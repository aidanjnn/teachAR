import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';
import { expect, it } from 'vitest';
import { RecordingSchema, type GuideContextRef } from '@trail/contracts';
import { createAuthoringFixture } from '@trail/motion';
import { TutorialRepository } from '../src/storage/repository.js';
import { ReferenceStore } from '../src/storage/references.js';
import { digest } from '../src/storage/files.js';

it('binds decoded images to reviewed checkpoint revisions and invalidates approval on edits', { timeout: 20000 }, async () => {
  const root = await mkdtemp(join(tmpdir(), 'trail-refs-'));
  try {
    const repository = new TutorialRepository(root); const store = new ReferenceStore(repository); const recording = createAuthoringFixture();
    const { frames, ...metadata } = recording; const upload = await repository.createRecording(metadata); recording.id = upload.id;
    await repository.upload(upload.id, 0, frames, digest(JSON.stringify(frames))); const hash = digest(JSON.stringify(RecordingSchema.parse(recording))); await repository.finalizeRecording(upload.id, 1, hash);
    const job = await repository.compile(upload.id, hash, 1); let tutorial = await repository.tutorial(job.tutorialId!);
    tutorial = await repository.edit(tutorial.id, { baseRevision: 1, steps: tutorial.steps.map(step => ({ ...step, activeHands: step.targets.map(target => target.side) })).map(({ id,title,startFrame,endFrameExclusive,checkpointFrame,activeHands,completionMode }) => ({ id,title,startFrame,endFrameExclusive,checkpointFrame,activeHands,completionMode,instruction:'Move the large part.' })) });
    const image = await sharp({ create: { width: 32, height: 32, channels: 3, background: '#126c8a' } }).png().toBuffer();
    const request = { recordingId: upload.id, recordingHash: hash, frameIndex: tutorial.steps[0]!.checkpointFrame, source: 'workspace-webcam' as const, image: { mimeType: 'image/png' as const, dataBase64: image.toString('base64'), sha256: digest(image), width: 32, height: 32 } };
    await expect(store.upload({ ...request, image: { ...request.image, width: 33 } })).rejects.toThrow('decoded');
    const asset = await store.upload(request);
    expect(await store.upload(request)).toEqual(asset);
    const candidates = await store.candidates(recording.id); expect(candidates).toHaveLength(1);
    expect(candidates[0]!.frameIndex).toBe(tutorial.steps[0]!.checkpointFrame); expect(candidates[0]!.image).not.toHaveProperty('dataBase64');
    expect((await repository.bundle(tutorial.id)).references).toHaveLength(0);
    const reference = { id: 'checkpoint-view', recordingId: upload.id, recordingHash: hash, tutorialId: tutorial.id, tutorialRevision: tutorial.revision, stepId: tutorial.steps[0]!.id, assetId: asset.id, source: request.source, visibleOutcome: 'Large part is visible at the right side.' };
    const reviewed = await store.review(tutorial.id, { baseRevision: tutorial.revision, references: [reference] });
    await expect(store.review(tutorial.id, { baseRevision: tutorial.revision, references: [reference] })).rejects.toThrow('stale');
    const ready = await repository.finalizeTutorial(tutorial.id, reviewed.tutorial.revision);
    const context: GuideContextRef = { runId:'run', tutorialId:ready.id,tutorialRevision:ready.revision,stepId:ready.steps[0]!.id,stepRevision:1,attemptId:'attempt' };
    const resolved = await store.resolveReferences(context); expect(resolved.references[0]!.reference.tutorialRevision).toBe(ready.revision); expect(resolved.references[0]!.image.sha256).toBe(digest(image));
    await expect(store.resolveReferences({ ...context, tutorialRevision: ready.revision-1 })).rejects.toThrow('revision');
    await expect(store.review(ready.id, { baseRevision: ready.revision, references: [] })).rejects.toThrow('stale');
  } finally { await rm(root, { recursive: true, force: true }); }
});
