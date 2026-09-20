import { z } from 'zod';
import { VisionImageSchema } from './vision-image.js';
import { IdSchema, RevisionSchema, unique } from './common.js';
import { CoachAssessmentSchema, InspectionRequestSchema, SceneObservationSchema, StepSceneReferenceSchema } from './scene.js';

// Independent service protocol; RecordingSchema v1 remains unchanged.
export const VisionHealthSchema = z.strictObject({
  schemaVersion: z.literal(1), service: z.literal('vision'),
  status: z.literal('ok'), buildId: z.string().min(1).max(128),
  provider: z.enum(['mock', 'openai']), capabilities: z.strictObject({ imageInterpretation: z.boolean() }),
});
export type VisionHealth = z.infer<typeof VisionHealthSchema>;
export const VisionReadinessSchema = z.strictObject({
  schemaVersion: z.literal(1), service: z.literal('vision'), ready: z.boolean(),
  reason: z.enum(['not-implemented', 'ready', 'mock-provider', 'provider-unconfigured', 'busy']),
}).refine(value => value.ready === (value.reason === 'ready'), 'Readiness reason mismatch');
export const VisionDependencySchema = z.discriminatedUnion('status', [
  z.strictObject({ status: z.literal('disabled') }), z.strictObject({ status: z.literal('unavailable') }),
  z.strictObject({ status: z.literal('reachable'), health: VisionHealthSchema }),
]);
export type VisionDependency = z.infer<typeof VisionDependencySchema>;
export { VisionImageSchema, type VisionImage } from './vision-image.js';
export const VisionReferenceSchema = z.strictObject({ reference: StepSceneReferenceSchema, image: VisionImageSchema });
export const ApprovedInspectionStepSchema = z.strictObject({
  title: z.string().min(1).max(200), instruction: z.string().min(1).max(4000), expectedVisibleOutcome: z.string().min(1).max(2000),
});
export const VisionInspectionInputSchema = z.strictObject({
  schemaVersion: z.literal(1), request: InspectionRequestSchema, observation: SceneObservationSchema,
  currentImage: VisionImageSchema, references: z.array(VisionReferenceSchema).min(1).max(2),
  approvedStep: ApprovedInspectionStepSchema, movementSummary: z.string().max(2000),
  remainingBudgetMs: z.number().int().min(1).max(8000),
}).refine(value => value.observation.requestId === value.request.requestId && value.observation.captureAgeAtSendMs <= 500 &&
  unique(value.references.map(entry => entry.reference.id)) && value.references.length === value.request.referenceIds.length &&
  value.references.every((entry, index) => entry.reference.id === value.request.referenceIds[index] &&
    entry.reference.tutorialId === value.request.tutorialId && entry.reference.tutorialRevision === value.request.tutorialRevision &&
    entry.reference.stepId === value.request.stepId && entry.reference.recordingId === value.references[0]?.reference.recordingId &&
    entry.reference.recordingHash === value.references[0]?.reference.recordingHash), 'Inspection evidence identity or freshness mismatch');
export type VisionInspectionInput = z.infer<typeof VisionInspectionInputSchema>;
export const VisionInspectionResultSchema = z.strictObject({
  schemaVersion: z.literal(1), requestId: IdSchema, requestEpoch: RevisionSchema, observationId: IdSchema,
  referenceIds: z.array(IdSchema).min(1).max(2).refine(unique), assessment: CoachAssessmentSchema,
  provider: z.enum(['mock', 'openai']), model: z.string().min(1).max(128), serviceDurationMs: z.number().min(0).max(8000),
});
export type VisionInspectionResult = z.infer<typeof VisionInspectionResultSchema>;
export const VisionFailureSchema = z.strictObject({ schemaVersion: z.literal(1), error: z.enum([
  'invalid-input', 'invalid-image', 'busy', 'conflict', 'cancelled', 'deadline', 'provider-unavailable', 'invalid-assessment', 'stale',
]) });
export type VisionFailure = z.infer<typeof VisionFailureSchema>;
export * from './vision-transport.js';
