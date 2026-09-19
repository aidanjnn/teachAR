import { createVisionApp } from './app.js';
import { loadEnvironment, readConfig } from './config.js';

loadEnvironment();
const config = readConfig();
const app = createVisionApp(config, { logger: true });
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => { void app.close().catch(() => { process.exitCode = 1; }); });
}
await app.listen({ host: config.host, port: config.port });
