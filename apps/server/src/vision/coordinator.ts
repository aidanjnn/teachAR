import { randomUUID, createHash } from 'node:crypto';
import {
  InspectionStartSchema, InspectionUploadSchema, InspectionCaptureSchema, InspectionResultSchema,
  VisionInspectionInputSchema, type GuideContextRef, type InspectionCapture, type InspectionResult,
  type InspectionStart, type VisionInspectionInput,
} from '@trail/contracts';
import type { VisionConnection } from './client.js';
import { InspectionError, inspectVision } from './inspection-client.js';

export interface ReviewedInspectionReferences {
  references: VisionInspectionInput['references']; approvedStep: VisionInspectionInput['approvedStep'];
}
export interface InspectionDependencies {
  vision: VisionConnection | null;
  resolveReferences(context: GuideContextRef): Promise<ReviewedInspectionReferences>;
  /** Must require exact identity + locally paused, calibrated native guide state. */
  isCurrent(sessionId: string, context: GuideContextRef): boolean;
  now?: () => number;
  inspect?: typeof inspectVision;
}
interface Active {
  sessionId: string; start: InspectionStart; capture: InspectionCapture; started: number; nonceIssued: number;
  controller: AbortController; timer: ReturnType<typeof setTimeout>;
  references: ReviewedInspectionReferences | null; uploadHash: string | null; promise: Promise<InspectionResult> | null;
}
/**
 * Retired live-session identities for the current paired session, kept in a fixed-size Bloom filter:
 * a retired identity is never forgotten (no false negatives), memory is constant, and the rare false
 * positive only rejects a fresh identity as stale. Other paired sessions never pass `isCurrent`, so
 * their history is dropped when the paired session changes.
 */
class RetiredLiveSessions {
  private static readonly BITS = 1 << 17;
  private static readonly HASHES = 4;
  private sessionId: string | null = null;
  private readonly bits = new Uint8Array(RetiredLiveSessions.BITS / 8);
  has(sessionId: string, liveSessionId: string): boolean {
    return this.sessionId === sessionId && RetiredLiveSessions.indices(liveSessionId).every(i => (this.bits[i >> 3]! & (1 << (i & 7))) !== 0);
  }
  add(sessionId: string, liveSessionId: string): void {
    if (this.sessionId !== sessionId) { this.bits.fill(0); this.sessionId = sessionId; }
    for (const i of RetiredLiveSessions.indices(liveSessionId)) this.bits[i >> 3]! |= 1 << (i & 7);
  }
  private static indices(liveSessionId: string): number[] {
    const digest = createHash('sha256').update(liveSessionId).digest();
    return Array.from({ length: RetiredLiveSessions.HASHES }, (_, k) => digest.readUInt32BE(k * 4) % RetiredLiveSessions.BITS);
  }
}
/** A one-headset coordinator. It can pause-check identity, never mutate guide progression. */
export class InspectionCoordinator {
  private active: Active | null = null;
  private resolving = false;
  private readonly retiredLiveSessions = new RetiredLiveSessions();
  private source: { sessionId: string; id: string; sequence: number } | null = null;
  private readonly now: () => number;
  private epoch: { sessionId: string; liveSessionId: string; generation: number; epoch: number } | null = null;
  constructor(private readonly deps: InspectionDependencies) { this.now = deps.now ?? (() => performance.now()); }

  async start(sessionId: string, raw: unknown): Promise<InspectionCapture> {
    const parsed = InspectionStartSchema.safeParse(raw);
    if (!parsed.success) throw new InspectionError('invalid-input');
    if (this.resolving) throw new InspectionError('busy', 429);
    const input = parsed.data;
    if (!this.deps.isCurrent(sessionId, input.context)) throw new InspectionError('stale', 409);
    if (!this.deps.vision && !this.deps.inspect) throw new InspectionError('provider-unavailable', 503);
    if (this.active && this.active.sessionId !== sessionId) throw new InspectionError('busy', 429);
    const prior = this.epoch;
    if (this.retiredLiveSessions.has(sessionId, input.liveSessionId)) throw new InspectionError('stale', 409);
    if (prior?.sessionId === sessionId && input.liveSessionId === prior.liveSessionId &&
        (input.sessionGeneration < prior.generation || (input.sessionGeneration === prior.generation && input.requestEpoch <= prior.epoch))) {
      throw new InspectionError('stale', 409);
    }
    if (prior?.sessionId === sessionId && prior.liveSessionId !== input.liveSessionId) this.retiredLiveSessions.add(sessionId, prior.liveSessionId);
    this.invalidate(sessionId);
    this.epoch = { sessionId, liveSessionId: input.liveSessionId, generation: input.sessionGeneration, epoch: input.requestEpoch };
    const started = this.now();
    const controller = new AbortController();
    const capture: InspectionCapture = {
      schemaVersion: 1, request: { ...input.context, requestId: randomUUID(), liveSessionId: input.liveSessionId,
        sessionGeneration: input.sessionGeneration, requestEpoch: input.requestEpoch, delegationId: null,
        question: input.question, referenceIds: [] },
      captureNonce: randomUUID(), sourceSessionId: input.sourceSessionId, minSourceFrameSeq: Math.max(input.sourceFrameSeq, this.source?.sessionId === sessionId && this.source.id === input.sourceSessionId ? this.source.sequence : 0),
      uploadWithinMs: 2000, totalBudgetMs: 8000,
    };
    const active: Active = { sessionId, start: input, capture, started, nonceIssued: started, controller,
      timer: setTimeout(() => this.expire(active), 8000), references: null, uploadHash: null, promise: null };
    this.active = active;
    try {
      // Resolve only immutable, reviewed references from storage. It cannot fetch arbitrary user URLs.
      this.resolving = true;
      const work = Promise.resolve().then(() => this.deps.resolveReferences(input.context)).finally(() => { this.resolving = false; });
      const references = await this.withAbort(work, controller.signal);
      this.assertCurrent(active);
      active.references = references;
      capture.request.referenceIds = references.references.map(entry => entry.reference.id);
      if (!references.references.length || references.references.length > 2) throw new InspectionError('provider-unavailable', 503);
      active.nonceIssued = this.now();
      capture.totalBudgetMs = Math.max(1, Math.floor(8000 - (active.nonceIssued - started)));
      capture.uploadWithinMs = Math.min(2000, capture.totalBudgetMs);
      return InspectionCaptureSchema.parse(capture);
    } catch (error) {
      this.finish(active);
      throw error instanceof InspectionError ? error : new InspectionError('provider-unavailable', 503);
    }
  }

  async upload(sessionId: string, raw: unknown): Promise<InspectionResult> {
    const parsed = InspectionUploadSchema.safeParse(raw);
    if (!parsed.success) throw new InspectionError('invalid-input');
    const upload = parsed.data;
    const active = this.active;
    if (!active || active.sessionId !== sessionId || active.capture.request.requestId !== upload.requestId ||
        active.capture.request.requestEpoch !== upload.requestEpoch) throw new InspectionError('stale', 409);
    this.assertCurrent(active);
    const hash = createHash('sha256').update(JSON.stringify(upload)).digest('hex');
    if (active.uploadHash) {
      // Retry is safe only during the same active job; completed verdicts are never replayed.
      if (active.uploadHash !== hash || !active.promise) throw new InspectionError('conflict', 409);
      throw new InspectionError('busy', 429); // no unbounded HTTP waiters
    }
    if (upload.captureNonce !== active.capture.captureNonce || upload.sourceSessionId !== active.start.sourceSessionId ||
        upload.source !== active.start.source || upload.sourceFrameSeq <= active.capture.minSourceFrameSeq ||
        this.now() - active.nonceIssued > active.capture.uploadWithinMs) throw new InspectionError('stale', 409);
    const bytes = Buffer.from(upload.image.dataBase64, 'base64');
    const valid = bytes.length > 0 && bytes.length <= 2 * 1024 * 1024 && bytes.toString('base64') === upload.image.dataBase64 &&
      createHash('sha256').update(bytes).digest('hex') === upload.image.sha256;
    bytes.fill(0);
    if (!valid) throw new InspectionError('invalid-image');
    if (!active.references) throw new InspectionError('busy', 429);
    active.uploadHash = hash;
    this.source = { sessionId, id: upload.sourceSessionId, sequence: upload.sourceFrameSeq };
    if (this.now() - active.nonceIssued >= 5000) { this.finish(active); throw new InspectionError('stale', 409); }
    const now = this.now();
    const input = VisionInspectionInputSchema.safeParse({ schemaVersion: 1, request: active.capture.request,
      observation: { id: randomUUID(), requestId: upload.requestId, captureNonce: upload.captureNonce,
        sourceSessionId: upload.sourceSessionId, source: upload.source, assetId: randomUUID(),
        sourceFrameSeq: upload.sourceFrameSeq, captureAgeAtSendMs: upload.captureAgeAtSendMs, receivedAtServerMonoMs: now },
      currentImage: upload.image, ...active.references, movementSummary: 'The guide is paused for this inspection. Movement evidence is not physical verification.',
      remainingBudgetMs: Math.max(1, Math.floor(Math.min(8000 - (now - active.started), 5000 - (now - active.nonceIssued)))),
    });
    if (!input.success) { this.finish(active); throw new InspectionError('invalid-input'); }
    // Dispatch bound uses original nonce issue time, never a device/service wall clock.
    const ageTimer = setTimeout(() => active.controller.abort(new InspectionError('stale', 409)), input.data.remainingBudgetMs);
    active.promise = this.withAbort((this.deps.inspect ?? inspectVision)(this.deps.vision, input.data, active.controller.signal), active.controller.signal)
      .then(result => {
        this.assertCurrent(active);
        if (this.now() - active.nonceIssued > 5000 || result.requestId !== input.data.request.requestId ||
            result.requestEpoch !== input.data.request.requestEpoch || result.observationId !== input.data.observation.id ||
            JSON.stringify(result.referenceIds) !== JSON.stringify(input.data.request.referenceIds)) throw new InspectionError('stale', 409);
        return InspectionResultSchema.parse({ request: active.capture.request, observationId: result.observationId,
          referenceIds: result.referenceIds, assessment: result.assessment, provenance: result.provider === 'openai' ? 'model' : 'mock' });
      }).finally(() => { clearTimeout(ageTimer); this.finish(active); });
    return active.promise;
  }
  cancel(sessionId: string, requestId: string, epoch: number): void {
    const active = this.active;
    if (!active || active.sessionId !== sessionId || active.capture.request.requestId !== requestId || active.capture.request.requestEpoch !== epoch) {
      throw new InspectionError('stale', 409);
    }
    this.invalidate(sessionId);
  }
  invalidate(sessionId: string): void {
    const active = this.active;
    if (active?.sessionId === sessionId) {
      active.controller.abort(new InspectionError('cancelled', 409)); this.finish(active);
    }
  }
  /** Call on guide updates and session/connection loss. Paused-state validation is also repeated at dispatch. */
  guideChanged(sessionId: string): void {
    if (this.active?.sessionId === sessionId && !this.deps.isCurrent(sessionId, this.active.start.context)) this.invalidate(sessionId);
  }
  close(): void { if (this.active) this.invalidate(this.active.sessionId); }
  private expire(active: Active): void {
    active.controller.abort(new InspectionError('deadline', 504)); this.finish(active);
  }
  private assertCurrent(active: Active): void {
    if (active.controller.signal.aborted) throw active.controller.signal.reason;
    if (this.active !== active || !this.deps.isCurrent(active.sessionId, active.start.context)) throw new InspectionError('stale', 409);
    if (this.now() - active.started >= 8000) throw new InspectionError('deadline', 504);
  }
  private finish(active: Active): void {
    clearTimeout(active.timer); active.references = null;
    if (this.active === active) this.active = null;
  }
  private async withAbort<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
    let abort: () => void = () => undefined;
    try {
      return await Promise.race([promise, new Promise<never>((_resolve, reject) => {
        abort = () => reject(signal.reason); signal.addEventListener('abort', abort, { once: true }); if (signal.aborted) abort();
      })]);
    } finally { signal.removeEventListener('abort', abort); }
  }
}
