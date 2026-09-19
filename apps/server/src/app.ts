import { probeVision } from './vision/client.js';
import Fastify, { LogController } from 'fastify';
import fastifyStatic from '@fastify/static';
import { HealthSchema } from '@trail/contracts';
import { randomUUID } from 'node:crypto';
import { mkdir, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { ServerConfig } from './config.js';

async function storageWritable(dataDir: string): Promise<boolean> {
  const probe = join(dataDir, `.health-${randomUUID()}`);
  try {
    await mkdir(dataDir, { recursive: true });
    await writeFile(probe, '', { flag: 'wx', mode: 0o600 });
    return true;
  } catch {
    return false;
  } finally {
    await unlink(probe).catch(() => undefined);
  }
}

export async function createApp(config: ServerConfig, options: { webRoot?: string; logger?: boolean } = {}) {
  const app = Fastify({
    logger: options.logger ?? false,
    logController: new LogController({ disableRequestLogging: true }),
    bodyLimit: 64 * 1024, requestTimeout: 10_000,
  });
  app.get('/api/health', async (_request, reply) => {
    const writable = await storageWritable(config.dataDir);
    reply.code(writable ? 200 : 503).header('Cache-Control', 'no-store');
    return HealthSchema.parse({
      status: writable ? 'ok' : 'degraded', buildId: config.buildId,
      providers: config.providers, storage: { writable },
    });
  });
  app.get('/api/dependencies/vision', async (_request, reply) => {
    reply.header('Cache-Control', 'no-store');
    return probeVision(config.vision);
  });
  if (options.webRoot) {
    await app.register(fastifyStatic, { root: options.webRoot, dotfiles: 'deny' });
  }
  return app;
}
