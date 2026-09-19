import type { CoachAnswer } from '@trail/contracts';

export type CoachMode = 'idle' | 'connecting' | 'live' | 'listening' | 'text';

export interface CoachState {
  mode: CoachMode;
  /** A live session existed and then closed; answers continue in text mode. */
  liveClosed: boolean;
  runId: string;
  stepId: string;
  stepRevision: number;
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
  | { type: 'text-asked'; requestId: string }
  | { type: 'answer-received'; answer: CoachAnswer };

export type CoachEffect =
  | { type: 'unmute' }
  | { type: 'mute' }
  | { type: 'send-step-context' }
  | { type: 'emit-answer'; answer: CoachAnswer }
  | { type: 'drop-answer'; reason: 'stale-run' | 'stale-step' | 'unknown-request' | 'duplicate' };

const SEEN_LIMIT = 50;
const none: CoachEffect[] = [];

export function initialCoachState(input: { runId: string; stepId: string; stepRevision: number }): CoachState {
  return { mode: 'idle', liveClosed: false, runId: input.runId, stepId: input.stepId, stepRevision: input.stepRevision, pendingRequestId: null, seenRequestIds: [] };
}

/** Pure transition. The coach never touches guide progression; it only decides mute state and which answers to surface. */
export function reduceCoach(state: CoachState, event: CoachEvent): { state: CoachState; effects: CoachEffect[] } {
  switch (event.type) {
    case 'connect-started':
      return { state: { ...state, mode: 'connecting' }, effects: none };
    case 'live-ready':
      // A late session.started after the channel already closed must not revive a dead session.
      return state.mode === 'connecting' ? { state: { ...state, mode: 'live', liveClosed: false }, effects: [{ type: 'mute' }] } : { state, effects: none };
    case 'live-failed':
      return { state: { ...state, mode: 'text' }, effects: none };
    case 'live-closed':
      return state.mode === 'connecting' || state.mode === 'live' || state.mode === 'listening'
        ? { state: { ...state, mode: 'text', liveClosed: true }, effects: none }
        : { state, effects: none };
    case 'listen-toggled':
      if (state.mode === 'live') return { state: { ...state, mode: 'listening' }, effects: [{ type: 'unmute' }] };
      if (state.mode === 'listening') return { state: { ...state, mode: 'live' }, effects: [{ type: 'mute' }] };
      return { state, effects: none };
    case 'listen-timeout':
      return state.mode === 'listening' ? { state: { ...state, mode: 'live' }, effects: [{ type: 'mute' }] } : { state, effects: none };
    case 'step-changed': {
      const next: CoachState = { ...state, stepId: event.stepId, stepRevision: event.stepRevision, pendingRequestId: null };
      if (state.mode === 'listening') return { state: { ...next, mode: 'live' }, effects: [{ type: 'mute' }, { type: 'send-step-context' }] };
      if (state.mode === 'live') return { state: next, effects: [{ type: 'send-step-context' }] };
      return { state: next, effects: none };
    }
    case 'text-asked':
      return { state: { ...state, pendingRequestId: event.requestId }, effects: none };
    case 'answer-received': {
      const { answer } = event;
      if (answer.runId !== state.runId) return { state, effects: [{ type: 'drop-answer', reason: 'stale-run' }] };
      if (state.seenRequestIds.includes(answer.requestId)) return { state, effects: [{ type: 'drop-answer', reason: 'duplicate' }] };
      if (answer.requestId !== state.pendingRequestId) return { state, effects: [{ type: 'drop-answer', reason: 'unknown-request' }] };
      if (answer.stepId !== state.stepId || answer.stepRevision !== state.stepRevision) {
        return { state: { ...state, pendingRequestId: null }, effects: [{ type: 'drop-answer', reason: 'stale-step' }] };
      }
      const seenRequestIds = [...state.seenRequestIds, answer.requestId].slice(-SEEN_LIMIT);
      return { state: { ...state, pendingRequestId: null, seenRequestIds }, effects: [{ type: 'emit-answer', answer }] };
    }
  }
}
