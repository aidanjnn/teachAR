import { loadEnvFile } from 'node:process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

export const repositoryRoot = fileURLToPath(new URL('../../../', import.meta.url));
const EnvironmentSchema = z.object({
  VISION_HOST: z.literal('127.0.0.1').default('127.0.0.1'),
  VISION_PORT: z.coerce.number().int().min(1).max(65535).default(3002),
  VISION_SERVICE_TOKEN: z.string().min(32).max(256).regex(/^[A-Za-z0-9_-]+$/),
  VISION_PROVIDER: z.enum(['mock', 'openai']).default('mock'),
  OPENAI_API_KEY: z.string().min(1).optional(),
  VISION_MODEL: z.string().min(1).max(128).optional(),
  BUILD_ID: z.string().min(1).max(128).default('development-uncommitted'),
});
export function loadEnvironment(): void {
  try { loadEnvFile(resolve(repositoryRoot, '.env')); }
  catch (error) {
    if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) throw error;
  }
}
export function readConfig(env: NodeJS.ProcessEnv = process.env) {
  const result = EnvironmentSchema.refine(value => value.VISION_PROVIDER !== 'openai' ||
    (!!value.OPENAI_API_KEY && !!value.VISION_MODEL), { message: 'OpenAI vision requires key and explicit image-capable model', path: ['VISION_PROVIDER'] }).safeParse(env);
  if (!result.success) {
    throw new Error(`Invalid vision configuration: ${result.error.issues.map(issue => issue.path.join('.')).join(', ')}`);
  }
  return {
    host: result.data.VISION_HOST, port: result.data.VISION_PORT,
    serviceToken: result.data.VISION_SERVICE_TOKEN,
    provider: result.data.VISION_PROVIDER, buildId: result.data.BUILD_ID,
    apiKey: result.data.OPENAI_API_KEY, model: result.data.VISION_MODEL,
  };
}
export type VisionConfig = ReturnType<typeof readConfig>;
