import { createHash, randomBytes, randomInt, randomUUID } from 'node:crypto';
import type { FastifyInstance, FastifyRequest, preHandlerHookHandler } from 'fastify';
import { z } from 'zod';

export type PairingRole = 'author' | 'learner' | 'spectator';
export type PairingClient = 'native' | 'browser';
export type Principal = Readonly<{ role: PairingRole; sessionId: string; client: 'native' | 'browser'; expiresAt: number }>;
export type AccessPolicy = { roles: readonly PairingRole[]; sessionId?: string };
export type PairingOptions = { allowedOrigins: readonly string[]; allowUsbLoopback?: boolean; now?: () => number };
const roles = ['author', 'learner', 'spectator'] as const;
const codeLifetime = 5 * 60_000;
const tokenLifetime = 60 * 60_000;
const cookieName = 'trail_session';
const digest = (value: string) => createHash('sha256').update(value).digest('hex');
const fail = (statusCode: number, message: string): never => { throw Object.assign(new Error(message), { statusCode }); };
const loopback = (address: string | undefined) => address === '127.0.0.1' || address === '::1' || address === '::ffff:127.0.0.1';

/** One process owns a bounded, ephemeral demo session. Restart revokes all credentials. */
export class PairingAuthority {
  readonly sessionId = randomUUID();
  private readonly origins: Set<string>;
  private readonly now: () => number;
  private readonly codes = new Map<string, { role: PairingRole; sessionId: string; client: PairingClient; expiresAt: number }>();
  private readonly tokens = new Map<string, Principal>();
  private readonly attempts = new Map<string, { count: number; expiresAt: number }>();
  private globalAttempts = { count: 0, expiresAt: 0 };
  constructor(private readonly options: PairingOptions) {
    this.now = options.now ?? Date.now;
    this.origins = new Set(options.allowedOrigins.map(origin => {
      const parsed = new URL(origin);
      if (parsed.origin !== origin || parsed.username || parsed.password ||
          (parsed.protocol !== 'https:' && !(options.allowUsbLoopback && parsed.protocol === 'http:' && ['127.0.0.1', '[::1]', 'localhost'].includes(parsed.hostname)))) {
        throw new Error('Pairing requires exact HTTPS origins or explicit USB loopback origins');
      }
      return origin;
    }));
    if (!this.origins.size) throw new Error('At least one browser Origin is required');
  }
  private prune() {
    const now = this.now();
    for (const map of [this.codes, this.tokens, this.attempts]) {
      for (const [key, value] of map) if (value.expiresAt <= now) map.delete(key);
    }
  }
  issueCode(role: PairingRole, sessionId: string = this.sessionId, client: PairingClient = 'native') {
    this.prune();
    if (!roles.includes(role) || !['native', 'browser'].includes(client) || !z.uuid().safeParse(sessionId).success) throw new Error('Invalid pairing scope');
    if (this.codes.size >= 64) return fail(429, 'Too many pending pairing codes');
    let code: string;
    do { code = randomInt(0, 100_000_000).toString().padStart(8, '0'); } while (this.codes.has(digest(code)));
    const scope = { role, sessionId, client, expiresAt: this.now() + codeLifetime };
    this.codes.set(digest(code), scope);
    return { code, ...scope };
  }
  /** Checks the actual connection. Do not enable Fastify trustProxy for arbitrary peers. */
  checkTransport(request: FastifyRequest) {
    const origin = request.headers.origin;
    if (origin !== undefined && !this.origins.has(origin)) return fail(403, 'Origin rejected');
    if (request.protocol === 'https') return;
    let host: URL;
    try { host = new URL(`http://${request.headers.host ?? ''}`); } catch { return fail(403, 'Secure transport required'); }
    if (!this.options.allowUsbLoopback || !loopback(request.raw.socket.remoteAddress) ||
        !['127.0.0.1', '[::1]', 'localhost'].includes(host.hostname) || host.username || host.password || host.pathname !== '/') {
      return fail(403, 'Secure transport required');
    }
  }
  private rateLimit(request: FastifyRequest) {
    this.prune();
    const now = this.now();
    if (this.globalAttempts.expiresAt <= now) this.globalAttempts = { count: 0, expiresAt: now + 60_000 };
    if (++this.globalAttempts.count > 100) return fail(429, 'Pairing temporarily rate limited');
    const key = request.ip; // Never trust caller-supplied forwarding headers by default.
    const bucket = this.attempts.get(key) ?? { count: 0, expiresAt: now + 60_000 };
    this.attempts.set(key, bucket);
    if (++bucket.count > 10) return fail(429, 'Pairing temporarily rate limited');
  }
  exchange(request: FastifyRequest, code: string, client: 'browser' | 'native') {
    this.checkTransport(request);
    this.rateLimit(request);
    if (client === 'native' && (request.headers.origin || request.headers['sec-fetch-mode'])) return fail(403, 'Native pairing requires a native client');
    if (client === 'browser' && !request.headers.origin) return fail(403, 'Browser Origin required');
    const key = digest(code);
    const scope = this.codes.get(key);
    if (!scope || scope.client !== client) return fail(401, 'Invalid or expired pairing code');
    if (this.tokens.size >= 128) return fail(429, 'Too many paired clients');
    // Synchronous consume and issuance prevents concurrent reuse.
    this.codes.delete(key);
    const token = randomBytes(32).toString('base64url');
    const principal: Principal = Object.freeze({ ...scope, client, expiresAt: this.now() + tokenLifetime });
    this.tokens.set(digest(token), principal);
    return { token, ...principal };
  }
  private credential(request: FastifyRequest): { token: string; client: 'native' | 'browser' } {
    const authorization = request.headers.authorization;
    const cookies = (request.headers.cookie ?? '').split(';').map(value => value.trim()).filter(value => value.startsWith(`${cookieName}=`));
    if (authorization && cookies.length) return fail(401, 'Ambiguous credentials');
    if (authorization) {
      const match = /^Bearer ([A-Za-z0-9_-]{43})$/.exec(authorization);
      if (!match?.[1]) return fail(401, 'Authentication required');
      return { token: match[1], client: 'native' };
    }
    if (!request.headers.origin || cookies.length !== 1) return fail(401, 'Authentication required');
    const token = cookies[0]!.slice(cookieName.length + 1);
    if (!/^[A-Za-z0-9_-]{43}$/.test(token)) return fail(401, 'Authentication required');
    return { token, client: 'browser' };
  }
  authorize(request: FastifyRequest, policy: AccessPolicy): Principal {
    this.checkTransport(request);
    this.prune();
    const credential = this.credential(request);
    const principal = this.tokens.get(digest(credential.token));
    if (!principal || principal.client !== credential.client) return fail(401, 'Authentication required');
    if (!policy.roles.includes(principal.role) || (policy.sessionId !== undefined && principal.sessionId !== policy.sessionId)) return fail(403, 'Scope rejected');
    return principal;
  }
  require(policy: AccessPolicy): preHandlerHookHandler {
    return async request => { this.authorize(request, policy); };
  }
  revoke(request: FastifyRequest) {
    this.authorize(request, { roles });
    this.tokens.delete(digest(this.credential(request).token));
  }
  clear() { this.codes.clear(); this.tokens.clear(); this.attempts.clear(); }
}
export const createPairingAuthority = (options: PairingOptions) => new PairingAuthority(options);

export function registerPairingRoutes(app: FastifyInstance, authority: PairingAuthority) {
  app.post('/api/pair', { bodyLimit: 1024 }, async (request, reply) => {
    // Invalid bodies count against rate limits too, by using an impossible code.
    const body = z.object({ code: z.string().regex(/^\d{8}$/), client: z.enum(['native', 'browser']) }).strict().safeParse(request.body);
    const paired = authority.exchange(request, body.success ? body.data.code : '', body.success ? body.data.client : 'native');
    const { token, ...principal } = paired;
    reply.header('Cache-Control', 'no-store');
    if (paired.client === 'browser') {
      const secure = request.protocol === 'https' ? '; Secure' : '';
      reply.header('Set-Cookie', `${cookieName}=${token}; Path=/api; HttpOnly; SameSite=Strict; Max-Age=${tokenLifetime / 1000}${secure}`);
      return principal;
    }
    return paired;
  });
  app.route({ method: ['GET', 'POST'], url: '/api/session', handler: async (request, reply) => {
    reply.header('Cache-Control', 'no-store');
    return authority.authorize(request, { roles });
  } });
  app.delete('/api/session', async (request, reply) => {
    authority.revoke(request);
    reply.header('Cache-Control', 'no-store').header('Set-Cookie', `${cookieName}=; Path=/api; HttpOnly; SameSite=Strict; Max-Age=0${request.protocol === 'https' ? '; Secure' : ''}`);
    return reply.code(204).send();
  });
  app.post('/api/pairing-codes', { bodyLimit: 1024 }, async (request, reply) => {
    const principal = authority.authorize(request, { roles: ['author'], sessionId: authority.sessionId });
    const body = z.object({ role: z.enum(roles), client: z.enum(['native', 'browser']).default('native') }).strict().safeParse(request.body);
    if (!body.success) return fail(400, 'Invalid pairing role');
    reply.header('Cache-Control', 'no-store');
    return authority.issueCode(body.data.role, principal.sessionId, body.data.client);
  });
  app.addHook('onClose', async () => { authority.clear(); });
}
