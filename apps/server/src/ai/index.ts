import { resolve } from 'node:path';
import { repositoryRoot, type ServerConfig } from '../config.js';
import { createMockProvider } from './mock.js';
import { createOpenAiGateway } from './openai-gateway.js';
import { createOpenAiProvider } from './openai.js';
import type { AiProvider } from './provider.js';

export type { AiProvider } from './provider.js';

export function createProvider(config: ServerConfig): AiProvider {
  if (config.openai) {
    const { apiKey, ...models } = config.openai;
    return createOpenAiProvider({ ...models, gateway: createOpenAiGateway(apiKey) });
  }
  return createMockProvider({ transcriptFixturePath: resolve(repositoryRoot, 'fixtures/narration-transcript.v1.json') });
}
