import type { FastifyInstance, FastifyReply, RouteShorthandOptions } from 'fastify';
import {
  AUDIO_MIME_TYPES, COACH_TEXT_DEADLINE_MS, CoachAnswerSchema, CoachContextSchema, CoachRequestSchema, CoachSessionRequestSchema,
  CoachSessionResponseSchema, LabelRequestSchema, LabelResultSchema, MAX_COACH_STEPS, MAX_NARRATION_BYTES, MAX_RECORDING_DURATION_MS,
  TranscriptResultSchema, type CoachAnswer, type CoachContext, type VoiceUnavailable,
} from '@trail/contracts';
import { fallbackAnswer } from '../ai/coach-prompts.js';
import type { AiProvider } from '../ai/provider.js';
import type { PairingAuthority } from '../auth/pairing.js';

/** MIME essences accepted for narration; parameters such as ;codecs=opus are matched by Fastify. */
export const AUDIO_ESSENCES = [...new Set(AUDIO_MIME_TYPES.map(type => type.split(';')[0] ?? type))];
const TRANSCRIBE_TIMEOUT_MS = 60_000;
const LABEL_ROUTE_TIMEOUT_MS = 30_000;
/** Shorter than the browser's 15 s live-start deadline so an abandoned request cannot leave a billed session behind. */
const SESSION_TIMEOUT_MS = 12_000;

/** The approved tutorial text the server coaches from; adapters map a stored Tutorial onto this shape. */
export interface CoachTutorialSource {
  id: string;
  revision: number;
  steps: readonly { id: string; title: string; instruction: string }[];
}
export type CoachTutorialLookup = (tutorialId: string) => Promise<CoachTutorialSource | null>;

export interface VoiceRouteOptions {
  /** When present, narration/labels need an author token and coaching needs a learner or author token on this session. */
  auth?: PairingAuthority;
  /** When present, the client's step text is replaced by the stored tutorial; unknown or stale tutorials are rejected. */
  resolveTutorial?: CoachTutorialLookup;
}

type Grounded = { ok: true; context: CoachContext } | { ok: false; status: number; body: VoiceUnavailable };

function unavailable(reply: FastifyReply, status: number, body: VoiceUnavailable) {
  return reply.code(status).header('Cache-Control', 'no-store').send(body);
}

function headerNumber(value: string | string[] | undefined, range: { min: number; max: number }): number | null | 'invalid' {
  if (value === undefined) return null;
  const parsed = Number(Array.isArray(value) ? value[0] : value);
  if (!Number.isFinite(parsed) || parsed < range.min || parsed > range.max) return 'invalid';
  return Math.round(parsed);
}

/** Replace client-supplied tutorial text with the stored tutorial, keeping a bounded window of steps around the current one. */
export async function groundContext(context: CoachContext, resolveTutorial: CoachTutorialLookup | undefined): Promise<Grounded> {
  if (!resolveTutorial) return { ok: true, context };
  const tutorial = await resolveTutorial(context.tutorialId);
  if (!tutorial) return { ok: false, status: 404, body: { error: 'unknown_tutorial', message: 'No tutorial with that ID is stored on this server.' } };
  if (tutorial.revision !== context.tutorialRevision) {
    return { ok: false, status: 409, body: { error: 'stale_tutorial', message: `Tutorial revision ${context.tutorialRevision} is not current (${tutorial.revision}).` } };
  }
  const index = tutorial.steps.findIndex(step => step.id === context.currentStepId);
  if (index < 0) return { ok: false, status: 400, body: { error: 'invalid_request', message: 'The current step does not belong to this tutorial.' } };
  const start = Math.max(0, Math.min(index - Math.floor(MAX_COACH_STEPS / 2), tutorial.steps.length - MAX_COACH_STEPS));
  const steps = tutorial.steps.slice(start, start + MAX_COACH_STEPS).map(step => ({ id: step.id, title: step.title, instruction: step.instruction }));
  return {
    ok: true,
    context: CoachContextSchema.parse({
      tutorialId: tutorial.id, tutorialRevision: tutorial.revision, runId: context.runId, attemptId: context.attemptId,
      title: `Tutorial ${tutorial.id}`.slice(0, 120), steps, currentStepId: context.currentStepId, stepRevision: context.stepRevision,
    }),
  };
}

export async function registerVoiceRoutes(app: FastifyInstance, provider: AiProvider, options: VoiceRouteOptions = {}): Promise<void> {
  const { auth, resolveTutorial } = options;
  // Authenticate before the body is parsed so an unpaired client cannot make the server read a 20 MiB upload.
  const guard = (roles: readonly ('author' | 'learner')[]): RouteShorthandOptions =>
    auth ? { onRequest: auth.require({ roles, sessionId: auth.sessionId }) } : {};
  const authorOnly = guard(['author']);
  const learnerOrAuthor = guard(['learner', 'author']);

  await app.register(async voice => {
    voice.addContentTypeParser(AUDIO_ESSENCES, { parseAs: 'buffer', bodyLimit: MAX_NARRATION_BYTES }, (_request, body, done) => { done(null, body); });

    voice.setErrorHandler((error: Error & { code?: string; statusCode?: number }, request, reply) => {
      if (error.statusCode === 401) return unavailable(reply, 401, { error: 'unauthorized', message: error.message });
      if (error.statusCode === 403) return unavailable(reply, 403, { error: 'forbidden', message: error.message });
      if (error.statusCode === 429) return unavailable(reply, 429, { error: 'rate_limited', message: error.message });
      if (error.code === 'FST_ERR_CTP_BODY_TOO_LARGE') return unavailable(reply, 413, { error: 'payload_too_large', message: 'Request body is too large for this route.' });
      if (error.code === 'FST_ERR_CTP_INVALID_MEDIA_TYPE') return unavailable(reply, 415, { error: 'unsupported_media_type', message: 'Send webm, ogg, mp4, or wav audio.' });
      if (error.statusCode === 400 || error.code?.startsWith('FST_ERR_CTP_')) return unavailable(reply, 400, { error: 'invalid_request', message: 'The request body could not be read.' });
      request.log.error({ code: error.code ?? error.name }, 'voice route failed');
      return unavailable(reply, 503, { error: 'provider_unavailable', message: 'The AI provider did not respond.' });
    });

    voice.post('/api/voice/transcriptions', { ...authorOnly, bodyLimit: MAX_NARRATION_BYTES }, async (request, reply) => {
      const body = request.body;
      if (!Buffer.isBuffer(body)) return unavailable(reply, 415, { error: 'unsupported_media_type', message: 'Send webm, ogg, mp4, or wav audio.' });
      if (body.length === 0) return unavailable(reply, 400, { error: 'invalid_request', message: 'Send the narration audio as the request body.' });
      const offset = headerNumber(request.headers['x-audio-start-offset-ms'], { min: -5_000, max: 5_000 });
      const duration = headerNumber(request.headers['x-audio-duration-ms'], { min: 1, max: MAX_RECORDING_DURATION_MS });
      if (offset === 'invalid' || duration === 'invalid') return unavailable(reply, 400, { error: 'invalid_request', message: 'Audio offset or duration header is out of range.' });
      const mimeType = String(request.headers['content-type'] ?? '').replace(/\s+/g, '').toLowerCase();
      // A view over the parsed body; File() honours the offset/length so nothing is copied again.
      const bytes = new Uint8Array(body.buffer as ArrayBuffer, body.byteOffset, body.byteLength);
      const result = await provider.transcribe({
        bytes, mimeType, audioStartOffsetMs: offset ?? 0, audioDurationHintMs: duration, signal: AbortSignal.timeout(TRANSCRIBE_TIMEOUT_MS),
      });
      return reply.header('Cache-Control', 'no-store').send(TranscriptResultSchema.parse(result));
    });

    voice.post('/api/voice/labels', { ...authorOnly, bodyLimit: 1024 * 1024 }, async (request, reply) => {
      const parsed = LabelRequestSchema.safeParse(request.body);
      if (!parsed.success) return unavailable(reply, 400, { error: 'invalid_request', message: 'Label request failed validation.' });
      const result = await provider.label(parsed.data, AbortSignal.timeout(LABEL_ROUTE_TIMEOUT_MS));
      return reply.header('Cache-Control', 'no-store').send(LabelResultSchema.parse(result));
    });

    voice.post('/api/coach', { ...learnerOrAuthor, bodyLimit: 64 * 1024 }, async (request, reply) => {
      const parsed = CoachRequestSchema.safeParse(request.body);
      if (!parsed.success) return unavailable(reply, 400, { error: 'invalid_request', message: 'Coach request failed validation.' });
      const grounded = await groundContext(parsed.data.context, resolveTutorial);
      if (!grounded.ok) return unavailable(reply, grounded.status, grounded.body);
      const coachRequest = { ...parsed.data, context: grounded.context };
      let answer: CoachAnswer;
      try {
        answer = await provider.coachText(coachRequest, AbortSignal.timeout(COACH_TEXT_DEADLINE_MS - 500));
      } catch {
        answer = fallbackAnswer(coachRequest);
      }
      return reply.header('Cache-Control', 'no-store').send(CoachAnswerSchema.parse(answer));
    });

    voice.post('/api/live/sessions', { ...learnerOrAuthor, bodyLimit: 128 * 1024 }, async (request, reply) => {
      const parsed = CoachSessionRequestSchema.safeParse(request.body);
      if (!parsed.success) return unavailable(reply, 400, { error: 'invalid_request', message: 'Session request failed validation.' });
      const grounded = await groundContext(parsed.data.context, resolveTutorial);
      if (!grounded.ok) return unavailable(reply, grounded.status, grounded.body);
      // Stop talking to OpenAI as soon as the client gives up, so no session is created for nobody.
      const clientGone = new AbortController();
      const onClose = () => { clientGone.abort(new DOMException('Client disconnected', 'AbortError')); };
      reply.raw.once('close', onClose);
      let result;
      try {
        result = await provider.createLiveSession({ ...parsed.data, context: grounded.context }, AbortSignal.any([clientGone.signal, AbortSignal.timeout(SESSION_TIMEOUT_MS)]));
      } finally {
        reply.raw.off('close', onClose);
      }
      if ('error' in result) return unavailable(reply, 503, result);
      return reply.code(201).header('Cache-Control', 'no-store').send(CoachSessionResponseSchema.parse(result));
    });
  });
}
