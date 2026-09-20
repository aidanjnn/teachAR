import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CoachContext } from '@trail/contracts';
import { LiveSessionRegistry } from '../../src/ai/live-sessions.js';
import type { LiveControlChannel } from '../../src/ai/provider.js';

const context: CoachContext = {
  tutorialId: 't', tutorialRevision: 0, runId: 'run', attemptId: 'a', title: 'T',
  steps: [{ id: 's1', title: 'One', instruction: 'Do one.' }, { id: 's2', title: 'Two', instruction: 'Do two.' }], currentStepId: 's1', stepRevision: 0,
};
function control() {
  const sent: { type: string }[] = [];
  let closed = 0;
  let onClose: (() => void) | null = null;
  let onError: ((error: Error) => void) | null = null;
  const channel: LiveControlChannel = {
    ready: Promise.resolve(), send: event => { sent.push(event); }, close: () => { closed += 1; },
    onClose: handler => { onClose = handler; }, onError: handler => { onError = handler; },
  };
  return {
    channel, sent, closed: () => closed,
    dropFromServer: () => { (onClose as (() => void) | null)?.(); },
    fail: () => { (onError as ((error: Error) => void) | null)?.(new Error('boom')); },
  };
}
const update = (generation: number, currentStepId = 's2', stepRevision = 1, attemptId?: string) =>
  ({ schemaVersion: 1 as const, generation, currentStepId, stepRevision, ...(attemptId ? { attemptId } : {}) });

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); });

describe('LiveSessionRegistry', () => {
  it('pushes server-composed context for newer generations only and closes cleanly', () => {
    const registry = new LiveSessionRegistry();
    const a = control();
    registry.register('live_1', context, a.channel);
    const moved = registry.updateStep('live_1', update(2, 's2', 2, 'a2'));
    expect(moved.ok).toBe(true);
    if (moved.ok) { expect(moved.pushed).toBe(true); expect(moved.context).toMatchObject({ currentStepId: 's2', stepRevision: 2, attemptId: 'a2' }); }
    expect(a.sent[0]).toMatchObject({ type: 'session.thinking.append' });
    // Reversed arrival: the older step/attempt must not come back.
    expect(registry.updateStep('live_1', update(1, 's1', 1, 'a'))).toMatchObject({ ok: false, status: 409, body: { error: 'stale_update' } });
    const duplicate = registry.updateStep('live_1', update(2, 's2', 2, 'a2'));
    expect(duplicate).toMatchObject({ ok: true, pushed: false });
    expect(a.sent).toHaveLength(1);
    expect(registry.updateStep('live_1', update(3, 'zzz'))).toMatchObject({ ok: false, status: 400 });
    expect(registry.updateStep('missing', update(1))).toMatchObject({ ok: false, status: 404 });
    expect(registry.close('live_1')).toBe(true);
    expect(a.sent.at(-1)).toMatchObject({ type: 'session.close' });
    expect(a.closed()).toBe(1);
    expect(registry.close('live_1')).toBe(false);
  });
  it('forgets sessions the provider closed, closes ones whose channel errors, and bounds the count', () => {
    const registry = new LiveSessionRegistry({ maxSessions: 2 });
    const b = control();
    registry.register('b', context, b.channel);
    b.dropFromServer();
    expect(registry.updateStep('b', update(1))).toMatchObject({ ok: false, status: 404 });
    const e = control();
    registry.register('e', context, e.channel);
    e.fail();
    expect(e.closed()).toBe(1);
    expect(registry.size).toBe(0);
    const c = control();
    registry.register('c', context, c.channel);
    const d = control();
    registry.register('d', context, d.channel);
    const f = control();
    registry.register('f', context, f.channel);
    expect(registry.size).toBe(2);
    expect(c.closed()).toBe(1);
  });
  it('expires an idle session on its own without any further request', () => {
    const registry = new LiveSessionRegistry({ ttlMs: 1_000 });
    const g = control();
    registry.register('g', context, g.channel);
    vi.advanceTimersByTime(999);
    expect(registry.size).toBe(1);
    vi.advanceTimersByTime(2);
    expect(registry.size).toBe(0);
    expect(g.sent.at(-1)).toMatchObject({ type: 'session.close' });
    expect(g.closed()).toBe(1);
    const h = control();
    registry.register('h', context, h.channel);
    registry.closeAll();
    vi.advanceTimersByTime(5_000);
    expect(h.closed()).toBe(1);
  });

  it('greets through the control channel once and reports when no channel exists', () => {
    const registry = new LiveSessionRegistry();
    const a = control();
    registry.register('live_g', context, a.channel);
    expect(registry.greet('live_g', 'Coach ready.')).toBe(true);
    expect(a.sent.at(-1)).toMatchObject({ type: 'session.commentary.append', content: 'Coach ready.' });
    registry.register('live_n', context, null);
    expect(registry.greet('live_n', 'Coach ready.')).toBe(false);
    expect(registry.greet('missing', 'Coach ready.')).toBe(false);
    registry.closeAll();
  });
});
