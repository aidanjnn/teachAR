import { CoachContextSchema, describeStepChange, type CoachContext, type LiveStepUpdate, type InspectionResult, type VoiceUnavailable } from '@trail/contracts';
import type { LiveControlChannel } from './provider.js';

export interface LiveSessionRecord {
  sessionId: string;
  ownerSessionId: string | null;
  context: CoachContext;
  /** Highest client generation applied; older or equal updates never move the model backwards. */
  generation: number;
  createdAt: number;
  control: LiveControlChannel | null;
  expiry: ReturnType<typeof setTimeout> | null;
}
export type StepUpdateResult = { ok: true; context: CoachContext; pushed: boolean } | { ok: false; status: number; body: VoiceUnavailable };

/** Tracks open live sessions so step context is pushed by the server, never composed by the client. */
export class LiveSessionRegistry {
  private readonly sessions = new Map<string, LiveSessionRecord>();
  private counter = 0;
  constructor(private readonly options: { now?: () => number; ttlMs?: number; maxSessions?: number } = {}) {}
  private now() { return (this.options.now ?? Date.now)(); }
  private get ttl() { return this.options.ttlMs ?? 30 * 60_000; }
  get size() { return this.sessions.size; }

  register(sessionId: string, context: CoachContext, control: LiveControlChannel | null, ownerSessionId: string | null = null): void {
    const max = this.options.maxSessions ?? 8;
    while (this.sessions.size >= max) {
      const oldest = this.sessions.keys().next().value;
      if (oldest === undefined) break;
      this.close(oldest);
    }
    // Every session ends after ttlMs even if no request arrives; this runtime adapter may own a timer (the pure reducers may not).
    const expiry = setTimeout(() => { this.close(sessionId); }, this.ttl);
    expiry.unref?.();
    this.sessions.set(sessionId, { sessionId, ownerSessionId, context, generation: 0, createdAt: this.now(), control, expiry });
    control?.onClose(() => { this.forget(sessionId); });
    control?.onError(() => { this.close(sessionId); });
  }

  updateStep(sessionId: string, update: LiveStepUpdate): StepUpdateResult {
    const record = this.sessions.get(sessionId);
    if (!record) return { ok: false, status: 404, body: { error: 'unknown_session', message: 'No open live session with that ID.' } };
    if (update.generation < record.generation) {
      return { ok: false, status: 409, body: { error: 'stale_update', message: `Update generation ${update.generation} is older than the applied ${record.generation}.` } };
    }
    if (update.generation === record.generation) return { ok: true, context: record.context, pushed: false };
    if (!record.context.steps.some(step => step.id === update.currentStepId)) {
      return { ok: false, status: 400, body: { error: 'invalid_request', message: 'That step does not belong to this session’s tutorial.' } };
    }
    const context = CoachContextSchema.parse({
      ...record.context, currentStepId: update.currentStepId, stepRevision: update.stepRevision,
      ...(update.attemptId ? { attemptId: update.attemptId } : {}),
    });
    record.context = context;
    record.generation = update.generation;
    record.control?.send({ type: 'session.thinking.append', event_id: `ctx-${++this.counter}`, delegation_id: null, content: describeStepChange(context) });
    return { ok: true, context, pushed: true };
  }

  /** Called only with coordinator-owned findings; the client never submits prose to the trusted channel. */
  speakInspection(sessionId: string, generation: number, result: InspectionResult, ownerSessionId: string): boolean {
    const record = this.sessions.get(sessionId);
    const request = result.request;
    if (!record?.control || record.ownerSessionId !== ownerSessionId || record.generation !== generation || record.context.runId !== request.runId ||
        record.context.tutorialId !== request.tutorialId || record.context.tutorialRevision !== request.tutorialRevision ||
        record.context.currentStepId !== request.stepId || record.context.stepRevision !== request.stepRevision ||
        record.context.attemptId !== request.attemptId) return false;
    const content = `${result.provenance === 'mock' ? 'Synthetic mock only. ' : ''}Checked snapshot (${result.assessment.verdict}): ${result.assessment.feedback} ${result.assessment.limitation} This is advice, not step completion. Resume remains your choice.`;
    // Live append has a 500-token cap. A conservative UTF-8 byte bound cannot exceed it,
    // and refusing oversized prose preserves its complete uncertainty/limitation wording.
    if (Buffer.byteLength(content, 'utf8') > 480) return false;
    try {
      record.control.send({ type: 'session.commentary.append', event_id: `vision-${++this.counter}`, delegation_id: null, content });
      return true;
    } catch { this.close(sessionId); return false; }
  }

  /** The provider ended the session; nothing to send, just stop tracking it. */
  private forget(sessionId: string) {
    const record = this.sessions.get(sessionId);
    if (!record) return;
    if (record.expiry) clearTimeout(record.expiry);
    this.sessions.delete(sessionId);
  }

  close(sessionId: string): boolean {
    const record = this.sessions.get(sessionId);
    if (!record) return false;
    this.forget(sessionId);
    try { record.control?.send({ type: 'session.close', event_id: `close-${++this.counter}` }); } catch { /* already gone */ }
    try { record.control?.close(); } catch { /* already gone */ }
    return true;
  }

  closeAll(): void {
    for (const id of [...this.sessions.keys()]) this.close(id);
  }
}
