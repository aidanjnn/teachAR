import { z } from 'zod';

export const IdSchema = z.string().min(1).max(128);
export const MAX_RECORDING_DURATION_MS = 120_000;
export const AUDIO_MIME_TYPES = [
  'audio/webm', 'audio/webm;codecs=opus', 'audio/ogg', 'audio/ogg;codecs=opus', 'audio/mp4', 'audio/wav',
] as const;
export const AudioMimeTypeSchema = z.enum(AUDIO_MIME_TYPES);
export type AudioMimeType = z.infer<typeof AudioMimeTypeSchema>;
