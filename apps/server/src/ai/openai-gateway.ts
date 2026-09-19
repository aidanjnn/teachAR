import OpenAI from 'openai';
import { zodTextFormat } from 'openai/helpers/zod';
import type { LiveCreateParams, LiveCreateResponse } from 'openai/resources/live/live';
import type { z } from 'zod';

export interface VerboseTranscript {
  durationSeconds: number;
  language: string | null;
  segments: { start: number; end: number; text: string }[];
}
export type ParsedJson<T> =
  | { status: 'ok'; parsed: T }
  | { status: 'refusal'; refusal: string }
  | { status: 'incomplete'; reason: string }
  | { status: 'unparsed' };
export interface ParseJsonInput<T> {
  model: string; instructions: string; input: string; schema: z.ZodType<T>; schemaName: string; maxOutputTokens: number; signal: AbortSignal;
}

/** The only surface the provider uses. Tests substitute a fake; the real one wraps the SDK. */
export interface OpenAiGateway {
  transcribeVerbose(input: { bytes: Uint8Array; mimeType: string; model: string; signal: AbortSignal }): Promise<VerboseTranscript>;
  parseJson<T>(input: ParseJsonInput<T>): Promise<ParsedJson<T>>;
  createLiveSession(params: LiveCreateParams, signal: AbortSignal): Promise<LiveCreateResponse>;
}

const EXTENSIONS: Record<string, string> = { 'audio/webm': 'webm', 'audio/ogg': 'ogg', 'audio/mp4': 'mp4', 'audio/wav': 'wav' };

export function fileNameFor(mimeType: string): string {
  const essence = mimeType.split(';')[0]?.trim().toLowerCase() ?? '';
  return `narration.${EXTENSIONS[essence] ?? 'webm'}`;
}

export function createOpenAiGateway(apiKey: string): OpenAiGateway {
  const client = new OpenAI({ apiKey, maxRetries: 1 });
  return {
    async transcribeVerbose({ bytes, mimeType, model, signal }) {
      const file = new File([new Uint8Array(bytes)], fileNameFor(mimeType), { type: mimeType });
      const result = await client.audio.transcriptions.create(
        { file, model, response_format: 'verbose_json', timestamp_granularities: ['segment'] },
        { signal },
      );
      return {
        durationSeconds: result.duration,
        language: result.language || null,
        segments: (result.segments ?? []).map(segment => ({ start: segment.start, end: segment.end, text: segment.text })),
      };
    },
    async parseJson({ model, instructions, input, schema, schemaName, maxOutputTokens, signal }) {
      const response = await client.responses.parse(
        { model, instructions, input, max_output_tokens: maxOutputTokens, text: { format: zodTextFormat(schema, schemaName) } },
        { signal },
      );
      if (response.status === 'incomplete') return { status: 'incomplete', reason: response.incomplete_details?.reason ?? 'unknown' };
      for (const item of response.output) {
        if (item.type !== 'message') continue;
        for (const part of item.content) {
          if (part.type === 'refusal') return { status: 'refusal', refusal: part.refusal };
        }
      }
      const parsed = response.output_parsed;
      if (parsed === null || parsed === undefined) return { status: 'unparsed' };
      return { status: 'ok', parsed };
    },
    createLiveSession: (params, signal) => client.live.create(params, { signal }),
  };
}
