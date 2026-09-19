import { loadEnvFile } from 'node:process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

export const repositoryRoot = fileURLToPath(new URL('../../../', import.meta.url));
const EnvironmentSchema = z.object({
  HOST: z.literal('127.0.0.1').default('127.0.0.1'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3001),
  DATA_DIR: z.string().min(1).default('./data'),
  AI_PROVIDER: z.literal('mock').default('mock'),
  HAPTICS_DRIVER: z.literal('mock').default('mock'),
  BUILD_ID: z.string().min(1).max(128).default('development-uncommitted'),
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
  return {
    host: result.data.HOST, port: result.data.PORT,
    dataDir: resolve(repositoryRoot, result.data.DATA_DIR),
    buildId: result.data.BUILD_ID,
    providers: { ai: result.data.AI_PROVIDER, haptics: result.data.HAPTICS_DRIVER },
  };
}
export type ServerConfig = ReturnType<typeof readConfig>;
