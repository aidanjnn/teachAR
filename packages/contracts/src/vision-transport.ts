import { z } from 'zod';
import { IdSchema, CounterSchema, RevisionSchema } from './common.js';
import { GuideContextRefSchema } from './guide.js';
import { InspectionRequestSchema, SceneSourceSchema } from './scene.js';
import { VisionImageSchema } from './vision-image.js';

// A fresh authenticated Check obtains a server-issued incarnation. Generation is 1 within this v1 lease.
export const InspectionSessionSchema = z.strictObject({ schemaVersion: z.literal(1), liveSessionId: IdSchema });
export type InspectionSession = z.infer<typeof InspectionSessionSchema>;

// Public authenticated native/browser transport. Server assigns request/observation IDs and receipt times.
export const InspectionStartSchema = z.strictObject({
  schemaVersion: z.literal(1), context: GuideContextRefSchema,
  liveSessionId: IdSchema, sessionGeneration: RevisionSchema, requestEpoch: RevisionSchema,
  question: z.string().min(1).max(4000), sourceSessionId: IdSchema, source: SceneSourceSchema,
  sourceFrameSeq: CounterSchema,
});
export type InspectionStart = z.infer<typeof InspectionStartSchema>;
export const InspectionCaptureSchema = z.strictObject({
  schemaVersion: z.literal(1), request: InspectionRequestSchema, captureNonce: IdSchema,
  sourceSessionId: IdSchema, minSourceFrameSeq: CounterSchema,
  uploadWithinMs: z.number().int().min(1).max(2000), totalBudgetMs: z.number().int().min(1).max(8000),
});
export type InspectionCapture = z.infer<typeof InspectionCaptureSchema>;
export const InspectionUploadSchema = z.strictObject({
  schemaVersion: z.literal(1), requestId: IdSchema, requestEpoch: RevisionSchema, captureNonce: IdSchema,
  sourceSessionId: IdSchema, source: SceneSourceSchema, sourceFrameSeq: CounterSchema,
  captureAgeAtSendMs: z.number().min(0).max(500), image: VisionImageSchema,
});
export type InspectionUpload = z.infer<typeof InspectionUploadSchema>;
export const InspectionCancelSchema = z.strictObject({ requestId: IdSchema, requestEpoch: RevisionSchema });
