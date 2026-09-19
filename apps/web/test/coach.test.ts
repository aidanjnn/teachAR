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
