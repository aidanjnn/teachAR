import { randomUUID } from 'node:crypto';
import { mkdir, readdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { z } from 'zod';
import { CoachGuidePublishSchema, CoachGuideSchema, type CoachGuide } from '@trail/contracts';
import { StoreError } from './files.js';

/** The shape `routes/voice.ts` grounds on; kept structural so storage does not import route code. */
export interface CoachGuideSource {
  id: string;
  revision: number;
  status: 'ready';
  title: string;
  layoutNotes?: string;
  steps: readonly { id: string; title: string; instruction: string }[];
}

/**
 * Published step text for tutorials that live only in a browser. A guide is always ready: publishing is the
 * expert's review act. Files are small JSON documents written atomically; everything is held in memory after recovery.
 */
export class CoachGuideStore {
  private readonly dir: string;
  private readonly guides = new Map<string, CoachGuide>();
  private readonly bySource = new Map<string, string>();
  private queue: Promise<unknown> = Promise.resolve();
  constructor(dataDir: string, private readonly now: () => Date = () => new Date()) { this.dir = join(dataDir, 'coach-guides'); }

  async recover(): Promise<void> {
    await mkdir(this.dir, { recursive: true });
    for (const name of await readdir(this.dir)) {
      if (!name.endsWith('.json')) { if (name.endsWith('.tmp')) await unlink(join(this.dir, name)).catch(() => undefined); continue; }
      try {
        const guide = CoachGuideSchema.parse(JSON.parse(await readFile(join(this.dir, name), 'utf8')));
        if (`${guide.id}.json` !== name) continue;
        this.remember(guide);
      } catch { /* an unreadable guide is skipped; the author republishes */ }
    }
  }

  async publish(input: unknown): Promise<{ id: string; revision: number }> {
    const parsed = CoachGuidePublishSchema.safeParse(input);
    if (!parsed.success) throw new StoreError(400, 'Invalid coach guide');
    const body = parsed.data;
    const run = this.queue.then(async () => {
      const existingId = this.bySource.get(body.sourceId);
      const existing = existingId ? this.guides.get(existingId) : undefined;
      const guide = CoachGuideSchema.parse({
        schemaVersion: 1, id: existing?.id ?? randomUUID(), sourceId: body.sourceId, revision: (existing?.revision ?? 0) + 1,
        publishedAt: this.now().toISOString(), title: body.title, ...(body.layoutNotes !== undefined ? { layoutNotes: body.layoutNotes } : {}), steps: body.steps,
      });
      await mkdir(this.dir, { recursive: true });
      const target = join(this.dir, `${guide.id}.json`);
      const temporary = `${target}.${randomUUID()}.tmp`;
      try {
        await writeFile(temporary, JSON.stringify(guide), { mode: 0o600, flag: 'wx' });
        await rename(temporary, target);
      } catch (error) {
        await unlink(temporary).catch(() => undefined);
        throw new StoreError(503, `Coach guide could not be stored: ${(error as Error).message}`);
      }
      this.remember(guide);
      return { id: guide.id, revision: guide.revision };
    });
    this.queue = run.catch(() => undefined);
    return run;
  }

  async get(id: string): Promise<CoachGuide | null> {
    if (!z.uuid().safeParse(id).success) return null;
    return this.guides.get(id) ?? null;
  }

  asCoachSource(guide: CoachGuide): CoachGuideSource {
    return {
      id: guide.id, revision: guide.revision, status: 'ready', title: guide.title,
      ...(guide.layoutNotes !== undefined ? { layoutNotes: guide.layoutNotes } : {}),
      steps: guide.steps.map(step => ({ id: step.id, title: step.title, instruction: step.instruction })),
    };
  }

  private remember(guide: CoachGuide) {
    this.guides.set(guide.id, guide);
    this.bySource.set(guide.sourceId, guide.id);
  }
}
