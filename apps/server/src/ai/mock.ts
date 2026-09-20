import { readFile } from 'node:fs/promises';
import { TranscriptResultSchema, fallbackCoachAnswer, type TranscriptResult } from '@trail/contracts';
import { alignTranscript } from './align.js';
import { fallbackLabels } from './labels.js';
import type { AiProvider, TranscribeInput } from './provider.js';

export interface MockProviderOptions {
  /** Absolute path to fixtures/narration-transcript.v1.json. */
  transcriptFixturePath: string;
}

/** Deterministic provider for tests and keyless development. It never reports model provenance. */
export function createMockProvider(options: MockProviderOptions): AiProvider {
  let fixture: Promise<TranscriptResult> | null = null;
  const loadFixture = () => (fixture ??= readFile(options.transcriptFixturePath, 'utf8')
    .then(text => TranscriptResultSchema.parse(JSON.parse(text)))
    .catch((error: unknown) => { fixture = null; throw error; }));
  return {
    name: 'mock',
    async transcribe(input: TranscribeInput) {
      const source = await loadFixture();
      const audioDurationMs = input.audioDurationHintMs ?? source.audioDurationMs;
      const scale = source.audioDurationMs > 0 ? audioDurationMs / source.audioDurationMs : 1;
      return alignTranscript({
        source: 'fixture', model: null, language: source.language, audioDurationMs, audioStartOffsetMs: input.audioStartOffsetMs,
        segments: source.spans.map(span => ({ start: (span.startMs * scale) / 1000, end: (span.endMs * scale) / 1000, text: span.text })),
      });
    },
    async label(request) { return fallbackLabels(request, null); },
    async coachText(request) { return fallbackCoachAnswer(request); },
    async createLiveSession() {
      return { error: 'live_unavailable', message: 'The live voice coach needs AI_PROVIDER=openai on the server.' };
    },
    openLiveControl() { return null; },
  };
}
