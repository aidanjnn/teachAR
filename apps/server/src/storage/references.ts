import { randomUUID } from 'node:crypto';
import sharp from 'sharp';
import { ReferenceEditSchema, ReferenceImageUploadSchema, SceneReferenceManifestSchema, type GuideContextRef, type ReferenceImageUpload, type StepSceneReference } from '@trail/contracts';
import { TutorialRepository } from './repository.js';
import { digest, StoreError } from './files.js';

type Asset = ReferenceImageUpload & { id: string };
export class ReferenceStore {
  constructor(private readonly repository: TutorialRepository) {}
  async upload(input: ReferenceImageUpload) {
    const parsed = ReferenceImageUploadSchema.parse(input);
    const { recording, sha256 } = await this.repository.recording(parsed.recordingId);
    if (sha256 !== parsed.recordingHash || parsed.frameIndex >= recording.frames.length) throw new StoreError(409, 'Reference recording/frame mismatch');
    const bytes = Buffer.from(parsed.image.dataBase64, 'base64');
    if (bytes.length > 2 * 1024 * 1024 || digest(bytes) !== parsed.image.sha256) throw new StoreError(422, 'Reference image hash or byte limit mismatch');
    try {
      const decoder = sharp(bytes, { limitInputPixels: 1280 * 1280, failOn: 'warning', animated: false });
      const metadata = await decoder.metadata();
      if ((parsed.image.mimeType === 'image/png' ? 'png' : 'jpeg') !== metadata.format || metadata.width !== parsed.image.width || metadata.height !== parsed.image.height || (metadata.pages ?? 1) !== 1) throw new Error('Dimensions or type mismatch');
      await decoder.raw().toBuffer();
    } catch { throw new StoreError(422, 'Reference image could not be decoded within limits'); }
    return this.repository.files.serial('reference-upload', async () => {
      let count = 0; let total = bytes.length;
      for (const id of await this.repository.files.ids('assets')) {
        const asset = await this.repository.files.read<Asset>('assets', id);
        if (asset.recordingId === parsed.recordingId) {
          if (asset.recordingHash === parsed.recordingHash && asset.frameIndex === parsed.frameIndex && asset.source === parsed.source && asset.image.sha256 === parsed.image.sha256) return { id: asset.id, sha256: asset.image.sha256 };
          count++; total += Buffer.byteLength(asset.image.dataBase64, 'base64');
        }
      }
      if (count >= 240 || total > 64 * 1024 * 1024) throw new StoreError(413, 'Reference capture limit reached');
      const id = randomUUID(); await this.repository.files.write('assets', id, { ...parsed, id });
      return { id, sha256: parsed.image.sha256 };
    });
  }
  async candidates(recordingId: string) {
    const { sha256 } = await this.repository.recording(recordingId);
    const result = [];
    for (const id of await this.repository.files.ids('assets')) {
      const asset = await this.repository.files.read<Asset>('assets', id);
      if (asset.recordingId !== recordingId || asset.recordingHash !== sha256) continue;
      const { image, ...identity } = asset; const { dataBase64: _bytes, ...metadata } = image;
      result.push({ ...identity, image: metadata });
    }
    return result.sort((a, b) => a.frameIndex - b.frameIndex);
  }
  async review(id: string, input: unknown) {
    const edit = ReferenceEditSchema.parse(input);
    return this.repository.files.serial(id, async () => {
      const tutorial = await this.repository.tutorial(id);
      if (tutorial.status !== 'draft' || tutorial.revision !== edit.baseRevision) throw new StoreError(409, 'Reference review revision is stale');
      const { recording } = await this.repository.recording(tutorial.recordingId);
      const counts = new Map<string, number>();
      for (const reference of edit.references) {
        const step = tutorial.steps.find(value => value.id === reference.stepId);
        if (!step || reference.tutorialId !== id || reference.tutorialRevision !== tutorial.revision || reference.recordingId !== tutorial.recordingId || reference.recordingHash !== tutorial.recordingHash) throw new StoreError(409, 'Reference identity mismatch');
        const asset = await this.repository.files.read<Asset>('assets', reference.assetId);
        if (asset.recordingId !== tutorial.recordingId || asset.recordingHash !== tutorial.recordingHash || asset.source !== reference.source || asset.frameIndex < step.startFrame || asset.frameIndex >= step.endFrameExclusive || Math.abs(recording.frames[asset.frameIndex]!.tMs - recording.frames[step.checkpointFrame]!.tMs) > 250) throw new StoreError(409, 'Reference must depict this recorded checkpoint');
        const count = (counts.get(step.id) ?? 0) + 1; counts.set(step.id, count);
        if (count > 2) throw new StoreError(400, 'At most two reviewed views per step');
      }
      const next = { ...tutorial, revision: tutorial.revision + 1 };
      const references = edit.references.map(reference => ({ ...reference, tutorialRevision: next.revision }));
      SceneReferenceManifestSchema.parse({ schemaVersion: 1, recordingId: tutorial.recordingId, recordingHash: tutorial.recordingHash, tutorialId: id, tutorialRevision: next.revision, references });
      await this.repository.files.write('tutorials', id, { tutorial: next, references }); return { tutorial: next, references };
    });
  }
  async resolveReferences(context: GuideContextRef) {
    const { tutorial, references } = await this.repository.bundle(context.tutorialId);
    if (tutorial.status !== 'ready' || tutorial.revision !== context.tutorialRevision) throw new StoreError(409, 'Ready tutorial revision unavailable');
    const step = tutorial.steps.find(value => value.id === context.stepId);
    if (!step) throw new StoreError(404, 'Step unavailable');
    const selected = references.filter(reference => reference.stepId === step.id && reference.tutorialRevision === tutorial.revision);
    if (!selected.length || selected.length > 2) throw new StoreError(409, 'Reviewed visual references unavailable');
    const result: { reference: StepSceneReference; image: ReferenceImageUpload['image'] }[] = [];
    for (const reference of selected) {
      const asset = await this.repository.files.read<Asset>('assets', reference.assetId);
      if (digest(Buffer.from(asset.image.dataBase64, 'base64')) !== asset.image.sha256) throw new StoreError(422, 'Reference integrity check failed');
      result.push({ reference, image: asset.image });
    }
    return { references: result, approvedStep: { title: step.title, instruction: step.instruction, expectedVisibleOutcome: selected.map(reference => reference.visibleOutcome).join(' ') } };
  }
  async image(id: string) {
    const asset = await this.repository.files.read<Asset>('assets', id);
    const { id: _id, ...value } = asset; const parsed = ReferenceImageUploadSchema.parse(value);
    if (digest(Buffer.from(parsed.image.dataBase64, 'base64')) !== parsed.image.sha256) throw new StoreError(422, 'Reference integrity check failed');
    return { ...parsed, id };
  }
}
