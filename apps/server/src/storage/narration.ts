import type { Recording } from '@trail/contracts';
import { StoreError } from './files.js';

export const MAX_WAV_BYTES = 12 * 1024 * 1024;
/** Canonical native PCM16 mono WAV only. Header claims never substitute for byte validation. */
export function validateNarration(bytes: Buffer, audio: Recording['audio']) {
  if (!audio || audio.assetId !== 'narration' || audio.mimeType !== 'audio/wav' || audio.audioStartOffsetMs !== 0)
    throw new StoreError(422, 'Expected aligned native narration metadata');
  if (bytes.length < 46 || bytes.length > MAX_WAV_BYTES || bytes.toString('ascii', 0, 4) !== 'RIFF' ||
      bytes.readUInt32LE(4) !== bytes.length - 8 || bytes.toString('ascii', 8, 16) !== 'WAVEfmt ' ||
      bytes.readUInt32LE(16) !== 16 || bytes.readUInt16LE(20) !== 1 || bytes.readUInt16LE(22) !== 1 ||
      bytes.readUInt16LE(32) !== 2 || bytes.readUInt16LE(34) !== 16 || bytes.toString('ascii', 36, 40) !== 'data' ||
      bytes.readUInt32LE(40) !== bytes.length - 44 || (bytes.length - 44) % 2 !== 0)
    throw new StoreError(422, 'Expected a complete canonical mono PCM16 WAV');
  const sampleRate = bytes.readUInt32LE(24);
  if (![16000, 24000, 48000].includes(sampleRate) || bytes.readUInt32LE(28) !== sampleRate * 2)
    throw new StoreError(422, 'Unsupported narration sample rate');
  const durationMs = (bytes.length - 44) / (sampleRate * 2) * 1000;
  if (durationMs > 120000 || Math.abs(audio.durationMs - durationMs) > 1000 / sampleRate + 1e-6)
    throw new StoreError(422, 'Narration duration does not match its samples');
  return { durationMs, sampleRate };
}
