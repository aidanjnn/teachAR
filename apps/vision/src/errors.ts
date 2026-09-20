import type { VisionFailure } from '@trail/contracts';
/** Never forward decoder/provider messages: they may contain images, prompts or credentials. */
export class VisionError extends Error {
  constructor(public readonly code: VisionFailure['error'], public readonly status = 400) {
    super(code);
  }
}
export function failure(error: unknown): VisionError {
  return error instanceof VisionError ? error : new VisionError('provider-unavailable', 503);
}

/** Settle at the deadline even when an injected/broken provider ignores AbortSignal. */
export async function abortable<T>(work: Promise<T>, signal: AbortSignal): Promise<T> {
  signal.throwIfAborted();
  let onAbort: () => void = () => undefined;
  try {
    return await Promise.race([work, new Promise<never>((_resolve, reject) => {
      onAbort = () => reject(signal.reason);
      signal.addEventListener('abort', onAbort, { once: true });
      if (signal.aborted) onAbort();
    })]);
  } finally { signal.removeEventListener('abort', onAbort); }
}
