import OpenAI from 'openai';
import { zodTextFormat } from 'openai/helpers/zod';
import type { LiveCreateParams, LiveCreateResponse } from 'openai/resources/live/live';
import { SidebandWS } from 'openai/resources/live/sideband/ws';
import type { LiveControlChannel } from './provider.js';
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
  speech?(text: string, signal: AbortSignal): Promise<Uint8Array>;
  transcribeVerbose(input: { bytes: Uint8Array<ArrayBuffer>; mimeType: string; model: string; signal: AbortSignal }): Promise<VerboseTranscript>;
  parseJson<T>(input: ParseJsonInput<T>): Promise<ParsedJson<T>>;
  createLiveSession(params: LiveCreateParams, signal: AbortSignal): Promise<LiveCreateResponse>;
  /** Trusted server-side sideband to an existing live session. */
  openSideband(sessionId: string): LiveControlChannel;
}

const EXTENSIONS: Record<string, string> = { 'audio/webm': 'webm', 'audio/ogg': 'ogg', 'audio/mp4': 'mp4', 'audio/wav': 'wav' };

export function fileNameFor(mimeType: string): string {
  const essence = mimeType.split(';')[0]?.trim().toLowerCase() ?? '';
  return `narration.${EXTENSIONS[essence] ?? 'webm'}`;
}

export function createOpenAiGateway(apiKey: string, options: { baseURL?: string } = {}): OpenAiGateway {
  const client = new OpenAI({ apiKey, maxRetries: 1, ...(options.baseURL ? { baseURL: options.baseURL } : {}) });
  return {
    async speech(text, signal) {
      const response = await client.audio.speech.create({ model: 'gpt-4o-mini-tts-2025-12-15', voice: 'coral', input: text, instructions: 'Speak clearly and naturally, like a calm instructor beside the learner. Use a measured conversational pace and brief pauses between actions. Read only the supplied words; add no introduction or filler.', response_format: 'mp3' }, { signal });
      return new Uint8Array(await response.arrayBuffer());
    },
    async transcribeVerbose({ bytes, mimeType, model, signal }) {
      const file = new File([bytes], fileNameFor(mimeType), { type: mimeType });
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
    openSideband(sessionId) {
      // Sends queue while the socket connects; no reconnect so a dead session is reported, not silently resumed.
      const socket = new SidebandWS(client, { session_id: sessionId }, { reconnect: null });
      const errorHandlers = new Set<(error: Error) => void>();
      const closeHandlers = new Set<() => void>();
      const pending: { settle: { resolve: () => void; reject: (error: Error) => void } | null } = { settle: null };
      const ready = new Promise<void>((resolve, reject) => { pending.settle = { resolve, reject }; });
      void ready.catch(() => undefined);
      // The SDK rejects a bare promise (and would take the process down) when an error arrives with no listener.
      socket.on('error', error => {
        pending.settle?.reject(error);
        pending.settle = null;
        errorHandlers.forEach(handler => handler(error));
      });
      socket.on('close', () => {
        pending.settle?.reject(new Error('Live sideband closed before it opened'));
        pending.settle = null;
        closeHandlers.forEach(handler => handler());
      });
      void (async () => {
        try {
          for await (const item of socket.stream()) {
            if (item.type === 'open') { pending.settle?.resolve(); pending.settle = null; }
            if (item.type === 'close' || item.type === 'error') break;
          }
        } catch { /* already reported through the error listener */ }
      })();
      return {
        ready,
        send: event => { socket.send(event); },
        close: () => { socket.close(); },
        onClose: handler => { closeHandlers.add(handler); },
        onError: handler => { errorHandlers.add(handler); },
      };
    },
  };
}
