import { createHash } from 'node:crypto';
import sharp from 'sharp';
import { VisionError } from './errors.js';

export const MAX_IMAGE_BYTES = 2 * 1024 * 1024;
export const MAX_EDGE = 1280;
export const MAX_BODY_BYTES = 3 * Math.ceil(MAX_IMAGE_BYTES / 3) * 4 + 64 * 1024;
export interface EncodedImage {
  mimeType: 'image/png' | 'image/jpeg'; dataBase64: string; sha256: string; width: number; height: number;
}

/** Full decode with a pixel ceiling; re-encode strips metadata/extra trailing payloads. */
export async function validateImage(image: EncodedImage, signal: AbortSignal): Promise<EncodedImage> {
  signal.throwIfAborted();
  if (image.dataBase64.length > Math.ceil(MAX_IMAGE_BYTES / 3) * 4) throw new VisionError('invalid-image');
  const bytes = Buffer.from(image.dataBase64, 'base64');
  if (!bytes.length || bytes.length > MAX_IMAGE_BYTES || bytes.toString('base64') !== image.dataBase64 ||
      createHash('sha256').update(bytes).digest('hex') !== image.sha256) throw new VisionError('invalid-image');
  const decoder = sharp(bytes, { failOn: 'warning', limitInputPixels: MAX_EDGE * MAX_EDGE, animated: false });
  const abort = () => decoder.destroy();
  signal.addEventListener('abort', abort, { once: true });
  try {
    const meta = await decoder.metadata();
    if (meta.format !== (image.mimeType === 'image/png' ? 'png' : 'jpeg') ||
        !meta.width || !meta.height || meta.width > MAX_EDGE || meta.height > MAX_EDGE ||
        meta.width !== image.width || meta.height !== image.height || (meta.pages ?? 1) !== 1) throw new VisionError('invalid-image');
    // toBuffer forces decoding all scanlines; metadata() alone accepts truncated files.
    const clean = await decoder.rotate().png().toBuffer({ resolveWithObject: true });
    signal.throwIfAborted();
    if (clean.data.length > MAX_IMAGE_BYTES) throw new VisionError('invalid-image');
    return { mimeType: 'image/png', dataBase64: clean.data.toString('base64'),
      sha256: createHash('sha256').update(clean.data).digest('hex'), width: clean.info.width, height: clean.info.height };
  } catch (error) {
    if (signal.aborted) throw signal.reason;
    throw error instanceof VisionError ? error : new VisionError('invalid-image');
  } finally {
    signal.removeEventListener('abort', abort);
    decoder.destroy();
    bytes.fill(0);
  }
}
