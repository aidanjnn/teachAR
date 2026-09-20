import { VisionFailureSchema, VisionInspectionResultSchema, type VisionInspectionInput, type VisionInspectionResult } from '@trail/contracts';
import { InspectionError, readVisionJson } from './response.js';
import type { VisionConnection } from './client.js';

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
    const raw = await readVisionJson(response, 32 * 1024);
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
