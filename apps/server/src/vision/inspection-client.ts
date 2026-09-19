import { VisionFailureSchema, VisionInspectionResultSchema, type VisionInspectionInput, type VisionInspectionResult } from '@trail/contracts';
import type { VisionConnection } from './client.js';

export class InspectionError extends Error {
  constructor(public readonly code: 'invalid-input' | 'invalid-image' | 'busy' | 'conflict' | 'cancelled' | 'deadline' | 'provider-unavailable' | 'invalid-assessment' | 'stale', public readonly status = 400) { super(code); }
}
async function boundedJson(response: Response): Promise<unknown> {
  if (!response.body) throw new InspectionError('provider-unavailable', 503);
  const reader = response.body.getReader(); const chunks: Uint8Array[] = []; let length = 0;
  try {
    while (true) {
      const next = await reader.read(); if (next.done) break;
      length += next.value.length;
      if (length > 32 * 1024) throw new InspectionError('invalid-assessment', 502);
      chunks.push(next.value);
    }
    return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown;
  } finally { await reader.cancel().catch(() => undefined); reader.releaseLock(); }
}
/** No retry: a crash/timeout must not silently inspect the old image again. */
export async function inspectVision(connection: VisionConnection | null, input: VisionInspectionInput, signal: AbortSignal): Promise<VisionInspectionResult> {
  if (!connection) throw new InspectionError('provider-unavailable', 503);
  const cancel = () => { void cancelVision(connection, input.request.requestId, input.request.requestEpoch); };
  signal.addEventListener('abort', cancel, { once: true });
  try {
    signal.throwIfAborted();
    const response = await fetch(new URL('/internal/v1/inspections', connection.url), {
      method: 'POST', headers: { authorization: `Bearer ${connection.token}`, 'content-type': 'application/json' },
      body: JSON.stringify(input), redirect: 'error', signal,
    });
    const raw = await boundedJson(response);
    if (!response.ok) {
      const error = VisionFailureSchema.safeParse(raw);
      throw new InspectionError(error.success ? error.data.error : 'provider-unavailable', response.status);
    }
    const result = VisionInspectionResultSchema.safeParse(raw);
    if (!result.success) throw new InspectionError('invalid-assessment', 502);
    return result.data;
  } catch (error) {
    if (signal.aborted) throw signal.reason;
    if (error instanceof InspectionError) throw error;
    throw new InspectionError('provider-unavailable', 503);
  } finally { signal.removeEventListener('abort', cancel); }
}
export async function cancelVision(connection: VisionConnection, requestId: string, epoch: number): Promise<void> {
  try {
    const response = await fetch(new URL(`/internal/v1/inspections/${encodeURIComponent(requestId)}?epoch=${epoch}`, connection.url), {
      method: 'DELETE', headers: { authorization: `Bearer ${connection.token}` }, signal: AbortSignal.timeout(1000), redirect: 'error',
    });
    await response.body?.cancel();
  } catch { /* The original request stays invalid even if cancellation cannot reach vision. */ }
}
