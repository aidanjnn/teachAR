import Fastify from 'fastify';
import { it, expect } from 'vitest';
import type { InspectionCapture, InspectionStart, InspectionUpload, VisionInspectionInput } from '@trail/contracts';
import { InspectionCoordinator } from '../src/vision/coordinator.js';
import { registerInspectionRoutes } from '../src/vision/routes.js';
import { createPairingAuthority } from '../src/auth/pairing.js';
import { assessment, input } from '../../vision/test/fixtures.js';

async function setup() {
  let now = 100; let current = true; let calls = 0;
  const fixture = await input();
  let inspect = async (_connection: unknown, value: VisionInspectionInput) => ({ schemaVersion: 1 as const,
    requestId: value.request.requestId, requestEpoch: value.request.requestEpoch, observationId: value.observation.id,
    referenceIds: value.request.referenceIds, assessment: assessment(), provider: 'mock' as const, model: 'synthetic', serviceDurationMs: 10 });
  const coordinator = new InspectionCoordinator({ vision: null,
    resolveReferences: async () => ({ references: fixture.references, approvedStep: fixture.approvedStep }),
    isCurrent: () => current, now: () => now, inspect: (...args) => { calls++; return inspect(args[0], args[1]); },
  });
  const start: InspectionStart = { schemaVersion: 1, context: { runId: 'run-1', tutorialId: 'tutorial-1', tutorialRevision: 1,
    stepId: 'step-1', stepRevision: 1, attemptId: 'attempt-1' }, liveSessionId: 'app-check', sessionGeneration: 1,
    requestEpoch: 1, question: 'Is this aligned?', sourceSessionId: 'camera-1', source: 'quest-camera', sourceFrameSeq: 1 };
  start.liveSessionId = coordinator.openSession('session', start.context).liveSessionId;
  const upload = (capture: InspectionCapture): InspectionUpload => ({ schemaVersion: 1, requestId: capture.request.requestId,
    requestEpoch: capture.request.requestEpoch, captureNonce: capture.captureNonce, sourceSessionId: 'camera-1',
    source: 'quest-camera', sourceFrameSeq: capture.minSourceFrameSeq + 1, captureAgeAtSendMs: 10, image: fixture.currentImage });
  return { coordinator, start, upload, calls: () => calls, setCurrent: (value: boolean) => { current = value; },
    advance: (ms: number) => { now += ms; }, setInspect: (fn: typeof inspect) => { inspect = fn; } };
}
it('requires paused current guide, binds nonce/source/frame and returns advice without progression effects', async () => {
  const h = await setup();
  try {
    h.setCurrent(false); await expect(h.coordinator.start('session', h.start)).rejects.toMatchObject({ code: 'stale' });
    h.setCurrent(true); const capture = await h.coordinator.start('session', h.start);
    const bad = h.upload(capture); bad.sourceFrameSeq = 1;
    await expect(h.coordinator.upload('session', bad)).rejects.toMatchObject({ code: 'stale' });
    await expect(h.coordinator.upload('different-session', h.upload(capture))).rejects.toMatchObject({ code: 'stale' });
    await expect(h.coordinator.upload('session', { ...h.upload(capture), captureNonce: 'wrong' })).rejects.toMatchObject({ code: 'stale' });
    const result = await h.coordinator.upload('session', h.upload(capture));
    expect(result.provenance).toBe('mock'); expect(result.request).toEqual(capture.request); expect(result).not.toHaveProperty('complete');
    await expect(h.coordinator.upload('session', h.upload(capture))).rejects.toMatchObject({ code: 'stale' });
    expect(h.calls()).toBe(1);
  } finally { h.coordinator.close(); }
});
it('rejects old requests/epochs, late upload and old source delivery', async () => {
  const h = await setup();
  try {
    let capture = await h.coordinator.start('session', h.start);
    await expect(h.coordinator.start('session', h.start)).rejects.toMatchObject({ code: 'stale' });
    h.advance(2001); await expect(h.coordinator.upload('session', h.upload(capture))).rejects.toMatchObject({ code: 'stale' });
    capture = await h.coordinator.start('session', { ...h.start, requestEpoch: 2 });
    await h.coordinator.upload('session', h.upload(capture));
    capture = await h.coordinator.start('session', { ...h.start, requestEpoch: 3, sourceFrameSeq: 0 });
    expect(capture.minSourceFrameSeq).toBe(2);
    await expect(h.coordinator.upload('session', { ...h.upload(capture), sourceFrameSeq: 2 })).rejects.toMatchObject({ code: 'stale' });
  } finally { h.coordinator.close(); }
});
it.each(['resume', 'age', 'identity', 'cancel'] as const)('discards a late verdict after %s', async cause => {
  const h = await setup(); let finish!: () => void;
  h.setInspect(async (_connection, value) => {
    await new Promise<void>(resolve => { finish = resolve; });
    return { schemaVersion: 1, requestId: cause === 'identity' ? 'wrong' : value.request.requestId,
      requestEpoch: value.request.requestEpoch, observationId: value.observation.id, referenceIds: value.request.referenceIds,
      assessment: assessment(), provider: 'mock', model: 'test', serviceDurationMs: 1 };
  });
  try {
    const capture = await h.coordinator.start('session', h.start);
    const work = h.coordinator.upload('session', h.upload(capture));
    const rejected = expect(work).rejects.toBeInstanceOf(Error);
    if (cause === 'resume') { h.setCurrent(false); h.coordinator.guideChanged('session'); }
    if (cause === 'age') h.advance(5001);
    if (cause === 'cancel') h.coordinator.cancel('session', capture.request.requestId, capture.request.requestEpoch);
    finish(); await rejected;
  } finally { h.coordinator.close(); }
});
it('authenticates routes before reading images, excludes spectators, and scopes cancellation', async () => {
  const h = await setup(); const app = Fastify();
  const authority = createPairingAuthority({ allowedOrigins: ['https://trail.test'], allowUsbLoopback: true });
  // Test route boundary with the real task1 auth API; bearer exchange itself is covered by pairing tests.
  await registerInspectionRoutes(app, { authorizeLearner: request => authority.authorize(request, { roles: ['learner'] }), coordinator: h.coordinator });
  try {
    const result = await app.inject({ method: 'POST', url: '/api/scene-observations', payload: 'not an image' });
    expect([401, 403]).toContain(result.statusCode); expect(h.calls()).toBe(0);
  } finally { await app.close(); }
});
it('accepts fresh server leases without accumulated retirement history and rejects obsolete identities', async () => {
  const h = await setup();
  try {
    const oldCapture = await h.coordinator.start('session', h.start);
    const retired = [h.start.liveSessionId];
    let latest = h.start.liveSessionId;
    for (let i = 0; i < 50_000; i++) {
      latest = h.coordinator.openSession('session', h.start.context).liveSessionId;
      if (i % 1000 === 0) {
        await h.coordinator.start('session', { ...h.start, liveSessionId: latest });
        retired.push(latest);
      }
    }
    for (const liveSessionId of retired) {
      await expect(h.coordinator.start('session', { ...h.start, liveSessionId, requestEpoch: 999 })).rejects.toMatchObject({ code: 'stale' });
    }
    await expect(h.coordinator.upload('session', h.upload(oldCapture))).rejects.toMatchObject({ code: 'stale' });
    await expect(h.coordinator.start('session', { ...h.start, liveSessionId: latest, sessionGeneration: 2 })).rejects.toMatchObject({ code: 'stale' });
    await expect(h.coordinator.start('other-session', { ...h.start, liveSessionId: latest })).rejects.toMatchObject({ code: 'stale' });
    await h.coordinator.start('session', { ...h.start, liveSessionId: latest, requestEpoch: 0 });
    await expect(h.coordinator.start('session', { ...h.start, liveSessionId: latest, requestEpoch: 0 })).rejects.toMatchObject({ code: 'stale' });
    h.setCurrent(false);
    expect(() => h.coordinator.openSession('session', h.start.context)).toThrow();
  } finally { h.coordinator.close(); }
});
it('enforces learner role and exact paired session through real route composition', async () => {
  const h = await setup(); const app = Fastify();
  const { registerPairingRoutes } = await import('../src/auth/pairing.js');
  const authority = createPairingAuthority({ allowedOrigins: ['http://localhost'], allowUsbLoopback: true });
  await registerPairingRoutes(app, authority);
  await registerInspectionRoutes(app, { authorizeLearner: request => authority.authorize(request, { roles: ['learner'] }), coordinator: h.coordinator });
  async function pair(role: 'learner' | 'spectator') {
    const code = authority.issueCode(role).code;
    const response = await app.inject({ method: 'POST', url: '/api/pair', headers: { host: 'localhost' }, payload: { code, client: 'native' } });
    expect(response.statusCode).toBe(200);
    return { host: 'localhost', authorization: `Bearer ${response.json().token as string}` };
  }
  try {
    const spectator = await pair('spectator'); const learner = await pair('learner');
    expect((await app.inject({ method: 'POST', url: '/api/inspections', headers: spectator, payload: h.start })).statusCode).toBe(403);
    expect((await app.inject({ method: 'POST', url: '/api/inspection-sessions', headers: spectator, payload: h.start.context })).statusCode).toBe(403);
    expect((await app.inject({ method: 'POST', url: '/api/inspection-sessions', headers: learner, payload: { ...h.start.context, unexpected: true } })).statusCode).toBe(400);
    const lease = await app.inject({ method: 'POST', url: '/api/inspection-sessions', headers: learner, payload: h.start.context });
    expect(lease.statusCode).toBe(200);
    const response = await app.inject({ method: 'POST', url: '/api/inspections', headers: learner, payload: { ...h.start, liveSessionId: lease.json().liveSessionId } });
    expect(response.statusCode).toBe(200);
    const capture = response.json() as InspectionCapture;
    expect((await app.inject({ method: 'DELETE', url: `/api/inspections/${capture.request.requestId}?epoch=999`, headers: learner })).statusCode).toBe(409);
    expect((await app.inject({ method: 'DELETE', url: `/api/inspections/${capture.request.requestId}?epoch=1`, headers: learner })).statusCode).toBe(204);
  } finally { await app.close(); }
});
it('bounds unresolved reference IO even if the resolver ignores cancellation', async () => {
  const fixture = await input(); let finish!: () => void;
  const h = await setup();
  const coordinator = new InspectionCoordinator({ vision: { url: 'http://127.0.0.1:1', token: 'unused' }, isCurrent: () => true,
    resolveReferences: async () => { await new Promise<void>(resolve => { finish = resolve; }); return { references: fixture.references, approvedStep: fixture.approvedStep }; },
  });
  h.start.liveSessionId = coordinator.openSession('session', h.start.context).liveSessionId;
  const pending = coordinator.start('session', h.start);
  const rejected = expect(pending).rejects.toMatchObject({ code: 'cancelled' });
  await Promise.resolve(); coordinator.invalidate('session');
  await expect(coordinator.start('session', { ...h.start, requestEpoch: 2 })).rejects.toMatchObject({ code: 'busy' });
  finish(); await rejected; coordinator.close(); h.coordinator.close();
});
