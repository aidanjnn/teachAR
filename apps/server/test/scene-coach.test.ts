import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';
import { afterEach, describe, expect, it } from 'vitest';
import { SceneAdviceResponseSchema } from '@trail/contracts';
import { GUARDED_LINE, UNPAIRED_REASON, type SceneAdviceInput, type SceneCoachProvider } from '../src/ai/scene-coach.js';
import { createApp } from '../src/app.js';
import { readConfig } from '../src/config.js';

const directories: string[] = [];
afterEach(async () => { await Promise.all(directories.splice(0).map(path => rm(path, { recursive: true, force: true }))); });
async function temp() { const path = await mkdtemp(join(tmpdir(), 'trail-scene-')); directories.push(path); return path; }

const context = {
  tutorialId: 't', tutorialRevision: 0, runId: 'run', attemptId: 'a', title: 'Stand',
  steps: [{ id: 's1', title: 'Place the base', instruction: 'Slide it.' }], currentStepId: 's1', stepRevision: 4,
};
async function jpeg(width = 96, height = 64) {
  return (await sharp({ create: { width, height, channels: 3, background: { r: 120, g: 130, b: 140 } } }).jpeg({ quality: 70 }).toBuffer()).toString('base64');
}
async function png() {
  return (await sharp({ create: { width: 16, height: 16, channels: 3, background: { r: 1, g: 2, b: 3 } } }).png().toBuffer()).toString('base64');
}
function fakeProvider(transcript: string, audio: { format: 'wav'; dataBase64: string } | null = null) {
  const inputs: SceneAdviceInput[] = [];
  const provider: SceneCoachProvider = { name: 'omni', model: 'fake-omni', async advise(input) { inputs.push(input); return { transcript, audio, model: 'fake-omni' }; } };
  return { provider, inputs };
}
async function request(image: string, extra: Record<string, unknown> = {}) {
  return { schemaVersion: 1, requestId: 'req-1', context, question: 'Is my paper placed right?', source: 'quest-camera', image: { mimeType: 'image/jpeg', dataBase64: image }, captureAgeMs: 400, epoch: 7, ...extra };
}
const json = { 'content-type': 'application/json' };

describe('POST /api/scene-coach', () => {
  it('is off by default and says so without calling any model', async () => {
    const app = await createApp(readConfig({ DATA_DIR: await temp() }));
    try {
      const response = await app.inject({ method: 'POST', url: '/api/scene-coach', headers: json, payload: await request(await jpeg()) });
      expect(response.statusCode).toBe(503);
      expect(response.json()).toEqual({ error: 'scene_unavailable', message: 'Scene coaching is not configured on this server.' });
      expect((await app.inject('/api/health')).json().providers.scene).toBe('off');
    } finally { await app.close(); }
    // A configured model on an unpaired server is refused too: nothing could ground or gate the paid request.
    const unpaired = await createApp(readConfig({ DATA_DIR: await temp(), SCENE_COACH: 'omni', OMNI_API_KEY: 'sk-omni-test' }));
    try {
      const response = await unpaired.inject({ method: 'POST', url: '/api/scene-coach', headers: json, payload: await request(await jpeg()) });
      expect(response.statusCode).toBe(503);
      expect(response.json().message).toBe(UNPAIRED_REASON);
      expect((await unpaired.inject('/api/health')).json().providers.scene).toBe('omni');
    } finally { await unpaired.close(); }
  });
  it('bounds both images, forwards the grounded context and returns speech with provenance', async () => {
    const wav = { format: 'wav' as const, dataBase64: Buffer.alloc(200, 3).toString('base64') };
    const { provider, inputs } = fakeProvider('Turn the sheet so the marked corner is nearest you.', wav);
    const app = await createApp(readConfig({ DATA_DIR: await temp() }), { sceneCoach: provider });
    try {
      const big = await jpeg(1280, 960);
      const response = await app.inject({ method: 'POST', url: '/api/scene-coach', headers: json, payload: await request(big, { reference: { mimeType: 'image/jpeg', dataBase64: await jpeg(200, 150) } }) });
      expect(response.statusCode).toBe(200);
      expect(response.headers['cache-control']).toBe('no-store');
      const body = SceneAdviceResponseSchema.parse(response.json());
      expect(body).toMatchObject({ requestId: 'req-1', stepId: 's1', stepRevision: 4, epoch: 7, source: 'quest-camera', transcript: 'Turn the sheet so the marked corner is nearest you.', audio: wav, model: 'fake-omni', provenance: 'model' });
      expect(inputs).toHaveLength(1);
      expect(inputs[0]!.question).toBe('Is my paper placed right?');
      expect(inputs[0]!.context.currentStepId).toBe('s1');
      // The frame the model sees is re-encoded within 1024 px; the client's 1280 px capture never goes out as-is.
      const sent = await sharp(Buffer.from(inputs[0]!.image.dataBase64, 'base64')).metadata();
      expect(sent.width).toBe(1024);
      expect(inputs[0]!.reference).not.toBeNull();
    } finally { await app.close(); }
  });
  it('replaces completion claims with the guarded line and drops the audio', async () => {
    const { provider } = fakeProvider('Step completed, you are done.', { format: 'wav', dataBase64: Buffer.alloc(200, 3).toString('base64') });
    const app = await createApp(readConfig({ DATA_DIR: await temp() }), { sceneCoach: provider });
    try {
      const response = await app.inject({ method: 'POST', url: '/api/scene-coach', headers: json, payload: await request(await jpeg()) });
      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({ transcript: GUARDED_LINE, audio: null, provenance: 'guarded' });
    } finally { await app.close(); }
  });
  it('refuses stale frames, non-JPEG bytes, malformed bodies and back-to-back looks', async () => {
    const { provider, inputs } = fakeProvider('Fine.');
    const app = await createApp(readConfig({ DATA_DIR: await temp() }), { sceneCoach: provider });
    try {
      const stale = await app.inject({ method: 'POST', url: '/api/scene-coach', headers: json, payload: await request(await jpeg(), { captureAgeMs: 4_000 }) });
      expect(stale.statusCode).toBe(400);
      expect(stale.json().error).toBe('stale_capture');
      const notJpeg = await app.inject({ method: 'POST', url: '/api/scene-coach', headers: json, payload: await request(await png()) });
      expect(notJpeg.statusCode).toBe(400);
      expect(notJpeg.json().error).toBe('invalid_image');
      const malformed = await app.inject({ method: 'POST', url: '/api/scene-coach', headers: json, payload: { schemaVersion: 1, question: 'x' } });
      expect(malformed.statusCode).toBe(400);
      const first = await app.inject({ method: 'POST', url: '/api/scene-coach', headers: json, payload: await request(await jpeg()) });
      expect(first.statusCode).toBe(200);
      const second = await app.inject({ method: 'POST', url: '/api/scene-coach', headers: json, payload: await request(await jpeg()) });
      expect(second.statusCode).toBe(429);
      expect(second.json().error).toBe('scene_busy');
      expect(inputs).toHaveLength(1);
    } finally { await app.close(); }
  });
  it('reports a provider failure as 503 without its details', async () => {
    const provider: SceneCoachProvider = { name: 'omni', model: 'm', async advise() { throw new Error('gateway said sk-secret-value'); } };
    const app = await createApp(readConfig({ DATA_DIR: await temp() }), { sceneCoach: provider });
    try {
      const response = await app.inject({ method: 'POST', url: '/api/scene-coach', headers: json, payload: await request(await jpeg()) });
      expect(response.statusCode).toBe(503);
      expect(response.body).not.toContain('sk-secret-value');
      expect(response.json().error).toBe('scene_unavailable');
    } finally { await app.close(); }
  });
});
