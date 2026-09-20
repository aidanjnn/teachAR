import { z } from 'zod';
import { PoseSchema, Vec3Schema, RecordingSchema, type Recording, type JointName } from './recording.js';
import { HashSchema, IdSchema, RevisionSchema } from './common.js';
export const CalibrationV2Schema = z.strictObject({
  schemaVersion: z.literal(2), id: IdSchema, referenceSpaceType: z.literal('native-device'), trackingSessionId: IdSchema,
  originRevision: RevisionSchema, referenceFromWorkspace: PoseSchema, sampledReferencePointsM: z.tuple([Vec3Schema, Vec3Schema, Vec3Schema]),
  verificationErrorM: z.number().min(0), valid: z.boolean(),
});
export type CalibrationV2 = z.infer<typeof CalibrationV2Schema>;
export const ClockMappingSchema = z.strictObject({ source: z.enum(['native-monotonic', 'unity-dsp', 'camera-sensor']), offsetToMonotonicMs: z.number(), uncertaintyMs: z.number().min(0).max(120_000) });
export const NativeCaptureSidecarSchema = z.strictObject({
  schemaVersion: z.literal(1), recordingId: IdSchema, recordingHash: HashSchema, trackingSessionId: IdSchema, originRevision: RevisionSchema,
  provider: IdSchema, editorVersion: IdSchema, sdkVersion: IdSchema, skeleton: z.literal('openxr-26'), adapterVersion: IdSchema,
  clock: ClockMappingSchema, confidencePolicy: z.literal('all-required-joints-valid'), source: z.enum(['live', 'synthetic-fixture', 'recorded-fixture']),
});
export type NativeCaptureSidecar = z.infer<typeof NativeCaptureSidecarSchema>;
export type ClockMapping = z.infer<typeof ClockMappingSchema>;
export const OPENXR_JOINT_MAP: Readonly<Record<JointName, string>> = Object.freeze({
  wrist: 'XR_HAND_JOINT_WRIST_EXT',
  'thumb-metacarpal': 'XR_HAND_JOINT_THUMB_METACARPAL_EXT', 'thumb-phalanx-proximal': 'XR_HAND_JOINT_THUMB_PROXIMAL_EXT', 'thumb-phalanx-distal': 'XR_HAND_JOINT_THUMB_DISTAL_EXT', 'thumb-tip': 'XR_HAND_JOINT_THUMB_TIP_EXT',
  ...Object.fromEntries((['index', 'middle', 'ring', 'pinky'] as const).flatMap(finger => [
    [`${finger}-finger-metacarpal`, `XR_HAND_JOINT_${finger === 'pinky' ? 'LITTLE' : finger.toUpperCase()}_METACARPAL_EXT`],
    ...(['proximal', 'intermediate', 'distal'] as const).map(bone => [`${finger}-finger-phalanx-${bone}`, `XR_HAND_JOINT_${finger === 'pinky' ? 'LITTLE' : finger.toUpperCase()}_${bone.toUpperCase()}_EXT`]),
    [`${finger}-finger-tip`, `XR_HAND_JOINT_${finger === 'pinky' ? 'LITTLE' : finger.toUpperCase()}_TIP_EXT`],
  ])),
} as Record<JointName, string>);

/** Hash must be verified against finalized bytes by the storage adapter. */
export function parseNativeSidecarForRecording(input: unknown, recordingInput: Recording, recordingHash: string): NativeCaptureSidecar {
  const sidecar = NativeCaptureSidecarSchema.parse(input);
  const recording = RecordingSchema.parse(recordingInput);
  if (sidecar.recordingId !== recording.id || sidecar.recordingHash !== HashSchema.parse(recordingHash) || sidecar.source !== recording.source) throw new Error('Native sidecar recording/hash/source mismatch');
  return sidecar;
}

/** Local authoring envelope. Motion remains v1; legacy bare recordings still import. */
export const TakeAuthoringMetadataSchema = z.strictObject({
  schemaVersion: z.literal(1), tutorialId: IdSchema,
  takeIndex: z.number().int().min(0).max(127),
  savePosition: z.strictObject({ leftM: Vec3Schema, rightM: Vec3Schema }),
  trim: z.strictObject({ startMs: z.number().min(0).max(120_000), endMsExclusive: z.number().positive().max(120_001) }),
  trimReason: z.enum(['endpoint-hold', 'endpoint-hold-return', 'explicit-stop']),
}).superRefine((value, ctx) => {
  if ([...value.savePosition.leftM, ...value.savePosition.rightM].some(v => Math.abs(v) > 10))
    ctx.addIssue({ code: 'custom', message: 'Save position must lie within 10 m of the workspace origin' });
  if (value.trim.endMsExclusive <= value.trim.startMs)
    ctx.addIssue({ code: 'custom', message: 'Trim must be a nonempty half-open interval' });
});
export const AuthoredCaptureSchema = z.strictObject({
  schemaVersion: z.literal(1), recording: RecordingSchema, authoring: TakeAuthoringMetadataSchema,
}).superRefine((value, ctx) => {
  if (value.recording.durationMs >= value.authoring.trim.endMsExclusive - value.authoring.trim.startMs)
    ctx.addIssue({ code: 'custom', message: 'Motion must fit inside the retained half-open interval' });
});
export type TakeAuthoringMetadata = z.infer<typeof TakeAuthoringMetadataSchema>;
export type AuthoredCapture = z.infer<typeof AuthoredCaptureSchema>;
