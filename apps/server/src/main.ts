import { createPairingAuthority } from './auth/pairing.js';
import { writePairingBootstrap } from './auth/bootstrap.js';
import { access } from 'node:fs/promises';
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
const app = await createApp(config, { logger: true, ...(auth ? { auth } : {}), ...(development ? {} : { webRoot }) });
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => {
    void app.close().catch(() => { process.exitCode = 1; });
  });
}
await app.listen({ host: config.host, port: config.port });
