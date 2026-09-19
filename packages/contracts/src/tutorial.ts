import { z } from 'zod';
import { PoseSchema, SideSchema, Vec3Schema, WorkspaceDefinitionSchema, RecordingSchema, type Recording, type Pose } from './recording.js';
import { HashSchema, IdSchema, RevisionSchema, unique } from './common.js';
export const CompletionModeSchema = z.enum(['path-and-pose', 'pose-match', 'user-confirmed']);
export const MotionGateSchema = z.strictObject({
  frameIndex: RevisionSchema.max(3599), positionM: Vec3Schema,
  toleranceM: z.number().positive().max(1), dwellMs: z.number().min(0).max(10_000),
});
export type MotionGate = z.infer<typeof MotionGateSchema>;
export const HandTargetSchema = z.strictObject({
  side: SideSchema, joint: z.literal('wrist'), startPose: PoseSchema, checkpointPose: PoseSchema,
  positionToleranceM: z.number().positive().max(1), orientationToleranceRad: z.number().positive().max(Math.PI).nullable(),
  gesture: z.enum(['any', 'pinch', 'open']), motionGates: z.array(MotionGateSchema).max(128), pathCorridorM: z.number().positive().max(1),
});
export type HandTarget = z.infer<typeof HandTargetSchema>;
const range = { id: IdSchema, startFrame: RevisionSchema.max(3599), endFrameExclusive: RevisionSchema.min(1).max(3600), checkpointFrame: RevisionSchema.max(3599) };
function validRange(s: { startFrame: number; endFrameExclusive: number; checkpointFrame: number }) {
  return s.startFrame < s.endFrameExclusive && s.checkpointFrame >= s.startFrame && s.checkpointFrame < s.endFrameExclusive;
}
export const TutorialStepSchema = z.strictObject({
  ...range, title: z.string().min(1).max(60), instruction: z.string().min(1).max(240),
  targets: z.array(HandTargetSchema).min(1).max(2), dwellMs: z.number().min(0).max(10_000),
  startDwellMs: z.number().min(0).max(10_000), completionMode: CompletionModeSchema,
  narrationSpanIds: z.array(IdSchema).max(256).refine(unique, 'Duplicate narration ID'),
}).superRefine((s, ctx) => {
  const fail = (message: string) => ctx.addIssue({ code: 'custom', message });
  if (!validRange(s)) fail('Invalid half-open step range');
  if (!unique(s.targets.map(t => t.side))) fail('Duplicate target hand');
  for (const target of s.targets) {
    let previous = s.startFrame;
    for (const gate of target.motionGates) {
      if (gate.frameIndex <= previous || gate.frameIndex >= s.checkpointFrame) fail('Gates must increase strictly between start and checkpoint');
      previous = gate.frameIndex;
    }
    if (s.completionMode === 'path-and-pose' && target.motionGates.length === 0) fail('Path matching requires intermediate gates for each active hand');
  }
});
export type TutorialStep = z.infer<typeof TutorialStepSchema>;
export const TutorialProvenanceSchema = z.strictObject({
  segmentation: z.enum(['explicit-markers', 'motion-proposals']), labels: z.enum(['model', 'manual', 'fallback']),
  model: z.string().min(1).max(128).nullable(), promptVersion: z.string().min(1).max(128),
}).refine(p => p.labels !== 'model' || p.model !== null, 'Model labels require model provenance');
export const TutorialSchema = z.strictObject({
  schemaVersion: z.literal(1), id: IdSchema, revision: RevisionSchema, recordingId: IdSchema, recordingHash: HashSchema,
  workspace: WorkspaceDefinitionSchema, status: z.enum(['draft', 'ready']), steps: z.array(TutorialStepSchema).min(1).max(128), provenance: TutorialProvenanceSchema,
}).refine(t => ordered(t.steps), 'Step IDs must be unique and ranges ordered without overlap');
export type Tutorial = z.infer<typeof TutorialSchema>;
function ordered(steps: { id: string; startFrame: number; endFrameExclusive: number }[]) {
  return unique(steps.map(s => s.id)) && steps.every((s, i) => i === 0 || s.startFrame >= steps[i - 1]!.endFrameExclusive);
}
export const TutorialDraftStepSchema = z.strictObject({
  ...range, activeHands: z.array(SideSchema).min(1).max(2).refine(unique, 'Duplicate active hand'),
  completionMode: CompletionModeSchema, title: z.string().min(1).max(60), instruction: z.string().min(1).max(240),
}).refine(validRange, 'Invalid half-open step range');
export const TutorialDraftEditSchema = z.strictObject({
  baseRevision: RevisionSchema, steps: z.array(TutorialDraftStepSchema).min(1).max(128),
}).refine(t => ordered(t.steps), 'Step IDs must be unique and ranges ordered without overlap');
export type TutorialDraftEdit = z.infer<typeof TutorialDraftEditSchema>;
export type TutorialDraftStep = z.infer<typeof TutorialDraftStepSchema>;
const samePose = (a: Pose, b: Pose) => a.positionM.every((v, i) => Math.abs(v - b.positionM[i]!) <= 1e-6) &&
  Math.min(Math.hypot(...a.orientationXyzw.map((v, i) => v - b.orientationXyzw[i]!)), Math.hypot(...a.orientationXyzw.map((v, i) => v + b.orientationXyzw[i]!))) <= 1e-4;
export function parseTutorialForRecording(input: unknown, recordingInput: Recording, recordingHash: string): Tutorial {
  const recording = RecordingSchema.parse(recordingInput);
  const tutorial = TutorialSchema.parse(input);
  if (tutorial.recordingId !== recording.id || tutorial.recordingHash !== HashSchema.parse(recordingHash) ||
      JSON.stringify(tutorial.workspace) !== JSON.stringify(recording.workspace)) throw new Error('Tutorial recording/hash/workspace binding mismatch');
  for (const step of tutorial.steps) {
    if (step.endFrameExclusive > recording.frames.length) throw new Error('Step exceeds recording');
    for (const target of step.targets) {
      const start = recording.frames[step.startFrame]!.hands[target.side];
      const checkpoint = recording.frames[step.checkpointFrame]!.hands[target.side];
      if (start.status !== 'valid' || checkpoint.status !== 'valid' || !samePose(start.joints.wrist, target.startPose) || !samePose(checkpoint.joints.wrist, target.checkpointPose)) throw new Error('Target must derive from valid recording wrists');
      for (const gate of target.motionGates) {
        const hand = recording.frames[gate.frameIndex]!.hands[target.side];
        if (hand.status !== 'valid' || !hand.joints.wrist.positionM.every((v, i) => Math.abs(v - gate.positionM[i]!) <= 1e-6)) throw new Error('Gate must derive from valid recording wrist');
      }
    }
  }
  return tutorial;
}
