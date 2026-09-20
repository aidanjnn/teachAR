import {
  COACH_TEXT_DEADLINE_MS, CoachAnswerSchema, CoachSessionResponseSchema, fallbackCoachAnswer, type CoachAnswer, type CoachContext,
} from '@trail/contracts';
import { initialCoachState, reduceCoach, type CoachEffect, type CoachEvent, type CoachState } from './coach-state.js';
import { createWebRtcLiveTransport, type LiveClientEvent, type LiveServerEvent, type LiveTransport } from './live-transport.js';

/** `stale` marks coach output produced for a step or attempt the learner has already left. */
export interface TranscriptEntry { role: 'learner' | 'coach'; delta: string; stepRevision: number; stale: boolean }
export interface LiveError { code: string; message: string }
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
  /** Repeat starts a new attempt: in-flight answers for the old attempt are dropped. */
  setAttempt(attemptId: string): void;
  dispose(): void;
  onState(handler: (state: CoachState) => void): () => void;
  onTranscript(handler: (entry: TranscriptEntry) => void): () => void;
  onAnswer(handler: (answer: CoachAnswer) => void): () => void;
  onLiveError(handler: (error: LiveError) => void): () => void;
}

function newId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `req-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

/** After a step change, playback returns once the model has been silent this long and the server holds the new step. */
const QUIET_MS = 1_500;
/** Echo cancellation matters most on a headset whose speakers sit next to its microphone. */
const MIC_CONSTRAINTS: MediaStreamConstraints = { audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } };

/** Runs the coach reducer against GPT-Live over WebRTC, falling back to text answers. Never touches guide progression. */
export function createCoach(options: CoachOptions): CoachApi {
  const fetchImpl = options.fetchImpl ?? ((input, init) => fetch(input, init));
  const getUserMedia = options.getUserMedia ?? (constraints => navigator.mediaDevices.getUserMedia(constraints));
  const transportFactory = options.transportFactory ?? createWebRtcLiveTransport;
  const listenTimeoutMs = options.listenTimeoutMs ?? 10_000;
  const liveStartTimeoutMs = options.liveStartTimeoutMs ?? 15_000;
  const textDeadlineMs = options.textDeadlineMs ?? COACH_TEXT_DEADLINE_MS;
  let context: CoachContext = { ...options.context };
  let state = initialCoachState({
    runId: context.runId, tutorialId: context.tutorialId, tutorialRevision: context.tutorialRevision,
    attemptId: context.attemptId, stepId: context.currentStepId, stepRevision: context.stepRevision,
  });
  let disposed = false;
  let transport: LiveTransport | null = null;
  let liveSessionId: string | null = null;
  let stream: MediaStream | null = null;
  let listenTimer: ReturnType<typeof setTimeout> | null = null;
  let startTimer: ReturnType<typeof setTimeout> | null = null;
  let startedResolve: (() => void) | null = null;
  let startedReject: ((error: Error) => void) | null = null;
  /** Closed after a step/attempt change until the learner speaks again; playback is muted and captions are stale meanwhile. */
  let outputGateClosed = false;
  /** Revision the current learner turn was asked under; coach output is stamped with it, not with the latest state. */
  let turnRevision = state.stepRevision;
  let eventCounter = 0;
  /** When the model last produced speech; playback is only reopened after a step change once it has gone quiet. */
  let lastOutputAt = 0;
  let reopenTimer: ReturnType<typeof setTimeout> | null = null;
  const stateHandlers = new Set<(state: CoachState) => void>();
  const transcriptHandlers = new Set<(entry: TranscriptEntry) => void>();
  const answerHandlers = new Set<(answer: CoachAnswer) => void>();
  const errorHandlers = new Set<(error: LiveError) => void>();

  const eventId = (prefix: string) => `${prefix}-${++eventCounter}`;
  const clearListenTimer = () => { if (listenTimer) { clearTimeout(listenTimer); listenTimer = null; } };
  const armListenTimer = () => { clearListenTimer(); listenTimer = setTimeout(() => { dispatch({ type: 'listen-timeout' }); }, listenTimeoutMs); };
  /** Local backstop: the track is disabled regardless of whether the server accepted the mute event. */
  const setMicEnabled = (enabled: boolean) => { stream?.getAudioTracks().forEach(track => { track.enabled = enabled; }); };
  const send = (event: LiveClientEvent) => {
    try {
      transport?.send(event);
    } catch {
      errorHandlers.forEach(handler => handler({ code: 'send_failed', message: `Could not send ${event.type} to the live session.` }));
    }
  };
  const stopStream = () => { stream?.getTracks().forEach(track => track.stop()); stream = null; };
  const deleteSession = (id: string) => { void fetchImpl(`/api/live/sessions/${encodeURIComponent(id)}`, { method: 'DELETE', keepalive: true }).catch(() => undefined); };
  /** A step change mutes whatever the model was saying about the old step. Once the server has the new step and the model is quiet, playback comes back on its own. */
  function reopenGateWhenQuiet() {
    if (reopenTimer) { clearTimeout(reopenTimer); reopenTimer = null; }
    if (disposed || !outputGateClosed || state.contextSync !== 'idle') return;
    const quietMs = Date.now() - lastOutputAt;
    if (quietMs >= QUIET_MS) { outputGateClosed = false; setPlaybackMuted(false); return; }
    reopenTimer = setTimeout(() => { reopenTimer = null; reopenGateWhenQuiet(); }, QUIET_MS - quietMs + 50);
  }
  function describeStartFailure(error: unknown): LiveError {
    const name = (error as { name?: string })?.name ?? '';
    const message = (error as { message?: string })?.message ?? '';
    if (['NotAllowedError', 'PermissionDeniedError', 'SecurityError'].includes(name)) return { code: 'microphone_denied', message: 'Microphone permission was refused; the coach answers in text only.' };
    if (name === 'NotFoundError' || name === 'NotReadableError') return { code: 'microphone_unavailable', message: 'No usable microphone was found; the coach answers in text only.' };
    const refused = /Live session refused \((\d+)\)/.exec(message);
    if (refused) return { code: 'live_refused', message: `The server refused a live session (${refused[1]}); text answers remain.` };
    if (/did not start in time/.test(message)) return { code: 'live_timeout', message: 'The live session did not start in time; the network may block WebRTC audio. Text answers remain.' };
    return { code: 'live_start_failed', message: message || 'The live session could not start; text answers remain.' };
  }
  const setPlaybackMuted = (muted: boolean) => { if (options.audioSink) options.audioSink.muted = muted; };
  function releaseLive() {
    clearListenTimer();
    if (reopenTimer) { clearTimeout(reopenTimer); reopenTimer = null; }
    if (startTimer) { clearTimeout(startTimer); startTimer = null; }
    // Settle a still-pending connect() so callers never hang when the session ends before session.started.
    startedReject?.(new Error('Live session ended before it started'));
    startedResolve = null;
    startedReject = null;
    const active = transport;
    transport = null;
    liveSessionId = null;
    active?.close();
    stopStream();
    // The audio element outlives this coach; never leave it muted for the next session.
    outputGateClosed = false;
    setPlaybackMuted(false);
  }

  function runEffect(effect: CoachEffect) {
    switch (effect.type) {
      case 'mute': clearListenTimer(); setMicEnabled(false); send({ type: 'session.input_audio.mute', event_id: eventId('mute') }); break;
      case 'unmute': setMicEnabled(true); send({ type: 'session.input_audio.unmute', event_id: eventId('unmute') }); armListenTimer(); break;
      case 'send-step-context': reportStep(); break;
      case 'release-live': releaseLive(); break;
      case 'invalidate-live-output': outputGateClosed = true; setPlaybackMuted(true); break;
      case 'emit-answer': answerHandlers.forEach(handler => handler(effect.answer)); break;
      case 'drop-answer': break;
    }
  }
  /** The server composes and pushes step context over its trusted channel; the browser only names the step and waits for the ack. */
  function reportStep() {
    const generation = state.contextGeneration;
    if (!liveSessionId) { dispatch({ type: 'context-sync-failed', generation }); return; }
    const sessionId = liveSessionId;
    void fetchImpl(`/api/live/sessions/${encodeURIComponent(sessionId)}/step`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, signal: AbortSignal.timeout(3_000),
      body: JSON.stringify({ schemaVersion: 1, generation, currentStepId: context.currentStepId, stepRevision: context.stepRevision, attemptId: context.attemptId }),
    }).then(response => {
      if (response.ok) { dispatch({ type: 'context-synced', generation }); return; }
      failSync(generation, { code: 'step_context_rejected', message: `Server refused the step update (${response.status}); live coaching stopped.` });
    }, () => {
      failSync(generation, { code: 'step_context_failed', message: 'Could not reach the server to update the coach step; live coaching stopped.' });
    });
  }
  /** A late answer for an older generation is noise once a newer update is in flight; only the current one can end live coaching. */
  function failSync(generation: number, error: LiveError) {
    if (disposed || generation !== state.contextGeneration) return;
    errorHandlers.forEach(handler => handler(error));
    dispatch({ type: 'context-sync-failed', generation });
  }
  function dispatch(event: CoachEvent): CoachEffect[] {
    if (disposed) return [];
    const wasPending = state.contextSync === 'pending';
    const result = reduceCoach(state, event);
    state = result.state;
    result.effects.forEach(runEffect);
    if (event.type === 'context-synced' && wasPending && state.contextSync === 'idle') reopenGateWhenQuiet();
    stateHandlers.forEach(handler => handler(state));
    return result.effects;
  }
  function handleLiveEvent(event: LiveServerEvent) {
    if (disposed) return;
    switch (event.type) {
      case 'session.started':
        if (startTimer) { clearTimeout(startTimer); startTimer = null; }
        startedResolve?.();
        startedResolve = null;
        startedReject = null;
        break;
      case 'session.input_transcript.delta':
        armListenTimer();
        // A new learner turn reopens the gate and fixes the revision its answer belongs to.
        turnRevision = state.stepRevision;
        // Only reopen once the server has acknowledged the current step; until then the model may still hold the old one.
        if (outputGateClosed && state.contextSync === 'idle') { outputGateClosed = false; setPlaybackMuted(false); }
        transcriptHandlers.forEach(handler => handler({ role: 'learner', delta: event.delta, stepRevision: turnRevision, stale: false }));
        break;
      case 'session.output_transcript.delta':
        lastOutputAt = Date.now();
        transcriptHandlers.forEach(handler => handler({ role: 'coach', delta: event.delta, stepRevision: turnRevision, stale: outputGateClosed }));
        break;
      case 'session.closed':
        dispatch({ type: 'live-closed' });
        break;
      case 'error':
        errorHandlers.forEach(handler => handler({ code: event.error.code, message: event.error.message }));
        break;
      default:
        break;
    }
  }

  return {
    get state() { return state; },
    get context() { return context; },
    async connect() {
      if (disposed || state.mode !== 'idle') return state.mode;
      dispatch({ type: 'connect-started' });
      try {
        const acquired = await getUserMedia(MIC_CONSTRAINTS);
        // Silence the microphone before it ever reaches the peer connection; only Ask by voice enables it.
        acquired.getAudioTracks().forEach(track => { track.enabled = false; });
        if (disposed) { acquired.getTracks().forEach(track => track.stop()); return state.mode; }
        stream = acquired;
        const active = transportFactory();
        transport = active;
        const started = new Promise<void>((resolve, reject) => {
          startedResolve = resolve;
          startedReject = reject;
          startTimer = setTimeout(() => reject(new Error('Live session did not start in time')), liveStartTimeoutMs);
        });
        outputGateClosed = false;
        setPlaybackMuted(false);
        turnRevision = state.stepRevision;
        void started.catch(() => undefined);
        await active.connect({
          localStream: acquired,
          timeoutMs: liveStartTimeoutMs,
          onEvent: handleLiveEvent,
          onClosed: () => { dispatch({ type: 'live-closed' }); },
          onRemoteStream: remote => {
            if (disposed || transport !== active || !options.audioSink) return;
            options.audioSink.srcObject = remote;
            void options.audioSink.play().catch(() => undefined);
          },
          exchangeSdp: async (offer, signal) => {
            const response = await fetchImpl('/api/live/sessions', {
              method: 'POST', headers: { 'content-type': 'application/json' }, signal,
              body: JSON.stringify({ schemaVersion: 1, sdp: offer, context }),
            });
            if (!response.ok) throw new Error(`Live session refused (${response.status})`);
            const session = CoachSessionResponseSchema.parse(await response.json());
            liveSessionId = session.sessionId;
            return session.sdp;
          },
        });
        await started;
        if (disposed) { releaseLive(); return state.mode; }
        dispatch({ type: 'live-ready' });
      } catch (error) {
        // The server may already have created and billed a session; never leave it orphaned for 30 minutes.
        if (liveSessionId) { deleteSession(liveSessionId); liveSessionId = null; }
        if (disposed) { releaseLive(); return state.mode; }
        // If the session already closed while we waited, live-closed has run; do not report a second failure.
        // (Cast: dispatch() mutates `state` inside a closure, which TypeScript's narrowing cannot see.)
        if ((state as CoachState).mode === 'connecting') {
          const failure = describeStartFailure(error);
          errorHandlers.forEach(handler => handler(failure));
          dispatch({ type: 'live-failed' });
        }
      }
      return state.mode;
    },
    ask() { dispatch({ type: 'listen-toggled' }); },
    async askText(question) {
      const requestId = newId();
      const requestContext = context;
      dispatch({ type: 'text-asked', requestId });
      let answer: CoachAnswer;
      try {
        const response = await fetchImpl('/api/coach', {
          method: 'POST', headers: { 'content-type': 'application/json' }, signal: AbortSignal.timeout(textDeadlineMs),
          body: JSON.stringify({ schemaVersion: 1, requestId, context: requestContext, question }),
        });
        if (!response.ok) throw new Error(`Coach refused (${response.status})`);
        answer = CoachAnswerSchema.parse(await response.json());
      } catch {
        answer = fallbackCoachAnswer({ requestId, context: requestContext });
      }
      const effects = dispatch({ type: 'answer-received', answer });
      return effects.some(effect => effect.type === 'emit-answer') ? answer : null;
    },
    setStep(stepId, stepRevision) {
      if (!context.steps.some(step => step.id === stepId)) throw new Error(`Unknown step ${stepId}`);
      context = { ...context, currentStepId: stepId, stepRevision };
      dispatch({ type: 'step-changed', stepId, stepRevision });
    },
    setAttempt(attemptId) {
      context = { ...context, attemptId };
      dispatch({ type: 'attempt-changed', attemptId });
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      stateHandlers.clear();
      transcriptHandlers.clear();
      answerHandlers.clear();
      errorHandlers.clear();
      if (transport) { try { transport.send({ type: 'session.close', event_id: eventId('close') }); } catch { /* already closed */ } }
      if (liveSessionId) { deleteSession(liveSessionId); liveSessionId = null; }
      releaseLive();
    },
    onState(handler) { stateHandlers.add(handler); return () => { stateHandlers.delete(handler); }; },
    onTranscript(handler) { transcriptHandlers.add(handler); return () => { transcriptHandlers.delete(handler); }; },
    onAnswer(handler) { answerHandlers.add(handler); return () => { answerHandlers.delete(handler); }; },
    onLiveError(handler) { errorHandlers.add(handler); return () => { errorHandlers.delete(handler); }; },
  };
}
