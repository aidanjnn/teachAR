import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { HealthSchema } from '@trail/contracts';
import { createApp } from '../src/app.js';
import { readConfig } from '../src/config.js';

const directories: string[] = [];
afterEach(async () => { await Promise.all(directories.splice(0).map(path => rm(path, { recursive: true, force: true }))); });
async function temp() { const path = await mkdtemp(join(tmpdir(), 'trail-test-')); directories.push(path); return path; }

describe('local scaffold server', () => {
  it('reports writable storage and mock modes without exposing server secrets', async () => {
    const config = readConfig({ DATA_DIR: await temp(), BUILD_ID: 'test-build', OPENAI_API_KEY: 'not-a-real-secret' });
    const app = await createApp(config);
    try {
      const response = await app.inject('/api/health');
      expect(response.statusCode).toBe(200);
      expect(HealthSchema.parse(response.json())).toEqual({ status: 'ok', buildId: 'test-build', providers: { ai: 'mock', haptics: 'mock' }, storage: { writable: true } });
      expect(response.body).not.toContain(config.dataDir);
      expect(response.body).not.toContain('not-a-real-secret');
      expect(response.headers['cache-control']).toBe('no-store');
    } finally { await app.close(); }
  });
  it('reports degraded health when storage cannot be created', async () => {
    const file = join(await temp(), 'not-a-directory');
    await writeFile(file, 'occupied');
    const app = await createApp(readConfig({ DATA_DIR: join(file, 'data') }));
    try {
      const response = await app.inject('/api/health');
      expect(response.statusCode).toBe(503);
      expect(response.json().storage.writable).toBe(false);
    } finally { await app.close(); }
  });
  it('serves only built assets and leaves unimplemented APIs as 404', async () => {
    const webRoot = await temp();
    await writeFile(join(webRoot, 'index.html'), '<h1>TeachAR fixture</h1>');
    await writeFile(join(webRoot, '.env'), 'do-not-serve');
    const app = await createApp(readConfig({ DATA_DIR: await temp() }), { webRoot });
    try {
      expect((await app.inject('/')).body).toContain('TeachAR fixture');
      expect((await app.inject('/api/tutorials')).statusCode).toBe(404);
      expect((await app.inject('/.env')).body).not.toContain('do-not-serve');
    } finally { await app.close(); }
  });
  it.each([{ PORT: '0' }, { PORT: '65536' }, { HOST: '0.0.0.0' }, { AI_PROVIDER: 'live' }, { HAPTICS_DRIVER: 'serial' }])('fails explicitly for unsupported configuration %j', env => {
    expect(() => readConfig(env)).toThrow('Invalid server configuration');
  });
  it('reads openai settings only when the provider is openai and never echoes the key', () => {
    const mock = readConfig({ DATA_DIR: 'data' });
    expect(mock.providers.ai).toBe('mock');
    expect(mock.openai).toBeNull();
    const live = readConfig({ AI_PROVIDER: 'openai', OPENAI_API_KEY: 'sk-test-key', OPENAI_LIVE_VOICE: 'cedar' });
    expect(live.providers.ai).toBe('openai');
    expect(live.openai).toEqual({
      apiKey: 'sk-test-key', transcribeModel: 'whisper-1', textModel: 'gpt-4.1-mini-2025-04-14',
      liveModel: 'gpt-live-1', liveBackendModel: 'gpt-5.6-luna', liveVoice: 'cedar', liveGreeting: true,
    });
    let message = '';
    try { readConfig({ AI_PROVIDER: 'openai', OPENAI_API_KEY: '   ' }); } catch (error) { message = String(error); }
    expect(message).toContain('OPENAI_API_KEY');
    expect(message).not.toContain('sk-');
  });
});
