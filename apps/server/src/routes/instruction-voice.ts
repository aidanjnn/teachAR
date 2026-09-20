import { z } from 'zod';
import type { FastifyInstance, RouteShorthandOptions } from 'fastify';
import type { AiProvider } from '../ai/provider.js';
import { TranscriptResultSchema, LabelResultSchema } from '@trail/contracts';

// Separate authoring allowance, shared by all clients in this server process.
// Failed calls consume attempts too; saved audio is replayed locally thereafter.
export function registerInstructionVoice(app: FastifyInstance, provider: AiProvider, guard: RouteShorthandOptions) {
  let attempts = 0, busy = false, nextAt = 0;
  async function run(reply: import('fastify').FastifyReply, work: () => Promise<unknown>) {
    reply.header('Cache-Control', 'no-store');
    if (provider.name !== 'openai') return reply.code(503).send({ message: 'Pair with the AI server to polish recorded instructions. Mock narration is never used.' });
    if (busy || Date.now() < nextAt || attempts >= 48) return reply.code(429).header('Retry-After', '2').send({ message: attempts >= 48 ? 'Instruction allowance used (48 requests this server run). Saved audio still plays.' : 'Another instruction is processing. Try again shortly.' });
    busy = true; attempts++; nextAt = Date.now() + 2000;
    try { return await work(); }
    catch { return reply.code(503).send({ message: 'Could not prepare this instruction. Your original recording is unchanged.' }); }
    finally { busy = false; }
  }
  app.post('/api/voice/polish', { ...guard, bodyLimit: 44 + 16000 * 2 * 120 }, async (request, reply) => {
    const b = request.body;
    // Browser narration is a canonical 16 kHz mono PCM WAV. Derive duration from bytes.
    if (!Buffer.isBuffer(b) || b.length < 46 || b.toString('ascii', 0, 4) !== 'RIFF' || b.toString('ascii', 8, 16) !== 'WAVEfmt ' || b.toString('ascii', 36, 40) !== 'data' || b.readUInt32LE(4) !== b.length - 8 || b.readUInt32LE(16) !== 16 || b.readUInt16LE(20) !== 1 || b.readUInt16LE(22) !== 1 || b.readUInt32LE(24) !== 16000 || b.readUInt32LE(28) !== 32000 || b.readUInt16LE(32) !== 2 || b.readUInt16LE(34) !== 16 || b.readUInt32LE(40) !== b.length - 44 || (b.length - 44) % 2) return reply.code(400).send({ message: 'Use a recorded step of at most two minutes.' });
    const duration = (b.length - 44) / 32;
    return run(reply, async () => {
      const transcript = TranscriptResultSchema.parse(await provider.transcribe({ bytes: new Uint8Array(b.buffer as ArrayBuffer, b.byteOffset, b.byteLength), mimeType: 'audio/wav', audioStartOffsetMs: 0, audioDurationHintMs: duration, signal: AbortSignal.timeout(60000) }));
      if (transcript.source !== 'model' || !transcript.spans.length) throw Error('No real narration');
      const result = LabelResultSchema.parse(await provider.label({ schemaVersion: 1, segments: [{ id: 'instruction', startMs: 0, endMs: Math.round(duration) }], transcript }, AbortSignal.timeout(30000)));
      const label = result.labels[0];
      if (result.provenance.labels !== 'model' || result.labels.length !== 1 || !label || label.stepId !== 'instruction' || label.instruction.length > 240 || label.title.length > 60) throw Error('No polished instruction');
      return { title: label.title, instruction: label.instruction, needsReview: label.needsReview, transcript: transcript.spans.map(s => s.text).join(' ').slice(0, 4000) };
    });
  });
  app.post('/api/voice/instruction-audio', { ...guard, bodyLimit: 2048 }, async (request, reply) => {
    const parsed = z.object({ text: z.string().trim().min(1).max(240), approved: z.literal(true) }).strict().safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ message: 'Review and approve the instruction before generating its voice.' });
    return run(reply, async () => {
      if (!provider.speak) throw Error('Speech unavailable');
      const bytes = await provider.speak(parsed.data.text, AbortSignal.timeout(20000));
      if (!bytes.length || bytes.length > 1024 * 1024) throw Error('Invalid speech');
      return reply.type('audio/mpeg').send(Buffer.from(bytes));
    });
  });
}
