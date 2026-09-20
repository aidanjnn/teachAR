import type { FastifyInstance, FastifyReply, FastifyRequest, RouteShorthandOptions } from 'fastify';
import {
  fallbackCoachAnswer, AUDIO_MIME_TYPES, COACH_TEXT_DEADLINE_MS, CoachAnswerSchema, CoachContextSchema, CoachRequestSchema, CoachSessionRequestSchema,
  CoachSessionResponseSchema, LabelRequestSchema, LabelResultSchema, LiveStepUpdateSchema, MAX_NARRATION_BYTES, MAX_RECORDING_DURATION_MS,
  TranscriptResultSchema, type CoachAnswer, type CoachContext, type VoiceUnavailable,
} from '@trail/contracts';
import { z } from 'zod';
import { registerVoiceCommands } from './voice-commands.js';
import {registerLandmarks} from './landmarks.js';
import { registerInstructionVoice } from './instruction-voice.js';
import { LiveSessionRegistry } from '../ai/live-sessions.js';
import type { AiProvider } from '../ai/provider.js';
import type { PairingAuthority, PairingRole } from '../auth/pairing.js';

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
  /** Learners may only be coached from ready tutorials; authors may test drafts. Omitted means ready. */
  status?: 'draft' | 'ready';
  title?: string;
  layoutNotes?: string;
  steps: readonly { id: string; title: string; instruction: string }[];
}
const LOOKUP_TIMEOUT_MS = 2_000;
/** The trusted control channel must be open before the browser is told the session exists. */
const CONTROL_READY_TIMEOUT_MS = 5_000;
const SessionIdParam = z.object({ id: z.string().regex(/^[A-Za-z0-9_-]{1,128}$/) });
export type CoachTutorialLookup = (tutorialId: string) => Promise<CoachTutorialSource | null>;

export interface VoiceRouteOptions {
  /** Spoken once per session when the browser reports its media path is up; omitted for the mock provider and when OPENAI_LIVE_GREETING=off. */
  greeting?: string;
  /** When present, narration/labels need an author token and coaching needs a learner or author token on this session. */
  auth?: PairingAuthority;
  /** When present, the client's step text is replaced by the stored tutorial; unknown or stale tutorials are rejected. */
  resolveTutorial?: CoachTutorialLookup;
}

type Grounded = { ok: true; context: CoachContext } | { ok: false; status: number; body: VoiceUnavailable };

async function withinDeadline<T>(work: Promise<T>, timeoutMs: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([work, new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error('Voice operation timed out')), timeoutMs);
      timer.unref();
    })]);
  } finally { clearTimeout(timer); }
}

function unavailable(reply: FastifyReply, status: number, body: VoiceUnavailable) {
  return reply.code(status).header('Cache-Control', 'no-store').send(body);
}

function headerNumber(value: string | string[] | undefined, range: { min: number; max: number }): number | null | 'invalid' {
  if (value === undefined) return null;
  const parsed = Number(Array.isArray(value) ? value[0] : value);
  if (!Number.isFinite(parsed) || parsed < range.min || parsed > range.max) return 'invalid';
  return Math.round(parsed);
}

/** Replace client-supplied tutorial text with the stored tutorial. The client keeps only identifiers and its local step position. */
export async function groundContext(context: CoachContext, resolveTutorial: CoachTutorialLookup | undefined, role: PairingRole | null): Promise<Grounded> {
  if (!resolveTutorial) return { ok: true, context };
  let tutorial: CoachTutorialSource | null;
  try {
    tutorial = await withinDeadline(resolveTutorial(context.tutorialId), LOOKUP_TIMEOUT_MS);
  } catch {
    return { ok: false, status: 503, body: { error: 'provider_unavailable', message: 'Tutorial lookup failed.' } };
  }
  if (!tutorial || tutorial.id !== context.tutorialId) {
    return { ok: false, status: 404, body: { error: 'unknown_tutorial', message: 'No tutorial with that ID is stored on this server.' } };
  }
  if (tutorial.revision !== context.tutorialRevision) {
    return { ok: false, status: 409, body: { error: 'stale_tutorial', message: `Tutorial revision ${context.tutorialRevision} is not current (${tutorial.revision}).` } };
  }
  if (tutorial.status === 'draft' && role !== 'author') {
    return { ok: false, status: 403, body: { error: 'forbidden', message: 'This tutorial is still a draft; only its author can be coached from it.' } };
  }
  if (!tutorial.steps.some(step => step.id === context.currentStepId)) {
    return { ok: false, status: 400, body: { error: 'invalid_request', message: 'The current step does not belong to this tutorial.' } };
  }
  const grounded = CoachContextSchema.safeParse({
    tutorialId: tutorial.id, tutorialRevision: tutorial.revision, runId: context.runId, attemptId: context.attemptId,
    title: (tutorial.title ?? `Tutorial ${tutorial.id}`).slice(0, 120),
    steps: tutorial.steps.map(step => ({ id: step.id, title: step.title, instruction: step.instruction })),
    currentStepId: context.currentStepId, stepRevision: context.stepRevision,
    ...(tutorial.layoutNotes ? { layoutNotes: tutorial.layoutNotes.slice(0, 500) } : {}),
  });
  if (!grounded.success) return { ok: false, status: 503, body: { error: 'provider_unavailable', message: 'The stored tutorial does not fit the coach contract.' } };
  return { ok: true, context: grounded.data };
}

export async function registerVoiceRoutes(app: FastifyInstance, provider: AiProvider, options: VoiceRouteOptions = {}): Promise<void> {
  const { auth, resolveTutorial } = options;
  const sessions = new LiveSessionRegistry();
  const roleOf = (request: FastifyRequest): PairingRole | null => (auth ? auth.authorize(request, { roles: ['author', 'learner'], sessionId: auth.sessionId }).role : null);
  // Authenticate before the body is parsed so an unpaired client cannot make the server read a 20 MiB upload.
  const guard = (roles: readonly ('author' | 'learner')[]): RouteShorthandOptions =>
    auth ? { onRequest: auth.require({ roles, sessionId: auth.sessionId }) } : {};
  const authorOnly = guard(['author']);
  const learnerOrAuthor = guard(['learner', 'author']);

  await app.register(async voice => {
    voice.addContentTypeParser(AUDIO_ESSENCES, { parseAs: 'buffer', bodyLimit: MAX_NARRATION_BYTES }, (_request, body, done) => { done(null, body); });

    voice.setErrorHandler((error: Error & { code?: string; statusCode?: number }, request, reply) => {
      if (error.statusCode === 401) return unavailable(reply, 401, { error: 'unauthorized', message: 'Pair this client with the server first.' });
      if (error.statusCode === 403) return unavailable(reply, 403, { error: 'forbidden', message: 'This token cannot use this route.' });
      if (error.code === 'FST_ERR_CTP_BODY_TOO_LARGE') return unavailable(reply, 413, { error: 'payload_too_large', message: 'Request body is too large for this route.' });
      if (error.code === 'FST_ERR_CTP_INVALID_MEDIA_TYPE') return unavailable(reply, 415, { error: 'unsupported_media_type', message: 'Send webm, ogg, mp4, or wav audio.' });
      if (error.statusCode === 400 || error.code?.startsWith('FST_ERR_CTP_')) return unavailable(reply, 400, { error: 'invalid_request', message: 'The request body could not be read.' });
      request.log.error({ code: error.code ?? error.name }, 'voice route failed');
      return unavailable(reply, 503, { error: 'provider_unavailable', message: 'The AI provider did not respond.' });
    });

    registerVoiceCommands(voice, provider, learnerOrAuthor);
    registerInstructionVoice(voice, provider, authorOnly);
    registerLandmarks(voice,provider,learnerOrAuthor);

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
      const grounded = await groundContext(parsed.data.context, resolveTutorial, roleOf(request));
      if (!grounded.ok) return unavailable(reply, grounded.status, grounded.body);
      const coachRequest = { ...parsed.data, context: grounded.context };
      let answer: CoachAnswer;
      try {
        answer = await provider.coachText(coachRequest, AbortSignal.timeout(COACH_TEXT_DEADLINE_MS - 500));
      } catch {
        answer = fallbackCoachAnswer(coachRequest);
      }
      return reply.header('Cache-Control', 'no-store').send(CoachAnswerSchema.parse(answer));
    });

    voice.post('/api/live/sessions', { ...learnerOrAuthor, bodyLimit: 128 * 1024 }, async (request, reply) => {
      const parsed = CoachSessionRequestSchema.safeParse(request.body);
      if (!parsed.success) return unavailable(reply, 400, { error: 'invalid_request', message: 'Session request failed validation.' });
      // Stop talking to OpenAI as soon as the client gives up, so no session is created for nobody.
      const clientGone = new AbortController();
      const onClose = () => { clientGone.abort(new DOMException('Client disconnected', 'AbortError')); };
      reply.raw.once('close', onClose);
      let result;
      try {
        const grounded = await groundContext(parsed.data.context, resolveTutorial, roleOf(request));
        if (!grounded.ok) return unavailable(reply, grounded.status, grounded.body);
        result = await provider.createLiveSession({ ...parsed.data, context: grounded.context }, AbortSignal.any([clientGone.signal, AbortSignal.timeout(SESSION_TIMEOUT_MS)]));
        if ('error' in result) return unavailable(reply, 503, result);
        // Without the server-side channel there is no trusted way to move the model between steps; refuse rather than hand out a stuck session.
        const control = provider.openLiveControl(result.sessionId);
        if (!control) return unavailable(reply, 503, { error: 'live_unavailable', message: 'The live coach control channel could not be opened.' });
        try {
          // A browser that already gave up must not leave a registered, billed session behind.
          await Promise.race([
            withinDeadline(control.ready, CONTROL_READY_TIMEOUT_MS),
            new Promise<never>((_, reject) => {
              if (clientGone.signal.aborted) { reject(new Error('client gone')); return; }
              clientGone.signal.addEventListener('abort', () => reject(new Error('client gone')), { once: true });
            }),
          ]);
        } catch {
          // The provider session already exists: end it as soon as the channel can carry the close, within the same deadline.
          void withinDeadline(control.ready, CONTROL_READY_TIMEOUT_MS)
            .then(() => { try { control.send({ type: 'session.close', event_id: 'close-abandoned' }); } catch { /* already gone */ } }, () => undefined)
            .finally(() => { try { control.close(); } catch { /* already closed */ } });
          return unavailable(reply, 503, { error: 'live_unavailable', message: 'The live coach control channel did not become ready.' });
        }
        sessions.register(result.sessionId, grounded.context, control);
      } finally {
        reply.raw.off('close', onClose);
      }
      return reply.code(201).header('Cache-Control', 'no-store').send(CoachSessionResponseSchema.parse(result));
    });

    voice.post('/api/live/sessions/:id/step', { ...learnerOrAuthor, bodyLimit: 4 * 1024 }, async (request, reply) => {
      const params = SessionIdParam.safeParse(request.params);
      const parsed = LiveStepUpdateSchema.safeParse(request.body);
      if (!params.success || !parsed.success) return unavailable(reply, 400, { error: 'invalid_request', message: 'Step update failed validation.' });
      const result = sessions.updateStep(params.data.id, parsed.data);
      if (!result.ok) return unavailable(reply, result.status, result.body);
      return reply.code(204).header('Cache-Control', 'no-store').send();
    });

    // The browser asks for the greeting once its media path is up, so the model never speaks into a peer connection that is still negotiating.
    voice.post('/api/live/sessions/:id/greeting', learnerOrAuthor, async (request, reply) => {
      const params = SessionIdParam.safeParse(request.params);
      if (!params.success) return unavailable(reply, 400, { error: 'invalid_request', message: 'Invalid session ID.' });
      if (!sessions.has(params.data.id)) return unavailable(reply, 404, { error: 'unknown_session', message: 'No open live session with that ID.' });
      if (options.greeting) sessions.greet(params.data.id, options.greeting);
      return reply.code(204).header('Cache-Control', 'no-store').send();
    });

    voice.delete('/api/live/sessions/:id', learnerOrAuthor, async (request, reply) => {
      const params = SessionIdParam.safeParse(request.params);
      if (!params.success) return unavailable(reply, 400, { error: 'invalid_request', message: 'Invalid session ID.' });
      if (!sessions.close(params.data.id)) return unavailable(reply, 404, { error: 'unknown_session', message: 'No open live session with that ID.' });
      return reply.code(204).header('Cache-Control', 'no-store').send();
    });

    voice.addHook('onClose', async () => { sessions.closeAll(); });
  });
}
