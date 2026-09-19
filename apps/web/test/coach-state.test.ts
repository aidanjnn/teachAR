import { describe, expect, it } from 'vitest';
import type { CoachAnswer } from '@trail/contracts';
import { initialCoachState, reduceCoach, type CoachEvent, type CoachState } from '../src/guide/coach-state.js';

const start = initialCoachState({ runId: 'run-1', tutorialId: 't', tutorialRevision: 0, attemptId: 'a', stepId: 's1', stepRevision: 0 });
function run(state: CoachState, ...events: CoachEvent[]) {
  return events.reduce<{ state: CoachState; effects: ReturnType<typeof reduceCoach>['effects'] }>(
    (acc, event) => { const next = reduceCoach(acc.state, event); return { state: next.state, effects: [...acc.effects, ...next.effects] }; },
    { state, effects: [] },
  );
}
function answer(overrides: Partial<CoachAnswer> = {}): CoachAnswer {
  return {
    schemaVersion: 1, requestId: 'req-1', runId: 'run-1', tutorialId: 't', tutorialRevision: 0, stepId: 's1', stepRevision: 0,
    attemptId: 'a', answer: 'Slide it.', grounded: true, source: 'fallback', model: null, ...overrides,
  };
}

describe('coach modes', () => {
  it('mutes as soon as the live session is ready and toggles listening', () => {
    const ready = run(start, { type: 'connect-started' }, { type: 'live-ready' });
    expect(ready.state.mode).toBe('live');
    expect(ready.effects).toEqual([{ type: 'mute' }]);
    const listening = reduceCoach(ready.state, { type: 'listen-toggled' });
    expect(listening.state.mode).toBe('listening');
    expect(listening.effects).toEqual([{ type: 'unmute' }]);
    const back = reduceCoach(listening.state, { type: 'listen-timeout' });
    expect(back.state.mode).toBe('live');
    expect(back.effects).toEqual([{ type: 'mute' }]);
  });
  it('falls back to text when live fails or closes, and ignores listen requests there', () => {
    expect(run(start, { type: 'connect-started' }, { type: 'live-failed' }).state.mode).toBe('text');
    const closed = run(start, { type: 'connect-started' }, { type: 'live-ready' }, { type: 'live-closed' });
    expect(closed.state).toMatchObject({ mode: 'text', liveClosed: true });
    expect(reduceCoach(closed.state, { type: 'listen-toggled' }).effects).toEqual([]);
    const lateStart = reduceCoach(closed.state, { type: 'live-ready' });
    expect(lateStart.state.mode).toBe('text');
    expect(lateStart.effects).toEqual([]);
  });
  it('pushes step context while live and stops listening on a step change', () => {
    const live = run(start, { type: 'connect-started' }, { type: 'live-ready' }).state;
    expect(reduceCoach(live, { type: 'step-changed', stepId: 's2', stepRevision: 1 }).effects).toEqual([{ type: 'send-step-context' }]);
    const listening = reduceCoach(live, { type: 'listen-toggled' }).state;
    const changed = reduceCoach(listening, { type: 'step-changed', stepId: 's2', stepRevision: 1 });
    expect(changed.state).toMatchObject({ mode: 'live', stepId: 's2', stepRevision: 1, pendingRequestId: null });
    expect(changed.effects).toEqual([{ type: 'mute' }, { type: 'send-step-context' }]);
    expect(reduceCoach({ ...start, mode: 'text' }, { type: 'step-changed', stepId: 's2', stepRevision: 1 }).effects).toEqual([]);
  });
});

describe('live lifecycle and context resync', () => {
  it('releases the microphone whenever a live session fails or closes', () => {
    expect(run(start, { type: 'connect-started' }, { type: 'live-failed' }).effects).toEqual([{ type: 'release-live' }]);
    expect(run(start, { type: 'connect-started' }, { type: 'live-ready' }, { type: 'live-closed' }).effects.at(-1)).toEqual({ type: 'release-live' });
  });
  it('resyncs step context on ready when the step changed while connecting', () => {
    const during = run(start, { type: 'connect-started' }, { type: 'step-changed', stepId: 's2', stepRevision: 1 });
    expect(during.effects).toEqual([]);
    expect(during.state.contextDirty).toBe(true);
    const ready = reduceCoach(during.state, { type: 'live-ready' });
    expect(ready.effects).toEqual([{ type: 'mute' }, { type: 'send-step-context' }]);
    expect(ready.state).toMatchObject({ mode: 'live', stepId: 's2', contextDirty: false });
  });
  it('treats a new attempt like a step change and drops answers from the old attempt or tutorial revision', () => {
    const asked = reduceCoach({ ...start, mode: 'text' }, { type: 'text-asked', requestId: 'req-1' }).state;
    const repeated = reduceCoach(asked, { type: 'attempt-changed', attemptId: 'a2' });
    expect(repeated.state).toMatchObject({ attemptId: 'a2', pendingRequestId: null });
    const askedAgain = reduceCoach(repeated.state, { type: 'text-asked', requestId: 'req-2' }).state;
    expect(reduceCoach(askedAgain, { type: 'answer-received', answer: answer({ requestId: 'req-2', attemptId: 'a' }) }).effects).toEqual([{ type: 'drop-answer', reason: 'stale-attempt' }]);
    expect(reduceCoach(askedAgain, { type: 'answer-received', answer: answer({ requestId: 'req-2', tutorialRevision: 1 }) }).effects).toEqual([{ type: 'drop-answer', reason: 'stale-tutorial' }]);
    expect(reduceCoach(askedAgain, { type: 'answer-received', answer: answer({ requestId: 'req-2', attemptId: 'a2' }) }).effects[0]?.type).toBe('emit-answer');
    const live = run(start, { type: 'connect-started' }, { type: 'live-ready' }).state;
    expect(reduceCoach(live, { type: 'attempt-changed', attemptId: 'a3' }).effects).toEqual([{ type: 'send-step-context' }]);
  });
});

describe('stale reply protection', () => {
  const asked = reduceCoach({ ...start, mode: 'text' }, { type: 'text-asked', requestId: 'req-1' }).state;
  it('emits the matching answer exactly once', () => {
    const first = reduceCoach(asked, { type: 'answer-received', answer: answer() });
    expect(first.effects).toEqual([{ type: 'emit-answer', answer: answer() }]);
    expect(first.state.pendingRequestId).toBeNull();
    const again = reduceCoach(first.state, { type: 'answer-received', answer: answer() });
    expect(again.effects).toEqual([{ type: 'drop-answer', reason: 'duplicate' }]);
  });
  it('drops answers for another run, an unknown request, or a superseded step', () => {
    expect(reduceCoach(asked, { type: 'answer-received', answer: answer({ runId: 'run-2' }) }).effects).toEqual([{ type: 'drop-answer', reason: 'stale-run' }]);
    expect(reduceCoach(asked, { type: 'answer-received', answer: answer({ requestId: 'req-9' }) }).effects).toEqual([{ type: 'drop-answer', reason: 'unknown-request' }]);
    const moved = reduceCoach(asked, { type: 'step-changed', stepId: 's2', stepRevision: 1 }).state;
    expect(reduceCoach(moved, { type: 'answer-received', answer: answer() }).effects).toEqual([{ type: 'drop-answer', reason: 'unknown-request' }]);
    const repeated = reduceCoach({ ...asked, stepRevision: 1 }, { type: 'answer-received', answer: answer({ stepRevision: 0 }) });
    expect(repeated.effects).toEqual([{ type: 'drop-answer', reason: 'stale-step' }]);
    expect(repeated.state.pendingRequestId).toBeNull();
  });
});
