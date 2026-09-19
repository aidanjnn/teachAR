import { describe, it, expect } from 'vitest';
import Fastify from 'fastify';
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createPairingAuthority, registerPairingRoutes } from '../src/auth/pairing.js';
import { writePairingBootstrap } from '../src/auth/bootstrap.js';

async function fixture(allowUsbLoopback = true) {
  let now = 1_000;
  const auth = createPairingAuthority({ allowedOrigins: allowUsbLoopback ? ['http://localhost:3401'] : ['https://trail.example'], allowUsbLoopback, now: () => now });
  const app = Fastify();
  registerPairingRoutes(app, auth);
  app.get('/protected', { preHandler: auth.require({ roles: ['learner'], sessionId: auth.sessionId }) }, async () => ({ ok: true }));
  const pair = (role: 'author' | 'learner' | 'spectator' = 'learner', client = 'native') => app.inject({ method: 'POST', url: '/api/pair', headers: { host: 'localhost:3401', ...(client === 'browser' ? { origin: 'http://localhost:3401' } : {}) }, payload: { code: auth.issueCode(role).code, client } });
  return { app, auth, pair, advance: (ms: number) => { now += ms; } };
}

describe('scoped demo pairing', () => {
  it('consumes codes once, expires codes/tokens, rejects missing credentials and revokes sessions', async () => {
    const { app, auth, advance } = await fixture();
    try {
      const issued = auth.issueCode('learner');
      const request = { method: 'POST' as const, url: '/api/pair', payload: { code: issued.code, client: 'native' } };
      const paired = await app.inject(request);
      expect(paired.statusCode).toBe(200);
      expect((await app.inject(request)).statusCode).toBe(401);
      const headers = { authorization: `Bearer ${paired.json().token}` };
      expect((await app.inject({ url: '/protected', headers })).statusCode).toBe(200);
      expect((await app.inject('/protected')).statusCode).toBe(401);
      expect((await app.inject({ method: 'DELETE', url: '/api/session', headers })).statusCode).toBe(204);
      expect((await app.inject({ url: '/protected', headers })).statusCode).toBe(401);
      const expired = auth.issueCode('learner'); advance(300_001);
      expect((await app.inject({ ...request, payload: { code: expired.code, client: 'native' } })).statusCode).toBe(401);
      const fresh = await app.inject({ ...request, payload: { code: auth.issueCode('learner').code, client: 'native' } });
      advance(3_600_001);
      expect((await app.inject({ url: '/protected', headers: { authorization: `Bearer ${fresh.json().token}` } })).statusCode).toBe(401);
    } finally { await app.close(); }
  });
  it('enforces Origin for browser cookies, credential kind, role and session scope', async () => {
    const { app, auth, pair } = await fixture();
    app.get('/other-session', { preHandler: auth.require({ roles: ['learner'], sessionId: 'other' }) }, async () => ({}));
    try {
      const browser = await pair('learner', 'browser');
      const cookie = String(browser.headers['set-cookie']).split(';')[0]!;
      expect(browser.json().token).toBeUndefined();
      expect(browser.headers['set-cookie']).toContain('HttpOnly; SameSite=Strict');
      expect((await app.inject({ url: '/protected', headers: { cookie } })).statusCode).toBe(401);
      expect((await app.inject({ url: '/protected', headers: { cookie, origin: 'http://evil.example' } })).statusCode).toBe(403);
      expect((await app.inject({ url: '/protected', headers: { cookie, origin: 'http://localhost:3401' } })).statusCode).toBe(200);
      expect((await app.inject({ url: '/protected', headers: { authorization: `Bearer ${cookie.split('=')[1]}` } })).statusCode).toBe(401);
      const learner = await pair();
      const headers = { authorization: `Bearer ${learner.json().token}` };
      expect((await app.inject({ url: '/protected', headers: { ...headers, origin: 'https://evil.example' } })).statusCode).toBe(403);
      expect((await app.inject({ url: '/other-session', headers })).statusCode).toBe(403);
      expect((await app.inject({ url: '/protected', headers: { ...headers, cookie } })).statusCode).toBe(401);
      const spectator = await pair('spectator');
      expect((await app.inject({ url: '/protected', headers: { authorization: `Bearer ${spectator.json().token}` } })).statusCode).toBe(403);
      expect((await app.inject({ method: 'POST', url: '/api/pairing-codes', headers, payload: { role: 'author' } })).statusCode).toBe(403);
    } finally { await app.close(); }
  });
  it('requires TLS by default and limits USB exception to actual loopback and host', async () => {
    const secure = await fixture(false);
    try { expect((await secure.pair()).statusCode).toBe(403); } finally { await secure.app.close(); }
    const { app, auth } = await fixture();
    try {
      for (const headers of [{ host: 'public.example' }, { host: 'localhost', 'x-forwarded-proto': 'https' }]) {
        expect((await app.inject({ method: 'POST', url: '/api/pair', headers, remoteAddress: '203.0.113.1', payload: { code: auth.issueCode('learner').code, client: 'native' } })).statusCode).toBe(403);
      }
    } finally { await app.close(); }
  });
  it('rate limits guesses including malformed bodies and permits only authors to issue codes', async () => {
    const { app, pair } = await fixture();
    try {
      const author = await pair('author');
      const headers = { authorization: `Bearer ${author.json().token}` };
      expect((await app.inject({ method: 'POST', url: '/api/pairing-codes', headers, payload: { role: 'spectator' } })).statusCode).toBe(200);
      for (let i = 0; i < 9; i++) expect((await app.inject({ method: 'POST', url: '/api/pair', payload: {} })).statusCode).toBe(401);
      expect((await app.inject({ method: 'POST', url: '/api/pair', payload: {} })).statusCode).toBe(429);
    } finally { await app.close(); }
  });
  it('writes the initial author code to a private file and bounds pending credentials', async () => {
    const { app, auth } = await fixture();
    const dir = await mkdtemp(join(tmpdir(), 'trail-pair-'));
    try {
      const path = await writePairingBootstrap(auth, dir);
      expect((await stat(path)).mode & 0o777).toBe(0o600);
      expect(JSON.parse(await readFile(path, 'utf8')).role).toBe('author');
      for (let i = 1; i < 64; i++) auth.issueCode('learner');
      expect(() => auth.issueCode('learner')).toThrow('Too many');
    } finally { await app.close(); await rm(dir, { recursive: true, force: true }); }
  });
});

it('applies the same gate to real WebSocket upgrades for native and browser clients', async () => {
  const { default: websocket } = await import('@fastify/websocket');
  const { default: WebSocket } = await import('ws');
  const auth = createPairingAuthority({ allowedOrigins: ['http://localhost:3401'], allowUsbLoopback: true });
  const app = Fastify();
  await app.register(websocket);
  registerPairingRoutes(app, auth);
  app.get('/ws', { websocket: true, preValidation: auth.require({ roles: ['learner'] }) }, socket => { socket.send('authorized'); });
  const address = await app.listen({ host: '127.0.0.1', port: 0 });
  async function connect(headers: Record<string, string>) {
    return new Promise<number>((resolve, reject) => {
      const socket = new WebSocket(address.replace('http:', 'ws:') + '/ws', { headers });
      socket.on('message', () => { socket.close(); resolve(101); });
      socket.on('unexpected-response', (_request, response) => { response.resume(); socket.terminate(); resolve(response.statusCode!); });
      socket.on('error', error => { if (!error.message.includes('closed before')) reject(error); });
    });
  }
  try {
    const pair = await app.inject({ method: 'POST', url: '/api/pair', payload: { code: auth.issueCode('learner').code, client: 'native' } });
    const headers = { authorization: `Bearer ${pair.json().token}` };
    expect(await connect(headers)).toBe(101);
    expect(await connect({})).toBe(401);
    expect(await connect({ ...headers, origin: 'http://evil.example' })).toBe(403);
    const browser = await app.inject({ method: 'POST', url: '/api/pair', headers: { origin: 'http://localhost:3401' }, payload: { code: auth.issueCode('learner').code, client: 'browser' } });
    const cookie = String(browser.headers['set-cookie']).split(';')[0]!;
    expect(await connect({ cookie, origin: 'http://localhost:3401' })).toBe(101);
    expect(await connect({ cookie })).toBe(401);
  } finally { await app.close(); }
});
