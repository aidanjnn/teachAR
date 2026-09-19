import { z } from 'zod';
import { CounterSchema, IdSchema, RevisionSchema } from './common.js';
import { CompletionModeSchema } from './tutorial.js';
export const GuideContextRefSchema = z.strictObject({
  runId: IdSchema, tutorialId: IdSchema, tutorialRevision: RevisionSchema, stepId: IdSchema, stepRevision: RevisionSchema, attemptId: IdSchema,
});
export type GuideContextRef = z.infer<typeof GuideContextRefSchema>;
export const GuideSnapshotSchema = z.strictObject({
  phase: z.enum(['preloading', 'calibrating', 'showing', 'waiting-start', 'guiding', 'holding', 'tracking-lost', 'paused', 'complete']),
  tutorialId: IdSchema, tutorialRevision: RevisionSchema, stepId: IdSchema.nullable(), stepRevision: RevisionSchema, attemptId: IdSchema.nullable(),
  dwellProgress: z.number().min(0).max(1), pathProgress: z.number().min(0).max(1),
  nextGateByHand: z.strictObject({ left: RevisionSchema.max(128).optional(), right: RevisionSchema.max(128).optional() }),
  calibrationValid: z.boolean(), tracking: z.strictObject({ left: z.enum(['valid', 'missing']), right: z.enum(['valid', 'missing']) }),
}).refine(s => (s.stepId === null) === (s.attemptId === null), 'Step and attempt identities must be present together');
export type GuideSnapshot = z.infer<typeof GuideSnapshotSchema>;
const envelope = { schemaVersion: z.literal(1), sessionId: IdSchema, runId: IdSchema, seq: CounterSchema, tMs: z.number().min(0) };
export const GuideEventSchema = z.discriminatedUnion('type', [
  z.strictObject({ ...envelope, type: z.literal('snapshot'), state: GuideSnapshotSchema }),
  z.strictObject({ ...envelope, type: z.literal('tracking-changed'), state: GuideSnapshotSchema }),
  z.strictObject({ ...envelope, type: z.literal('step-completed'), stepId: IdSchema, attemptId: IdSchema, evidence: CompletionModeSchema }),
  z.strictObject({ ...envelope, type: z.literal('guide-ended'), reason: z.enum(['completed', 'cancelled']) }),
]);
export type GuideEvent = z.infer<typeof GuideEventSchema>;
