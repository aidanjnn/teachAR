import { z } from 'zod';
import { IdSchema } from './common.js';
import { AudioMimeTypeSchema, MAX_RECORDING_DURATION_MS } from './recording.js';

export const MAX_NARRATION_BYTES = 20 * 1024 * 1024;
export const MAX_TRANSCRIPT_SPANS = 2_000;
export const MAX_TRANSCRIPT_MS = MAX_RECORDING_DURATION_MS + 10_000;
export const MAX_LABEL_SEGMENTS = 64;
export const MAX_COACH_STEPS = 16;
export const MAX_TITLE_CHARS = 60;
export const MAX_INSTRUCTION_CHARS = 240;
export const MAX_ANSWER_CHARS = 600;
export const MAX_QUESTION_CHARS = 500;
export const MAX_SDP_CHARS = 64 * 1024;
export const COACH_TEXT_DEADLINE_MS = 5_000;

const Ms = z.number().int().min(0).max(MAX_TRANSCRIPT_MS);
const ShortName = z.string().min(1).max(128);
const Revision = z.number().int().min(0);

function uniqueIds(items: readonly { id: string }[], ctx: z.RefinementCtx, label: string) {
  const seen = new Set<string>();
  for (const [index, item] of items.entries()) {
    if (seen.has(item.id)) ctx.addIssue({ code: 'custom', path: [index, 'id'], message: `${label} IDs must be unique` });
    seen.add(item.id);
  }
}

export const TranscriptSpanSchema = z.strictObject({ id: IdSchema, startMs: Ms, endMs: Ms, text: z.string().min(1).max(1_000) })
  .refine(span => span.startMs < span.endMs, 'Span must end after it starts');
export type TranscriptSpan = z.infer<typeof TranscriptSpanSchema>;

export const TranscriptResultSchema = z.strictObject({
  schemaVersion: z.literal(1),
  source: z.enum(['model', 'fixture']),
  model: ShortName.nullable(),
  language: z.string().min(1).max(16).nullable(),
  audioDurationMs: Ms,
  spans: z.array(TranscriptSpanSchema).max(MAX_TRANSCRIPT_SPANS),
}).superRefine((result, ctx) => uniqueIds(result.spans, ctx, 'Span'));
export type TranscriptResult = z.infer<typeof TranscriptResultSchema>;

export const LabelSegmentSchema = z.strictObject({ id: IdSchema, startMs: Ms, endMs: Ms })
  .refine(segment => segment.startMs < segment.endMs, 'Segment must end after it starts');
export type LabelSegment = z.infer<typeof LabelSegmentSchema>;
export const LabelSegmentsSchema = z.array(LabelSegmentSchema).min(1).max(MAX_LABEL_SEGMENTS).superRefine((segments, ctx) => {
  uniqueIds(segments, ctx, 'Segment');
  for (let index = 1; index < segments.length; index += 1) {
    const previous = segments[index - 1];
    const current = segments[index];
    if (previous && current && current.startMs < previous.endMs) {
      ctx.addIssue({ code: 'custom', path: [index, 'startMs'], message: 'Segments must be ordered and non-overlapping' });
    }
  }
});

export const LabelRequestSchema = z.strictObject({
  schemaVersion: z.literal(1),
  segments: LabelSegmentsSchema,
  transcript: TranscriptResultSchema,
  taskContext: z.string().max(500).optional(),
});
export type LabelRequest = z.infer<typeof LabelRequestSchema>;

export const SegmentLabelSchema = z.strictObject({
  stepId: IdSchema,
  title: z.string().min(1).max(MAX_TITLE_CHARS),
  instruction: z.string().min(1).max(MAX_INSTRUCTION_CHARS),
  narrationSpanIds: z.array(IdSchema).max(32),
  needsReview: z.boolean(),
});
export type SegmentLabel = z.infer<typeof SegmentLabelSchema>;

export const LABEL_FAILURE_CODES = [
  'provider_unavailable', 'timeout', 'refusal', 'incomplete', 'invalid_output',
  'wrong_count', 'unknown_step', 'duplicate_step', 'title_length', 'instruction_length', 'unknown_span',
] as const;
export const LabelFailureSchema = z.strictObject({ code: z.enum(LABEL_FAILURE_CODES), message: z.string().min(1).max(300) });
export type LabelFailure = z.infer<typeof LabelFailureSchema>;

export const LabelResultSchema = z.strictObject({
  schemaVersion: z.literal(1),
  labels: z.array(SegmentLabelSchema).max(MAX_LABEL_SEGMENTS),
  provenance: z.strictObject({ labels: z.enum(['model', 'fallback']), model: ShortName.nullable(), promptVersion: z.string().min(1).max(64) }),
  failure: LabelFailureSchema.nullable(),
});
export type LabelResult = z.infer<typeof LabelResultSchema>;

export const CoachStepSchema = z.strictObject({
  id: IdSchema, title: z.string().min(1).max(MAX_TITLE_CHARS), instruction: z.string().min(1).max(MAX_INSTRUCTION_CHARS),
});
export type CoachStep = z.infer<typeof CoachStepSchema>;

export const CoachContextSchema = z.strictObject({
  tutorialId: IdSchema, tutorialRevision: Revision, runId: IdSchema, attemptId: IdSchema,
  title: z.string().min(1).max(120),
  steps: z.array(CoachStepSchema).min(1).max(MAX_COACH_STEPS),
  currentStepId: IdSchema, stepRevision: Revision,
  layoutNotes: z.string().max(500).optional(),
}).superRefine((context, ctx) => {
  uniqueIds(context.steps, ctx, 'Step');
  if (!context.steps.some(step => step.id === context.currentStepId)) {
    ctx.addIssue({ code: 'custom', path: ['currentStepId'], message: 'Current step must be one of the steps' });
  }
});
export type CoachContext = z.infer<typeof CoachContextSchema>;

/** Plain-language context pushed to the coach when the learner's step or attempt changes. Shared by server and clients. */
export function describeStepChange(context: CoachContext): string {
  const index = context.steps.findIndex(step => step.id === context.currentStepId);
  const step = context.steps[index];
  if (!step) throw new Error('Coach context has no current step');
  return `The learner is now on step ${index + 1} of ${context.steps.length}: "${step.title}". Instruction: ${step.instruction} Questions about earlier steps are stale; answer for this step.`;
}

export const CoachRequestSchema = z.strictObject({
  schemaVersion: z.literal(1), requestId: IdSchema, context: CoachContextSchema, question: z.string().min(1).max(MAX_QUESTION_CHARS),
});
export type CoachRequest = z.infer<typeof CoachRequestSchema>;

export const CoachAnswerSchema = z.strictObject({
  schemaVersion: z.literal(1), requestId: IdSchema, runId: IdSchema, tutorialId: IdSchema, tutorialRevision: Revision,
  stepId: IdSchema, stepRevision: Revision, attemptId: IdSchema,
  answer: z.string().min(1).max(MAX_ANSWER_CHARS), grounded: z.boolean(),
  source: z.enum(['model', 'fallback']), model: ShortName.nullable(),
});
export type CoachAnswer = z.infer<typeof CoachAnswerSchema>;

export const CoachSessionRequestSchema = z.strictObject({
  schemaVersion: z.literal(1), sdp: z.string().min(1).max(MAX_SDP_CHARS), context: CoachContextSchema,
});
export type CoachSessionRequest = z.infer<typeof CoachSessionRequestSchema>;

export const CoachSessionResponseSchema = z.strictObject({
  schemaVersion: z.literal(1), sessionId: ShortName, sdp: z.string().min(1).max(MAX_SDP_CHARS), liveModel: ShortName,
});
export type CoachSessionResponse = z.infer<typeof CoachSessionResponseSchema>;

export const VoiceUnavailableSchema = z.strictObject({
  error: z.enum(['live_unavailable', 'provider_unavailable', 'payload_too_large', 'unsupported_media_type', 'invalid_request']),
  message: z.string().min(1).max(300),
});
export type VoiceUnavailable = z.infer<typeof VoiceUnavailableSchema>;

export const NarrationCaptureSchema = z.strictObject({
  mimeType: AudioMimeTypeSchema,
  durationMs: z.number().int().positive().max(MAX_RECORDING_DURATION_MS),
  audioStartOffsetMs: z.number().int().min(-5_000).max(5_000),
  syncMethod: z.literal('media-recorder-start'),
  estimatedSyncErrorMs: z.number().int().min(0).max(MAX_RECORDING_DURATION_MS),
  sizeBytes: z.number().int().positive().max(MAX_NARRATION_BYTES),
});
export type NarrationCapture = z.infer<typeof NarrationCaptureSchema>;
