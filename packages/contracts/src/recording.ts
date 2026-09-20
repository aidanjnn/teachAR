import { z } from 'zod';

export const JOINT_NAMES = [
  'wrist',
  'thumb-metacarpal', 'thumb-phalanx-proximal', 'thumb-phalanx-distal', 'thumb-tip',
  'index-finger-metacarpal', 'index-finger-phalanx-proximal', 'index-finger-phalanx-intermediate', 'index-finger-phalanx-distal', 'index-finger-tip',
  'middle-finger-metacarpal', 'middle-finger-phalanx-proximal', 'middle-finger-phalanx-intermediate', 'middle-finger-phalanx-distal', 'middle-finger-tip',
  'ring-finger-metacarpal', 'ring-finger-phalanx-proximal', 'ring-finger-phalanx-intermediate', 'ring-finger-phalanx-distal', 'ring-finger-tip',
  'pinky-finger-metacarpal', 'pinky-finger-phalanx-proximal', 'pinky-finger-phalanx-intermediate', 'pinky-finger-phalanx-distal', 'pinky-finger-tip',
] as const;
export const JointNameSchema = z.enum(JOINT_NAMES);
export type JointName = z.infer<typeof JointNameSchema>;
export const SideSchema = z.enum(['left', 'right']);
export type Side = z.infer<typeof SideSchema>;
export const Vec3Schema = z.tuple([z.number(), z.number(), z.number()]);
export type Vec3 = z.infer<typeof Vec3Schema>;
// Serialization tolerance only; never a spatial matching tolerance.
export const QUATERNION_NORM_TOLERANCE = 1e-4;
export const QuatSchema = z.tuple([z.number(), z.number(), z.number(), z.number()])
  .refine(q => Math.abs(Math.hypot(...q) - 1) <= QUATERNION_NORM_TOLERANCE, 'Expected a unit quaternion');
export const PoseSchema = z.strictObject({ positionM: Vec3Schema, orientationXyzw: QuatSchema });
export type Pose = z.infer<typeof PoseSchema>;
export const HandSampleSchema = z.discriminatedUnion('status', [
  z.strictObject({ status: z.literal('missing'), reason: z.enum(['unavailable', 'nonfinite', 'jump']) }),
  z.strictObject({ status: z.literal('valid'), joints: z.record(JointNameSchema, PoseSchema) }),
]);
export type HandSample = z.infer<typeof HandSampleSchema>;
export const MotionFrameSchema = z.strictObject({
  tMs: z.number().min(0),
  hands: z.strictObject({ left: HandSampleSchema, right: HandSampleSchema }),
  head: PoseSchema.nullable(),
});
export type MotionFrame = z.infer<typeof MotionFrameSchema>;

const Id = z.string().min(1).max(128);
export const WorkspaceDefinitionSchema = z.strictObject({
  id: Id, version: z.literal(1), widthM: z.number().positive(), depthM: z.number().positive(),
  calibrationMarksM: z.strictObject({ A: Vec3Schema, B: Vec3Schema, C: Vec3Schema, D: Vec3Schema }),
  layoutId: Id, dominantHand: SideSchema,
  calibrationMethod: z.literal('three-point-index-tip-v1'),
});
export type WorkspaceDefinition = z.infer<typeof WorkspaceDefinitionSchema>;
export const MAX_RECORDING_DURATION_MS = 120_000;
export const AUDIO_MIME_TYPES = [
  'audio/webm', 'audio/webm;codecs=opus', 'audio/ogg', 'audio/ogg;codecs=opus', 'audio/mp4', 'audio/wav',
] as const;
export const AudioMimeTypeSchema = z.enum(AUDIO_MIME_TYPES);
export type AudioMimeType = z.infer<typeof AudioMimeTypeSchema>;
export const MAX_RECORDING_FRAMES = 3_600;
export const RecordingSchema = z.strictObject({
  schemaVersion: z.literal(1), id: Id, coordinateFrame: z.literal('workspace'),
  workspace: WorkspaceDefinitionSchema,
  jointOrder: z.array(JointNameSchema).length(JOINT_NAMES.length)
    .refine(names => names.every((name, index) => name === JOINT_NAMES[index]), 'Joint order must match JOINT_NAMES'),
  nominalSampleHz: z.literal(30),
  durationMs: z.number().min(0).max(MAX_RECORDING_DURATION_MS),
  frames: z.array(MotionFrameSchema).min(1).max(MAX_RECORDING_FRAMES),
  markers: z.array(z.strictObject({
    id: Id, tMs: z.number().min(0), kind: z.enum(['step-start', 'step-end']),
    source: z.enum(['expert-control', 'operator-control', 'review']),
  })).max(256),
  audio: z.strictObject({
    assetId: Id.refine(id => !id.startsWith('blob:') && !/[\\/]/.test(id), 'Expected a durable asset ID'),
    mimeType: AudioMimeTypeSchema,
    durationMs: z.number().positive().max(MAX_RECORDING_DURATION_MS),
    audioStartOffsetMs: z.number().min(-5_000).max(5_000),
    syncMethod: z.enum(['media-recorder-start', 'manual-markers']),
    estimatedSyncErrorMs: z.number().min(0).max(MAX_RECORDING_DURATION_MS).nullable(),
  }).nullable(),
  source: z.enum(['live', 'synthetic-fixture', 'recorded-fixture']),
}).superRefine((recording, ctx) => {
  let previous = -1;
  for (const [index, frame] of recording.frames.entries()) {
    if (frame.tMs <= previous || frame.tMs > recording.durationMs) {
      ctx.addIssue({ code: 'custom', path: ['frames', index, 'tMs'], message: 'Frame time must increase strictly and lie within duration' });
    }
    previous = frame.tMs;
  }
  const ids = new Set<string>();
  for (const [index, marker] of recording.markers.entries()) {
    if (ids.has(marker.id) || marker.tMs > recording.durationMs) {
      ctx.addIssue({ code: 'custom', path: ['markers', index], message: 'Marker IDs must be unique and times within duration' });
    }
    ids.add(marker.id);
  }
});
export type Recording = z.infer<typeof RecordingSchema>;

export const HealthSchema = z.strictObject({
  status: z.enum(['ok', 'degraded']),
  buildId: z.string().min(1).max(128),
  providers: z.strictObject({ ai: z.enum(['mock', 'openai']), haptics: z.literal('mock'), scene: z.enum(['off', 'omni']).default('off') }),
  storage: z.strictObject({ writable: z.boolean() }),
});
export type Health = z.infer<typeof HealthSchema>;


