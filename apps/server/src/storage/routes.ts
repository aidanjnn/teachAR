import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { CreateRecordingRequestSchema, MotionChunkSchema, FinalizeRecordingRequestSchema, TutorialDraftEditSchema, TutorialJobCreateSchema, TutorialFinalizeSchema } from '@trail/contracts';
import type { PairingAuthority } from '../auth/pairing.js';
import { TutorialRepository } from './repository.js';
import { StoreError } from './files.js';
const Id = z.strictObject({ id: z.uuid() });
const ChunkId = Id.extend({ chunk: z.coerce.number().int().min(0).max(63) });

export async function registerStorageRoutes(app: FastifyInstance, repository: TutorialRepository, auth: PairingAuthority) {
  await app.register(async scope => {
    scope.addHook('onSend', async (_request, reply) => { reply.header('Cache-Control', 'no-store'); });
    scope.setErrorHandler((error, _request, reply) => {
      if (error instanceof z.ZodError) { void reply.code(400).send({ error: 'Invalid authoring input', issues: error.issues.map(issue => ({ path: issue.path, message: issue.message })) }); return; }
      const status = (error as { statusCode?: number }).statusCode ?? 500;
      void reply.code(status).send({ error: status < 500 ? (error as Error).message : 'Storage operation failed' });
    });
    const author = { onRequest: auth.require({ roles: ['author'] }) };
    const reader = { onRequest: auth.require({ roles: ['author', 'learner'] }) };
    scope.post('/api/recordings', author, async request => {
      const { metadata } = CreateRecordingRequestSchema.parse(request.body);
      return repository.createRecording(metadata);
    });
    scope.put('/api/recordings/:id/motion/:chunk', { ...author, bodyLimit: 2 * 1024 * 1024 + 1024 }, async request => {
      const { id, chunk } = ChunkId.parse(request.params); const body = MotionChunkSchema.parse(request.body);
      return repository.upload(id, chunk, body.frames, body.sha256);
    });
    scope.post('/api/recordings/:id/finalize', author, async request => {
      const { id } = Id.parse(request.params); const body = FinalizeRecordingRequestSchema.parse(request.body);
      return repository.finalizeRecording(id, body.chunkCount, body.sha256);
    });
    scope.get('/api/recordings/:id/upload', author, request => repository.uploadStatus(Id.parse(request.params).id));
    scope.post('/api/recordings/:id/upload/query', author, request => repository.uploadStatus(Id.parse(request.params).id));
    scope.post('/api/recordings/:id/discard', author, async request => repository.discard(Id.parse(request.params).id));
    scope.get('/api/recordings/:id', reader, request => repository.recording(Id.parse(request.params).id));
    scope.post('/api/recordings/:id/query', reader, request => repository.recording(Id.parse(request.params).id));
    scope.get('/api/recordings/:id/content', reader, async (request, reply) => {
      const { recording, sha256 } = await repository.recording(Id.parse(request.params).id);
      return reply.type('application/json').header('X-Content-SHA256', sha256).send(JSON.stringify(recording));
    });
    scope.post('/api/tutorial-jobs', author, async (request, reply) => {
      const input = TutorialJobCreateSchema.parse(request.body);
      reply.code(202); return repository.compile(input.recordingId, input.recordingHash, input.segmentationRevision);
    });
    scope.get('/api/tutorial-jobs/:id', author, request => repository.files.read('jobs', Id.parse(request.params).id));
    scope.post('/api/tutorial-jobs/:id/query', author, request => repository.files.read('jobs', Id.parse(request.params).id));
    scope.get('/api/tutorials', author, () => repository.list());
    scope.post('/api/tutorials/query', author, () => repository.list());
    const getTutorial = async (id: string, role: string) => {
      const value = await repository.tutorial(id);
      if (role !== 'author' && value.status !== 'ready') throw new StoreError(403, 'Only reviewed tutorials are available to learners');
      return value;
    };
    for (const [method, url] of [['GET', '/api/tutorials/:id'], ['POST', '/api/tutorials/:id/query']] as const) {
      scope.route({ method, url, ...reader, handler: request => getTutorial(Id.parse(request.params).id, auth.authorize(request, { roles: ['author', 'learner'] }).role) });
    }
    scope.patch('/api/tutorials/:id', author, request => repository.edit(Id.parse(request.params).id, TutorialDraftEditSchema.parse(request.body)));
    scope.post('/api/tutorials/:id/finalize', author, request => repository.finalizeTutorial(Id.parse(request.params).id, TutorialFinalizeSchema.parse(request.body).baseRevision));
  });
}
