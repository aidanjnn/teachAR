import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CoachContext } from '@trail/contracts';
import { createCoach } from '../src/guide/coach.js';
import type { LiveClientEvent, LiveConnectOptions, LiveServerEvent, LiveTransport } from '../src/guide/live-transport.js';

const context: CoachContext = {
  tutorialId: 'tut', tutorialRevision: 0, runId: 'run-1', attemptId: 'a', title: 'Stand',
  steps: [{ id: 's1', title: 'Place the base', instruction: 'Slide it.' }, { id: 's2', title: 'Insert the support', instruction: 'Drop it.' }],
  currentStepId: 's1', stepRevision: 0,
};
const stream = { getAudioTracks: () => [], getTracks: () => [] } as unknown as MediaStream;

function fakeTransport(behaviour: { fail?: boolean } = {}) {
  const sent: LiveClientEvent[] = [];
  let handlers: LiveConnectOptions | null = null;
  const transport: LiveTransport = {
    async connect(options) {
      handlers = options;
      if (behaviour.fail) throw new Error('refused');
      await options.exchangeSdp('v=0 offer', new AbortController().signal);
    },
    send(event) { sent.push(event); },
    close() { /* no-op */ },
  };
  return { transport, sent, emit: (event: LiveServerEvent) => handlers?.onEvent(event), closeFromServer: () => handlers?.onClosed() };
}
function okFetch(body: unknown, status = 200): typeof fetch {
  return async () => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}
const sessionOk = { schemaVersion: 1, sessionId: 'live_1', sdp: 'v=0 answer', liveModel: 'gpt-live-1' };
const started = { type: 'session.started', event_id: 'e1', session: { id: 'live_1', model: 'gpt-live-1' } } as unknown as LiveServerEvent;
function answerFor(requestId: string, stepId: string, stepRevision: number) {
  return { schemaVersion: 1, requestId, runId: 'run-1', tutorialId: 'tut', tutorialRevision: 0, stepId, stepRevision, attemptId: 'a', answer: 'From server.', grounded: true, source: 'fallback', model: null };
}

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); });

describe('coach live path', () => {
  it('connects, waits for session.started, mutes, toggles listening, and pushes step context', async () => {
    const fake = fakeTransport();
    const coach = createCoach({ context, fetchImpl: okFetch(sessionOk), getUserMedia: async () => stream, transportFactory: () => fake.transport, listenTimeoutMs: 1_000 });
    const connecting = coach.connect();
    await vi.advanceTimersByTimeAsync(0);
    fake.emit(started);
    expect(await connecting).toBe('live');
    expect(fake.sent.map(event => event.type)).toEqual(['session.input_audio.mute']);
    coach.ask();
    expect(coach.state.mode).toBe('listening');
    expect(fake.sent.at(-1)?.type).toBe('session.input_audio.unmute');
    await vi.advanceTimersByTimeAsync(1_001);
    expect(coach.state.mode).toBe('live');
    expect(fake.sent.at(-1)?.type).toBe('session.input_audio.mute');
    coach.setStep('s2', 1);
    const last = fake.sent.at(-1);
    expect(last?.type).toBe('session.thinking.append');
    if (last?.type === 'session.thinking.append') expect(last.content).toContain('"Insert the support"');
    fake.closeFromServer();
    expect(coach.state).toMatchObject({ mode: 'text', liveClosed: true });
    coach.dispose();
  });
  it('falls back to text when the server refuses a session', async () => {
    const fake = fakeTransport();
    const coach = createCoach({ context, fetchImpl: okFetch({ error: 'live_unavailable', message: 'mock' }, 503), getUserMedia: async () => stream, transportFactory: () => fake.transport });
    expect(await coach.connect()).toBe('text');
    coach.ask();
    expect(coach.state.mode).toBe('text');
  });
  it('relays learner and coach transcript deltas', async () => {
    const fake = fakeTransport();
    const coach = createCoach({ context, fetchImpl: okFetch(sessionOk), getUserMedia: async () => stream, transportFactory: () => fake.transport });
    const seen: string[] = [];
    coach.onTranscript(entry => seen.push(`${entry.role}:${entry.delta}`));
    const connecting = coach.connect();
    await vi.advanceTimersByTimeAsync(0);
    fake.emit(started);
    await connecting;
    fake.emit({ type: 'session.input_transcript.delta', event_id: 'e2', delta: 'what now', start_ms: 0, end_ms: 100 });
    fake.emit({ type: 'session.output_transcript.delta', event_id: 'e3', delta: 'Slide it.', start_ms: 100, end_ms: 200 });
    expect(seen).toEqual(['learner:what now', 'coach:Slide it.']);
  });
});

function trackedStream() {
  const track = { enabled: true, stopped: false, stop() { this.stopped = true; } };
  const stream = { getAudioTracks: () => [track], getTracks: () => [track] } as unknown as MediaStream;
  return { stream, track };
}

describe('coach microphone lifecycle', () => {
  it('disables the local track while muted and releases it when the session closes', async () => {
    const fake = fakeTransport();
    const { stream: mic, track } = trackedStream();
    const coach = createCoach({ context, fetchImpl: okFetch(sessionOk), getUserMedia: async () => mic, transportFactory: () => fake.transport });
    const connecting = coach.connect();
    await vi.advanceTimersByTimeAsync(0);
    fake.emit(started);
    await connecting;
    expect(track.enabled).toBe(false);
    coach.ask();
    expect(track.enabled).toBe(true);
    coach.ask();
    expect(track.enabled).toBe(false);
    fake.closeFromServer();
    expect(track.stopped).toBe(true);
    expect(coach.state.mode).toBe('text');
  });
  it('releases a stream acquired after dispose and stops notifying', async () => {
    const fake = fakeTransport();
    const { stream: mic, track } = trackedStream();
    let grant: ((stream: MediaStream) => void) | null = null;
    const coach = createCoach({ context, fetchImpl: okFetch(sessionOk), getUserMedia: () => new Promise(resolve => { grant = resolve; }), transportFactory: () => fake.transport });
    let notifications = 0;
    coach.onState(() => { notifications += 1; });
    const connecting = coach.connect();
    await vi.advanceTimersByTimeAsync(0);
    const before = notifications;
    coach.dispose();
    (grant as ((stream: MediaStream) => void) | null)?.(mic);
    await connecting;
    expect(track.stopped).toBe(true);
    expect(fake.sent).toEqual([]);
    expect(notifications).toBe(before);
  });
  it('surfaces live error events and sends context on a new attempt', async () => {
    const fake = fakeTransport();
    const coach = createCoach({ context, fetchImpl: okFetch(sessionOk), getUserMedia: async () => stream, transportFactory: () => fake.transport });
    const errors: string[] = [];
    coach.onLiveError(error => errors.push(error.code));
    const connecting = coach.connect();
    await vi.advanceTimersByTimeAsync(0);
    fake.emit(started);
    await connecting;
    fake.emit({ type: 'error', event_id: 'e9', error: { code: 'data_channel_permissions', message: 'denied', type: 'invalid_request_error' } });
    expect(errors).toEqual(['data_channel_permissions']);
    coach.setAttempt('attempt-2');
    expect(fake.sent.at(-1)?.type).toBe('session.thinking.append');
    expect(coach.state.attemptId).toBe('attempt-2');
  });
});

describe('coach startup and output gating', () => {
  it('hands the transport a silenced microphone and keeps it silent until Ask by voice', async () => {
    const fake = fakeTransport();
    const { stream: mic, track } = trackedStream();
    let enabledAtConnect: boolean | null = null;
    const observing: LiveTransport = {
      ...fake.transport,
      connect: async options => { enabledAtConnect = options.localStream.getAudioTracks()[0]?.enabled ?? null; await fake.transport.connect(options); },
    };
    const coach = createCoach({ context, fetchImpl: okFetch(sessionOk), getUserMedia: async () => mic, transportFactory: () => observing });
    const connecting = coach.connect();
    await vi.advanceTimersByTimeAsync(0);
    expect(enabledAtConnect).toBe(false);
    fake.emit(started);
    await connecting;
    expect(track.enabled).toBe(false);
    coach.ask();
    expect(track.enabled).toBe(true);
  });
  it('mutes playback and marks captions stale after a step change until the learner speaks again', async () => {
    const fake = fakeTransport();
    const sink = { muted: false, srcObject: null as MediaStream | null, play: async () => undefined } as unknown as HTMLAudioElement;
    const coach = createCoach({ context, fetchImpl: okFetch(sessionOk), getUserMedia: async () => stream, transportFactory: () => fake.transport, audioSink: sink });
    const seen: string[] = [];
    coach.onTranscript(entry => seen.push(`${entry.role}:${entry.stepRevision}:${entry.stale ? 'stale' : 'live'}:${entry.delta}`));
    const connecting = coach.connect();
    await vi.advanceTimersByTimeAsync(0);
    fake.emit(started);
    await connecting;
    fake.emit({ type: 'session.input_transcript.delta', event_id: 'i1', delta: 'what now', start_ms: 0, end_ms: 100 });
    coach.setStep('s2', 1);
    expect(sink.muted).toBe(true);
    fake.emit({ type: 'session.output_transcript.delta', event_id: 'o1', delta: 'Slide base.', start_ms: 100, end_ms: 200 });
    fake.emit({ type: 'session.input_transcript.delta', event_id: 'i2', delta: 'and now', start_ms: 300, end_ms: 400 });
    expect(sink.muted).toBe(false);
    fake.emit({ type: 'session.output_transcript.delta', event_id: 'o2', delta: 'Drop it.', start_ms: 400, end_ms: 500 });
    expect(seen).toEqual(['learner:0:live:what now', 'coach:0:stale:Slide base.', 'learner:1:live:and now', 'coach:1:live:Drop it.']);
  });
  it('settles connect() when the session closes or is disposed before session.started', async () => {
    const fake = fakeTransport();
    const closing: LiveTransport = { ...fake.transport, connect: async options => { await fake.transport.connect(options); options.onClosed(); } };
    const coach = createCoach({ context, fetchImpl: okFetch(sessionOk), getUserMedia: async () => stream, transportFactory: () => closing });
    const connecting = coach.connect();
    await vi.advanceTimersByTimeAsync(0);
    expect(await connecting).toBe('text');
    expect(coach.state.liveClosed).toBe(true);
    const fake2 = fakeTransport();
    const coach2 = createCoach({ context, fetchImpl: okFetch(sessionOk), getUserMedia: async () => stream, transportFactory: () => fake2.transport });
    const connecting2 = coach2.connect();
    await vi.advanceTimersByTimeAsync(0);
    coach2.dispose();
    await expect(connecting2).resolves.toBeDefined();
  });
});

describe('coach text path', () => {
  it('returns the server answer for the current step and drops one that arrives after a step change', async () => {
    const gate = { release: null as (() => void) | null };
    const fetchImpl: typeof fetch = async (_input, init) => {
      const body = JSON.parse(String(init?.body)) as { requestId: string; context: { currentStepId: string; stepRevision: number } };
      await new Promise<void>(resolve => { gate.release = resolve; });
      return new Response(JSON.stringify(answerFor(body.requestId, body.context.currentStepId, body.context.stepRevision)), { status: 200 });
    };
    const coach = createCoach({ context, fetchImpl, getUserMedia: async () => { throw new Error('no mic'); } });
    expect(await coach.connect()).toBe('text');
    const answers: string[] = [];
    coach.onAnswer(answer => answers.push(`${answer.stepId}:${answer.answer}`));
    const pending = coach.askText('What now?');
    await vi.advanceTimersByTimeAsync(0);
    coach.setStep('s2', 1);
    gate.release?.();
    expect(await pending).toBeNull();
    expect(answers).toEqual([]);
    const second = coach.askText('And now?');
    await vi.advanceTimersByTimeAsync(0);
    gate.release?.();
    expect(await second).toMatchObject({ answer: 'From server.', stepId: 's2', stepRevision: 1 });
    expect(answers).toEqual(['s2:From server.']);
  });
  it('answers locally from the stored step when the request fails or times out', async () => {
    const failing = createCoach({ context, fetchImpl: async () => { throw new TypeError('offline'); }, getUserMedia: async () => { throw new Error('no mic'); } });
    await failing.connect();
    const answer = await failing.askText('Help');
    expect(answer).toMatchObject({ answer: 'Place the base. Slide it.', source: 'fallback', stepId: 's1' });
    const slow = createCoach({ context, textDeadlineMs: 50, fetchImpl: (_input, init) => new Promise((_, reject) => init?.signal?.addEventListener('abort', () => reject(init.signal?.reason))), getUserMedia: async () => { throw new Error('no mic'); } });
    await slow.connect();
    const pending = slow.askText('Help');
    await vi.advanceTimersByTimeAsync(60);
    expect((await pending)?.source).toBe('fallback');
  });
});
