import { describe, expect, it } from 'vitest';
import { CoachRequestSchema, LabelRequestSchema } from '@trail/contracts';
import type { OpenAiGateway } from '../../src/ai/openai-gateway.js';
import { fileNameFor } from '../../src/ai/openai-gateway.js';
import { BROWSER_CLIENT_EVENTS, buildLiveSessionParams, createOpenAiProvider } from '../../src/ai/openai.js';
import transcriptRaw from '../../../../fixtures/narration-transcript.v1.json';
import segmentsRaw from '../../../../fixtures/label-segments.v1.json';

const labelRequest = LabelRequestSchema.parse({ schemaVersion: 1, segments: segmentsRaw.segments, transcript: transcriptRaw });
const coachRequest = CoachRequestSchema.parse({
  schemaVersion: 1, requestId: 'r1', question: 'Which way does the cap go?',
  context: { tutorialId: 't', tutorialRevision: 0, runId: 'run', attemptId: 'a', title: 'Stand', steps: [{ id: 'seg-1', title: 'Place the base', instruction: 'Slide it in.' }], currentStepId: 'seg-1', stepRevision: 0 },
});
const goodLabels = {
  labels: segmentsRaw.segments.map((segment, i) => ({ stepId: segment.id, title: `Move ${i + 1}`, instruction: `Do move ${i + 1}.`, narrationSpanIds: [], needsReview: false })),
};
const models = { transcribeModel: 'whisper-1', textModel: 'gpt-4.1-mini', liveModel: 'gpt-live-1', liveBackendModel: 'gpt-5.6-luna', liveVoice: 'marin' };
const signal = new AbortController().signal;

function gateway(overrides: Partial<OpenAiGateway>): OpenAiGateway {
  return {
    transcribeVerbose: async () => ({ durationSeconds: 12, language: 'en', segments: [{ start: 0.5, end: 2, text: 'hello' }] }),
    parseJson: (async () => ({ status: 'unparsed' })) as OpenAiGateway['parseJson'],
    createLiveSession: async () => ({ session: { id: 'live_1' }, transport: { type: 'webrtc', sdp: 'v=0 answer' } }),
    openSideband: () => ({ send: () => undefined, close: () => undefined, onClose: () => undefined }),
    ...overrides,
  };
}
const hang: OpenAiGateway['parseJson'] = ({ signal: s }) => new Promise((_, reject) => { s.addEventListener('abort', () => reject(s.reason as Error)); });

describe('openai provider labels', () => {
  it('returns model labels when the output validates and passes the schema name', async () => {
    let seen: { schemaName?: string; model?: string } = {};
    const provider = createOpenAiProvider({ ...models, gateway: gateway({ parseJson: (async (input: { schemaName: string; model: string }) => { seen = input; return { status: 'ok', parsed: goodLabels }; }) as OpenAiGateway['parseJson'] }) });
    const result = await provider.label(labelRequest, signal);
    expect(result.provenance).toEqual({ labels: 'model', model: 'gpt-4.1-mini', promptVersion: 'labels-v1' });
    expect(result.labels[1]?.title).toBe('Move 2');
    expect(seen).toMatchObject({ schemaName: 'segment_labels', model: 'gpt-4.1-mini' });
  });
  it.each([
    ['refusal', { status: 'refusal', refusal: 'no' }],
    ['incomplete', { status: 'incomplete', reason: 'max_output_tokens' }],
    ['invalid_output', { status: 'unparsed' }],
    ['wrong_count', { status: 'ok', parsed: { labels: goodLabels.labels.slice(1) } }],
  ])('falls back with code %s', async (code, parsed) => {
    const provider = createOpenAiProvider({ ...models, gateway: gateway({ parseJson: (async () => parsed) as OpenAiGateway['parseJson'] }) });
    const result = await provider.label(labelRequest, signal);
    expect(result.provenance.labels).toBe('fallback');
    expect(result.failure?.code).toBe(code);
    expect(result.labels).toHaveLength(3);
  });
  it('maps thrown errors and timeouts to typed failures', async () => {
    const thrown = createOpenAiProvider({ ...models, gateway: gateway({ parseJson: (async () => { throw new Error('network'); }) as OpenAiGateway['parseJson'] }) });
    expect((await thrown.label(labelRequest, signal)).failure?.code).toBe('provider_unavailable');
    const slow = createOpenAiProvider({ ...models, labelTimeoutMs: 20, gateway: gateway({ parseJson: hang }) });
    expect((await slow.label(labelRequest, signal)).failure?.code).toBe('timeout');
  });
});

describe('openai provider coach', () => {
  it('uses the model answer when usable and the stored step otherwise', async () => {
    const good = createOpenAiProvider({ ...models, gateway: gateway({ parseJson: (async () => ({ status: 'ok', parsed: { answer: 'Flat side down.', grounded: true } })) as OpenAiGateway['parseJson'] }) });
    expect(await good.coachText(coachRequest, signal)).toMatchObject({ answer: 'Flat side down.', source: 'model', model: 'gpt-4.1-mini' });
    const bad = createOpenAiProvider({ ...models, gateway: gateway({ parseJson: (async () => ({ status: 'ok', parsed: { answer: '', grounded: true } })) as OpenAiGateway['parseJson'] }) });
    expect(await bad.coachText(coachRequest, signal)).toMatchObject({ answer: 'Place the base. Slide it in.', source: 'fallback' });
    const slow = createOpenAiProvider({ ...models, coachTimeoutMs: 20, gateway: gateway({ parseJson: hang }) });
    expect((await slow.coachText(coachRequest, signal)).source).toBe('fallback');
    const thrown = createOpenAiProvider({ ...models, gateway: gateway({ parseJson: (async () => { throw new Error('x'); }) as OpenAiGateway['parseJson'] }) });
    expect((await thrown.coachText(coachRequest, signal)).source).toBe('fallback');
  });
});

describe('openai provider live sessions', () => {
  it('builds a locked-down session: approved instructions, no tools, allow-listed browser events', () => {
    const params = buildLiveSessionParams(coachRequest.context, 'v=0 offer', models);
    expect(params.transport).toEqual({ type: 'webrtc', sdp: 'v=0 offer' });
    expect(params.session.model).toBe('gpt-live-1');
    expect(params.session.instructions).toContain('Place the base');
    expect(params.session.store).toBe(false);
    expect(params.session.audio).toEqual({ output: { voice: 'marin' } });
    expect(params.session.delegation).toMatchObject({ type: 'responses', responses: { model: 'gpt-5.6-luna', max_output_tokens: 200 } });
    const responses = params.session.delegation?.type === 'responses' ? params.session.delegation.responses : undefined;
    expect(responses?.tools).toBeUndefined();
    expect(responses?.tool_choice).toBeUndefined();
    expect(params.session.client?.data_channel.allowed_client_events).toEqual(BROWSER_CLIENT_EVENTS);
    expect(BROWSER_CLIENT_EVENTS).not.toContain('session.instructions.append');
    expect(BROWSER_CLIENT_EVENTS).not.toContain('session.update');
    expect(BROWSER_CLIENT_EVENTS).not.toContain('session.thinking.append');
  });
  it('returns the answer SDP or a typed unavailable result', async () => {
    const provider = createOpenAiProvider({ ...models, gateway: gateway({}) });
    expect(await provider.createLiveSession({ schemaVersion: 1, sdp: 'v=0', context: coachRequest.context }, signal)).toEqual({ schemaVersion: 1, sessionId: 'live_1', sdp: 'v=0 answer', liveModel: 'gpt-live-1' });
    const broken = createOpenAiProvider({ ...models, gateway: gateway({ createLiveSession: async () => { throw new Error('402'); } }) });
    expect(await broken.createLiveSession({ schemaVersion: 1, sdp: 'v=0', context: coachRequest.context }, signal)).toMatchObject({ error: 'live_unavailable' });
    expect(provider.openLiveControl('live_1')).not.toBeNull();
    const noSideband = createOpenAiProvider({ ...models, gateway: gateway({ openSideband: () => { throw new Error('ws unavailable'); } }) });
    expect(noSideband.openLiveControl('live_1')).toBeNull();
  });
});

describe('openai provider transcription', () => {
  it('aligns provider seconds with the audio offset and records the model', async () => {
    const provider = createOpenAiProvider({ ...models, gateway: gateway({}) });
    const result = await provider.transcribe({ bytes: new Uint8Array(4), mimeType: 'audio/webm', audioStartOffsetMs: 250, audioDurationHintMs: null, signal });
    expect(result).toMatchObject({ source: 'model', model: 'whisper-1', language: 'en', audioDurationMs: 12_000 });
    expect(result.spans[0]).toMatchObject({ startMs: 750, endMs: 2_250, text: 'hello' });
  });
  it('names the upload by MIME essence', () => {
    expect(fileNameFor('audio/webm;codecs=opus')).toBe('narration.webm');
    expect(fileNameFor('audio/mp4')).toBe('narration.mp4');
    expect(fileNameFor('weird')).toBe('narration.webm');
  });
});
