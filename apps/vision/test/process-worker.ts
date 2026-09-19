// Synthetic-only child-process harness. Never used by production entry points.
import Fastify from 'fastify';
import { createVisionApp } from '../src/app.js';
import { readConfig } from '../src/config.js';
import { createPairingAuthority, registerPairingRoutes } from '../../server/src/auth/pairing.js';
import { InspectionCoordinator } from '../../server/src/vision/coordinator.js';
import { registerInspectionRoutes } from '../../server/src/vision/routes.js';
import { assessment, input, token } from './fixtures.js';
let mode = 'correct';
process.on('message', value => { mode = (value as { mode: string }).mode; process.send?.({ changed: mode }); });
const fixture = await input();
const port = Number(process.env.TEST_PORT ?? '0');
const app = process.env.TEST_SERVICE === 'vision' ? createVisionApp(readConfig({ VISION_SERVICE_TOKEN: token }), {
  provider: { name: 'mock', model: 'synthetic-process-fixture', async assess(_input, signal) {
    if (mode === 'slow') await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(resolve, 4000);
      signal.addEventListener('abort', () => { clearTimeout(timer); reject(signal.reason); }, { once: true });
    });
    return assessment(mode === 'wrong' ? 'adjustment-needed' : mode === 'obscured' ? 'uncertain' : 'visible-match');
  } },
}) : Fastify({ bodyLimit: 64 * 1024 });
let code: string | undefined;
if (process.env.TEST_SERVICE === 'main') {
  const authority = createPairingAuthority({ allowedOrigins: ['https://trail.test'], allowUsbLoopback: true });
  const issued = authority.issueCode('learner'); code = issued.code;
  await registerPairingRoutes(app, authority);
  const coordinator = new InspectionCoordinator({ vision: { url: process.env.TEST_VISION_URL!, token },
    isCurrent: (sessionId, context) => sessionId === issued.sessionId && context.stepId === 'step-1' && context.stepRevision === 1,
    resolveReferences: async () => ({ references: fixture.references, approvedStep: fixture.approvedStep }),
  });
  await registerInspectionRoutes(app, { authorizeLearner: request => authority.authorize(request, { roles: ['learner'] }), coordinator });
  app.get('/health', () => ({ status: 'ok' }));
}
await app.listen({ host: '127.0.0.1', port });
process.send?.({ ready: true, port: (app.server.address() as { port: number }).port, code });
process.on('SIGTERM', () => { void app.close().then(() => process.exit()); });
