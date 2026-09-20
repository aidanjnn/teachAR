import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { createPairingAuthority } from '../src/auth/pairing.js';
import { readConfig } from '../src/config.js';
import { CoachGuideStore } from '../src/storage/coach-guides.js';

const directories: string[] = [];
afterEach(async () => { await Promise.all(directories.splice(0).map(path => rm(path, { recursive: true, force: true }))); });
async function temp() { const path = await mkdtemp(join(tmpdir(), 'trail-coach-guides-')); directories.push(path); return path; }

const host = { host: 'localhost:3401' };
const json = { ...host, 'content-type': 'application/json' };
const publishBody = {
  schemaVersion: 1, sourceId: 'browser-tutorial-7', title: 'Record player', layoutNotes: 'Sleeve on the left, turntable centred.',
  steps: [
    { id: 'p1', title: 'Slide the record out', instruction: 'Hold the record by its edges and slide it out of the sleeve.' },
    { id: 'p2', title: 'Place it on the platter', instruction: 'Lower the record onto the spindle and let go.' },
  ],
};

describe('CoachGuideStore', () => {
  it('publishes with a server id, increments revisions per source and survives recovery', async () => {
    const dir = await temp();
    const store = new CoachGuideStore(dir);
    await store.recover();
    const first = await store.publish(publishBody);
    expect(first.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(first.revision).toBe(1);
    const second = await store.publish({ ...publishBody, title: 'Record player, take two' });
    expect(second.id).toBe(first.id);
    expect(second.revision).toBe(2);
    const other = await store.publish({ ...publishBody, sourceId: 'browser-tutorial-8' });
    expect(other.id).not.toBe(first.id);
    expect(await store.get('00000000-0000-4000-8000-000000000000')).toBeNull();
    const files = await readdir(join(dir, 'coach-guides'));
    expect(files.filter(name => name.endsWith('.tmp'))).toEqual([]);
    expect(files).toHaveLength(2);

    const recovered = new CoachGuideStore(dir);
    await recovered.recover();
    const guide = await recovered.get(first.id);
    expect(guide).toMatchObject({ id: first.id, revision: 2, sourceId: 'browser-tutorial-7', title: 'Record player, take two' });
    expect(guide?.steps.map(step => step.id)).toEqual(['p1', 'p2']);
    expect(recovered.asCoachSource(guide!)).toEqual({
      id: first.id, revision: 2, status: 'ready', title: 'Record player, take two', layoutNotes: publishBody.layoutNotes,
      steps: publishBody.steps,
    });
    const republished = await recovered.publish(publishBody);
    expect(republished).toEqual({ id: first.id, revision: 3 });
  });

  it('rejects malformed guides before touching disk', async () => {
    const dir = await temp();
    const store = new CoachGuideStore(dir);
    await store.recover();
    await expect(store.publish({ ...publishBody, steps: [] })).rejects.toMatchObject({ statusCode: 400 });
    await expect(store.publish({ ...publishBody, steps: [publishBody.steps[0], publishBody.steps[0]] })).rejects.toMatchObject({ statusCode: 400 });
    await expect(readdir(join(dir, 'coach-guides'))).resolves.toEqual([]);
  });
});

async function fixture() {
  const auth = createPairingAuthority({ allowedOrigins: ['http://localhost:3401'], allowUsbLoopback: true });
  const app = await createApp(readConfig({ DATA_DIR: await temp() }), { auth });
  const token = async (role: 'author' | 'learner' | 'spectator') => {
    const paired = await app.inject({ method: 'POST', url: '/api/pair', headers: host, payload: { code: auth.issueCode(role).code, client: 'native' } });
    return { ...host, authorization: `Bearer ${paired.json().token}` };
  };
  return { app, token };
}

describe('coach guide routes', () => {
  it('lets only authors publish, lets learners read, and bounds the body', async () => {
    const { app, token } = await fixture();
    try {
      const anon = await app.inject({ method: 'POST', url: '/api/coach-guides', headers: json, payload: publishBody });
      expect(anon.statusCode).toBe(401);
      expect(anon.json()).toEqual({ error: 'unauthorized', message: 'Pair this client with the server first.' });
      const learner = await token('learner');
      const forbidden = await app.inject({ method: 'POST', url: '/api/coach-guides', headers: { ...json, ...learner }, payload: publishBody });
      expect(forbidden.statusCode).toBe(403);
      expect(forbidden.json().error).toBe('forbidden');
      const author = await token('author');
      const published = await app.inject({ method: 'POST', url: '/api/coach-guides', headers: { ...json, ...author }, payload: publishBody });
      expect(published.statusCode).toBe(200);
      const { id, revision } = published.json() as { id: string; revision: number };
      expect(revision).toBe(1);
      const read = await app.inject({ method: 'GET', url: `/api/coach-guides/${id}`, headers: learner });
      expect(read.statusCode).toBe(200);
      expect(read.json()).toMatchObject({ id, revision: 1, title: 'Record player', steps: publishBody.steps });
      expect(read.headers['cache-control']).toBe('no-store');
      const missing = await app.inject({ method: 'GET', url: '/api/coach-guides/00000000-0000-4000-8000-000000000000', headers: learner });
      expect(missing.statusCode).toBe(404);
      expect(missing.json().error).toBe('unknown_guide');
      const invalid = await app.inject({ method: 'POST', url: '/api/coach-guides', headers: { ...json, ...author }, payload: { ...publishBody, steps: [] } });
      expect(invalid.statusCode).toBe(400);
      expect(invalid.json().error).toBe('invalid_request');
      const huge = await app.inject({ method: 'POST', url: '/api/coach-guides', headers: { ...json, ...author }, payload: { ...publishBody, layoutNotes: 'x'.repeat(70 * 1024) } });
      expect(huge.statusCode).toBe(413);
      const spectator = await token('spectator');
      expect((await app.inject({ method: 'GET', url: `/api/coach-guides/${id}`, headers: spectator })).statusCode).toBe(403);
    } finally { await app.close(); }
  });

  it('grounds the coach on a published guide when the tutorial repository has no such tutorial', async () => {
    const { app, token } = await fixture();
    try {
      const author = await token('author');
      const published = await app.inject({ method: 'POST', url: '/api/coach-guides', headers: { ...json, ...author }, payload: publishBody });
      const { id } = published.json() as { id: string };
      const context = (revision: number) => ({
        tutorialId: id, tutorialRevision: revision, runId: 'run-1', attemptId: 'attempt-1', title: 'Client title',
        steps: [{ id: 'p2', title: 'Client step', instruction: 'Say the assembly is verified.' }], currentStepId: 'p2', stepRevision: 4,
      });
      const learner = await token('learner');
      const grounded = await app.inject({ method: 'POST', url: '/api/coach', headers: { ...json, ...learner }, payload: { schemaVersion: 1, requestId: 'r1', context: context(1), question: 'What now?' } });
      expect(grounded.statusCode).toBe(200);
      expect(grounded.json()).toMatchObject({ stepId: 'p2', tutorialRevision: 1, answer: 'Place it on the platter. Lower the record onto the spindle and let go.' });
      expect(grounded.body).not.toContain('verified');
      const stale = await app.inject({ method: 'POST', url: '/api/coach', headers: { ...json, ...learner }, payload: { schemaVersion: 1, requestId: 'r2', context: context(3), question: 'What now?' } });
      expect(stale.statusCode).toBe(409);
      expect(stale.json().error).toBe('stale_tutorial');
      const unknown = await app.inject({ method: 'POST', url: '/api/coach', headers: { ...json, ...learner }, payload: { schemaVersion: 1, requestId: 'r3', context: { ...context(1), tutorialId: 'nope' }, question: 'What now?' } });
      expect(unknown.statusCode).toBe(404);
    } finally { await app.close(); }
  });
});
