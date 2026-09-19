import Fastify, { LogController } from 'fastify';
import { timingSafeEqual } from 'node:crypto';
import { VisionHealthSchema, VisionReadinessSchema, InspectionCancelSchema } from '@trail/contracts';
import type { VisionConfig } from './config.js';
import { MAX_BODY_BYTES } from './images.js';
import { InspectionJobs } from './jobs.js';
import { createOpenAIProvider, type VisionProvider } from './provider.js';
import { failure, VisionError } from './errors.js';

export function createVisionApp(config: VisionConfig, options: { logger?: boolean; provider?: VisionProvider } = {}) {
  const app = Fastify({ logger: options.logger ?? false,
    logController: new LogController({ disableRequestLogging: true }),
    bodyLimit: MAX_BODY_BYTES, requestTimeout: 10_000, connectionTimeout: 10_000,
  });
  const provider = options.provider ?? (config.provider === 'openai' && config.apiKey && config.model
    ? createOpenAIProvider(config.apiKey, config.model) : null);
  const jobs = new InspectionJobs(provider);
  let uploads = 0;
  const admitted = new WeakSet<object>();
  const expected = Buffer.from(`Bearer ${config.serviceToken}`);
  app.addHook('onRequest', async (request, reply) => {
    reply.header('Cache-Control', 'no-store');
    const received = Buffer.from(request.headers.authorization ?? '');
    if (received.length !== expected.length || !timingSafeEqual(received, expected)) return reply.code(401).send({ error: 'unauthorized' });
    if (request.method === 'POST' && request.url === '/internal/v1/inspections') {
      if (!provider) return reply.code(503).send({ schemaVersion: 1, error: 'provider-unavailable' });
      if (uploads >= 4) return reply.code(429).send({ schemaVersion: 1, error: 'busy' });
      uploads++; admitted.add(request);
      request.raw.once('aborted', () => { if (admitted.delete(request)) uploads--; });
    }
  });
  app.addHook('onResponse', async request => { if (admitted.delete(request)) uploads--; });
  app.setErrorHandler((error, _request, reply) => {
    const err = error instanceof VisionError ? error : (error as { statusCode?: number }).statusCode === 413
      ? new VisionError('invalid-input', 413) : (error as { statusCode?: number }).statusCode === 400
        ? new VisionError('invalid-input') : failure(error);
    void reply.code(err.status).send({ schemaVersion: 1, error: err.code });
  });
  app.get('/internal/v1/health', async () => VisionHealthSchema.parse({
    schemaVersion: 1, service: 'vision', status: 'ok', buildId: config.buildId,
    provider: provider?.name ?? config.provider, capabilities: { imageInterpretation: provider?.name === 'openai' },
  }));
  app.get('/internal/v1/ready', async (_request, reply) => {
    const ready = jobs.ready;
    return reply.code(ready ? 200 : 503).send(VisionReadinessSchema.parse({
      schemaVersion: 1, service: 'vision', ready,
      reason: ready ? 'ready' : jobs.configured ? 'busy' : config.provider === 'mock' ? 'mock-provider' : 'provider-unconfigured',
    }));
  });
  app.post('/internal/v1/inspections', async request => jobs.inspect(request.body));
  app.delete('/internal/v1/inspections/:requestId', async (request, reply) => {
    const params = request.params as Record<string, unknown>;
    const query = request.query as Record<string, unknown>;
    const parsed = InspectionCancelSchema.safeParse({ requestId: params.requestId, requestEpoch: Number(query.epoch) });
    if (!parsed.success || typeof query.epoch !== 'string' || !/^\d+$/.test(query.epoch)) throw new VisionError('invalid-input');
    jobs.cancel(parsed.data.requestId, parsed.data.requestEpoch);
    return reply.code(204).send();
  });
  app.addHook('preClose', async () => { jobs.close(); });
  return app;
}
