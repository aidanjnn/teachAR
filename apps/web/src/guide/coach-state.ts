import type { CoachAnswer } from '@trail/contracts';

export type CoachMode = 'idle' | 'connecting' | 'live' | 'listening' | 'text';

export interface CoachState {
  mode: CoachMode;
  /** A live session existed and then closed; answers continue in text mode. */
  liveClosed: boolean;
  runId: string;
  tutorialId: string;
  tutorialRevision: number;
  attemptId: string;
  stepId: string;
  stepRevision: number;
  /** Increases on every step or attempt change; the server orders live context updates by it. */
  contextGeneration: number;
  /** A live context update is in flight; the coach must not listen or play output until it is acknowledged. */
  contextSync: 'idle' | 'pending';
  /** The step or attempt changed while the live session was still connecting; resync on ready. */
  contextDirty: boolean;
  /** Ask was pressed while a context update was in flight; open the microphone as soon as the server acknowledges. */
  listenRequested: boolean;
  pendingRequestId: string | null;
  seenRequestIds: readonly string[];
}

export type CoachEvent =
  | { type: 'connect-started' }
  | { type: 'live-ready' }
  | { type: 'live-failed' }
  | { type: 'live-closed' }
  | { type: 'listen-toggled' }
  | { type: 'listen-timeout' }
  | { type: 'step-changed'; stepId: string; stepRevision: number }
  | { type: 'attempt-changed'; attemptId: string }
  /** The server accepted the context update for this generation. */
  | { type: 'context-synced'; generation: number }
  /** The server rejected the update or could not be reached; live coaching is no longer trustworthy. */
  | { type: 'context-sync-failed'; generation: number }
  | { type: 'text-asked'; requestId: string }
  | { type: 'answer-received'; answer: CoachAnswer };

export type CoachEffect =
  | { type: 'unmute' }
  | { type: 'mute' }
  | { type: 'send-step-context' }
  /** Stop microphone tracks and close the transport; emitted whenever a live session ends. */
  | { type: 'release-live' }
  /** Old spoken output no longer applies: mute playback and mark captions stale until the learner speaks again. */
  | { type: 'invalidate-live-output' }
  | { type: 'emit-answer'; answer: CoachAnswer }
  | { type: 'drop-answer'; reason: 'stale-run' | 'stale-tutorial' | 'stale-attempt' | 'stale-step' | 'unknown-request' | 'duplicate' };

const SEEN_LIMIT = 50;
const none: CoachEffect[] = [];

export function initialCoachState(input: {
  runId: string; tutorialId: string; tutorialRevision: number; attemptId: string; stepId: string; stepRevision: number;
}): CoachState {
  return {
    mode: 'idle', liveClosed: false, runId: input.runId, tutorialId: input.tutorialId, tutorialRevision: input.tutorialRevision,
    attemptId: input.attemptId, stepId: input.stepId, stepRevision: input.stepRevision, contextGeneration: 0, contextSync: 'idle',
    contextDirty: false, listenRequested: false, pendingRequestId: null, seenRequestIds: [],
  };
}

/** Step and attempt changes share one shape: in-flight answers become stale and a live session needs fresh context. */
function contextChanged(state: CoachState, next: CoachState): { state: CoachState; effects: CoachEffect[] } {
  const cleared: CoachState = { ...next, pendingRequestId: null, contextGeneration: state.contextGeneration + 1 };
  if (state.mode === 'listening') {
    return { state: { ...cleared, mode: 'live', contextSync: 'pending' }, effects: [{ type: 'mute' }, { type: 'invalidate-live-output' }, { type: 'send-step-context' }] };
  }
  if (state.mode === 'live') return { state: { ...cleared, contextSync: 'pending' }, effects: [{ type: 'invalidate-live-output' }, { type: 'send-step-context' }] };
  if (state.mode === 'connecting') return { state: { ...cleared, contextDirty: true }, effects: none };
  return { state: cleared, effects: none };
}

function leaveLive(state: CoachState): { state: CoachState; effects: CoachEffect[] } {
  return { state: { ...state, mode: 'text', liveClosed: true, contextSync: 'idle', listenRequested: false }, effects: [{ type: 'release-live' }] };
}

/** Pure transition. The coach never touches guide progression; it only decides mute state and which answers to surface. */
export function reduceCoach(state: CoachState, event: CoachEvent): { state: CoachState; effects: CoachEffect[] } {
  switch (event.type) {
    case 'connect-started':
      return { state: { ...state, mode: 'connecting', contextDirty: false, contextSync: 'idle' }, effects: none };
    case 'live-ready': {
      // A late session.started after the channel already closed must not revive a dead session.
      if (state.mode !== 'connecting') return { state, effects: none };
      if (state.contextDirty) {
        return {
          state: { ...state, mode: 'live', liveClosed: false, contextDirty: false, contextSync: 'pending' },
          effects: [{ type: 'mute' }, { type: 'invalidate-live-output' }, { type: 'send-step-context' }],
        };
      }
      return { state: { ...state, mode: 'live', liveClosed: false }, effects: [{ type: 'mute' }] };
    }
    case 'live-failed':
      return { state: { ...state, mode: 'text', contextSync: 'idle', listenRequested: false }, effects: [{ type: 'release-live' }] };
    case 'live-closed':
      return state.mode === 'connecting' || state.mode === 'live' || state.mode === 'listening' ? leaveLive(state) : { state, effects: none };
    case 'listen-toggled':
      // Never open the microphone while the model may still hold the previous step.
      if (state.mode === 'live' && state.contextSync === 'idle') return { state: { ...state, mode: 'listening', listenRequested: false }, effects: [{ type: 'unmute' }] };
      // A press during a step update is kept, not dropped: the mic opens the moment the server acknowledges. A second press cancels it.
      if (state.mode === 'live') return { state: { ...state, listenRequested: !state.listenRequested }, effects: none };
      if (state.mode === 'listening') return { state: { ...state, mode: 'live', listenRequested: false }, effects: [{ type: 'mute' }] };
      return { state, effects: none };
    case 'listen-timeout':
      return state.mode === 'listening' ? { state: { ...state, mode: 'live' }, effects: [{ type: 'mute' }] } : { state, effects: none };
    case 'step-changed':
      return contextChanged(state, { ...state, stepId: event.stepId, stepRevision: event.stepRevision });
    case 'attempt-changed':
      return contextChanged(state, { ...state, attemptId: event.attemptId });
    case 'context-synced':
      if (state.contextSync !== 'pending' || event.generation !== state.contextGeneration) return { state, effects: none };
      if (state.listenRequested && state.mode === 'live') return { state: { ...state, contextSync: 'idle', mode: 'listening', listenRequested: false }, effects: [{ type: 'unmute' }] };
      return { state: { ...state, contextSync: 'idle' }, effects: none };
    case 'context-sync-failed':
      if (event.generation !== state.contextGeneration || !(state.mode === 'live' || state.mode === 'listening')) return { state, effects: none };
      return leaveLive(state);
    case 'text-asked':
      return { state: { ...state, pendingRequestId: event.requestId }, effects: none };
    case 'answer-received': {
      const { answer } = event;
      const drop = (reason: Extract<CoachEffect, { type: 'drop-answer' }>['reason'], clearPending = false) =>
        ({ state: clearPending ? { ...state, pendingRequestId: null } : state, effects: [{ type: 'drop-answer' as const, reason }] });
      if (answer.runId !== state.runId) return drop('stale-run');
      if (answer.tutorialId !== state.tutorialId || answer.tutorialRevision !== state.tutorialRevision) return drop('stale-tutorial');
      if (state.seenRequestIds.includes(answer.requestId)) return drop('duplicate');
      if (answer.requestId !== state.pendingRequestId) return drop('unknown-request');
      if (answer.attemptId !== state.attemptId) return drop('stale-attempt', true);
      if (answer.stepId !== state.stepId || answer.stepRevision !== state.stepRevision) return drop('stale-step', true);
      const seenRequestIds = [...state.seenRequestIds, answer.requestId].slice(-SEEN_LIMIT);
      return { state: { ...state, pendingRequestId: null, seenRequestIds }, effects: [{ type: 'emit-answer', answer }] };
    }
  }
}
