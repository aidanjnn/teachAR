import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { createPairingAuthority } from '../src/auth/pairing.js';
import { readConfig } from '../src/config.js';
import { readTelemetryConfig } from '../src/telemetry.js';

const dsn = 'https://0123456789abcdef0123456789abcdef@o1.ingest.us.sentry.io/1';
const enabled = { SENTRY_ENABLED: 'true', SENTRY_BROWSER_DSN: dsn };
const directories: string[] = [];
afterEach(async () => { await Promise.all(directories.splice(0).map(path => rm(path, { recursive: true, force: true }))); });
async function temp() { const path = await mkdtemp(join(tmpdir(), 'trail-telemetry-')); directories.push(path); return path; }

describe('public browser telemetry configuration', () => {
  it('defaults off, never returns private credentials, and opts into Replay separately', () => {
    expect(readTelemetryConfig({ SENTRY_BROWSER_DSN: dsn, SENTRY_AUTH_TOKEN: 'PRIVATE' })).toEqual({
      enabled: false, dsn: '', replay_enabled: false, environment: 'development', release: 'development-uncommitted', traces_sample_rate: 1,
    });
    const result = readTelemetryConfig({ ...enabled, SENTRY_AUTH_TOKEN: 'PRIVATE', OPENAI_API_KEY: 'PRIVATE', SENTRY_RELEASE: 'trail-browser@test' });
    expect(result).toEqual({ enabled: true, dsn, replay_enabled: false, environment: 'hackathon-demo', release: 'trail-browser@test', traces_sample_rate: 1 });
    expect(JSON.stringify(result)).not.toContain('PRIVATE');
    expect(readTelemetryConfig({ ...enabled, SENTRY_REPLAY_ENABLED: 'true', BUILD_ID: 'build-test' })).toMatchObject({ replay_enabled: true, release: 'build-test' });
  });

  it.each([
    'https://key:PRIVATE@o1.ingest.sentry.io/1', `${dsn}?PRIVATE`, `${dsn}#PRIVATE`,
    dsn.replace('https:', 'http:'), dsn.replace('sentry.io', 'sentry.io.attacker.example'), 'PRIVATE',
  ])('rejects invalid or private DSN %s without echoing it', value => {
    const result = readTelemetryConfig({ ...enabled, SENTRY_BROWSER_DSN: value });
    expect(result.enabled).toBe(false); expect(result.dsn).toBe('');
    expect(JSON.stringify(result)).not.toContain('PRIVATE');
  });

  it.each(['NaN', 'Infinity', '-1', '1.01', '', 'nonsense', '0x1'])('fails closed for invalid sample rate %s', rate => {
    expect(readTelemetryConfig({ ...enabled, SENTRY_TRACES_SAMPLE_RATE: rate }).enabled).toBe(false);
  });
  it.each(['0', '0.25', '1', '1e-1'])('accepts finite bounded sample rate %s', rate => {
    expect(readTelemetryConfig({ ...enabled, SENTRY_TRACES_SAMPLE_RATE: rate }).traces_sample_rate).toBe(Number(rate));
  });
  it.each(['SENTRY_RELEASE', 'SENTRY_ENVIRONMENT'])('rejects unsafe %s labels', key => {
    for (const value of ['PRIVATE\n<script>', 'PRIVATE\n']) {
      const result = readTelemetryConfig({ ...enabled, [key]: value });
      expect(result.enabled).toBe(false); expect(JSON.stringify(result)).not.toContain('PRIVATE');
    }
  });
});

describe('public telemetry route boundaries', () => {
  it('serves same-origin configuration before pairing and retains auth on protected routes', async () => {
    const origin = 'http://127.0.0.1:3001';
    const config = readConfig({ ...enabled, DATA_DIR: await temp(), SENTRY_AUTH_TOKEN: 'PRIVATE', ALLOW_USB_LOOPBACK: 'true', PAIRING_ORIGINS: origin });
    const auth = createPairingAuthority(config.pairing);
    const app = await createApp(config, { auth });
    try {
      for (const headers of [{ host: '127.0.0.1:3001' }, { host: '127.0.0.1:3001', origin, 'sec-fetch-site': 'same-origin' }]) {
        const response = await app.inject({ url: '/api/telemetry/config', headers });
        expect(response.statusCode).toBe(200);
        expect(response.headers['cache-control']).toBe('no-store');
        expect(response.headers['access-control-allow-origin']).toBeUndefined();
        expect(response.json()).toEqual(config.telemetry);
        expect(response.body).not.toContain('PRIVATE');
      }
      const protectedResponse = await app.inject({ url: '/api/session', remoteAddress: '127.0.0.1', headers: { host: '127.0.0.1:3001', origin } });
      expect(protectedResponse.statusCode).toBe(401);
    } finally { await app.close(); }
  });

  it('rejects cross-origin and rebinding requests, including spoofed forwarding headers', async () => {
    const app = await createApp(readConfig({ ...enabled, DATA_DIR: await temp() }));
    try {
      for (const headers of [
        { origin: 'https://example.com' }, { origin: 'null' }, { 'sec-fetch-site': 'cross-site' },
        { 'sec-fetch-site': 'same-site' }, { host: 'attacker.example' },
        { host: 'attacker.example', 'x-forwarded-host': '127.0.0.1:3001', 'x-forwarded-proto': 'https' },
      ]) {
        const response = await app.inject({ url: '/api/telemetry/config', headers: { host: '127.0.0.1:3001', ...headers } });
        expect(response.statusCode).toBe(403); expect(response.body).not.toContain(dsn);
      }
    } finally { await app.close(); }
  });
});
