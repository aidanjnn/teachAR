import { ReferenceStore } from './storage/references.js';
import { InspectionCoordinator } from './vision/coordinator.js';
import { registerInspectionRoutes } from './vision/routes.js';
import { SpectatorRelay } from './sessions/relay.js';
import { PairingAuthority, registerPairingRoutes } from './auth/pairing.js';
import { TutorialRepository } from './storage/repository.js';
import { registerStorageRoutes } from './storage/routes.js';
import { probeVision } from './vision/client.js';
import Fastify, { LogController } from 'fastify';
import fastifyStatic from '@fastify/static';
import { z } from 'zod';
import { HealthSchema, parseContractJson } from '@trail/contracts';
import { randomUUID } from 'node:crypto';
import { mkdir, unlink, writeFile, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createProvider } from './ai/index.js';
import type { AiProvider } from './ai/provider.js';
import type { ServerConfig } from './config.js';
import { registerVoiceRoutes, type CoachTutorialLookup } from './routes/voice.js';

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

export async function createApp(
  config: ServerConfig,
  options: { webRoot?: string; logger?: boolean; auth?: PairingAuthority; provider?: AiProvider; resolveTutorial?: CoachTutorialLookup } = {},
) {
  let resolveTutorial = options.resolveTutorial;
  const https = config.tls ? { cert: await readFile(config.tls.certFile), key: await readFile(config.tls.keyFile) } : null;
  const app = Fastify({
    ...(https ? { https } : {}),
    logger: options.logger ?? false,
    logController: new LogController({ disableRequestLogging: true }),
    // requestTimeout bounds receiving the whole request; narration uploads of up to 20 MiB need more than 10 s on Wi-Fi.
    bodyLimit: 64 * 1024, requestTimeout: 60_000,
  });
  app.removeContentTypeParser('application/json');
  app.addContentTypeParser('application/json', { parseAs: 'string' }, (_request, body, done) => {
    try { done(null, parseContractJson(z.unknown(), String(body))); }
    catch { done(Object.assign(new Error('Invalid JSON input'), { statusCode: 400 })); }
  });
  if (options.auth) {
    const relay = new SpectatorRelay();
    await relay.register(app, options.auth);
    registerPairingRoutes(app, options.auth);
    const repository = new TutorialRepository(config.dataDir);
    await repository.recover();
    // The coach speaks only from stored tutorials once pairing is on; unknown or malformed IDs read as "no tutorial".
    resolveTutorial ??= async id => {
      try {
        const tutorial = await repository.tutorial(id);
        return { id: tutorial.id, revision: tutorial.revision, status: tutorial.status, steps: tutorial.steps.map(step => ({ id: step.id, title: step.title, instruction: step.instruction })) };
      } catch (error) {
        const status = (error as { statusCode?: number }).statusCode;
        if (status === 404 || status === 400) return null;
        throw error;
      }
    };
    relay.bindTutorials(repository);
    await registerStorageRoutes(app, repository, options.auth);
    const references = new ReferenceStore(repository);
    const auth = options.auth;
    const inspection = new InspectionCoordinator({ vision: config.vision, resolveReferences: context => references.resolveReferences(context), isCurrent: (sessionId, context) => {
      const { snapshot, connected, updatedAt } = relay.snapshot();
      if (!connected || Date.now() - updatedAt >= 3000 || !snapshot || !('state' in snapshot) || snapshot.sessionId !== sessionId || snapshot.runId !== context.runId) return false;
      const state = snapshot.state;
      return state.phase === 'paused' && state.calibrationValid && state.tutorialId === context.tutorialId && state.tutorialRevision === context.tutorialRevision && state.stepId === context.stepId && state.stepRevision === context.stepRevision && state.attemptId === context.attemptId;
    } });
    const unsubscribe = relay.subscribe(() => inspection.guideChanged(auth.sessionId));
    await registerInspectionRoutes(app, { coordinator: inspection, authorizeLearner: request => auth.authorize(request, { roles: ['learner'], sessionId: auth.sessionId }) });
    app.addHook('onClose', async () => { unsubscribe(); inspection.close(); });
  }
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
  await registerVoiceRoutes(app, options.provider ?? createProvider(config), {
    ...(options.auth ? { auth: options.auth } : {}),
    ...(resolveTutorial ? { resolveTutorial } : {}),
  });
  if (options.webRoot) {
    await app.register(fastifyStatic, { root: options.webRoot, dotfiles: 'deny' });
  }
  return app;
}
