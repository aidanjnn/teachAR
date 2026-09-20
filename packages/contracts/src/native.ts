// Legacy import compatibility only. The WebXR tutor uses its own browser format.
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
