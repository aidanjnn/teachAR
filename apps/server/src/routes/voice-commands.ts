import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { directVoiceIntent, VoiceIntentContextSchema, VoiceIntentSchema } from '../ai/voice-intent.js';
import type { FastifyInstance, RouteShorthandOptions } from 'fastify';
import { TranscriptResultSchema } from '@trail/contracts';
import type { AiProvider } from '../ai/provider.js';

// One shared process allowance, including failed provider calls. Restarting the server resets it.
const LIMIT = 120;
const MAX_BYTES = 44 + 48000 * 2 * 6;
/** Bounded PCM prevents a client from claiming a short duration for hours of compressed audio. */
export function commandAudioDuration(body: Buffer): number | null {
  if (body.length < 46 || body.length > MAX_BYTES || body.toString('ascii', 0, 4) !== 'RIFF' || body.toString('ascii', 8, 16) !== 'WAVEfmt ' || body.toString('ascii', 36, 40) !== 'data') return null;
  const rate = body.readUInt32LE(24), bytes = body.length - 44;
  if (body.readUInt32LE(4) !== body.length - 8 || body.readUInt32LE(16) !== 16 || body.readUInt16LE(20) !== 1 || body.readUInt16LE(22) !== 1 || rate < 8000 || rate > 48000 || body.readUInt16LE(34) !== 16 || body.readUInt16LE(32) !== 2 || body.readUInt32LE(28) !== rate * 2 || body.readUInt32LE(40) !== bytes || bytes % 2) return null;
  const duration = bytes / (rate * 2) * 1000;
  return duration >= 200 && duration <= 6000 ? duration : null;
}
export function registerVoiceCommands(app: FastifyInstance, provider: AiProvider, guard: RouteShorthandOptions) {
  let attempts = 0, busy = false, nextAt = 0;
  const speechTickets = new Map<string, number>();
  const ticket = () => { for (const [id, expires] of speechTickets) if (expires < Date.now()) speechTickets.delete(id); const id = randomUUID(); speechTickets.set(id, Date.now() + 30000); return id; };
  // One short spoken acknowledgement per interpreted clip; no unrestricted TTS endpoint.
  app.post('/api/voice/speech', { ...guard, bodyLimit: 2048 }, async (request, reply) => {
    const parsed = z.object({ ticket: z.string().uuid(), text: z.string().trim().min(1).max(240) }).strict().safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'invalid_reply' });
    const expires = speechTickets.get(parsed.data.ticket); speechTickets.delete(parsed.data.ticket);
    if (!expires || expires < Date.now()) return reply.code(403).send({ error: 'reply_expired' });
    if (!provider.speak) return reply.code(503).send({ error: 'speech_unavailable' });
    try { const bytes = await provider.speak(parsed.data.text, AbortSignal.timeout(10000)); if (bytes.length > 1024 * 1024) throw Error('Reply too large'); return reply.header('Cache-Control','no-store').type('audio/mpeg').send(Buffer.from(bytes)); }
    catch { return reply.code(503).send({ error: 'speech_unavailable' }); }
  });
  const status = () => ({ enabled: provider.name === 'openai', attempts, limit: LIMIT, remaining: LIMIT - attempts });
  app.post('/api/voice/commands/status', guard, async (_request, reply) => reply.header('Cache-Control', 'no-store').send(status()));
  app.post('/api/voice/commands', { ...guard, bodyLimit: MAX_BYTES }, async (request, reply) => {
    reply.header('Cache-Control', 'no-store');
    if (provider.name !== 'openai') return reply.code(503).send({ error: 'voice_unavailable', message: 'Voice commands need the configured transcription provider. Mock speech never controls the tutorial.' });
    if (!Buffer.isBuffer(request.body) || commandAudioDuration(request.body) === null) return reply.code(400).send({ error: 'invalid_audio', message: 'Send 0.2–6 seconds of mono PCM16 WAV.' });
    let context;
    try { context = VoiceIntentContextSchema.parse(JSON.parse(decodeURIComponent(String(request.headers['x-trail-voice-context'] || '')))); }
    catch { return reply.code(400).send({ error: 'invalid_context', message: 'Voice context changed. Reopen voice controls.' }); }
    if (busy || Date.now() < nextAt || attempts >= LIMIT) return reply.code(429).header('Retry-After', '3').send({ error: 'voice_limit', message: attempts >= LIMIT ? 'Voice command allowance used. Buttons still work.' : 'One voice command at a time. Try again shortly.', ...status() });
    busy = true; attempts++; nextAt = Date.now() + 2500;
    try {
      const body = request.body;
      const result = TranscriptResultSchema.parse(await provider.transcribe({ bytes: new Uint8Array(body.buffer as ArrayBuffer, body.byteOffset, body.byteLength), mimeType: 'audio/wav', audioStartOffsetMs: 0, audioDurationHintMs: commandAudioDuration(body), signal: AbortSignal.timeout(10_000) }));
      // Fixture/fallback text must never be interpreted as a real user's command.
      if (result.source !== 'model') return reply.code(503).send({ error: 'voice_unavailable', message: 'No live transcription was returned.' });
      const text = result.spans.map(s => s.text).join(' ').slice(0, 500);
      if (!provider.interpretCommand) return reply.code(503).send({ error: 'voice_unavailable', message: 'Natural voice control is not configured.' });
      const intent = VoiceIntentSchema.parse(directVoiceIntent(text,context) ?? await provider.interpretCommand(text, context, AbortSignal.timeout(8_000)));
      if (intent.action !== 'none' && !context.allowed.includes(intent.action)) return { action: 'none', response: 'That action is not available here.', ...status() };
      return { ...intent, speechTicket: intent.action !== 'none' || intent.response ? ticket() : null, ...status() };
    } catch {
      return reply.code(503).send({ error: 'voice_unavailable', message: 'Could not hear that command. Try again or use the controls.' });
    } finally { busy = false; }
  });
}
