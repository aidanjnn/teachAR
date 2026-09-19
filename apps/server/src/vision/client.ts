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
    if (!response.ok || !response.body) return { status: 'unavailable' };
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let length = 0;
    try {
      while (true) {
        const chunk = await reader.read();
        if (chunk.done) break;
        length += chunk.value.byteLength;
        if (length > 8192) { await reader.cancel(); return { status: 'unavailable' }; }
        chunks.push(chunk.value);
      }
    } finally { reader.releaseLock(); }
    return { status: 'reachable', health: VisionHealthSchema.parse(JSON.parse(Buffer.concat(chunks).toString('utf8'))) };
  } catch { return { status: 'unavailable' }; }
}
