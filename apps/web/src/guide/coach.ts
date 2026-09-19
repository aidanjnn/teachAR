import { CoachAnswerSchema, CoachSessionResponseSchema, type CoachAnswer, type CoachContext, type CoachStep } from '@trail/contracts';
import { initialCoachState, reduceCoach, type CoachEffect, type CoachEvent, type CoachState } from './coach-state.js';
import { createWebRtcLiveTransport, type LiveClientEvent, type LiveServerEvent, type LiveTransport } from './live-transport.js';

export interface TranscriptEntry { role: 'learner' | 'coach'; delta: string; stepRevision: number }
export interface CoachOptions {
  context: CoachContext;
  fetchImpl?: typeof fetch;
  transportFactory?: () => LiveTransport;
  getUserMedia?: (constraints: MediaStreamConstraints) => Promise<MediaStream>;
  audioSink?: HTMLAudioElement;
  listenTimeoutMs?: number;
  liveStartTimeoutMs?: number;
  textDeadlineMs?: number;
}
export interface CoachApi {
  readonly state: CoachState;
  readonly context: CoachContext;
  connect(): Promise<CoachState['mode']>;
  ask(): void;
  askText(question: string): Promise<CoachAnswer | null>;
  setStep(stepId: string, stepRevision: number): void;
  dispose(): void;
  onState(handler: (state: CoachState) => void): () => void;
  onTranscript(handler: (entry: TranscriptEntry) => void): () => void;
  onAnswer(handler: (answer: CoachAnswer) => void): () => void;
}

function stepOf(context: CoachContext): CoachStep {
  const step = context.steps.find(item => item.id === context.currentStepId);
  if (!step) throw new Error('Coach context has no current step');
  return step;
}
/** Mirrors the server's stepChangeContext wording; the web bundle cannot import server code. */
function stepContextText(context: CoachContext): string {
  const index = context.steps.findIndex(item => item.id === context.currentStepId);
  const step = stepOf(context);
  return `The learner is now on step ${index + 1} of ${context.steps.length}: "${step.title}". Instruction: ${step.instruction} Questions about earlier steps are stale; answer for this step.`;
}
function newId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `req-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

/** Runs the coach reducer against GPT-Live over WebRTC, falling back to text answers. Never touches guide progression. */
export function createCoach(options: CoachOptions): CoachApi {
  const fetchImpl = options.fetchImpl ?? ((input, init) => fetch(input, init));
  const getUserMedia = options.getUserMedia ?? (constraints => navigator.mediaDevices.getUserMedia(constraints));
  const transportFactory = options.transportFactory ?? createWebRtcLiveTransport;
  const listenTimeoutMs = options.listenTimeoutMs ?? 10_000;
  const liveStartTimeoutMs = options.liveStartTimeoutMs ?? 15_000;
  const textDeadlineMs = options.textDeadlineMs ?? 5_000;
  let context: CoachContext = { ...options.context };
  let state = initialCoachState({ runId: context.runId, stepId: context.currentStepId, stepRevision: context.stepRevision });
  let transport: LiveTransport | null = null;
  let stream: MediaStream | null = null;
  let listenTimer: ReturnType<typeof setTimeout> | null = null;
  let startTimer: ReturnType<typeof setTimeout> | null = null;
  let startedResolve: (() => void) | null = null;
  let eventCounter = 0;
  const stateHandlers = new Set<(state: CoachState) => void>();
  const transcriptHandlers = new Set<(entry: TranscriptEntry) => void>();
  const answerHandlers = new Set<(answer: CoachAnswer) => void>();

  const eventId = (prefix: string) => `${prefix}-${++eventCounter}`;
  const send = (event: LiveClientEvent) => { try { transport?.send(event); } catch { /* channel closed; live-closed follows */ } };
  const clearListenTimer = () => { if (listenTimer) { clearTimeout(listenTimer); listenTimer = null; } };
  const armListenTimer = () => { clearListenTimer(); listenTimer = setTimeout(() => { dispatch({ type: 'listen-timeout' }); }, listenTimeoutMs); };

  function runEffect(effect: CoachEffect) {
    switch (effect.type) {
      case 'mute': clearListenTimer(); send({ type: 'session.input_audio.mute', event_id: eventId('mute') }); break;
      case 'unmute': send({ type: 'session.input_audio.unmute', event_id: eventId('unmute') }); armListenTimer(); break;
      case 'send-step-context': send({ type: 'session.thinking.append', event_id: eventId('ctx'), delegation_id: null, content: stepContextText(context) }); break;
      case 'emit-answer': answerHandlers.forEach(handler => handler(effect.answer)); break;
      case 'drop-answer': break;
    }
  }
  function dispatch(event: CoachEvent): CoachEffect[] {
    const result = reduceCoach(state, event);
    state = result.state;
    result.effects.forEach(runEffect);
    stateHandlers.forEach(handler => handler(state));
    return result.effects;
  }
  function handleLiveEvent(event: LiveServerEvent) {
    switch (event.type) {
      case 'session.started':
        if (startTimer) { clearTimeout(startTimer); startTimer = null; }
        startedResolve?.();
        startedResolve = null;
        break;
      case 'session.input_transcript.delta':
        armListenTimer();
        transcriptHandlers.forEach(handler => handler({ role: 'learner', delta: event.delta, stepRevision: state.stepRevision }));
        break;
      case 'session.output_transcript.delta':
        transcriptHandlers.forEach(handler => handler({ role: 'coach', delta: event.delta, stepRevision: state.stepRevision }));
        break;
      case 'session.closed':
        dispatch({ type: 'live-closed' });
        break;
      default:
        break;
    }
  }
  function localFallback(requestId: string): CoachAnswer {
    const step = stepOf(context);
    return CoachAnswerSchema.parse({
      schemaVersion: 1, requestId, runId: context.runId, tutorialId: context.tutorialId, tutorialRevision: context.tutorialRevision,
      stepId: context.currentStepId, stepRevision: context.stepRevision, attemptId: context.attemptId,
      answer: `${step.title}. ${step.instruction}`.slice(0, 600), grounded: true, source: 'fallback', model: null,
    });
  }
  function releaseLive() {
    clearListenTimer();
    if (startTimer) { clearTimeout(startTimer); startTimer = null; }
    transport?.close();
    transport = null;
    stream?.getTracks().forEach(track => track.stop());
    stream = null;
  }

  return {
    get state() { return state; },
    get context() { return context; },
    async connect() {
      if (state.mode !== 'idle') return state.mode;
      dispatch({ type: 'connect-started' });
      try {
        stream = await getUserMedia({ audio: true });
        const active = transportFactory();
        transport = active;
        const started = new Promise<void>((resolve, reject) => {
          startedResolve = resolve;
          startTimer = setTimeout(() => reject(new Error('Live session did not start in time')), liveStartTimeoutMs);
        });
        void started.catch(() => undefined);
        await active.connect({
          localStream: stream,
          timeoutMs: liveStartTimeoutMs,
          onEvent: handleLiveEvent,
          onClosed: () => { dispatch({ type: 'live-closed' }); },
          onRemoteStream: remote => {
            if (options.audioSink) {
              options.audioSink.srcObject = remote;
              void options.audioSink.play().catch(() => undefined);
            }
          },
          exchangeSdp: async (offer, signal) => {
            const response = await fetchImpl('/api/coach/session', {
              method: 'POST', headers: { 'content-type': 'application/json' }, signal,
              body: JSON.stringify({ schemaVersion: 1, sdp: offer, context }),
            });
            if (!response.ok) throw new Error(`Live session refused (${response.status})`);
            return CoachSessionResponseSchema.parse(await response.json()).sdp;
          },
        });
        await started;
        dispatch({ type: 'live-ready' });
      } catch {
        releaseLive();
        dispatch({ type: 'live-failed' });
      }
      return state.mode;
    },
    ask() { dispatch({ type: 'listen-toggled' }); },
    async askText(question) {
      const requestId = newId();
      dispatch({ type: 'text-asked', requestId });
      let answer: CoachAnswer;
      try {
        const response = await fetchImpl('/api/coach', {
          method: 'POST', headers: { 'content-type': 'application/json' }, signal: AbortSignal.timeout(textDeadlineMs),
          body: JSON.stringify({ schemaVersion: 1, requestId, context, question }),
        });
        if (!response.ok) throw new Error(`Coach refused (${response.status})`);
        answer = CoachAnswerSchema.parse(await response.json());
      } catch {
        answer = localFallback(requestId);
      }
      const effects = dispatch({ type: 'answer-received', answer });
      return effects.some(effect => effect.type === 'emit-answer') ? answer : null;
    },
    setStep(stepId, stepRevision) {
      if (!context.steps.some(step => step.id === stepId)) throw new Error(`Unknown step ${stepId}`);
      context = { ...context, currentStepId: stepId, stepRevision };
      dispatch({ type: 'step-changed', stepId, stepRevision });
    },
    dispose() {
      if (transport) send({ type: 'session.close', event_id: eventId('close') });
      releaseLive();
      stateHandlers.clear();
      transcriptHandlers.clear();
      answerHandlers.clear();
    },
    onState(handler) { stateHandlers.add(handler); return () => { stateHandlers.delete(handler); }; },
    onTranscript(handler) { transcriptHandlers.add(handler); return () => { transcriptHandlers.delete(handler); }; },
    onAnswer(handler) { answerHandlers.add(handler); return () => { answerHandlers.delete(handler); }; },
  };
}
