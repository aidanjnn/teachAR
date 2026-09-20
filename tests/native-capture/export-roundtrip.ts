/** Synthetic C# take export through the real authenticated desktop-review API. */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { RecordingSchema, type Tutorial } from '../../packages/contracts/src/index.js';
import { createApp } from '../../apps/server/src/app.js';
import { readConfig } from '../../apps/server/src/config.js';
import { createPairingAuthority } from '../../apps/server/src/auth/pairing.js';
import { TutorialRepository } from '../../apps/server/src/storage/repository.js';
import { digest } from '../../apps/server/src/storage/files.js';

const dir = await mkdtemp(join(tmpdir(), 'trail-native-review-'));
const auth = createPairingAuthority({ allowedOrigins: ['http://127.0.0.1:3406'], allowUsbLoopback: true });
const app = await createApp(readConfig({ DATA_DIR: join(dir, 'store') }), { auth });
try {
  const path = join(dir, 'native-export.json');
  execFileSync(process.env.DOTNET ?? 'dotnet', ['run', '--project', 'tests/native-capture/NativeCapture.csproj', '--', path], { stdio: 'inherit' });
  const recording = RecordingSchema.parse(JSON.parse(await readFile(path, 'utf8')));
  const paired = await app.inject({ method: 'POST', url: '/api/pair', headers: { host: '127.0.0.1:3406' },
    payload: { code: auth.issueCode('author').code, client: 'native' } });
  assert.equal(paired.statusCode, 200);
  const headers = { host: '127.0.0.1:3406', authorization: `Bearer ${paired.json().token}` };
  const { frames: _frames, ...metadata } = recording;
  const created = await app.inject({ method: 'POST', url: '/api/recordings', headers, payload: { metadata } });
  assert.equal(created.statusCode, 200, created.body);
  recording.id = created.json().id;
  const bytes = Buffer.from(JSON.stringify(recording)); const sha256 = digest(bytes);
  const chunks = Math.ceil(bytes.length / (1024 * 1024));
  for (let index = 0; index < chunks; index++) {
    const part = bytes.subarray(index * 1024 * 1024, (index + 1) * 1024 * 1024);
    const uploaded = await app.inject({ method: 'PUT', url: `/api/recordings/${recording.id}/bytes/${index}`, headers,
      payload: { dataBase64: part.toString('base64'), sha256: digest(part) } });
    assert.equal(uploaded.statusCode, 200, uploaded.body);
  }
  const finalized = await app.inject({ method: 'POST', url: `/api/recordings/${recording.id}/finalize-bytes`, headers,
    payload: { chunkCount: chunks, sha256 } });
  assert.equal(finalized.statusCode, 200, finalized.body);
  const job = await app.inject({ method: 'POST', url: '/api/tutorial-jobs', headers,
    payload: { recordingId: recording.id, recordingHash: sha256, segmentationRevision: 1 } });
  assert.equal(job.statusCode, 202, job.body); assert.equal(job.json().status, 'complete', job.body);
  const id = job.json().tutorialId as string;
  const draft = (await app.inject({ url: `/api/tutorials/${id}`, headers })).json<Tutorial>();
  assert.equal(draft.steps.length, 3); assert.equal(draft.provenance.labels, 'fallback');
  const reviewed = await app.inject({ method: 'PATCH', url: `/api/tutorials/${id}`, headers, payload: {
    baseRevision: draft.revision, steps: draft.steps.map((step, index) => ({
      id: step.id, title: `Synthetic action ${index + 1}`, instruction: 'Follow the synthetic motion for this integration test.',
      startFrame: step.startFrame, endFrameExclusive: step.endFrameExclusive, checkpointFrame: step.checkpointFrame,
      activeHands: step.targets.map(target => target.side), completionMode: 'path-and-pose',
    })),
  } });
  assert.equal(reviewed.statusCode, 200, reviewed.body);
  const ready = await app.inject({ method: 'POST', url: `/api/tutorials/${id}/finalize`, headers, payload: { baseRevision: reviewed.json().revision } });
  assert.equal(ready.statusCode, 200, ready.body); assert.equal(ready.json().status, 'ready');
  const restarted = new TutorialRepository(join(dir, 'store')); await restarted.recover();
  assert.deepEqual(await restarted.tutorial(id), ready.json());
  assert.equal((await restarted.recording(recording.id)).sha256, sha256);
  const narratedDir = join(dir, 'narrated');
  execFileSync(process.env.DOTNET ?? 'dotnet', ['run', '--project', 'tests/native-narration/Narration.csproj', '--', narratedDir], { stdio: 'inherit' });
  const narrated = RecordingSchema.parse(JSON.parse(await readFile(join(narratedDir, 'recording.json'), 'utf8')));
  const wav = await readFile(join(narratedDir, 'narration.wav'));
  const { frames: narratedFrames, ...narratedMetadata } = narrated;
  const audioCreated = await app.inject({ method: 'POST', url: '/api/recordings', headers, payload: { metadata: narratedMetadata } });
  assert.equal(audioCreated.statusCode, 200, audioCreated.body); narrated.id = audioCreated.json().id;
  const audioUploaded = await app.inject({ method: 'PUT', url: `/api/recordings/${narrated.id}/narration`, headers: { ...headers, 'content-type': 'audio/wav' }, payload: wav });
  assert.equal(audioUploaded.statusCode, 200, audioUploaded.body);
  const audioMotion = await app.inject({ method: 'PUT', url: `/api/recordings/${narrated.id}/motion/0`, headers, payload: { frames: narratedFrames, sha256: digest(JSON.stringify(narratedFrames)) } });
  assert.equal(audioMotion.statusCode, 200, audioMotion.body);
  const audioFinal = await app.inject({ method: 'POST', url: `/api/recordings/${narrated.id}/finalize`, headers, payload: { chunkCount: 1, sha256: digest(JSON.stringify(narrated)) } });
  assert.equal(audioFinal.statusCode, 200, audioFinal.body); assert.deepEqual(await restarted.narration(narrated.id), wav);
  console.log('PASS: C# generated WAV + motion metadata → authenticated narration upload → finalization → byte-identical reload. Synthetic PCM only.');
  console.log('PASS: synthetic native C# takes → authenticated byte upload → 3-step draft → explicit review → ready tutorial → repository restart. No narration, model, headset or learner evidence.');
} finally { await app.close(); await rm(dir, { recursive: true, force: true }); }
