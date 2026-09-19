import { describe, expect, it } from 'vitest';
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
  const channel: LiveControlChannel = { send: event => { sent.push(event); }, close: () => { closed += 1; }, onClose: handler => { onClose = handler; } };
  return { channel, sent, closed: () => closed, dropFromServer: () => { (onClose as (() => void) | null)?.(); } };
}

describe('LiveSessionRegistry', () => {
  it('pushes server-composed context on step and attempt changes and closes cleanly', () => {
    const registry = new LiveSessionRegistry();
    const a = control();
    registry.register('live_1', context, a.channel);
    const moved = registry.updateStep('live_1', { schemaVersion: 1, currentStepId: 's2', stepRevision: 1, attemptId: 'a2' });
    expect(moved.ok).toBe(true);
    if (moved.ok) expect(moved.context).toMatchObject({ currentStepId: 's2', stepRevision: 1, attemptId: 'a2' });
    expect(a.sent[0]).toMatchObject({ type: 'session.thinking.append' });
    expect(registry.updateStep('live_1', { schemaVersion: 1, currentStepId: 'zzz', stepRevision: 2 })).toMatchObject({ ok: false, status: 400 });
    expect(registry.updateStep('missing', { schemaVersion: 1, currentStepId: 's1', stepRevision: 0 })).toMatchObject({ ok: false, status: 404 });
    expect(registry.close('live_1')).toBe(true);
    expect(a.sent.at(-1)).toMatchObject({ type: 'session.close' });
    expect(a.closed()).toBe(1);
    expect(registry.close('live_1')).toBe(false);
  });
  it('works without a control channel, forgets sessions the server closed, and bounds count and age', () => {
    let now = 0;
    const registry = new LiveSessionRegistry({ now: () => now, ttlMs: 1_000, maxSessions: 2 });
    registry.register('nochannel', context, null);
    expect(registry.updateStep('nochannel', { schemaVersion: 1, currentStepId: 's2', stepRevision: 1 }).ok).toBe(true);
    const b = control();
    registry.register('b', context, b.channel);
    b.dropFromServer();
    expect(registry.updateStep('b', { schemaVersion: 1, currentStepId: 's1', stepRevision: 0 })).toMatchObject({ ok: false, status: 404 });
    const c = control();
    registry.register('c', context, c.channel);
    const d = control();
    registry.register('d', context, d.channel);
    expect(registry.size).toBe(2);
    expect(registry.updateStep('nochannel', { schemaVersion: 1, currentStepId: 's1', stepRevision: 0 })).toMatchObject({ ok: false, status: 404 });
    now = 1_001;
    expect(registry.updateStep('c', { schemaVersion: 1, currentStepId: 's1', stepRevision: 0 })).toMatchObject({ ok: false, status: 404 });
    expect(c.closed()).toBe(1);
    expect(registry.size).toBe(0);
  });
});
