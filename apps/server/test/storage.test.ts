import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { RecordingSchema, type Tutorial } from '@trail/contracts';
import { createAuthoringFixture } from '@trail/motion';
import { createApp } from '../src/app.js';
import { readConfig } from '../src/config.js';
import { createPairingAuthority } from '../src/auth/pairing.js';
import { TutorialRepository } from '../src/storage/repository.js';
import { digest } from '../src/storage/files.js';
const dirs: string[] = [];
afterEach(async () => { await Promise.all(dirs.splice(0).map(dir => rm(dir, { recursive: true, force: true }))); });
async function setup() {
  const dir = await mkdtemp(join(tmpdir(), 'trail-storage-')); dirs.push(dir);
  const auth = createPairingAuthority({ allowedOrigins: ['http://127.0.0.1:3406'], allowUsbLoopback: true });
  const app = await createApp(readConfig({ DATA_DIR: dir }), { auth });
  const code = auth.issueCode('author').code;
  const paired = await app.inject({ method: 'POST', url: '/api/pair', headers: { host: '127.0.0.1:3406' }, payload: { code, client: 'native' } });
  const headers = { host: '127.0.0.1:3406', authorization: `Bearer ${paired.json().token}` };
  return { app, headers, dir, auth };
}
function edit(tutorial: Tutorial) { return { baseRevision: tutorial.revision, steps: tutorial.steps.map((step, index) => ({ id: step.id, title: `Move part ${index + 1}`, instruction: 'Move the large part to the indicated checkpoint.', startFrame: step.startFrame, endFrameExclusive: step.endFrameExclusive, checkpointFrame: step.checkpointFrame, activeHands: step.targets.map(target => target.side), completionMode: 'path-and-pose' })) }; }
async function upload(s: Awaited<ReturnType<typeof setup>>) {
  const recording = createAuthoringFixture(); const { frames, ...metadata } = recording;
  const created = await s.app.inject({ method: 'POST', url: '/api/recordings', headers: s.headers, payload: { metadata } });
  expect(created.statusCode).toBe(200); const id = created.json().id as string;
  const response = await s.app.inject({ method: 'PUT', url: `/api/recordings/${id}/motion/0`, headers: s.headers, payload: { frames, sha256: digest(JSON.stringify(frames)) } });
  expect(response.statusCode).toBe(200);
  const sha256 = digest(JSON.stringify(RecordingSchema.parse({ ...recording, id })));
  const final = await s.app.inject({ method: 'POST', url: `/api/recordings/${id}/finalize`, headers: s.headers, payload: { chunkCount: 1, sha256 } });
  expect(final.statusCode, final.body).toBe(200); return { id, sha256, frames };
}

describe('durable authoring HTTP flow', () => {
  it('rejects corrupted stored bytes through every download route', { timeout: 20000 }, async () => {
    const s = await setup();
    try {
      const { id } = await upload(s);
      const repo = new TutorialRepository(s.dir);
      const { recording } = await repo.recording(id);
      await writeFile(repo.files.path('recordings', id, 'recording.json'), JSON.stringify({ ...recording, source: 'recorded-fixture' }));
      for (const suffix of ['', '/download', '/content', '/content/0']) {
        const response = await s.app.inject({ url: `/api/recordings/${id}${suffix}`, headers: s.headers });
        expect(response.statusCode).toBe(422);
        expect(response.json()).toEqual({ error: 'Recording integrity check failed' });
      }
    } finally { await s.app.close(); }
  });
  it('uploads, compiles, reviews, finalizes and reloads immutable steps across restart', { timeout: 20000 }, async () => {
    const s = await setup();
    try {
      const input = await upload(s);
      const job = await s.app.inject({ method: 'POST', url: '/api/tutorial-jobs', headers: s.headers, payload: { recordingId: input.id, recordingHash: input.sha256, segmentationRevision: 1 } });
      expect(job.statusCode).toBe(202); expect(job.json().status, job.body).toBe('complete');
      const id = job.json().tutorialId as string;
      const tutorial = (await s.app.inject({ url: `/api/tutorials/${id}`, headers: s.headers })).json<Tutorial>();
      expect(tutorial.steps).toHaveLength(4); expect(tutorial.provenance.labels).toBe('fallback');
      expect((await s.app.inject({ method: 'POST', url: `/api/tutorials/${id}/finalize`, headers: s.headers, payload: { baseRevision: 1 } })).statusCode).toBe(409);
      const reviewed = await s.app.inject({ method: 'PATCH', url: `/api/tutorials/${id}`, headers: s.headers, payload: edit(tutorial) });
      expect(reviewed.statusCode, reviewed.body).toBe(200); expect(reviewed.json().revision).toBe(2);
      expect((await s.app.inject({ method: 'PATCH', url: `/api/tutorials/${id}`, headers: s.headers, payload: edit(tutorial) })).statusCode).toBe(409);
      const ready = await s.app.inject({ method: 'POST', url: `/api/tutorials/${id}/finalize`, headers: s.headers, payload: { baseRevision: 2 } });
      expect(ready.statusCode).toBe(200); expect(ready.json().status).toBe('ready');
      expect((await s.app.inject({ method: 'PATCH', url: `/api/tutorials/${id}`, headers: s.headers, payload: edit(ready.json()) })).statusCode).toBe(409);
      const restarted = new TutorialRepository(s.dir); await restarted.recover();
      expect(await restarted.tutorial(id)).toEqual(ready.json());
      expect((await restarted.recording(input.id)).sha256).toBe(input.sha256);
      const repeat = await restarted.compile(input.id, input.sha256, 1); expect(repeat.id).toBe(job.json().id);
    } finally { await s.app.close(); }
  });
  it('enforces hashes, ordered chunks, identical retries, aggregate bounds and interrupted recovery', { timeout: 20000 }, async () => {
    const s = await setup();
    try {
      const { frames, ...metadata } = createAuthoringFixture();
      const created = await s.app.inject({ method: 'POST', url: '/api/recordings', headers: s.headers, payload: { metadata } }); const id = created.json().id as string;
      const put = (chunk: number, value = frames.slice(0, 90), hash = digest(JSON.stringify(value))) => s.app.inject({ method: 'PUT', url: `/api/recordings/${id}/motion/${chunk}`, headers: s.headers, payload: { frames: value, sha256: hash } });
      expect((await put(1)).statusCode).toBe(409);
      expect((await put(0, undefined, '0'.repeat(64))).statusCode).toBe(422);
      expect((await put(0)).statusCode).toBe(200); expect((await put(0)).json().repeated).toBe(true);
      expect((await put(0, frames.slice(90, 180))).statusCode).toBe(409);
      const repo = new TutorialRepository(s.dir); await repo.recover(); expect((await repo.uploadStatus(id)).chunks).toHaveLength(1);
      expect((await s.app.inject({ method: 'POST', url: `/api/recordings/${id}/finalize`, headers: s.headers, payload: { chunkCount: 2, sha256: '0'.repeat(64) } })).statusCode).toBe(409);
      const jobId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'; await repo.files.write('jobs', jobId, { id: jobId, status: 'running' }); await repo.recover(); expect((await repo.files.read<{ status: string }>('jobs', jobId)).status).toBe('interrupted');
      expect((await s.app.inject({ method: 'POST', url: `/api/recordings/${id}/discard`, headers: s.headers })).statusCode).toBe(200);
    } finally { await s.app.close(); }
  });
  it('rejects unauthenticated/wrong-role writes and forged spatial coordinates', { timeout: 20000 }, async () => {
    const s = await setup();
    try {
      expect((await s.app.inject({ method: 'POST', url: '/api/recordings', payload: {} })).statusCode).toBeGreaterThanOrEqual(400);
      const token = (await s.app.inject({ method: 'POST', url: '/api/pair', headers: { host: s.headers.host }, payload: { code: s.auth.issueCode('spectator').code, client: 'native' } })).json().token;
      expect((await s.app.inject({ method: 'POST', url: '/api/recordings', headers: { host: s.headers.host, authorization: `Bearer ${token}` }, payload: {} })).statusCode).toBe(403);
      const result = await upload(s); const repo = new TutorialRepository(s.dir); const job = await repo.compile(result.id, result.sha256, 1); const tutorial = await repo.tutorial(job.tutorialId!);
      const body = edit(tutorial); Object.assign(body.steps[0]!, { targets: [] });
      expect((await s.app.inject({ method: 'PATCH', url: `/api/tutorials/${tutorial.id}`, headers: s.headers, payload: body })).statusCode).toBe(400);
      const changed = edit(tutorial); changed.steps[0]!.startFrame = 30;
      expect((await s.app.inject({ method: 'PATCH', url: `/api/tutorials/${tutorial.id}`, headers: s.headers, payload: changed })).statusCode).toBe(422);
      expect((await repo.tutorial(tutorial.id)).revision).toBe(1);
    } finally { await s.app.close(); }
  });
});

it('preserves raw cross-language JSON hashes and serves bounded preload chunks', { timeout: 20000 }, async () => {
  const s = await setup();
  try {
    const recording = createAuthoringFixture(); const { frames: _frames, ...metadata } = recording;
    const created = await s.app.inject({ method: 'POST', url: '/api/recordings', headers: s.headers, payload: { metadata } });
    recording.id = created.json().id;
    // Whitespace and exponent spelling are intentionally different from JSON.stringify(parsed).
    const raw = Buffer.from(JSON.stringify(recording, null, 2).replace('"durationMs": 11966.666666666666', '"durationMs": 1.1966666666666666e4'));
    const parts: Buffer[] = []; for (let i=0;i<raw.length;i+=1024*1024) parts.push(raw.subarray(i,i+1024*1024));
    for (const [index, part] of parts.entries()) expect((await s.app.inject({ method: 'PUT', url: `/api/recordings/${recording.id}/bytes/${index}`, headers: s.headers, payload: { dataBase64: part.toString('base64'), sha256: digest(part) } })).statusCode).toBe(200);
    const finalized = await s.app.inject({ method: 'POST', url: `/api/recordings/${recording.id}/finalize-bytes`, headers: s.headers, payload: { chunkCount: parts.length, sha256: digest(raw) } });
    expect(finalized.statusCode, finalized.body).toBe(200);
    const content = await s.app.inject({ url: `/api/recordings/${recording.id}/content`, headers: s.headers }); expect(digest(content.rawPayload)).toBe(digest(raw));
    const meta = (await s.app.inject({ url: `/api/recordings/${recording.id}/download`, headers: s.headers })).json();
    const chunks: Buffer[] = [];
    for (let i=0;i<meta.chunkCount;i++) { const part = await s.app.inject({ url: `/api/recordings/${recording.id}/content/${i}`, headers: s.headers }); chunks.push(Buffer.from(part.json().dataBase64, 'base64')); }
    expect(digest(Buffer.concat(chunks))).toBe(digest(raw));
  } finally { await s.app.close(); }
});
