import { z } from 'zod';
import { CounterSchema, HashSchema, IdSchema, RevisionSchema, unique } from './common.js';
import { GuideContextRefSchema } from './guide.js';
import { TutorialSchema, type Tutorial } from './tutorial.js';
export const SceneSourceSchema = z.enum(['quest-camera', 'workspace-webcam']);
/** Separately reviewed setup image; never an endpoint verdict or a progression target. */
export const StartingLayoutSchema = z.strictObject({
  schemaVersion: z.literal(1), recordingId: IdSchema, recordingHash: HashSchema,
  tutorialId: IdSchema, tutorialRevision: RevisionSchema, assetId: IdSchema,
  source: SceneSourceSchema, frameIndex: z.number().int().min(0).max(3599), notes: z.string().min(1).max(500),
});
export type StartingLayout = z.infer<typeof StartingLayoutSchema>;
export const StartingLayoutEditSchema = z.strictObject({ baseRevision: RevisionSchema, assetId: IdSchema, notes: z.string().min(1).max(500) });
export type StartingLayoutEdit = z.infer<typeof StartingLayoutEditSchema>;
export const StepSceneReferenceSchema = z.strictObject({
  id: IdSchema, recordingId: IdSchema, recordingHash: HashSchema, tutorialId: IdSchema, tutorialRevision: RevisionSchema,
  stepId: IdSchema, assetId: IdSchema, source: SceneSourceSchema, visibleOutcome: z.string().min(1).max(2000),
});
export type StepSceneReference = z.infer<typeof StepSceneReferenceSchema>;
export const SceneReferenceManifestSchema = z.strictObject({
  schemaVersion: z.literal(1), recordingId: IdSchema, recordingHash: HashSchema, tutorialId: IdSchema, tutorialRevision: RevisionSchema,
  references: z.array(StepSceneReferenceSchema).max(256),
}).refine(m => unique(m.references.map(r => r.id)) && m.references.every(r => r.recordingId === m.recordingId && r.recordingHash === m.recordingHash && r.tutorialId === m.tutorialId && r.tutorialRevision === m.tutorialRevision), 'Reference identity mismatch or duplicate ID');
export type SceneReferenceManifest = z.infer<typeof SceneReferenceManifestSchema>;
export const InspectionRequestSchema = GuideContextRefSchema.extend({
  requestId: IdSchema, liveSessionId: IdSchema, sessionGeneration: RevisionSchema, requestEpoch: RevisionSchema,
  delegationId: IdSchema.nullable(), question: z.string().min(1).max(4000), referenceIds: z.array(IdSchema).max(2).refine(unique, 'Duplicate reference ID'),
});
export type InspectionRequest = z.infer<typeof InspectionRequestSchema>;
export const SceneObservationSchema = z.strictObject({
  id: IdSchema, requestId: IdSchema, captureNonce: IdSchema, sourceSessionId: IdSchema, source: SceneSourceSchema,
  assetId: IdSchema, sourceFrameSeq: CounterSchema, captureAgeAtSendMs: z.number().min(0).max(120_000), receivedAtServerMonoMs: z.number().min(0),
});
export type SceneObservation = z.infer<typeof SceneObservationSchema>;
export const CoachAssessmentSchema = z.strictObject({
  verdict: z.enum(['visible-match', 'adjustment-needed', 'uncertain', 'motion-only']), observedEvidence: z.array(z.string().min(1).max(1000)).max(8),
  limitation: z.string().min(1).max(2000), feedback: z.string().min(1).max(2000), suggestedAction: z.enum(['none', 'show-another-view', 'replay', 'slower-preview']),
}).refine(a => (a.verdict !== 'visible-match' && a.verdict !== 'adjustment-needed') || a.observedEvidence.length > 0, 'Visual verdict requires observed evidence');
export type CoachAssessment = z.infer<typeof CoachAssessmentSchema>;
export const InspectionResultSchema = z.strictObject({
  request: InspectionRequestSchema, observationId: IdSchema.nullable(), referenceIds: z.array(IdSchema).max(2).refine(unique, 'Duplicate reference ID'),
  assessment: CoachAssessmentSchema, provenance: z.enum(['model', 'fallback', 'mock']),
}).refine(r => r.referenceIds.length === r.request.referenceIds.length && r.referenceIds.every((id, i) => id === r.request.referenceIds[i]) &&
  ((r.assessment.verdict !== 'visible-match' && r.assessment.verdict !== 'adjustment-needed') || (r.observationId !== null && r.referenceIds.length > 0)), 'Result references must match request; visual verdict needs observation and reference');
export type InspectionResult = z.infer<typeof InspectionResultSchema>;

/** Bind reviewed scene sidecar to the current tutorial; asset approval remains a storage responsibility. */
export function parseSceneReferencesForTutorial(input: unknown, tutorialInput: Tutorial): SceneReferenceManifest {
  const manifest = SceneReferenceManifestSchema.parse(input);
  const tutorial = TutorialSchema.parse(tutorialInput);
  if (manifest.recordingId !== tutorial.recordingId || manifest.recordingHash !== tutorial.recordingHash || manifest.tutorialId !== tutorial.id || manifest.tutorialRevision !== tutorial.revision || !manifest.references.every(r => tutorial.steps.some(s => s.id === r.stepId))) throw new Error('Scene references do not belong to the current tutorial steps/revision');
  return manifest;
}
