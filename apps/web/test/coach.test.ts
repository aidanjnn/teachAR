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

function fakeTransport(behaviour: { fail?: boolean; closeBeforeReject?: 'refusal' | 'answer' } = {}) {
  const sent: LiveClientEvent[] = [];
  let handlers: LiveConnectOptions | null = null;
  // The pinned SDK reports a failed setup as a close before connect() rejects, wrapping the original error as `cause`.
  const sdkFailure = (message: string, cause: unknown) => Object.assign(new Error(message), { name: 'WebRTCError', code: 'setup_failed', cause });
  const transport: LiveTransport = {
    async connect(options) {
      handlers = options;
      if (behaviour.fail) throw new Error('refused');
      try { await options.exchangeSdp('v=0 offer', new AbortController().signal); }
      catch (error) { if (behaviour.closeBeforeReject === 'refusal') { options.onClosed(); throw sdkFailure('WebRTC setup failed', error); } throw error; }
      if (behaviour.closeBeforeReject === 'answer') { options.onClosed(); throw sdkFailure('Failed to apply the remote description', new Error('InvalidStateError')); }
    },
    send(event) { sent.push(event); },
    close() { /* no-op */ },
  };
  return { transport, sent, emit: (event: LiveServerEvent) => handlers?.onEvent(event), closeFromServer: () => handlers?.onClosed() };
}
type RecordingFetch = typeof fetch & { calls: { url: string; init: RequestInit | undefined }[] };
function okFetch(body: unknown, status = 200): RecordingFetch {
  const calls: { url: string; init: RequestInit | undefined }[] = [];
  const impl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(input), init });
    return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
  }) as typeof fetch;
  return Object.assign(impl, { calls });
}
const sessionOk = { schemaVersion: 1, sessionId: 'live_1', sdp: 'v=0 answer', liveModel: 'gpt-live-1' };
const started = { type: 'session.started', event_id: 'e1', session: { id: 'live_1', model: 'gpt-live-1' } } as unknown as LiveServerEvent;
function answerFor(requestId: string, stepId: string, stepRevision: number) {
  return { schemaVersion: 1, requestId, runId: 'run-1', tutorialId: 'tut', tutorialRevision: 0, stepId, stepRevision, attemptId: 'a', answer: 'From server.', grounded: true, source: 'fallback', model: null };
}

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); });

describe('coach live path', () => {
  it('connects, waits for session.started, mutes, toggles listening, and reports step changes to the server', async () => {
    const fake = fakeTransport();
    const fetchImpl = okFetch(sessionOk);
    const coach = createCoach({ context, fetchImpl, getUserMedia: async () => stream, transportFactory: () => fake.transport, listenTimeoutMs: 1_000 });
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
    expect(fake.sent.some(event => event.type === 'session.thinking.append')).toBe(false);
    const report = fetchImpl.calls.at(-1);
    expect(report?.url).toBe('/api/live/sessions/live_1/step');
    expect(JSON.parse(String(report?.init?.body))).toMatchObject({ generation: 1, currentStepId: 's2', stepRevision: 1 });
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
  it('surfaces live error events and reports a new attempt to the server', async () => {
    const fake = fakeTransport();
    const fetchImpl = okFetch(sessionOk);
    const coach = createCoach({ context, fetchImpl, getUserMedia: async () => stream, transportFactory: () => fake.transport });
    const errors: string[] = [];
    coach.onLiveError(error => errors.push(error.code));
    const connecting = coach.connect();
    await vi.advanceTimersByTimeAsync(0);
    fake.emit(started);
    await connecting;
    fake.emit({ type: 'error', event_id: 'e9', error: { code: 'data_channel_permissions', message: 'denied', type: 'invalid_request_error' } });
    expect(errors).toEqual(['data_channel_permissions']);
    coach.setAttempt('attempt-2');
    expect(JSON.parse(String(fetchImpl.calls.at(-1)?.init?.body))).toMatchObject({ currentStepId: 's1', attemptId: 'attempt-2' });
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
    await vi.advanceTimersByTimeAsync(0);
    expect(coach.state.contextSync).toBe('idle');
    fake.emit({ type: 'session.input_transcript.delta', event_id: 'i2', delta: 'and now', start_ms: 300, end_ms: 400 });
    expect(sink.muted).toBe(false);
    fake.emit({ type: 'session.output_transcript.delta', event_id: 'o2', delta: 'Drop it.', start_ms: 400, end_ms: 500 });
    expect(seen).toEqual(['learner:0:live:what now', 'coach:0:stale:Slide base.', 'learner:1:live:and now', 'coach:1:live:Drop it.']);
  });
  it('never leaves the shared audio element muted for the next session', async () => {
    const sink = { muted: false, srcObject: null as MediaStream | null, play: async () => undefined } as unknown as HTMLAudioElement;
    const fake1 = fakeTransport();
    const first = createCoach({ context, fetchImpl: okFetch(sessionOk), getUserMedia: async () => stream, transportFactory: () => fake1.transport, audioSink: sink });
    const c1 = first.connect();
    await vi.advanceTimersByTimeAsync(0);
    fake1.emit(started);
    await c1;
    first.setStep('s2', 1);
    expect(sink.muted).toBe(true);
    first.dispose();
    expect(sink.muted).toBe(false);
    sink.muted = true;
    const fake2 = fakeTransport();
    const second = createCoach({ context, fetchImpl: okFetch(sessionOk), getUserMedia: async () => stream, transportFactory: () => fake2.transport, audioSink: sink });
    const seen: boolean[] = [];
    second.onTranscript(entry => seen.push(entry.stale));
    const c2 = second.connect();
    await vi.advanceTimersByTimeAsync(0);
    expect(sink.muted).toBe(false);
    fake2.emit(started);
    await c2;
    fake2.emit({ type: 'session.output_transcript.delta', event_id: 'o1', delta: 'Drop it.', start_ms: 0, end_ms: 100 });
    expect(seen).toEqual([false]);
    expect(sink.muted).toBe(false);
  });
  it('keeps the mic and playback closed until the server acknowledges a step change, and leaves live if it is refused', async () => {
    const sink = { muted: false, srcObject: null as MediaStream | null, play: async () => undefined } as unknown as HTMLAudioElement;
    const gate = { release: null as (() => void) | null, status: 200 };
    const fetchImpl: typeof fetch = async input => {
      if (String(input).endsWith('/step')) {
        await new Promise<void>(resolve => { gate.release = resolve; });
        return new Response(gate.status === 200 ? null : JSON.stringify({ error: 'stale_update', message: 'old' }), { status: gate.status });
      }
      return new Response(JSON.stringify(sessionOk), { status: 200, headers: { 'content-type': 'application/json' } });
    };
    const fake = fakeTransport();
    const { stream: mic, track } = trackedStream();
    const coach = createCoach({ context, fetchImpl, getUserMedia: async () => mic, transportFactory: () => fake.transport, audioSink: sink });
    const seen: string[] = [];
    coach.onTranscript(entry => seen.push(`${entry.stale ? 'stale' : 'live'}:${entry.delta}`));
    const connecting = coach.connect();
    await vi.advanceTimersByTimeAsync(0);
    fake.emit(started);
    await connecting;
    coach.setStep('s2', 1);
    expect(coach.state.contextSync).toBe('pending');
    coach.ask();
    expect(coach.state.mode).toBe('live');
    expect(track.enabled).toBe(false);
    fake.emit({ type: 'session.input_transcript.delta', event_id: 'i1', delta: 'hello', start_ms: 0, end_ms: 100 });
    expect(sink.muted).toBe(true);
    fake.emit({ type: 'session.output_transcript.delta', event_id: 'o1', delta: 'old step words', start_ms: 100, end_ms: 200 });
    expect(seen.at(-1)).toBe('stale:old step words');
    expect(coach.state.listenRequested).toBe(true);
    gate.release?.();
    await vi.advanceTimersByTimeAsync(0);
    expect(coach.state.contextSync).toBe('idle');
    // The Ask pressed during the update was kept: the mic opens the moment the server acknowledges.
    expect(coach.state.mode).toBe('listening');
    expect(track.enabled).toBe(true);
    coach.ask();
    expect(coach.state.mode).toBe('live');
    gate.status = 503;
    coach.setStep('s1', 2);
    gate.release?.();
    await vi.advanceTimersByTimeAsync(0);
    expect(coach.state).toMatchObject({ mode: 'text', liveClosed: true });
    expect(track.stopped).toBe(true);
  });
  it('ignores a late refusal for a step update that a newer one has already superseded', async () => {
    const stepCalls: ((status: number) => void)[] = [];
    const fetchImpl: typeof fetch = async input => {
      if (String(input).endsWith('/step')) {
        const status = await new Promise<number>(resolve => { stepCalls.push(resolve); });
        return new Response(status === 204 ? null : JSON.stringify({ error: 'stale_update', message: 'old' }), { status });
      }
      return new Response(JSON.stringify(sessionOk), { status: 200, headers: { 'content-type': 'application/json' } });
    };
    const fake = fakeTransport();
    const coach = createCoach({ context, fetchImpl, getUserMedia: async () => stream, transportFactory: () => fake.transport });
    const errors: string[] = [];
    coach.onLiveError(error => errors.push(error.code));
    const connecting = coach.connect();
    await vi.advanceTimersByTimeAsync(0);
    fake.emit(started);
    await connecting;
    coach.setStep('s2', 1);
    coach.setAttempt('attempt-2');
    await vi.advanceTimersByTimeAsync(0);
    expect(stepCalls).toHaveLength(2);
    stepCalls[1]?.(204);
    await vi.advanceTimersByTimeAsync(0);
    expect(coach.state).toMatchObject({ mode: 'live', contextSync: 'idle', contextGeneration: 2 });
    stepCalls[0]?.(409);
    await vi.advanceTimersByTimeAsync(0);
    expect(coach.state).toMatchObject({ mode: 'live', contextSync: 'idle', liveClosed: false });
    expect(errors).toEqual([]);
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
  it.each(['step', 'attempt'])('drops an offline fallback when the %s changes before the request fails', async change => {
    let fail!: (error: Error) => void;
    const coach = createCoach({ context, fetchImpl: () => new Promise((_, reject) => { fail = reject; }) });
    const answered = vi.fn(); coach.onAnswer(answered);
    const pending = coach.askText('Help');
    if (change === 'step') coach.setStep('s2', 1);
    else coach.setAttempt('attempt-2');
    fail(new TypeError('offline'));
    expect(await pending).toBeNull();
    expect(answered).not.toHaveBeenCalled();
    coach.dispose();
  });
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

  it('keeps old-step output muted and stale after the ack until the learner speaks, even when the step changed before the first delta', async () => {
    const sink = { muted: false, srcObject: null as MediaStream | null, play: async () => undefined } as unknown as HTMLAudioElement;
    const fake = fakeTransport();
    const coach = createCoach({ context, fetchImpl: okFetch(sessionOk), getUserMedia: async () => stream, transportFactory: () => fake.transport, audioSink: sink });
    const seen: { stale: boolean; delta: string; stepRevision: number }[] = [];
    coach.onTranscript(entry => seen.push({ stale: entry.stale, delta: entry.delta, stepRevision: entry.stepRevision }));
    const connecting = coach.connect();
    await vi.advanceTimersByTimeAsync(0);
    fake.emit(started);
    await connecting;
    // Ask on step 1, then move on before the model has said a word. The ack only proves the server holds step 2.
    fake.emit({ type: 'session.input_transcript.delta', event_id: 'i1', delta: 'what now', start_ms: 0, end_ms: 100 });
    coach.setStep('s2', 1);
    await vi.advanceTimersByTimeAsync(0);
    expect(coach.state.contextSync).toBe('idle');
    expect(sink.muted).toBe(true);
    // The delayed step-1 answer lands after the ack and after a long silence: still muted, still stale, still stamped with its own revision.
    await vi.advanceTimersByTimeAsync(5_000);
    fake.emit({ type: 'session.output_transcript.delta', event_id: 'o1', delta: 'old step answer', start_ms: 100, end_ms: 200 });
    expect(sink.muted).toBe(true);
    expect(seen.at(-1)).toEqual({ stale: true, delta: 'old step answer', stepRevision: 0 });
    // Only the learner's next words reopen playback, and they fix the revision the next answer belongs to.
    fake.emit({ type: 'session.input_transcript.delta', event_id: 'i2', delta: 'and now', start_ms: 300, end_ms: 400 });
    expect(sink.muted).toBe(false);
    fake.emit({ type: 'session.output_transcript.delta', event_id: 'o2', delta: 'new step answer', start_ms: 500, end_ms: 600 });
    expect(seen.at(-1)).toEqual({ stale: false, delta: 'new step answer', stepRevision: 1 });
    coach.dispose();
  });
  it('reports a startup failure and deletes the created session even when the SDK closes before connect() rejects', async () => {
    // The POST is refused: the SDK closes, then rejects with the refusal wrapped as cause. The server's reason survives.
    const refusedFetch = okFetch({ error: 'stale_tutorial', message: 'Tutorial revision 3 is not current.' }, 409);
    const refused = fakeTransport({ closeBeforeReject: 'refusal' });
    const a = createCoach({ context, fetchImpl: refusedFetch, getUserMedia: async () => stream, transportFactory: () => refused.transport });
    const errors: { code: string; message: string }[] = [];
    a.onLiveError(error => errors.push(error));
    expect(await a.connect()).toBe('text');
    expect(errors).toEqual([{ code: 'live_refused', message: 'The server refused a live session (409): Tutorial revision 3 is not current. Text answers remain.' }]);
    expect(refusedFetch.calls.some(call => call.init?.method === 'DELETE')).toBe(false);
    // The answer cannot be applied after the session exists: the close arrives first, the session is still deleted and the failure named.
    const fetchImpl = okFetch(sessionOk);
    const broken = fakeTransport({ closeBeforeReject: 'answer' });
    const b = createCoach({ context, fetchImpl, getUserMedia: async () => stream, transportFactory: () => broken.transport });
    const codes: string[] = [];
    b.onLiveError(error => codes.push(error.code));
    expect(await b.connect()).toBe('text');
    expect(codes).toEqual(['live_start_failed']);
    expect(fetchImpl.calls.find(call => call.init?.method === 'DELETE')?.url).toBe('/api/live/sessions/live_1');
  });
  it('names a non-secure origin when navigator.mediaDevices is missing', async () => {
    const insecure = createCoach({ context, fetchImpl: okFetch(sessionOk), getUserMedia: async () => { throw new TypeError("Cannot read properties of undefined (reading 'getUserMedia')"); }, transportFactory: () => fakeTransport().transport });
    const errors: string[] = [];
    insecure.onLiveError(error => errors.push(`${error.code}: ${error.message}`));
    expect(await insecure.connect()).toBe('text');
    expect(errors[0]).toMatch(/^microphone_unavailable: The microphone needs a secure origin/);
  });
  it('explains why live start failed and deletes a session the server already created', async () => {
    const errors: string[] = [];
    const denied = Object.assign(new Error('Permission denied'), { name: 'NotAllowedError' });
    const noMic = createCoach({ context, fetchImpl: okFetch(sessionOk), getUserMedia: async () => { throw denied; }, transportFactory: () => fakeTransport().transport });
    noMic.onLiveError(error => errors.push(error.code));
    expect(await noMic.connect()).toBe('text');
    expect(errors).toEqual(['microphone_denied']);

    const fetchImpl = okFetch(sessionOk);
    const fake = fakeTransport();
    const timedOut = createCoach({ context, fetchImpl, getUserMedia: async () => stream, transportFactory: () => fake.transport, liveStartTimeoutMs: 1_000 });
    const codes: string[] = [];
    timedOut.onLiveError(error => codes.push(error.code));
    const connecting = timedOut.connect();
    await vi.advanceTimersByTimeAsync(0);
    // session.started never arrives (for example, UDP is blocked and the media path never comes up).
    await vi.advanceTimersByTimeAsync(1_001);
    expect(await connecting).toBe('text');
    expect(codes).toEqual(['live_timeout']);
    const deleted = fetchImpl.calls.find(call => call.init?.method === 'DELETE');
    expect(deleted?.url).toBe('/api/live/sessions/live_1');
  });
  it('asks the microphone for echo cancellation, noise suppression and gain control, and requests the greeting only once live', async () => {
    let constraints: MediaStreamConstraints | null = null;
    const fake = fakeTransport();
    const fetchImpl = okFetch(sessionOk);
    const coach = createCoach({ context, fetchImpl, getUserMedia: async received => { constraints = received; return stream; }, transportFactory: () => fake.transport });
    const connecting = coach.connect();
    await vi.advanceTimersByTimeAsync(0);
    expect(fetchImpl.calls.some(call => call.url.endsWith('/greeting'))).toBe(false);
    fake.emit(started);
    await connecting;
    expect(constraints).toEqual({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
    expect(fetchImpl.calls.filter(call => call.url === '/api/live/sessions/live_1/greeting' && call.init?.method === 'POST')).toHaveLength(1);
    coach.dispose();
  });
});

describe('continuous live command tools',()=>{
 it('executes a completed tool once, rejects stale context, and keeps listening without clip uploads',async()=>{
  const fake=fakeTransport();let local='step-1';const actions:string[]=[];
  const coach=createCoach({context,continuous:true,actionContext:()=>local,onAction:action=>{actions.push(action);return {ok:true,message:'Paused.'};},fetchImpl:okFetch(sessionOk),getUserMedia:async()=>stream,transportFactory:()=>fake.transport});
  const connecting=coach.connect();await vi.advanceTimersByTimeAsync(0);fake.emit(started);await connecting;
  expect(coach.state.mode).toBe('listening');await vi.advanceTimersByTimeAsync(11000);expect(coach.state.mode).toBe('listening');
  const delegation=(id:string)=>fake.emit({type:'session.delegation.created',event_id:id,offset_ms:0,delegation:{id,target:'responses',type:'delegation'}});
  const tool=(id:string,call:string)=>fake.emit({type:'response.event',event_id:call,delegation_id:id,event:{type:'response.output_item.done',item:{type:'function_call',name:'trail_action',call_id:call,arguments:'{"action":"pause"}'}}});
  delegation('d1');tool('d1','c1');tool('d1','c1');await vi.advanceTimersByTimeAsync(0);expect(actions).toEqual(['pause']);
  expect(fake.sent.filter(e=>e.type==='response.item.create')).toHaveLength(1);
  delegation('d2');local='step-2';tool('d2','c2');tool('missing','c3');await vi.advanceTimersByTimeAsync(0);expect(actions).toEqual(['pause']);
  const outputs=fake.sent.filter(e=>e.type==='response.item.create');expect(outputs).toHaveLength(3);expect(JSON.stringify(outputs.at(-1))).toContain('false');coach.dispose();
 });
});
