import { describe, expect, it } from 'vitest';
import {
  CoachAnswerSchema, CoachContextSchema, CoachRequestSchema, CoachSessionRequestSchema, HealthSchema,
  LabelRequestSchema, LabelResultSchema, LabelSegmentsSchema, LiveStepUpdateSchema, NarrationCaptureSchema, TranscriptResultSchema, describeStepChange,
} from '../src/index.js';
import transcriptRaw from '../../../fixtures/narration-transcript.v1.json';
import segmentsRaw from '../../../fixtures/label-segments.v1.json';

const context = {
  tutorialId: 'tut-1', tutorialRevision: 0, runId: 'run-1', attemptId: 'att-1', title: 'Four-piece stand',
  steps: [
    { id: 'seg-1', title: 'Place the base', instruction: 'Slide the base to the center.' },
    { id: 'seg-2', title: 'Insert the support', instruction: 'Drop the support into the base.' },
  ],
  currentStepId: 'seg-1', stepRevision: 0,
};
const answer = {
  schemaVersion: 1, requestId: 'req-1', runId: 'run-1', tutorialId: 'tut-1', tutorialRevision: 0, stepId: 'seg-1',
  stepRevision: 0, attemptId: 'att-1', answer: 'Slide the base to the center.', grounded: true, source: 'fallback', model: null,
};

describe('voice contracts', () => {
  it('parses the synthetic transcript and segment fixtures', () => {
    const transcript = TranscriptResultSchema.parse(transcriptRaw);
    expect(transcript.spans).toHaveLength(4);
    expect(transcript.source).toBe('fixture');
    expect(LabelSegmentsSchema.parse(segmentsRaw.segments)).toHaveLength(3);
    const request = LabelRequestSchema.parse({ schemaVersion: 1, segments: segmentsRaw.segments, transcript: transcriptRaw });
    expect(request.segments[2]?.id).toBe('seg-3');
  });

  it.each([
    ['unknown version', (t: typeof transcriptRaw) => { t.schemaVersion = 2; }],
    ['a span ending before it starts', (t: typeof transcriptRaw) => { t.spans[0]!.endMs = t.spans[0]!.startMs; }],
    ['a duplicate span id', (t: typeof transcriptRaw) => { t.spans[1]!.id = t.spans[0]!.id; }],
    ['empty span text', (t: typeof transcriptRaw) => { t.spans[0]!.text = ''; }],
    ['an unknown field', (t: typeof transcriptRaw) => { Object.assign(t, { extra: true }); }],
  ])('rejects a transcript with %s', (_label, mutate) => {
    const value = structuredClone(transcriptRaw);
    mutate(value);
    expect(TranscriptResultSchema.safeParse(value).success).toBe(false);
  });

  it.each([
    ['overlapping segments', [{ id: 'a', startMs: 0, endMs: 1000 }, { id: 'b', startMs: 900, endMs: 2000 }]],
    ['segments out of order', [{ id: 'a', startMs: 1000, endMs: 2000 }, { id: 'b', startMs: 0, endMs: 900 }]],
    ['duplicate segment ids', [{ id: 'a', startMs: 0, endMs: 1000 }, { id: 'a', startMs: 1000, endMs: 2000 }]],
    ['a zero-length segment', [{ id: 'a', startMs: 500, endMs: 500 }]],
    ['no segments', []],
    ['too many segments', Array.from({ length: 65 }, (_, i) => ({ id: `s${i}`, startMs: i * 10, endMs: i * 10 + 10 }))],
  ])('rejects %s', (_label, segments) => {
    expect(LabelSegmentsSchema.safeParse(segments).success).toBe(false);
  });

  it('accepts a coach context and rejects inconsistent ones', () => {
    expect(CoachContextSchema.parse(context).currentStepId).toBe('seg-1');
    expect(CoachContextSchema.safeParse({ ...context, currentStepId: 'seg-9' }).success).toBe(false);
    expect(CoachContextSchema.safeParse({ ...context, steps: [context.steps[0], context.steps[0]] }).success).toBe(false);
    expect(CoachContextSchema.safeParse({ ...context, steps: Array.from({ length: 129 }, (_, i) => ({ id: `s${i}`, title: 't', instruction: 'i' })), currentStepId: 's0' }).success).toBe(false);
    expect(CoachContextSchema.safeParse({ ...context, steps: [{ ...context.steps[0], title: 'x'.repeat(61) }] }).success).toBe(false);
  });

  it('bounds coach requests and answers', () => {
    expect(CoachRequestSchema.safeParse({ schemaVersion: 1, requestId: 'req-1', context, question: 'What now?' }).success).toBe(true);
    expect(CoachRequestSchema.safeParse({ schemaVersion: 1, requestId: 'req-1', context, question: 'x'.repeat(501) }).success).toBe(false);
    expect(CoachAnswerSchema.safeParse(answer).success).toBe(true);
    expect(CoachAnswerSchema.safeParse({ ...answer, answer: 'x'.repeat(601) }).success).toBe(false);
    expect(CoachAnswerSchema.safeParse({ ...answer, source: 'model', model: null }).success).toBe(true);
    expect(CoachSessionRequestSchema.safeParse({ schemaVersion: 1, sdp: 'v=0', context }).success).toBe(true);
    expect(CoachSessionRequestSchema.safeParse({ schemaVersion: 1, sdp: '', context }).success).toBe(false);
  });

  it('validates label results and narration captures', () => {
    const labels = [{ stepId: 'seg-1', title: 'Place the base', instruction: 'Slide it.', narrationSpanIds: ['span-0001'], needsReview: false }];
    const provenance = { labels: 'fallback', model: null, promptVersion: 'labels-v1' };
    expect(LabelResultSchema.safeParse({ schemaVersion: 1, labels, provenance, failure: null }).success).toBe(true);
    expect(LabelResultSchema.safeParse({ schemaVersion: 1, labels: [{ ...labels[0], instruction: 'x'.repeat(241) }], provenance, failure: null }).success).toBe(false);
    expect(LabelResultSchema.safeParse({ schemaVersion: 1, labels, provenance, failure: { code: 'made-up', message: 'x' } }).success).toBe(false);
    const capture = { mimeType: 'audio/webm;codecs=opus', durationMs: 5200, audioStartOffsetMs: 40, syncMethod: 'media-recorder-start', estimatedSyncErrorMs: 12, sizeBytes: 80_000 };
    expect(NarrationCaptureSchema.safeParse(capture).success).toBe(true);
    expect(NarrationCaptureSchema.safeParse({ ...capture, mimeType: 'audio/flac' }).success).toBe(false);
    expect(NarrationCaptureSchema.safeParse({ ...capture, sizeBytes: 0 }).success).toBe(false);
  });

  it('requires a generation on live step updates', () => {
    expect(LiveStepUpdateSchema.safeParse({ schemaVersion: 1, generation: 3, currentStepId: 's1', stepRevision: 2 }).success).toBe(true);
    expect(LiveStepUpdateSchema.safeParse({ schemaVersion: 1, currentStepId: 's1', stepRevision: 2 }).success).toBe(false);
    expect(LiveStepUpdateSchema.safeParse({ schemaVersion: 1, generation: -1, currentStepId: 's1', stepRevision: 2 }).success).toBe(false);
  });

  it('describes a step change for the coach in one shared sentence', () => {
    expect(describeStepChange({ ...context, currentStepId: 'seg-2' })).toBe('The learner is now on step 2 of 2: "Insert the support". Instruction: Drop the support into the base. Questions about earlier steps are stale; answer for this step.');
  });

  it('lets health report the openai provider but nothing else', () => {
    const health = { status: 'ok', buildId: 'b', providers: { ai: 'openai', haptics: 'mock' }, storage: { writable: true } };
    expect(HealthSchema.safeParse(health).success).toBe(true);
    expect(HealthSchema.safeParse({ ...health, providers: { ai: 'live', haptics: 'mock' } }).success).toBe(false);
  });
});
