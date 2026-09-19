import { CoachContextSchema, describeStepChange, type CoachContext, type LiveStepUpdate, type VoiceUnavailable } from '@trail/contracts';
import type { LiveControlChannel } from './provider.js';

export interface LiveSessionRecord {
  sessionId: string;
  context: CoachContext;
  createdAt: number;
  control: LiveControlChannel | null;
}
export type StepUpdateResult = { ok: true; context: CoachContext } | { ok: false; status: number; body: VoiceUnavailable };

/** Tracks open live sessions so step context is pushed by the server, never composed by the client. */
export class LiveSessionRegistry {
  private readonly sessions = new Map<string, LiveSessionRecord>();
  private counter = 0;
  constructor(private readonly options: { now?: () => number; ttlMs?: number; maxSessions?: number } = {}) {}
  private now() { return (this.options.now ?? Date.now)(); }
  private prune() {
    const ttl = this.options.ttlMs ?? 30 * 60_000;
    for (const [id, record] of this.sessions) if (record.createdAt + ttl <= this.now()) this.close(id);
  }
  get size() { return this.sessions.size; }

  register(sessionId: string, context: CoachContext, control: LiveControlChannel | null): void {
    this.prune();
    const max = this.options.maxSessions ?? 8;
    while (this.sessions.size >= max) {
      const oldest = this.sessions.keys().next().value;
      if (oldest === undefined) break;
      this.close(oldest);
    }
    this.sessions.set(sessionId, { sessionId, context, createdAt: this.now(), control });
    control?.onClose(() => { this.sessions.delete(sessionId); });
  }

  updateStep(sessionId: string, update: LiveStepUpdate): StepUpdateResult {
    this.prune();
    const record = this.sessions.get(sessionId);
    if (!record) return { ok: false, status: 404, body: { error: 'unknown_session', message: 'No open live session with that ID.' } };
    if (!record.context.steps.some(step => step.id === update.currentStepId)) {
      return { ok: false, status: 400, body: { error: 'invalid_request', message: 'That step does not belong to this session’s tutorial.' } };
    }
    const context = CoachContextSchema.parse({
      ...record.context, currentStepId: update.currentStepId, stepRevision: update.stepRevision,
      ...(update.attemptId ? { attemptId: update.attemptId } : {}),
    });
    record.context = context;
    record.control?.send({ type: 'session.thinking.append', event_id: `ctx-${++this.counter}`, delegation_id: null, content: describeStepChange(context) });
    return { ok: true, context };
  }

  close(sessionId: string): boolean {
    const record = this.sessions.get(sessionId);
    if (!record) return false;
    this.sessions.delete(sessionId);
    try { record.control?.send({ type: 'session.close', event_id: `close-${++this.counter}` }); } catch { /* already gone */ }
    try { record.control?.close(); } catch { /* already gone */ }
    return true;
  }

  closeAll(): void {
    for (const id of [...this.sessions.keys()]) this.close(id);
  }
}
