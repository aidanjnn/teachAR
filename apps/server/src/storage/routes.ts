import { ReferenceStore } from './references.js';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { CreateRecordingRequestSchema, MotionChunkSchema, FinalizeRecordingRequestSchema, TutorialDraftEditSchema, TutorialJobCreateSchema, TutorialFinalizeSchema, RecordingByteChunkSchema } from '@trail/contracts';
import type { PairingAuthority } from '../auth/pairing.js';
import { TutorialRepository } from './repository.js';
import { StoreError } from './files.js';
import { MAX_WAV_BYTES } from './narration.js';
const Id = z.strictObject({ id: z.uuid() });
const ChunkId = Id.extend({ chunk: z.coerce.number().int().min(0).max(63) });

export async function registerStorageRoutes(app: FastifyInstance, repository: TutorialRepository, auth: PairingAuthority) {
  const references = new ReferenceStore(repository);
  await app.register(async scope => {
    const admitted = new WeakSet<object>(); let active = 0;
    const release = (request: object) => { if (admitted.delete(request)) active--; };
    scope.addHook('onRequest', async request => { if (active >= 8) throw new StoreError(429, 'Authoring request limit reached'); admitted.add(request); active++; });
    scope.addHook('onResponse', async request => release(request));
    scope.addHook('onRequestAbort', async request => release(request));
    scope.addHook('onError', async request => release(request));
    scope.addHook('onSend', async (_request, reply) => { reply.header('Cache-Control', 'no-store'); });
    scope.setErrorHandler((error, _request, reply) => {
      if (error instanceof z.ZodError) { void reply.code(400).send({ error: 'Invalid authoring input', issues: error.issues.map(issue => ({ path: issue.path, message: issue.message })) }); return; }
      const status = (error as { statusCode?: number }).statusCode ?? 500;
      void reply.code(status).send({ error: status < 500 ? (error as Error).message : 'Storage operation failed' });
    });
    scope.addContentTypeParser('audio/wav', { parseAs: 'buffer' }, (_request, body, done) => done(null, body));
    const author = { onRequest: auth.require({ roles: ['author'] }) };
    const reader = { onRequest: auth.require({ roles: ['author', 'learner'] }) };
    scope.post('/api/recordings/:id/reference-images/query', author, request => references.candidates(Id.parse(request.params).id));
    scope.post('/api/reference-images', { ...author, bodyLimit: 3 * 1024 * 1024 }, request => references.upload(request.body as never));
    scope.post('/api/reference-images/:id/query', author, request => references.image(Id.parse(request.params).id));
    scope.post('/api/tutorials/:id/references/query', author, async request => (await repository.bundle(Id.parse(request.params).id)).references);
    scope.put('/api/tutorials/:id/layout', author, request => references.reviewLayout(Id.parse(request.params).id, request.body));
    scope.post('/api/tutorials/:id/layout/query', reader, async request => {
      const id = Id.parse(request.params).id;
      const role = auth.authorize(request, { roles: ['author', 'learner'] }).role;
      if (role !== 'author' && (await repository.tutorial(id)).status !== 'ready') throw new StoreError(403, 'Starting layout requires a reviewed tutorial');
      return references.layout(id);
    });
    scope.put('/api/tutorials/:id/references', author, request => references.review(Id.parse(request.params).id, request.body));
    scope.post('/api/recordings/uploads/query', author, () => repository.pendingUploads());
    scope.post('/api/recordings', author, async request => {
      const { metadata } = CreateRecordingRequestSchema.parse(request.body);
      return repository.createRecording(metadata);
    });
    scope.put('/api/recordings/:id/narration', { ...author, bodyLimit: MAX_WAV_BYTES }, request => {
      if (!Buffer.isBuffer(request.body)) throw new StoreError(415, 'Send raw audio/wav');
      return repository.uploadNarration(Id.parse(request.params).id, request.body);
    });
    scope.get('/api/recordings/:id/narration', author, async (request, reply) =>
      reply.type('audio/wav').send(await repository.narration(Id.parse(request.params).id)));
    scope.post('/api/recordings/:id/narration/query', author, async (request, reply) =>
      reply.type('audio/wav').send(await repository.narration(Id.parse(request.params).id)));
    scope.post('/api/tutorials/:id/narration/query', author, request =>
      repository.files.read('tutorials', Id.parse(request.params).id, 'narration-review.json'));
    scope.put('/api/recordings/:id/bytes/:chunk', { ...author, bodyLimit: 3 * 1024 * 1024 }, async request => {
      const { id, chunk } = ChunkId.parse(request.params); const body = RecordingByteChunkSchema.parse(request.body);
      return repository.uploadBytes(id, chunk, Buffer.from(body.dataBase64, 'base64'), body.sha256);
    });
    scope.post('/api/recordings/:id/finalize-bytes', author, async request => {
      const { id } = Id.parse(request.params); const body = FinalizeRecordingRequestSchema.parse(request.body);
      return repository.finalizeBytes(id, body.chunkCount, body.sha256);
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
    scope.get('/api/recordings/:id/download', reader, async request => {
      const id = Id.parse(request.params).id; const { sha256 } = await repository.recording(id); const bytes = await repository.recordingContent(id);
      return { sha256, bytes: bytes.length, chunkCount: Math.ceil(bytes.length / (1024 * 1024)) };
    });
    scope.get('/api/recordings/:id/content/:chunk', reader, async request => {
      const { id, chunk } = ChunkId.parse(request.params); const bytes = await repository.recordingContent(id);
      const part = bytes.subarray(chunk * 1024 * 1024, (chunk + 1) * 1024 * 1024);
      if (!part.length) throw new StoreError(404, 'No such content chunk');
      return { dataBase64: part.toString('base64') };
    });
    scope.get('/api/recordings/:id/content', reader, async (request, reply) => {
      const id = Id.parse(request.params).id; const { sha256 } = await repository.recording(id);
      return reply.type('application/json').header('X-Content-SHA256', sha256).send(await repository.recordingContent(id));
    });
    scope.post('/api/tutorial-jobs', author, async (request, reply) => {
      const input = TutorialJobCreateSchema.parse(request.body);
      reply.code(202); return repository.compile(input.recordingId, input.recordingHash, input.segmentationRevision);
    });
    scope.get('/api/tutorial-jobs/:id', author, request => repository.files.read('jobs', Id.parse(request.params).id));
    scope.post('/api/tutorial-jobs/:id/query', author, request => repository.files.read('jobs', Id.parse(request.params).id));
    scope.get('/api/tutorials', reader, async request => { const role = auth.authorize(request, { roles: ['author', 'learner'] }).role; return (await repository.list()).filter(value => role === 'author' || value.status === 'ready'); });
    scope.post('/api/tutorials/ready/query', reader, async () => (await repository.list()).filter(value => value.status === 'ready'));
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
