import { afterEach, expect, it, vi } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import { createVisionApp } from '../../vision/src/app.js';
import { readConfig as readVisionConfig } from '../../vision/src/config.js';
import { probeVision } from '../src/vision/client.js';
import { readVisionJson } from '../src/vision/response.js';
import { readConfig } from '../src/config.js';

const token = 'synthetic-service-token-for-tests-0001';
const apps: FastifyInstance[] = [];
afterEach(async () => { await Promise.all(apps.splice(0).map(app => app.close())); });
it('bounds streamed vision bytes and cancels overflow before releasing the reader', async () => {
  const cancel = vi.fn();
  const body = new ReadableStream<Uint8Array>({
    start(controller) { controller.enqueue(new TextEncoder().encode('{"x":')); controller.enqueue(new TextEncoder().encode('123}')); },
    cancel,
  });
  await expect(readVisionJson(new Response(body), 8)).rejects.toMatchObject({ code: 'invalid-assessment', status: 502 });
  expect(cancel).toHaveBeenCalledOnce();
  expect(body.locked).toBe(false);
  await expect(readVisionJson(new Response('{"x":12}'), 8)).resolves.toEqual({ x: 12 });
});
it.each(['{"x":1,"x":2}', '{broken'])('rejects invalid vision JSON and releases its stream: %s', async text => {
  const response = new Response(text);
  await expect(readVisionJson(response, 32 * 1024)).rejects.toThrow();
  expect(response.body?.locked).toBe(false);
});
it('probes the separately listening vision service and detects auth failure/outage', async () => {
  const vision = createVisionApp(readVisionConfig({ VISION_SERVICE_TOKEN: token }));
  apps.push(vision);
  const url = await vision.listen({ host: '127.0.0.1', port: 0 });
  expect(await probeVision(null)).toEqual({ status: 'disabled' });
  const healthy = await probeVision({ url, token });
  expect(healthy.status).toBe('reachable');
  if (healthy.status === 'reachable') expect(healthy.health.capabilities.imageInterpretation).toBe(false);
  expect(await probeVision({ url, token: 'wrong' })).toEqual({ status: 'unavailable' });
  await vision.close(); apps.pop();
  expect(await probeVision({ url, token })).toEqual({ status: 'unavailable' });
});
it.each(['oversized', 'malformed', 'redirect'])('bounds and validates a %s service response', async mode => {
  const app = Fastify(); apps.push(app);
  app.get('/internal/v1/health', (_request, reply) => {
    if (mode === 'redirect') return reply.redirect('http://127.0.0.1:1/');
    return mode === 'oversized' ? 'x'.repeat(9000) : { status: 'ok', capabilities: { imageInterpretation: true } };
  });
  const url = await app.listen({ host: '127.0.0.1', port: 0 });
  expect(await probeVision({ url, token })).toEqual({ status: 'unavailable' });
});
it('requires an authenticated loopback origin when the vision dependency is enabled', () => {
  expect(readConfig({ VISION_SERVICE_URL: '', VISION_SERVICE_TOKEN: '' }).vision).toBeNull();
  for (const url of ['not-a-url-with-private-value', 'http://example.com', 'http://127.0.0.1/path', 'http://user:pass@127.0.0.1', 'http://127.0.0.1#fragment']) {
    expect(() => readConfig({ VISION_SERVICE_URL: url, VISION_SERVICE_TOKEN: token })).toThrow('Invalid server configuration');
  }
  expect(() => readConfig({ VISION_SERVICE_URL: 'http://127.0.0.1:3002' })).toThrow('VISION_SERVICE_TOKEN');
});
