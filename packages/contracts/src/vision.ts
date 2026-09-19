import { z } from 'zod';

// Independent service protocol; this does not change RecordingSchema v1.
export const VisionHealthSchema = z.strictObject({
  schemaVersion: z.literal(1), service: z.literal('vision'),
  status: z.literal('ok'), buildId: z.string().min(1).max(128),
  provider: z.literal('mock'),
  capabilities: z.strictObject({ imageInterpretation: z.literal(false) }),
});
export type VisionHealth = z.infer<typeof VisionHealthSchema>;
export const VisionReadinessSchema = z.strictObject({
  schemaVersion: z.literal(1), service: z.literal('vision'), ready: z.literal(false),
  reason: z.literal('not-implemented'),
});
export const VisionUnavailableSchema = z.strictObject({
  schemaVersion: z.literal(1), error: z.literal('vision-not-implemented'),
});
export const VisionDependencySchema = z.discriminatedUnion('status', [
  z.strictObject({ status: z.literal('disabled') }),
  z.strictObject({ status: z.literal('unavailable') }),
  z.strictObject({ status: z.literal('reachable'), health: VisionHealthSchema }),
]);
export type VisionDependency = z.infer<typeof VisionDependencySchema>;
