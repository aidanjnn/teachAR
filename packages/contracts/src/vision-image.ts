import { z } from 'zod';
import { HashSchema } from './common.js';
export const VisionImageSchema = z.strictObject({
  mimeType: z.enum(['image/png', 'image/jpeg']), dataBase64: z.string().min(4).max(2_796_204),
  sha256: HashSchema, width: z.number().int().min(1).max(1280), height: z.number().int().min(1).max(1280),
});
export type VisionImage = z.infer<typeof VisionImageSchema>;
