import { randomBytes } from 'node:crypto';
import { loadEnvFile } from 'node:process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'node:net';
import { spawn } from 'node:child_process';

const root = fileURLToPath(new URL('../', import.meta.url));
try { loadEnvFile(resolve(root, '.env')); }
catch (error) {
  if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) throw error;
}
// Check before starting any child so an old dev stack is never mistaken for this run.
const ports = [process.env.PORT || '3001', process.env.DEV_WEB_PORT || '5173', process.env.VISION_PORT || '3002'].map(Number);
if (ports.some(port => !Number.isInteger(port) || port < 1 || port > 65535) || new Set(ports).size !== ports.length) {
  throw new Error('PORT, DEV_WEB_PORT and VISION_PORT must be distinct valid ports.');
}
for (const port of ports) {
  await new Promise<void>((resolveProbe, reject) => {
    const probe = createServer();
    probe.once('error', () => reject(new Error(`Port ${port} is unavailable. Stop your old stack or set PORT, DEV_WEB_PORT and VISION_PORT to free ports.`)));
    probe.listen(port, '127.0.0.1', () => probe.close(error => error ? reject(error) : resolveProbe()));
  });
}
// Development-only secret shared in child environments; never persisted or printed.
const token = process.env.VISION_SERVICE_TOKEN || randomBytes(32).toString('base64url');
const port = process.env.VISION_PORT || '3002';
const env = {
  VISION_SERVICE_TOKEN: token,
  VISION_SERVICE_URL: process.env.VISION_SERVICE_URL || `http://127.0.0.1:${port}`,
};
console.log('Starting desktop, main API and vision skeleton. Image interpretation is not implemented.');
// Use the existing CLI: its published library types conflict with strict optional types.
// No -k: a failed vision process must not terminate the other development services.
const detached = process.platform !== 'win32';
const child = spawn('pnpm', ['exec', 'concurrently', '-n', 'shared,web,server,vision',
  'pnpm dev:shared', 'pnpm --filter @trail/web dev',
  'pnpm --filter @trail/server dev', 'pnpm --filter @trail/vision dev',
], { cwd: root, stdio: 'inherit', env: { ...process.env, ...env }, detached });
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => {
    if (child.pid && detached) { try { process.kill(-child.pid, signal); } catch { /* already stopped */ } }
    else child.kill(signal);
  });
}
process.exitCode = await new Promise<number>((resolveCode, reject) => {
  child.once('error', reject);
  child.once('exit', (code, signal) => resolveCode(code ?? (signal ? 1 : 0)));
});
