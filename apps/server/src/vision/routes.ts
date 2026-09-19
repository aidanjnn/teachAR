import type { FastifyInstance, FastifyRequest } from 'fastify';
import { InspectionCancelSchema } from '@trail/contracts';
import { InspectionCoordinator } from './coordinator.js';
import { InspectionError } from './inspection-client.js';

export interface InspectionRoutesOptions {
  authorizeLearner(request: FastifyRequest): { sessionId: string };
  coordinator: InspectionCoordinator;
}
export async function registerInspectionRoutes(app: FastifyInstance, options: InspectionRoutesOptions): Promise<void> {
  // Encapsulation keeps auth/error handlers restricted to this module.
  await app.register(async routes => {
    const principals = new WeakMap<FastifyRequest, string>();
    routes.addHook('onRequest', async (request, reply) => {
      reply.header('Cache-Control', 'no-store');
      principals.set(request, options.authorizeLearner(request).sessionId);
    });
    routes.setErrorHandler((error, _request, reply) => {
      const status = (error as { statusCode?: number }).statusCode;
      if (status === 401 || status === 403) { void reply.code(status).send({ error: status === 401 ? 'unauthorized' : 'forbidden' }); return; }
      const typed = error instanceof InspectionError ? error : new InspectionError('invalid-input', status === 413 ? 413 : 400);
      void reply.code(typed.status).send({ schemaVersion: 1, error: typed.code });
    });
    routes.post('/api/inspections', { bodyLimit: 16 * 1024 }, request => options.coordinator.start(principals.get(request)!, request.body));
    routes.post('/api/scene-observations', { bodyLimit: Math.ceil(2 * 1024 * 1024 / 3) * 4 + 16 * 1024 }, async request => {
      return options.coordinator.upload(principals.get(request)!, request.body);
    });
    routes.delete('/api/inspections/:requestId', async (request, reply) => {
      const query = request.query as Record<string, unknown>;
      const parsed = InspectionCancelSchema.safeParse({ requestId: (request.params as Record<string, unknown>).requestId, requestEpoch: Number(query.epoch) });
      if (!parsed.success || typeof query.epoch !== 'string' || !/^\d+$/.test(query.epoch)) throw new InspectionError('invalid-input');
      options.coordinator.cancel(principals.get(request)!, parsed.data.requestId, parsed.data.requestEpoch);
      return reply.code(204).send();
    });
    routes.addHook('preClose', async () => options.coordinator.close());
  });
}
