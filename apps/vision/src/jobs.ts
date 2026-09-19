import { createHash } from 'node:crypto';
import { VisionInspectionInputSchema, VisionInspectionResultSchema, type VisionInspectionInput, type VisionInspectionResult } from '@trail/contracts';
import { abortable, VisionError } from './errors.js';
import { validateImage } from './images.js';
import { validateAssessment, type VisionProvider } from './provider.js';

interface Job {
  hash: string; expires: number; epoch: number; controller: AbortController;
  promise: Promise<VisionInspectionResult>; active: boolean; waiters: number;
}
/** One job, no queue; bounded tombstones prevent active duplicate provider calls and replay. */
export class InspectionJobs {
  private readonly jobs = new Map<string, Job>();
  private running = false;
  constructor(private readonly provider: VisionProvider | null, private readonly now = () => performance.now()) {}
  get ready(): boolean { return this.provider !== null && !this.running; }
  get configured(): boolean { return this.provider !== null; }

  async inspect(raw: unknown): Promise<VisionInspectionResult> {
    const parsed = VisionInspectionInputSchema.safeParse(raw);
    if (!parsed.success) throw new VisionError('invalid-input');
    const input = parsed.data;
    this.prune();
    const hash = createHash('sha256').update(JSON.stringify(input)).digest('hex');
    const existing = this.jobs.get(input.request.requestId);
    if (existing) {
      if (existing.hash !== hash || existing.epoch !== input.request.requestEpoch || !existing.active) throw new VisionError('conflict', 409);
      if (existing.waiters >= 4) throw new VisionError('busy', 429);
      existing.waiters++;
      try { return await existing.promise; } finally { existing.waiters--; }
    }
    if (!this.provider) throw new VisionError('provider-unavailable', 503);
    if (this.running || this.jobs.size >= 64) throw new VisionError('busy', 429);
    const start = this.now();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(new VisionError('deadline', 504)), input.remainingBudgetMs);
    const job: Job = { hash, epoch: input.request.requestEpoch, expires: start + 30_000, controller,
      active: true, waiters: 1, promise: Promise.resolve(null as unknown as VisionInspectionResult) };
    this.running = true;
    this.jobs.set(input.request.requestId, job);
    const work = this.execute(input, controller.signal, start).finally(() => { this.running = false; });
    job.promise = abortable(work, controller.signal).finally(() => {
      clearTimeout(timeout); job.active = false;
    });
    return job.promise;
  }

  cancel(requestId: string, epoch: number): void {
    this.prune();
    const job = this.jobs.get(requestId);
    if (!job || job.epoch !== epoch) throw new VisionError('conflict', 409);
    job.controller.abort(new VisionError('cancelled', 409));
  }
  close(): void { for (const job of this.jobs.values()) job.controller.abort(new VisionError('cancelled', 409)); }
  private prune(): void { for (const [id, job] of this.jobs) if (!job.active && job.expires <= this.now()) this.jobs.delete(id); }
  private async execute(input: VisionInspectionInput, signal: AbortSignal, start: number): Promise<VisionInspectionResult> {
    const currentImage = await validateImage(input.currentImage, signal);
    const references: VisionInspectionInput['references'] = [];
    for (const entry of input.references) references.push({ reference: entry.reference, image: await validateImage(entry.image, signal) });
    signal.throwIfAborted();
    const assessment = validateAssessment(await this.provider!.assess({ ...input, currentImage, references }, signal));
    signal.throwIfAborted();
    const serviceDurationMs = this.now() - start;
    if (serviceDurationMs >= input.remainingBudgetMs) throw new VisionError('deadline', 504);
    return VisionInspectionResultSchema.parse({ schemaVersion: 1, requestId: input.request.requestId,
      requestEpoch: input.request.requestEpoch, observationId: input.observation.id,
      referenceIds: input.request.referenceIds, assessment,
      provider: this.provider!.name, model: this.provider!.model, serviceDurationMs });
  }
}
