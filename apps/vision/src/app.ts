import Fastify, { LogController } from 'fastify';
import { timingSafeEqual } from 'node:crypto';
import { VisionHealthSchema, VisionReadinessSchema, VisionUnavailableSchema } from '@trail/contracts';
import type { VisionConfig } from './config.js';

export function createVisionApp(config: VisionConfig, options: { logger?: boolean } = {}) {
  const app = Fastify({
    logger: options.logger ?? false,
    logController: new LogController({ disableRequestLogging: true }),
    bodyLimit: 64 * 1024, requestTimeout: 10_000,
  });
  const expected = Buffer.from(`Bearer ${config.serviceToken}`);
  app.addHook('onRequest', async (request, reply) => {
    reply.header('Cache-Control', 'no-store');
    const received = Buffer.from(request.headers.authorization ?? '');
    if (received.length !== expected.length || !timingSafeEqual(received, expected)) {
      return reply.code(401).send({ error: 'unauthorized' });
    }
  });
  app.get('/internal/v1/health', async () => VisionHealthSchema.parse({
    schemaVersion: 1, service: 'vision', status: 'ok', buildId: config.buildId,
    provider: config.provider, capabilities: { imageInterpretation: false },
  }));
  app.get('/internal/v1/ready', async (_request, reply) => {
    return reply.code(503).send(VisionReadinessSchema.parse({
      schemaVersion: 1, service: 'vision', ready: false, reason: 'not-implemented',
    }));
  });
  // Refuse at onRequest, before parsing/storing images. No fabricated mock verdicts.
  app.route({
    method: 'POST', url: '/internal/v1/inspections',
    onRequest: async (_request, reply) => {
      return reply.code(501).send(VisionUnavailableSchema.parse({
        schemaVersion: 1, error: 'vision-not-implemented',
      }));
    },
    handler: async () => undefined,
  });
  return app;
}
