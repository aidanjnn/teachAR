import type { FastifyInstance } from 'fastify';
import type { ServerConfig } from './config.js';

/** Public browser settings only. Invalid optional telemetry configuration fails closed. */
export function readTelemetryConfig(env: NodeJS.ProcessEnv) {
  const disabled = {
    enabled: false, dsn: '', replay_enabled: false,
    environment: 'development', release: 'development-uncommitted', traces_sample_rate: 1,
  };
  if (env.SENTRY_ENABLED?.toLowerCase() !== 'true') return disabled;
  const dsn = (env.SENTRY_BROWSER_DSN ?? '').trim();
  // Hosted public ingest DSNs cannot contain secret keys, query strings or fragments.
  if (!/^https:\/\/[a-fA-F0-9]{16,64}@(?:o\d+\.)?ingest(?:\.[a-z0-9-]+)?\.sentry\.io\/\d+$/.test(dsn)) return disabled;
  const environment = env.SENTRY_ENVIRONMENT ?? 'hackathon-demo';
  const release = env.SENTRY_RELEASE ?? env.BUILD_ID ?? 'development-uncommitted';
  if (environment.trim() !== environment || release.trim() !== release ||
      !/^[a-zA-Z0-9._-]{1,32}$/.test(environment) || !/^[a-zA-Z0-9._@+/-]{1,128}$/.test(release)) return disabled;
  const rawRate = (env.SENTRY_TRACES_SAMPLE_RATE ?? '1').trim();
  if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(rawRate)) return disabled;
  const traces_sample_rate = Number(rawRate);
  if (!Number.isFinite(traces_sample_rate) || traces_sample_rate < 0 || traces_sample_rate > 1) return disabled;
  return { enabled: true, dsn, replay_enabled: env.SENTRY_REPLAY_ENABLED?.toLowerCase() === 'true', environment, release, traces_sample_rate };
}

export function registerTelemetryRoute(app: FastifyInstance, config: ServerConfig) {
  const protocol = config.tls ? 'https' : 'http';
  const allowedOrigins = new Set([
    ...config.pairing.allowedOrigins,
    ...['127.0.0.1', 'localhost', '[::1]'].map(host => `${protocol}://${host}:${config.port}`),
  ]);
  // This endpoint serves public SDK configuration before pairing. It grants no
  // access to recordings/providers and does not alter other routes' authorization.
  app.get('/api/telemetry/config', async (request, reply) => {
    reply.header('Cache-Control', 'no-store').header('X-Content-Type-Options', 'nosniff');
    const requestOrigin = `${request.protocol}://${request.headers.host ?? ''}`;
    const origin = request.headers.origin;
    const site = request.headers['sec-fetch-site'];
    if (!allowedOrigins.has(requestOrigin) || (origin !== undefined && origin !== requestOrigin) ||
        (site !== undefined && site !== 'same-origin' && site !== 'none')) {
      return reply.code(403).send({ error: 'Same-origin requests only.' });
    }
    return config.telemetry;
  });
}
