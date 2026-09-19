import { describe, expect, it } from 'vitest';
import { createOpenAiGateway } from '../../src/ai/openai-gateway.js';

describe('openai gateway sideband', () => {
  it('reports an asynchronous socket failure through the channel instead of an unhandled rejection', async () => {
    // Port 1 on loopback refuses immediately; the real pinned SDK and ws client are used, no network leaves the machine.
    const gateway = createOpenAiGateway('test-key', { baseURL: 'http://127.0.0.1:1' });
    const channel = gateway.openSideband('live_test');
    const errors: string[] = [];
    let closed = 0;
    channel.onError(error => { errors.push(error.message); });
    channel.onClose(() => { closed += 1; });
    await expect(channel.ready).rejects.toBeInstanceOf(Error);
    await new Promise(resolve => setTimeout(resolve, 50));
    expect(errors.length + closed).toBeGreaterThan(0);
    expect(() => channel.close()).not.toThrow();
  });
});
