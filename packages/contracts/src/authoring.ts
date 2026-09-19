import { z } from 'zod';
import { HashSchema, IdSchema, RevisionSchema } from './common.js';
import { StepSceneReferenceSchema } from './scene.js';

// Delegated transport-only contracts. Spatial Tutorial/Recording formats remain canonical.
export const TutorialJobCreateSchema = z.strictObject({ recordingId: IdSchema, recordingHash: HashSchema, segmentationRevision: RevisionSchema.min(1) });
export const TutorialFinalizeSchema = z.strictObject({ baseRevision: RevisionSchema.min(1) });
export const ReferenceEditSchema = z.strictObject({ baseRevision: RevisionSchema.min(1), references: z.array(StepSceneReferenceSchema).max(64) });
export const ReferenceImageUploadSchema = z.strictObject({ recordingId: IdSchema, recordingHash: HashSchema, frameIndex: RevisionSchema.max(3599), source: z.enum(['quest-camera', 'workspace-webcam']), image: z.strictObject({ mimeType: z.enum(['image/jpeg', 'image/png']), dataBase64: z.string().min(1).max(2_796_204).regex(/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/), sha256: HashSchema, width: z.number().int().min(1).max(1280), height: z.number().int().min(1).max(1280) }) });
export type ReferenceImageUpload = z.infer<typeof ReferenceImageUploadSchema>;

import { GuideEventSchema } from './guide.js';
export const SpectatorStateSchema = z.strictObject({ type: z.literal('spectator-state'), connected: z.boolean(), updatedAt: z.number().nonnegative(), snapshot: GuideEventSchema.nullable() });
export type SpectatorState = z.infer<typeof SpectatorStateSchema>;
export const TutorialLabelBatchSchema = z.strictObject({ baseRevision: RevisionSchema.min(1), recordingHash: HashSchema, labels: z.array(z.strictObject({ id: IdSchema, title: z.string().min(1).max(60), instruction: z.string().min(1).max(240), narrationSpanIds: z.array(IdSchema).max(256) })).min(1).max(128), provenance: z.strictObject({ labels: z.enum(['model', 'manual', 'fallback']), model: z.string().min(1).max(128).nullable(), promptVersion: z.string().min(1).max(128) }) });
export type TutorialLabelBatch = z.infer<typeof TutorialLabelBatchSchema>;
