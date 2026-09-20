import { loadEnvFile } from 'node:process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import { readTelemetryConfig } from './telemetry.js';

export const repositoryRoot = fileURLToPath(new URL('../../../', import.meta.url));
const ModelName = z.string().min(1).max(128);
const EnvironmentSchema = z.object({
  TLS_CERT_FILE: z.string().min(1).optional(),
  TLS_KEY_FILE: z.string().min(1).optional(),
  PAIRING_ORIGINS: z.string().default(''),
  ALLOW_USB_LOOPBACK: z.enum(['true', 'false']).default('false'),
  HOST: z.literal('127.0.0.1').default('127.0.0.1'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3001),
  DATA_DIR: z.string().min(1).default('./data'),
  AI_PROVIDER: z.enum(['mock', 'openai']).default('mock'),
  HAPTICS_DRIVER: z.literal('mock').default('mock'),
  VISION_SERVICE_URL: z.string().url().refine(value => {
    let url: URL;
    try { url = new URL(value); } catch { return false; }
    return url.protocol === 'http:' && url.hostname === '127.0.0.1' && !url.username && !url.password && url.pathname === '/' && !url.search && !url.hash;
  }, 'Expected a loopback service origin').optional(),
  VISION_SERVICE_TOKEN: z.string().min(32).max(256).regex(/^[A-Za-z0-9_-]+$/).optional(),
  BUILD_ID: z.string().min(1).max(128).default('development-uncommitted'),
  OPENAI_API_KEY: z.string().default(''),
  OPENAI_TRANSCRIBE_MODEL: ModelName.default('whisper-1'),
  OPENAI_TEXT_MODEL: ModelName.default('gpt-4.1-mini-2025-04-14'),
  OPENAI_LIVE_MODEL: ModelName.default('gpt-live-1'),
  OPENAI_LIVE_BACKEND_MODEL: ModelName.default('gpt-5.6-luna'),
  OPENAI_LIVE_VOICE: z.string().min(1).max(64).default('marin'),
}).superRefine((env, ctx) => {
  if (env.AI_PROVIDER === 'openai' && env.OPENAI_API_KEY.trim().length === 0) {
    ctx.addIssue({ code: 'custom', path: ['OPENAI_API_KEY'], message: 'Required when AI_PROVIDER=openai' });
  }
});

export function loadEnvironment(): void {
  try {
    loadEnvFile(resolve(repositoryRoot, '.env'));
  } catch (error) {
    if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) throw error;
  }
}

export function readConfig(env: NodeJS.ProcessEnv = process.env) {
  const result = EnvironmentSchema.safeParse({ ...env, TLS_CERT_FILE: env.TLS_CERT_FILE || undefined, TLS_KEY_FILE: env.TLS_KEY_FILE || undefined, VISION_SERVICE_URL: env.VISION_SERVICE_URL || undefined, VISION_SERVICE_TOKEN: env.VISION_SERVICE_TOKEN || undefined });
  if (!result.success) {
    // Report field names only; environment values can contain credentials.
    throw new Error(`Invalid server configuration: ${result.error.issues.map(issue => issue.path.join('.')).join(', ')}`);
  }
  if (result.data.VISION_SERVICE_URL && !result.data.VISION_SERVICE_TOKEN) {
    throw new Error('Invalid server configuration: VISION_SERVICE_TOKEN');
  }
  if (Boolean(result.data.TLS_CERT_FILE) !== Boolean(result.data.TLS_KEY_FILE)) throw new Error('Invalid server configuration: TLS_CERT_FILE/TLS_KEY_FILE');
  const values = result.data;
  return {
    tls: values.TLS_CERT_FILE && values.TLS_KEY_FILE ? { certFile: resolve(values.TLS_CERT_FILE), keyFile: resolve(values.TLS_KEY_FILE) } : null,
    pairing: { allowedOrigins: values.PAIRING_ORIGINS.split(',').map(value => value.trim()).filter(Boolean), allowUsbLoopback: values.ALLOW_USB_LOOPBACK === 'true' },
    host: values.HOST, port: values.PORT,
    dataDir: resolve(repositoryRoot, values.DATA_DIR),
    buildId: values.BUILD_ID,
    telemetry: readTelemetryConfig(env),
    providers: { ai: values.AI_PROVIDER, haptics: values.HAPTICS_DRIVER },
    openai: values.AI_PROVIDER === 'openai' ? {
      apiKey: values.OPENAI_API_KEY.trim(), transcribeModel: values.OPENAI_TRANSCRIBE_MODEL, textModel: values.OPENAI_TEXT_MODEL,
      liveModel: values.OPENAI_LIVE_MODEL, liveBackendModel: values.OPENAI_LIVE_BACKEND_MODEL, liveVoice: values.OPENAI_LIVE_VOICE,
    } : null,
    vision: values.VISION_SERVICE_URL && values.VISION_SERVICE_TOKEN
      ? { url: values.VISION_SERVICE_URL, token: values.VISION_SERVICE_TOKEN } : null,
  };
}
export type ServerConfig = ReturnType<typeof readConfig>;
