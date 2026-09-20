import { readVisionJson } from './response.js';
import { VisionHealthSchema, type VisionDependency } from '@trail/contracts';

export interface VisionConnection { url: string; token: string }
/** Bounded liveness probe only; reaching the skeleton never means vision is ready. */
export async function probeVision(connection: VisionConnection | null): Promise<VisionDependency> {
  if (!connection) return { status: 'disabled' };
  try {
    const response = await fetch(new URL('/internal/v1/health', connection.url), {
      headers: { authorization: `Bearer ${connection.token}` },
      signal: AbortSignal.timeout(1500), redirect: 'error',
    });
    if (!response.ok) {
      await response.body?.cancel().catch(() => undefined);
      return { status: 'unavailable' };
    }
    return { status: 'reachable', health: VisionHealthSchema.parse(await readVisionJson(response, 8192)) };
  } catch { return { status: 'unavailable' }; }
}
