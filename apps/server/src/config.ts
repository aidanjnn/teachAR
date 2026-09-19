import { loadEnvFile } from 'node:process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

export const repositoryRoot = fileURLToPath(new URL('../../../', import.meta.url));
const ModelName = z.string().min(1).max(128);
const EnvironmentSchema = z.object({
  HOST: z.literal('127.0.0.1').default('127.0.0.1'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3001),
  DATA_DIR: z.string().min(1).default('./data'),
  AI_PROVIDER: z.enum(['mock', 'openai']).default('mock'),
  HAPTICS_DRIVER: z.literal('mock').default('mock'),
  BUILD_ID: z.string().min(1).max(128).default('development-uncommitted'),
  OPENAI_API_KEY: z.string().default(''),
  OPENAI_TRANSCRIBE_MODEL: ModelName.default('whisper-1'),
  OPENAI_TEXT_MODEL: ModelName.default('gpt-4.1-mini'),
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
  const result = EnvironmentSchema.safeParse(env);
  if (!result.success) {
    // Report field names only; environment values can contain credentials.
    throw new Error(`Invalid server configuration: ${result.error.issues.map(issue => issue.path.join('.')).join(', ')}`);
  }
  const values = result.data;
  return {
    host: values.HOST, port: values.PORT,
    dataDir: resolve(repositoryRoot, values.DATA_DIR),
    buildId: values.BUILD_ID,
    providers: { ai: values.AI_PROVIDER, haptics: values.HAPTICS_DRIVER },
    openai: values.AI_PROVIDER === 'openai' ? {
      apiKey: values.OPENAI_API_KEY.trim(), transcribeModel: values.OPENAI_TRANSCRIBE_MODEL, textModel: values.OPENAI_TEXT_MODEL,
      liveModel: values.OPENAI_LIVE_MODEL, liveBackendModel: values.OPENAI_LIVE_BACKEND_MODEL, liveVoice: values.OPENAI_LIVE_VOICE,
    } : null,
  };
}
export type ServerConfig = ReturnType<typeof readConfig>;
