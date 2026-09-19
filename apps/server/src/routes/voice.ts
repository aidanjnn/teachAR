import type { FastifyInstance, FastifyReply } from 'fastify';
import {
  AUDIO_MIME_TYPES, COACH_TEXT_DEADLINE_MS, CoachAnswerSchema, CoachRequestSchema, CoachSessionRequestSchema, CoachSessionResponseSchema,
  LabelRequestSchema, LabelResultSchema, MAX_NARRATION_BYTES, MAX_RECORDING_DURATION_MS, TranscriptResultSchema,
  type CoachAnswer, type VoiceUnavailable,
} from '@trail/contracts';
import { fallbackAnswer } from '../ai/coach-prompts.js';
import type { AiProvider } from '../ai/provider.js';

/** MIME essences accepted for narration; parameters such as ;codecs=opus are matched by Fastify. */
export const AUDIO_ESSENCES = [...new Set(AUDIO_MIME_TYPES.map(type => type.split(';')[0] ?? type))];
const TRANSCRIBE_TIMEOUT_MS = 60_000;
const LABEL_ROUTE_TIMEOUT_MS = 30_000;
const SESSION_TIMEOUT_MS = 20_000;

function unavailable(reply: FastifyReply, status: number, body: VoiceUnavailable) {
  return reply.code(status).header('Cache-Control', 'no-store').send(body);
}

function headerNumber(value: string | string[] | undefined, range: { min: number; max: number }): number | null | 'invalid' {
  if (value === undefined) return null;
  const parsed = Number(Array.isArray(value) ? value[0] : value);
  if (!Number.isFinite(parsed) || parsed < range.min || parsed > range.max) return 'invalid';
  return Math.round(parsed);
}

export async function registerVoiceRoutes(app: FastifyInstance, provider: AiProvider): Promise<void> {
  await app.register(async voice => {
    voice.addContentTypeParser(AUDIO_ESSENCES, { parseAs: 'buffer', bodyLimit: MAX_NARRATION_BYTES }, (_request, body, done) => { done(null, body); });

    voice.setErrorHandler((error: Error & { code?: string; statusCode?: number }, request, reply) => {
      if (error.code === 'FST_ERR_CTP_BODY_TOO_LARGE') return unavailable(reply, 413, { error: 'payload_too_large', message: 'Narration must be 20 MiB or smaller.' });
      if (error.code === 'FST_ERR_CTP_INVALID_MEDIA_TYPE') return unavailable(reply, 415, { error: 'unsupported_media_type', message: 'Send webm, ogg, mp4, or wav audio.' });
      if (error.statusCode === 400 || error.code?.startsWith('FST_ERR_CTP_')) return unavailable(reply, 400, { error: 'invalid_request', message: 'The request body could not be read.' });
      request.log.error({ code: error.code ?? error.name }, 'voice route failed');
      return unavailable(reply, 503, { error: 'provider_unavailable', message: 'The AI provider did not respond.' });
    });

    voice.post('/api/voice/transcriptions', { bodyLimit: MAX_NARRATION_BYTES }, async (request, reply) => {
      const body = request.body;
      if (!Buffer.isBuffer(body)) return unavailable(reply, 415, { error: 'unsupported_media_type', message: 'Send webm, ogg, mp4, or wav audio.' });
      if (body.length === 0) return unavailable(reply, 400, { error: 'invalid_request', message: 'Send the narration audio as the request body.' });
      const offset = headerNumber(request.headers['x-audio-start-offset-ms'], { min: -5_000, max: 5_000 });
      const duration = headerNumber(request.headers['x-audio-duration-ms'], { min: 1, max: MAX_RECORDING_DURATION_MS });
      if (offset === 'invalid' || duration === 'invalid') return unavailable(reply, 400, { error: 'invalid_request', message: 'Audio offset or duration header is out of range.' });
      const mimeType = String(request.headers['content-type'] ?? '').replace(/\s+/g, '').toLowerCase();
      const result = await provider.transcribe({
        bytes: new Uint8Array(body), mimeType, audioStartOffsetMs: offset ?? 0, audioDurationHintMs: duration, signal: AbortSignal.timeout(TRANSCRIBE_TIMEOUT_MS),
      });
      return reply.header('Cache-Control', 'no-store').send(TranscriptResultSchema.parse(result));
    });

    voice.post('/api/voice/labels', { bodyLimit: 1024 * 1024 }, async (request, reply) => {
      const parsed = LabelRequestSchema.safeParse(request.body);
      if (!parsed.success) return unavailable(reply, 400, { error: 'invalid_request', message: 'Label request failed validation.' });
      const result = await provider.label(parsed.data, AbortSignal.timeout(LABEL_ROUTE_TIMEOUT_MS));
      return reply.header('Cache-Control', 'no-store').send(LabelResultSchema.parse(result));
    });

    voice.post('/api/coach', { bodyLimit: 64 * 1024 }, async (request, reply) => {
      const parsed = CoachRequestSchema.safeParse(request.body);
      if (!parsed.success) return unavailable(reply, 400, { error: 'invalid_request', message: 'Coach request failed validation.' });
      let answer: CoachAnswer;
      try {
        answer = await provider.coachText(parsed.data, AbortSignal.timeout(COACH_TEXT_DEADLINE_MS + 500));
      } catch {
        answer = fallbackAnswer(parsed.data);
      }
      return reply.header('Cache-Control', 'no-store').send(CoachAnswerSchema.parse(answer));
    });

    voice.post('/api/live/sessions', { bodyLimit: 128 * 1024 }, async (request, reply) => {
      const parsed = CoachSessionRequestSchema.safeParse(request.body);
      if (!parsed.success) return unavailable(reply, 400, { error: 'invalid_request', message: 'Session request failed validation.' });
      const result = await provider.createLiveSession(parsed.data, AbortSignal.timeout(SESSION_TIMEOUT_MS));
      if ('error' in result) return unavailable(reply, 503, result);
      return reply.code(201).header('Cache-Control', 'no-store').send(CoachSessionResponseSchema.parse(result));
    });
  });
}
