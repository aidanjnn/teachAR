import { z } from 'zod';
import { IdSchema } from './common.js';
import { SceneSourceSchema } from './scene.js';
import { CoachContextSchema } from './voice.js';

/** One JPEG the browser captured or stored, base64 without the data URL prefix. Bounded here before any decode. */
export const SceneImageSchema = z.strictObject({
  mimeType: z.literal('image/jpeg'),
  dataBase64: z.string().min(64).max(1_400_000).regex(/^[A-Za-z0-9+/]+={0,2}$/),
});
export type SceneImage = z.infer<typeof SceneImageSchema>;

/** Look & advise: a fresh frame, the step's reference photo and a question, grounded on the stored tutorial by the server. */
export const SceneAdviceRequestSchema = z.strictObject({
  schemaVersion: z.literal(1),
  requestId: IdSchema,
  context: CoachContextSchema,
  question: z.string().trim().min(1).max(240),
  source: SceneSourceSchema,
  image: SceneImageSchema,
  reference: SceneImageSchema.nullable().default(null),
  /** Age of the frame when the request was built; the server refuses old frames. */
  captureAgeMs: z.number().int().min(0).max(30_000),
  /** The tutor's epoch at capture time, echoed back so a late answer can be dropped. */
  epoch: z.number().int().min(0).max(1_000_000_000),
});
export type SceneAdviceRequest = z.infer<typeof SceneAdviceRequestSchema>;

export const SceneAdviceResponseSchema = z.strictObject({
  schemaVersion: z.literal(1),
  requestId: IdSchema,
  tutorialId: IdSchema,
  tutorialRevision: z.number().int().min(0),
  stepId: IdSchema,
  stepRevision: z.number().int().min(0),
  epoch: z.number().int().min(0),
  source: SceneSourceSchema,
  transcript: z.string().min(1).max(600),
  /** WAV bytes, base64; null when the model returned no speech or the guard replaced the answer. */
  audio: z.strictObject({ format: z.literal('wav'), dataBase64: z.string().min(64).max(4_000_000) }).nullable(),
  model: z.string().min(1).max(128),
  /** `guarded` means the model's words were replaced because they claimed completion, verification or measurements. */
  provenance: z.enum(['model', 'guarded']),
  latencyMs: z.number().int().min(0),
});
export type SceneAdviceResponse = z.infer<typeof SceneAdviceResponseSchema>;
