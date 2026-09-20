import sharp from 'sharp';
import { SceneAdviceRequestSchema, SceneAdviceResponseSchema, type SceneImage } from '@trail/contracts';
import type { FastifyInstance, FastifyReply, FastifyRequest, RouteShorthandOptions } from 'fastify';
import { GUARDED_LINE, MAX_TRANSCRIPT_CHARS, SceneCoachError, violatesAdviceRules, type SceneCoachProvider } from '../ai/scene-coach.js';
import type { PairingAuthority, PairingRole } from '../auth/pairing.js';
import { groundContext, type CoachTutorialLookup } from './voice.js';

const MAX_CAPTURE_AGE_MS = 3_000;
const SPACING_MS = 3_000;
const DEADLINE_MS = 15_000;
const MAX_IMAGE_BYTES = 1_100_000;
const MAX_OUTPUT_PX = 1024;
/** Whole-body limit for the JSON request: two bounded JPEGs plus context. */
const BODY_LIMIT = 3 * 1024 * 1024;

export interface SceneCoachRouteOptions {
  /** When present, only paired learners and authors may ask, and the pairing role decides draft access. */
  auth?: PairingAuthority;
  /** When present, the client's step text is replaced by the stored tutorial; unknown or stale tutorials are rejected. */
  resolveTutorial?: CoachTutorialLookup;
  /** Requests allowed per server process; a demo laptop never needs more. */
  limit?: number;
}

/** Decodes within limits and re-encodes to a bounded JPEG so the model never sees oversized or non-image bytes. Null means refuse. */
export async function boundImage(image: SceneImage): Promise<SceneImage | null> {
  const bytes = Buffer.from(image.dataBase64, 'base64');
  if (bytes.length < 16 || bytes.length > MAX_IMAGE_BYTES) return null;
  try {
    const decoder = sharp(bytes, { limitInputPixels: 1280 * 1280, failOn: 'warning', animated: false });
    const metadata = await decoder.metadata();
    if (metadata.format !== 'jpeg' || (metadata.pages ?? 1) !== 1) return null;
    const out = await decoder.rotate().resize({ width: MAX_OUTPUT_PX, height: MAX_OUTPUT_PX, fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 82 }).toBuffer();
    return { mimeType: 'image/jpeg', dataBase64: out.toString('base64') };
  } catch {
    return null;
  }
}

export async function registerSceneCoachRoutes(app: FastifyInstance, provider: SceneCoachProvider, options: SceneCoachRouteOptions = {}): Promise<void> {
  const { auth, resolveTutorial } = options;
  const limit = options.limit ?? 60;
  const roleOf = (request: FastifyRequest): PairingRole | null => (auth ? auth.authorize(request, { roles: ['author', 'learner'], sessionId: auth.sessionId }).role : null);
  // Authenticate before the body is parsed so an unpaired client cannot make the server read two images.
  const guard: RouteShorthandOptions = auth ? { onRequest: auth.require({ roles: ['learner', 'author'], sessionId: auth.sessionId }) } : {};
  const refuse = (reply: FastifyReply, status: number, error: string, message: string, headers: Record<string, string> = {}) => {
    reply.code(status).header('Cache-Control', 'no-store');
    for (const [name, value] of Object.entries(headers)) reply.header(name, value);
    return reply.send({ error, message });
  };
  let busy = false, attempts = 0, nextAt = 0;
  // An unconfigured server refuses before the two images are even read.
  const refuseWhenOff = (_request: FastifyRequest, reply: FastifyReply, done: () => void) => {
    if (provider.name === 'off') { void refuse(reply, 503, 'scene_unavailable', provider.reason ?? 'Scene coaching is not configured on this server.'); return; }
    done();
  };
  const hooks = [...(guard.onRequest ? [guard.onRequest as (request: FastifyRequest, reply: FastifyReply, done: () => void) => void] : []), refuseWhenOff];

  app.post('/api/scene-coach', { onRequest: hooks, bodyLimit: BODY_LIMIT }, async (request, reply) => {
    reply.header('Cache-Control', 'no-store');
    const parsed = SceneAdviceRequestSchema.safeParse(request.body);
    if (!parsed.success) return refuse(reply, 400, 'invalid_request', 'Scene advice request failed validation.');
    const body = parsed.data;
    if (body.captureAgeMs > MAX_CAPTURE_AGE_MS) return refuse(reply, 400, 'stale_capture', 'The camera frame is too old; look again.');
    const grounded = await groundContext(body.context, resolveTutorial, roleOf(request));
    if (!grounded.ok) return refuse(reply, grounded.status, grounded.body.error, grounded.body.message);
    if (busy || Date.now() < nextAt) return refuse(reply, 429, 'scene_busy', 'One look at a time. Try again in a moment.', { 'Retry-After': '3' });
    if (attempts >= limit) return refuse(reply, 429, 'scene_limit', 'The scene coaching allowance for this server run is used up.');
    busy = true;
    const startedAt = Date.now();
    try {
      // Both decodes are independent; a reference the model cannot read is dropped, not fatal.
      const [image, reference] = await Promise.all([boundImage(body.image), body.reference ? boundImage(body.reference) : Promise.resolve(null)]);
      if (!image) return refuse(reply, 400, 'invalid_image', 'Send a JPEG frame within limits.');
      // Only a request that reaches the model counts against spacing and the allowance.
      attempts++; nextAt = Date.now() + SPACING_MS;
      const advice = await provider.advise({ context: grounded.context, question: body.question, image, reference, source: body.source }, AbortSignal.timeout(DEADLINE_MS));
      // Judge the whole spoken answer, not a caption-sized prefix: a claim after the cut would otherwise reach the learner as audio.
      const guarded = violatesAdviceRules(advice.transcript) || advice.transcript.length > MAX_TRANSCRIPT_CHARS;
      return SceneAdviceResponseSchema.parse({
        schemaVersion: 1, requestId: body.requestId,
        tutorialId: grounded.context.tutorialId, tutorialRevision: grounded.context.tutorialRevision,
        stepId: grounded.context.currentStepId, stepRevision: grounded.context.stepRevision, epoch: body.epoch, source: body.source,
        transcript: guarded ? GUARDED_LINE : advice.transcript, audio: guarded ? null : advice.audio,
        model: advice.model, provenance: guarded ? 'guarded' : 'model', latencyMs: Date.now() - startedAt,
      });
    } catch (error) {
      // The learner only needs to know to keep going; the operator's log gets the sanitized reason (gateway status, timeout, bad answer shape), never the body.
      request.log.warn({ reason: error instanceof SceneCoachError ? error.message : error instanceof Error ? error.name : 'unknown', status: error instanceof SceneCoachError ? error.status : null }, 'scene coach unavailable');
      return refuse(reply, 503, 'scene_unavailable', 'The scene coach could not answer. Keep following the ghost hand.');
    } finally {
      busy = false;
    }
  });
}
