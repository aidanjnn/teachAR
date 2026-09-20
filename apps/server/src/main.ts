import { createPairingAuthority } from './auth/pairing.js';
import { writePairingBootstrap } from './auth/bootstrap.js';
import { access, stat } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createApp } from './app.js';
import { loadEnvironment, readConfig, repositoryRoot } from './config.js';

loadEnvironment();
const config = readConfig();
const development = process.argv.includes('--dev');
const webRoot = resolve(repositoryRoot, 'apps/web/dist');
if (!development) {
  await access(resolve(webRoot, 'index.html')).catch(() => {
    throw new Error('Web build missing. Run pnpm build before pnpm start.');
  });
}
const origins = config.pairing.allowedOrigins.length ? config.pairing.allowedOrigins : config.pairing.allowUsbLoopback ? [`http://127.0.0.1:${config.port}`] : [];
const auth = origins.length ? createPairingAuthority({ ...config.pairing, allowedOrigins: origins }) : undefined;
if (auth) await writePairingBootstrap(auth, config.dataDir);
// The Quest Browser tutor is plain static files; serving them here gives the headset one origin for pages, pairing and voice.
const tutorRoot = resolve(repositoryRoot, 'experiments/quest-browser/public');
const tutorAvailable = await stat(resolve(tutorRoot, 'tutorial.html')).then(() => true, () => false);
const app = await createApp(config, { logger: true, ...(auth ? { auth } : {}), ...(development ? {} : { webRoot }), ...(tutorAvailable ? { tutorRoot } : {}) });
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => {
    void app.close().catch(() => { process.exitCode = 1; });
  });
}
await app.listen({ host: config.host, port: config.port });
