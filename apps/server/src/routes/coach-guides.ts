import type { FastifyInstance, FastifyReply } from 'fastify';
import { z } from 'zod';
import type { PairingAuthority } from '../auth/pairing.js';
import type { CoachGuideStore } from '../storage/coach-guides.js';

const GuideIdParam = z.object({ id: z.uuid() });
const MAX_PUBLISH_BYTES = 64 * 1024;

function fail(reply: FastifyReply, status: number, error: string, message: string) {
  return reply.code(status).header('Cache-Control', 'no-store').send({ error, message });
}

/** Authors publish reviewed step text; learners and authors read it back. Same fixed-text error bodies as the voice routes. */
export async function registerCoachGuideRoutes(app: FastifyInstance, store: CoachGuideStore, auth: PairingAuthority): Promise<void> {
  await app.register(async scope => {
    scope.addHook('onSend', async (_request, reply) => { reply.header('Cache-Control', 'no-store'); });
    scope.setErrorHandler((error: Error & { code?: string; statusCode?: number }, request, reply) => {
      if (error.statusCode === 401) return fail(reply, 401, 'unauthorized', 'Pair this client with the server first.');
      if (error.statusCode === 403) return fail(reply, 403, 'forbidden', 'This token cannot use this route.');
      if (error.code === 'FST_ERR_CTP_BODY_TOO_LARGE') return fail(reply, 413, 'payload_too_large', 'Request body is too large for this route.');
      if (error instanceof z.ZodError || error.statusCode === 400 || error.code?.startsWith('FST_ERR_CTP_')) return fail(reply, 400, 'invalid_request', 'The coach guide could not be read.');
      request.log.error({ code: error.code ?? error.name }, 'coach guide route failed');
      return fail(reply, 503, 'storage_unavailable', 'The coach guide could not be stored.');
    });
    scope.post('/api/coach-guides', { onRequest: auth.require({ roles: ['author'], sessionId: auth.sessionId }), bodyLimit: MAX_PUBLISH_BYTES }, request => store.publish(request.body));
    const reader = { onRequest: auth.require({ roles: ['author', 'learner'], sessionId: auth.sessionId }) };
    const read = async (request: { params: unknown }, reply: FastifyReply) => {
      const params = GuideIdParam.safeParse(request.params);
      const guide = params.success ? await store.get(params.data.id) : null;
      if (!guide) return fail(reply, 404, 'unknown_guide', 'No coach guide with that ID is stored on this server.');
      return guide;
    };
    // Browser cookies are only honoured with an Origin header, which same-origin GETs omit; the POST query mirrors the storage routes.
    scope.get('/api/coach-guides/:id', reader, read);
    scope.post('/api/coach-guides/:id/query', { ...reader, bodyLimit: 1024 }, read);
  });
}
