import { z } from 'zod';
import { RecordingSchema, MotionFrameSchema, JOINT_NAMES } from './recording.js';
import { HashSchema, RevisionSchema } from './common.js';
// Transport shapes only: authorization, server ID assignment and final hash verification belong to storage.
export const RecordingMetadataSchema = z.strictObject(RecordingSchema.shape).omit({ frames: true }).refine(r =>
  r.jointOrder.every((joint, i) => joint === JOINT_NAMES[i]) && new Set(r.markers.map(m => m.id)).size === r.markers.length && r.markers.every(m => m.tMs <= r.durationMs), 'Invalid recording metadata');
export const CreateRecordingRequestSchema = z.strictObject({ metadata: RecordingMetadataSchema });
export const MotionChunkSchema = z.strictObject({ frames: z.array(MotionFrameSchema).min(1).max(3600), sha256: HashSchema });
export const FinalizeRecordingRequestSchema = z.strictObject({ chunkCount: RevisionSchema.min(1).max(3600), sha256: HashSchema });
export type RecordingMetadata = z.infer<typeof RecordingMetadataSchema>;
export type CreateRecordingRequest = z.infer<typeof CreateRecordingRequestSchema>;
export type MotionChunk = z.infer<typeof MotionChunkSchema>;
export type FinalizeRecordingRequest = z.infer<typeof FinalizeRecordingRequestSchema>;
