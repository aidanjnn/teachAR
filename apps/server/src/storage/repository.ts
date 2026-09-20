import { randomUUID } from 'node:crypto';
import { rm, readFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { RecordingSchema, parseContractJson, TutorialSchema, TutorialDraftEditSchema, parseTutorialForRecording, type MotionFrame, type Recording, type Tutorial, type TutorialDraftEdit, type StepSceneReference, type TutorialLabelBatch, TutorialLabelBatchSchema } from '@trail/contracts';
import { deriveStep, proposeSteps } from '@trail/motion';
import { digest, PrivateFiles, StoreError } from './files.js';
import { validateNarration } from './narration.js';
import type { AiProvider } from '../ai/provider.js';
import { LabelRequestSchema, LabelResultSchema, TranscriptResultSchema } from '@trail/contracts';
import { validateLabelOutput } from '../ai/labels.js';

type TutorialBundle = { tutorial: Tutorial; references: StepSceneReference[] };
type Upload = { id: string; status: 'uploading' | 'ready'; metadata: Omit<Recording, 'id' | 'frames'>; chunks: { hash: string; bytes: number; frames: number }[]; hash: string | null; narration?: { sha256: string; bytes: number }; format?: 'frames' | 'bytes' };
export type CompileJob = { id: string; recordingId: string; recordingHash: string; segmentationRevision: number; status: 'running' | 'complete' | 'interrupted' | 'failed'; tutorialId: string | null; error: string | null };
const MAX_CHUNK_BYTES = 2 * 1024 * 1024;
const MAX_MOTION_BYTES = 64 * 1024 * 1024;

export class TutorialRepository {
  readonly files: PrivateFiles;
  constructor(root: string, private readonly provider?: AiProvider) { this.files = new PrivateFiles(root); }
  async recover() {
    for (const id of await this.files.ids('jobs')) {
      const job = await this.files.read<CompileJob>('jobs', id);
      if (job.status === 'running') await this.files.write('jobs', id, { ...job, status: 'interrupted', error: 'Server restarted. Retry compilation.' });
    }
  }
  async createRecording(metadata: Omit<Recording, 'id' | 'frames'>) {
    return this.files.serial('create-recording', async () => {
      const ids = await this.files.ids('recordings');
      if (ids.length >= 128) throw new StoreError(413, 'Local recording limit reached');
      for (const existing of ids) {
        const upload = await this.files.read<Upload>('recordings', existing);
        if (upload.status === 'uploading') throw new StoreError(409, `Resume or discard unfinished upload ${existing}`);
      }
      const id = randomUUID();
      const upload: Upload = { id, status: 'uploading', metadata, chunks: [], hash: null };
      await this.files.write('recordings', id, upload);
      return upload;
    });
  }
  async upload(id: string, index: number, frames: MotionFrame[], expectedHash: string) {
    return this.files.serial(id, async () => {
      const upload = await this.files.read<Upload>('recordings', id);
      if (upload.format === 'bytes') throw new StoreError(409, 'Cannot mix upload formats');
      upload.format = 'frames';
      const encoded = JSON.stringify(frames); const hash = digest(encoded); const bytes = Buffer.byteLength(encoded);
      if (hash !== expectedHash) throw new StoreError(422, 'Chunk hash mismatch');
      if (bytes > MAX_CHUNK_BYTES) throw new StoreError(413, 'Motion chunk exceeds 2 MiB');
      const existing = upload.chunks[index];
      if (existing) {
        if (existing.hash !== hash) throw new StoreError(409, 'Chunk retry differs');
        return { id, chunk: index, sha256: hash, repeated: true };
      }
      if (upload.status !== 'uploading' || index !== upload.chunks.length || index >= 64) throw new StoreError(409, 'Chunk is out of order or recording is immutable');
      if (upload.chunks.reduce((sum, chunk) => sum + chunk.bytes, bytes) > MAX_MOTION_BYTES || upload.chunks.reduce((sum, chunk) => sum + chunk.frames, frames.length) > 3600) throw new StoreError(413, 'Recording limit exceeded');
      await this.files.write('recordings', id, frames, `motion-${index}.json`);
      upload.chunks.push({ hash, bytes, frames: frames.length });
      await this.files.write('recordings', id, upload);
      return { id, chunk: index, sha256: hash, repeated: false };
    });
  }
  async discard(id: string) {
    return this.files.serial('create-recording', () => this.files.serial(id, async () => {
      const upload = await this.uploadStatus(id);
      if (upload.status !== 'uploading') throw new StoreError(409, 'Finalized recording is immutable');
      await rm(dirname(this.files.path('recordings', id)), { recursive: true });
      return { discarded: true };
    }));
  }
  async pendingUploads() {
    const result: Upload[] = [];
    for (const id of await this.files.ids('recordings')) { const upload = await this.uploadStatus(id); if (upload.status === 'uploading') result.push(upload); }
    return result;
  }
  async uploadNarration(id: string, bytes: Buffer) {
    return this.files.serial(id, async () => {
      const upload = await this.uploadStatus(id);
      validateNarration(bytes, upload.metadata.audio);
      const sha256 = digest(bytes);
      if (upload.narration) {
        if (upload.narration.sha256 !== sha256) throw new StoreError(409, 'Narration retry differs');
        await this.verifyNarration(upload, upload.metadata);
        return { sha256, repeated: true };
      }
      if (upload.status !== 'uploading') throw new StoreError(409, 'Finalized recording is immutable');
      await this.files.writeBytes('recordings', id, bytes, 'narration.wav');
      await this.files.write('recordings', id, { ...upload, narration: { sha256, bytes: bytes.length } });
      return { sha256, repeated: false };
    });
  }
  private async verifyNarration(upload: Upload, recording: Pick<Recording, 'audio'>) {
    if (!recording.audio) {
      if (upload.narration) throw new StoreError(422, 'Unreferenced narration asset');
      return;
    }
    if (!upload.narration) throw new StoreError(422, 'Upload narration before finalizing motion');
    let bytes: Buffer;
    try { bytes = await readFile(this.files.path('recordings', upload.id, 'narration.wav')); }
    catch { throw new StoreError(422, 'Narration asset is missing'); }
    if (bytes.length !== upload.narration.bytes || digest(bytes) !== upload.narration.sha256)
      throw new StoreError(422, 'Narration integrity check failed');
    validateNarration(bytes, recording.audio);
  }
  async narration(id: string) {
    const { recording } = await this.recording(id);
    if (!recording.audio) throw new StoreError(404, 'Recording has no narration');
    return readFile(this.files.path('recordings', id, 'narration.wav'));
  }
  async uploadStatus(id: string) { return this.files.read<Upload>('recordings', id); }
  async finalizeRecording(id: string, chunkCount: number, expectedHash: string) {
    return this.files.serial(id, async () => {
      const upload = await this.uploadStatus(id);
      if (upload.status === 'ready') {
        if (upload.hash !== expectedHash || upload.chunks.length !== chunkCount) throw new StoreError(409, 'Finalization retry differs');
        return { id, sha256: upload.hash, status: 'ready' as const };
      }
      if (upload.format === 'bytes') throw new StoreError(409, 'Use byte finalization for this recording');
      if (chunkCount !== upload.chunks.length || !chunkCount) throw new StoreError(409, 'Missing motion chunks');
      const frames: MotionFrame[] = [];
      for (let i = 0; i < chunkCount; i++) {
        const chunk = await this.files.read<MotionFrame[]>('recordings', id, `motion-${i}.json`);
        if (digest(JSON.stringify(chunk)) !== upload.chunks[i]!.hash) throw new StoreError(422, 'Stored chunk hash mismatch');
        frames.push(...chunk);
      }
      const recording = RecordingSchema.parse({ ...upload.metadata, id, frames });
      await this.verifyNarration(upload, recording);
      const hash = digest(JSON.stringify(recording));
      if (hash !== expectedHash) throw new StoreError(422, 'Recording hash mismatch');
      await this.files.write('recordings', id, recording, 'recording.json');
      await this.files.write('recordings', id, { ...upload, status: 'ready', hash });
      return { id, sha256: hash, status: 'ready' as const };
    });
  }
  async recording(id: string) {
    const manifest = await this.uploadStatus(id);
    if (manifest.status !== 'ready' || !manifest.hash) throw new StoreError(409, 'Recording upload is incomplete');
    const bytes = await readFile(this.files.path('recordings', id, 'recording.json'));
    const recording = parseContractJson(RecordingSchema, bytes.toString('utf8'));
    if (digest(bytes) !== manifest.hash) throw new StoreError(422, 'Recording integrity check failed');
    await this.verifyNarration(manifest, recording);
    return { recording, sha256: manifest.hash };
  }
  async recordingContent(id: string) { await this.recording(id); return readFile(this.files.path('recordings', id, 'recording.json')); }
  async uploadBytes(id: string, index: number, bytes: Buffer, expectedHash: string) {
    return this.files.serial(id, async () => {
      const upload = await this.uploadStatus(id);
      if (upload.format === 'frames') throw new StoreError(409, 'Cannot mix upload formats');
      if (bytes.length === 0 || bytes.length > MAX_CHUNK_BYTES || digest(bytes) !== expectedHash) throw new StoreError(422, 'Byte chunk size/hash mismatch');
      const existing = upload.chunks[index];
      if (existing) { if (existing.hash !== expectedHash) throw new StoreError(409, 'Byte chunk retry differs'); return { id, repeated: true }; }
      if (upload.status !== 'uploading' || index !== upload.chunks.length || index >= 64) throw new StoreError(409, 'Byte chunk order/immutability conflict');
      if (upload.chunks.reduce((sum, chunk) => sum + chunk.bytes, bytes.length) > MAX_MOTION_BYTES) throw new StoreError(413, 'Recording byte limit exceeded');
      await this.files.writeBytes('recordings', id, bytes, `bytes-${index}.bin`);
      upload.format = 'bytes'; upload.chunks.push({ hash: expectedHash, bytes: bytes.length, frames: 0 });
      await this.files.write('recordings', id, upload); return { id, repeated: false };
    });
  }
  async finalizeBytes(id: string, chunkCount: number, expectedHash: string) {
    return this.files.serial(id, async () => {
      const upload = await this.uploadStatus(id);
      if (upload.format !== 'bytes' || upload.chunks.length !== chunkCount) throw new StoreError(409, 'Incomplete byte upload');
      if (upload.status === 'ready') { if (upload.hash !== expectedHash) throw new StoreError(409, 'Finalization retry differs'); return { id, sha256: upload.hash, status: 'ready' }; }
      const chunks: Buffer[] = [];
      for (let index = 0; index < chunkCount; index++) {
        const bytes = await readFile(this.files.path('recordings', id, `bytes-${index}.bin`));
        if (digest(bytes) !== upload.chunks[index]!.hash) throw new StoreError(422, 'Stored byte chunk corrupted'); chunks.push(bytes);
      }
      const bytes = Buffer.concat(chunks);
      if (digest(bytes) !== expectedHash) throw new StoreError(422, 'Recording byte hash mismatch');
      let recording: Recording;
      try { recording = parseContractJson(RecordingSchema, new TextDecoder('utf-8', { fatal: true }).decode(bytes)); } catch { throw new StoreError(422, 'Invalid recording JSON'); }
      if (recording.id !== id) throw new StoreError(422, 'Recording identity mismatch');
      await this.verifyNarration(upload, recording);
      const { frames: _frames, id: _id, ...metadata } = recording;
      const expected = { ...upload.metadata } as Record<string, unknown>; delete expected.id;
      if (JSON.stringify(metadata) !== JSON.stringify(expected)) throw new StoreError(409, 'Recording metadata changed during upload');
      await this.files.writeBytes('recordings', id, bytes, 'recording.json');
      await this.files.write('recordings', id, { ...upload, status: 'ready', hash: expectedHash });
      return { id, sha256: expectedHash, status: 'ready' };
    });
  }
  async compile(recordingId: string, recordingHash: string, segmentationRevision: number) {
    return this.files.serial('compile', async () => {
      const jobIds = await this.files.ids('jobs');
      for (const id of jobIds) {
        const job = await this.files.read<CompileJob>('jobs', id);
        if (job.recordingId === recordingId && job.recordingHash === recordingHash && job.segmentationRevision === segmentationRevision && job.status === 'complete') return job;
      }
      if (jobIds.length >= 128) throw new StoreError(413, 'Local compile history limit reached');
      const { recording, sha256 } = await this.recording(recordingId);
      if (sha256 !== recordingHash) throw new StoreError(409, 'Recording revision changed');
      const job: CompileJob = { id: randomUUID(), recordingId, recordingHash, segmentationRevision, status: 'running', tutorialId: null, error: null };
      await this.files.write('jobs', job.id, job);
      try {
        const proposed = proposeSteps(recording);
        const tutorial = parseTutorialForRecording({ schemaVersion: 1, id: randomUUID(), revision: 1, recordingId, recordingHash, workspace: recording.workspace, status: 'draft', steps: proposed.steps.map(step => deriveStep(recording, step)), provenance: { segmentation: proposed.segmentation, labels: 'fallback', model: null, promptVersion: 'manual-review-v1' } }, recording, recordingHash);
        await this.files.write('tutorials', tutorial.id, { tutorial, references: [] });
        job.tutorialId = tutorial.id;
        if (recording.audio && this.provider) {
          try {
            const bytes = await this.narration(recordingId);
            const transcript = TranscriptResultSchema.parse(await this.provider.transcribe({ bytes: new Uint8Array(bytes),
              mimeType: recording.audio.mimeType, audioStartOffsetMs: recording.audio.audioStartOffsetMs,
              audioDurationHintMs: recording.audio.durationMs, signal: AbortSignal.timeout(30000) }));
            const request = LabelRequestSchema.parse({ schemaVersion: 1, transcript, segments: tutorial.steps.map(step => ({
              id: step.id, startMs: Math.round(recording.frames[step.startFrame]!.tMs),
              endMs: Math.round(recording.frames[step.endFrameExclusive]?.tMs ?? recording.durationMs + 1),
            })) });
            const result = LabelResultSchema.parse(await this.provider.label(request, AbortSignal.timeout(15000)));
            const checked = validateLabelOutput(request, { labels: result.labels });
            if (!checked.ok) throw new StoreError(422, 'Labels do not match recorded segments');
            // Keep the reviewed transcript and citations beside the immutable recording identity.
            await this.files.write('tutorials', tutorial.id, { recordingHash, transcript, segments: request.segments, result }, 'narration-review.json');
            await this.applyLabels(tutorial.id, { baseRevision: tutorial.revision, recordingHash,
              labels: checked.labels.map(label => ({ id: label.stepId, title: label.title, instruction: label.instruction, narrationSpanIds: label.narrationSpanIds })),
              provenance: result.provenance });
          } catch {
            // A provider outage must leave a durable manually reviewable draft, not lose the recording.
            job.error = 'Narration generation unavailable; review and write instructions manually.';
          }
        }
        job.status = 'complete';
      } catch (error) { job.status = 'failed'; job.error = error instanceof Error ? error.message.slice(0, 240) : 'Compilation failed'; }
      await this.files.write('jobs', job.id, job);
      return job;
    });
  }
  async bundle(id: string) { return this.files.read<TutorialBundle>('tutorials', id); }
  async tutorial(id: string) { return TutorialSchema.parse((await this.bundle(id)).tutorial); }
  async list() {
    const result = [];
    for (const id of await this.files.ids('tutorials')) { const value = await this.tutorial(id); result.push({ id, revision: value.revision, status: value.status, steps: value.steps.length, title: value.steps[0]?.title ?? 'Untitled' }); }
    return result;
  }
  async edit(id: string, input: TutorialDraftEdit) {
    const edit = TutorialDraftEditSchema.parse(input);
    return this.files.serial(id, async () => {
      const current = await this.tutorial(id);
      this.assertDraft(current, edit.baseRevision);
      const { recording, sha256 } = await this.recording(current.recordingId);
      let steps;
      try { steps = edit.steps.map(step => deriveStep(recording, step)); } catch (error) { throw new StoreError(422, (error as Error).message); }
      const next = parseTutorialForRecording({ ...current, revision: current.revision + 1, steps, provenance: { ...current.provenance, labels: edit.steps.some(step => step.instruction === 'Review this movement and describe the visible action.') ? 'fallback' : 'manual', model: null } }, recording, sha256);
      await this.files.write('tutorials', id, { tutorial: next, references: [] });
      return next;
    });
  }
  async finalizeTutorial(id: string, baseRevision: number) {
    return this.files.serial(id, async () => {
      const current = await this.tutorial(id);
      if (current.status === 'ready' && current.revision === baseRevision + 1) return current;
      this.assertDraft(current, baseRevision);
      if (current.provenance.labels === 'fallback') throw new StoreError(409, 'Review and save instructions before finalizing');
      const { recording, sha256 } = await this.recording(current.recordingId);
      const next = parseTutorialForRecording({ ...current, status: 'ready', revision: current.revision + 1 }, recording, sha256);
      const { references } = await this.bundle(id);
      await this.files.write('tutorials', id, { tutorial: next, references: references.map(reference => ({ ...reference, tutorialRevision: next.revision })) });
      return next;
    });
  }
  /** Provider-neutral semantic output boundary. Never accepts coordinates or frame edits. */
  async applyLabels(id: string, input: TutorialLabelBatch) {
    const batch = TutorialLabelBatchSchema.parse(input);
    return this.files.serial(id, async () => {
      const current = await this.tutorial(id); this.assertDraft(current, batch.baseRevision);
      if (batch.recordingHash !== current.recordingHash || batch.labels.length !== current.steps.length || new Set(batch.labels.map(label => label.id)).size !== current.steps.length || batch.labels.some(label => !current.steps.some(step => step.id === label.id))) throw new StoreError(409, 'Label output does not match current segmentation');
      const next = TutorialSchema.parse({ ...current, revision: current.revision + 1, steps: current.steps.map(step => ({ ...step, ...batch.labels.find(label => label.id === step.id)! })), provenance: { ...current.provenance, ...batch.provenance } });
      await this.files.write('tutorials', id, { tutorial: next, references: [] }); return next;
    });
  }
  private assertDraft(value: Tutorial, baseRevision: number) {
    if (value.status !== 'draft' || value.revision !== baseRevision) throw new StoreError(409, 'Stale revision or immutable ready tutorial');
  }
}
