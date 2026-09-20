import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
import { RecordingSchema, type LabelRequest } from '@trail/contracts';
import { createAuthoringFixture } from '@trail/motion';
import { createApp } from '../src/app.js';
import { readConfig } from '../src/config.js';
import { createPairingAuthority } from '../src/auth/pairing.js';
import { TutorialRepository } from '../src/storage/repository.js';
import { digest } from '../src/storage/files.js';
import { createMockProvider } from '../src/ai/mock.js';
import { validateNarration } from '../src/storage/narration.js';
const dirs: string[] = [];
afterEach(async () => { await Promise.all(dirs.splice(0).map(dir => rm(dir, { recursive: true, force: true }))); });
function wav(durationMs: number) {
  const rate = 16000; const bytes = Buffer.alloc(44 + Math.round(durationMs * rate / 1000) * 2);
  bytes.write('RIFF'); bytes.writeUInt32LE(bytes.length - 8, 4); bytes.write('WAVEfmt ', 8);
  bytes.writeUInt32LE(16, 16); bytes.writeUInt16LE(1, 20); bytes.writeUInt16LE(1, 22);
  bytes.writeUInt32LE(rate, 24); bytes.writeUInt32LE(rate * 2, 28); bytes.writeUInt16LE(2, 32); bytes.writeUInt16LE(16, 34);
  bytes.write('data', 36); bytes.writeUInt32LE(bytes.length - 44, 40); return bytes;
}
async function setup(byteUpload = false) {
  const dir = await mkdtemp(join(tmpdir(), 'trail-narration-')); dirs.push(dir);
  const config = readConfig({ DATA_DIR: dir });
  const provider = createMockProvider({ transcriptFixturePath: join(process.cwd(), 'fixtures/narration-transcript.v1.json') });
  const transcribe = vi.spyOn(provider, 'transcribe').mockImplementation(async input => ({ schemaVersion: 1, source: 'model', model: 'synthetic-test-transcriber', language: 'en', audioDurationMs: Math.round(input.audioDurationHintMs!), spans: [{ id: 'span-1', startMs: 0, endMs: 500, text: 'Move the bottle.' }] }));
  const label = vi.spyOn(provider, 'label').mockImplementation(async request => ({ schemaVersion: 1, labels: request.segments.map((segment, i) => ({ stepId: segment.id, title: `Action ${i + 1}`, instruction: 'Move the bottle.', narrationSpanIds: i === 0 ? ['span-1'] : [], needsReview: true })), provenance: { labels: 'model', model: 'synthetic-test-labeler', promptVersion: 'test-v1' }, failure: null }));
  const auth = createPairingAuthority({ allowedOrigins: ['http://127.0.0.1:3406'], allowUsbLoopback: true });
  const app = await createApp(config, { auth, provider });
  const pair = await app.inject({ method: 'POST', url: '/api/pair', headers: { host: '127.0.0.1:3406' }, payload: { code: auth.issueCode('author').code, client: 'native' } });
  const headers = { host: '127.0.0.1:3406', authorization: `Bearer ${pair.json().token}` };
  const recording = createAuthoringFixture(); const bytes = wav(recording.durationMs);
  recording.audio = { assetId: 'narration', mimeType: 'audio/wav', durationMs: (bytes.length - 44) / 32, audioStartOffsetMs: 0, syncMethod: 'manual-markers', estimatedSyncErrorMs: 33 };
  const { frames, ...metadata } = recording;
  const created = await app.inject({ method: 'POST', url: '/api/recordings', headers, payload: { metadata } });
  recording.id = created.json().id;
  const raw = Buffer.from(JSON.stringify(recording, null, 2));
  const parts: Buffer[] = []; for (let i = 0; i < raw.length; i += 1024 * 1024) parts.push(raw.subarray(i, i + 1024 * 1024));
  if (byteUpload) {
    for (const [index, part] of parts.entries()) {
      const response = await app.inject({ method: 'PUT', url: `/api/recordings/${recording.id}/bytes/${index}`, headers, payload: { dataBase64: part.toString('base64'), sha256: digest(part) } }); expect(response.statusCode).toBe(200);
    }
  } else {
    const response = await app.inject({ method: 'PUT', url: `/api/recordings/${recording.id}/motion/0`, headers, payload: { frames, sha256: digest(JSON.stringify(frames)) } }); expect(response.statusCode).toBe(200);
  }
  const hash = byteUpload ? digest(raw) : digest(JSON.stringify(RecordingSchema.parse(recording)));
  const uploadAudio = (data = bytes) => app.inject({ method: 'PUT', url: `/api/recordings/${recording.id}/narration`, headers: { ...headers, 'content-type': 'audio/wav' }, payload: data });
  const finalize = () => app.inject({ method: 'POST', url: `/api/recordings/${recording.id}/${byteUpload ? 'finalize-bytes' : 'finalize'}`, headers, payload: { chunkCount: byteUpload ? parts.length : 1, sha256: hash } });
  const compile = () => app.inject({ method: 'POST', url: '/api/tutorial-jobs', headers, payload: { recordingId: recording.id, recordingHash: hash, segmentationRevision: 1 } });
  return { app, dir, recording, bytes, headers, uploadAudio, finalize, compile, transcribe, label };
}
it('persists narrated motion, labels its actual segments, requires review and survives restart', async () => {
  const s = await setup(true);
  try {
    expect((await s.finalize()).statusCode).toBe(422);
    expect((await s.uploadAudio()).statusCode).toBe(200);
    expect((await s.uploadAudio()).json().repeated).toBe(true);
    const different = Buffer.from(s.bytes); different[45] = 1;
    expect((await s.uploadAudio(different)).statusCode).toBe(409);
    expect((await s.finalize()).statusCode).toBe(200);
    const job = await s.compile(); expect(job.json().status, job.body).toBe('complete'); expect(job.json().error).toBeNull();
    const repo = new TutorialRepository(s.dir); const tutorial = await repo.tutorial(job.json().tutorialId);
    expect(tutorial.status).toBe('draft'); expect(tutorial.provenance.labels).toBe('model'); expect(tutorial.steps).toHaveLength(4);
    expect(tutorial.steps[0]!.narrationSpanIds).toEqual(['span-1']);
    const request = s.label.mock.calls[0]![0] as LabelRequest;
    expect(request.segments.map(v => v.startMs)).toEqual(tutorial.steps.map(v => Math.round(s.recording.frames[v.startFrame]!.tMs)));
    expect(s.transcribe.mock.calls[0]![0].bytes).toEqual(new Uint8Array(s.bytes));
    expect((await s.compile()).json().id).toBe(job.json().id); expect(s.transcribe).toHaveBeenCalledTimes(1);
    const review = await s.app.inject({ method: 'POST', url: `/api/tutorials/${tutorial.id}/narration/query`, headers: s.headers }); expect(review.json().transcript.source).toBe('model');
    const edit = { baseRevision: tutorial.revision, steps: tutorial.steps.map(step => ({ id: step.id, title: step.title, instruction: step.instruction, startFrame: step.startFrame, endFrameExclusive: step.endFrameExclusive, checkpointFrame: step.checkpointFrame, activeHands: step.targets.map(t => t.side), completionMode: step.completionMode })) };
    const saved = await repo.edit(tutorial.id, edit); const ready = await repo.finalizeTutorial(tutorial.id, saved.revision);
    const restart = new TutorialRepository(s.dir); await restart.recover(); expect(await restart.tutorial(ready.id)).toEqual(ready);
    expect(await restart.narration(s.recording.id)).toEqual(s.bytes);
    await writeFile(repo.files.path('recordings', s.recording.id, 'narration.wav'), different);
    await expect(restart.recording(s.recording.id)).rejects.toThrow('integrity');
  } finally { await s.app.close(); }
}, 20000);
it('keeps a manual draft on provider failure and rejects unauthenticated audio access', async () => {
  const s = await setup();
  try {
    expect((await s.app.inject({ method: 'PUT', url: `/api/recordings/${s.recording.id}/narration`, headers: { 'content-type': 'audio/wav' }, payload: s.bytes })).statusCode).toBe(401);
    await s.uploadAudio(); await s.finalize(); s.transcribe.mockRejectedValue(new Error('provider unavailable'));
    const job = (await s.compile()).json(); expect(job.status).toBe('complete'); expect(job.error).toContain('manually');
    const tutorial = await new TutorialRepository(s.dir).tutorial(job.tutorialId); expect(tutorial.provenance.labels).toBe('fallback');
    expect((await s.app.inject({ method: 'POST', url: `/api/tutorials/${tutorial.id}/finalize`, headers: s.headers, payload: { baseRevision: tutorial.revision } })).statusCode).toBe(409);
    expect(s.label).not.toHaveBeenCalled();
  } finally { await s.app.close(); }
}, 20000);
it('rejects swapped transcript citations instead of persisting semantic mismatches', async () => {
  const s = await setup();
  try {
    s.label.mockImplementationOnce(async request => ({ schemaVersion: 1, labels: request.segments.map(segment => ({ stepId: segment.id, title: 'Moved', instruction: 'Move it.', narrationSpanIds: ['span-1'], needsReview: false })), provenance: { labels: 'model', model: 'test', promptVersion: 'test' }, failure: null }));
    await s.uploadAudio(); await s.finalize(); const job = (await s.compile()).json();
    expect(job.error).toContain('manually'); expect((await new TutorialRepository(s.dir).tutorial(job.tutorialId)).provenance.labels).toBe('fallback');
  } finally { await s.app.close(); }
}, 20000);
it('rejects truncated or forged WAV headers and duration mismatches', () => {
  const bytes = wav(1000); const audio = { assetId: 'narration', mimeType: 'audio/wav' as const, durationMs: 1000, audioStartOffsetMs: 0, syncMethod: 'manual-markers' as const, estimatedSyncErrorMs: 0 };
  expect(validateNarration(bytes, audio).durationMs).toBe(1000);
  expect(() => validateNarration(bytes.subarray(0, 30), audio)).toThrow();
  expect(() => validateNarration(bytes, { ...audio, durationMs: 999 })).toThrow();
  const stereo = Buffer.from(bytes); stereo.writeUInt16LE(2, 22); expect(() => validateNarration(stereo, audio)).toThrow();
});
