import { parseContractJson, type VisionFailure } from '@trail/contracts';
import { z } from 'zod';

export class InspectionError extends Error {
  constructor(public readonly code: VisionFailure['error'], public readonly status = 400) { super(code); }
}
export async function readVisionJson(response: Response, maxBytes: number): Promise<unknown> {
  if (!response.body) throw new InspectionError('provider-unavailable', 503);
  const reader = response.body.getReader(); const chunks: Uint8Array[] = []; let length = 0;
  try {
    while (true) {
      const next = await reader.read(); if (next.done) break;
      length += next.value.length;
      if (length > maxBytes) throw new InspectionError('invalid-assessment', 502);
      chunks.push(next.value);
    }
    return parseContractJson(z.unknown(), Buffer.concat(chunks).toString('utf8'));
  } finally { await reader.cancel().catch(() => undefined); reader.releaseLock(); }
}
