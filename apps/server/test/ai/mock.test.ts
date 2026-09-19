import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CoachRequestSchema, LabelRequestSchema } from '@trail/contracts';
import { createMockProvider } from '../../src/ai/mock.js';
import { repositoryRoot } from '../../src/config.js';
import transcriptRaw from '../../../../fixtures/narration-transcript.v1.json';
import segmentsRaw from '../../../../fixtures/label-segments.v1.json';

const provider = createMockProvider({ transcriptFixturePath: resolve(repositoryRoot, 'fixtures/narration-transcript.v1.json') });
const signal = AbortSignal.timeout(1_000);
const coach = CoachRequestSchema.parse({
  schemaVersion: 1, requestId: 'r', question: 'what now',
  context: { tutorialId: 't', tutorialRevision: 0, runId: 'run', attemptId: 'a', title: 'T', steps: [{ id: 's1', title: 'Place the base', instruction: 'Slide it.' }], currentStepId: 's1', stepRevision: 0 },
});

describe('mock provider', () => {
  it('rescales the fixture transcript to the reported audio duration and applies the offset', async () => {
    const result = await provider.transcribe({ bytes: new Uint8Array(16), mimeType: 'audio/webm', audioStartOffsetMs: 100, audioDurationHintMs: 6_000, signal });
    expect(result.source).toBe('fixture');
    expect(result.model).toBeNull();
    expect(result.audioDurationMs).toBe(6_000);
    expect(result.spans[0]).toMatchObject({ startMs: 300, endMs: 1_700 });
    expect(result.spans).toHaveLength(4);
  });
  it('uses the fixture duration when the client gives no hint', async () => {
    const result = await provider.transcribe({ bytes: new Uint8Array(16), mimeType: 'audio/webm', audioStartOffsetMs: 0, audioDurationHintMs: null, signal });
    expect(result.audioDurationMs).toBe(12_000);
    expect(result.spans[3]).toMatchObject({ startMs: 9_900, endMs: 11_800 });
  });
  it('labels with fallback provenance only', async () => {
    const result = await provider.label(LabelRequestSchema.parse({ schemaVersion: 1, segments: segmentsRaw.segments, transcript: transcriptRaw }), signal);
    expect(result.provenance.labels).toBe('fallback');
    expect(result.labels).toHaveLength(3);
  });
  it('answers coach questions with the stored step and refuses live sessions', async () => {
    const answer = await provider.coachText(coach, signal);
    expect(answer).toMatchObject({ answer: 'Place the base. Slide it.', source: 'fallback', grounded: true });
    const session = await provider.createLiveSession({ schemaVersion: 1, sdp: 'v=0', context: coach.context }, signal);
    expect(session).toEqual({ error: 'live_unavailable', message: expect.stringContaining('AI_PROVIDER=openai') });
  });
});
