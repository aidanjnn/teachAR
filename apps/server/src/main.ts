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
const app = await createApp(config, { logger: true, ...(development ? {} : { webRoot }) });
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => {
    void app.close().catch(() => { process.exitCode = 1; });
  });
}
await app.listen({ host: config.host, port: config.port });
