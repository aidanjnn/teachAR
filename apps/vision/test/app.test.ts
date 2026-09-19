import healthFixture from '../../../fixtures/vision-health.v1.json';
import { describe, expect, it } from 'vitest';
import { VisionHealthSchema, VisionReadinessSchema } from '@trail/contracts';
import { createVisionApp } from '../src/app.js';
import { readConfig } from '../src/config.js';

const token = 'synthetic-service-token-for-tests-0001';
const headers = { authorization: `Bearer ${token}` };
describe('dedicated vision skeleton', () => {
  it('authenticates every route and separates liveness from image readiness', async () => {
    const app = createVisionApp(readConfig({ VISION_SERVICE_TOKEN: token, BUILD_ID: 'fixture-build' }));
    try {
      for (const url of ['/internal/v1/health', '/internal/v1/ready', '/unknown']) {
        expect((await app.inject(url)).statusCode).toBe(401);
        expect((await app.inject({ url, headers: { authorization: 'Bearer wrong' } })).statusCode).toBe(401);
      }
      const health = await app.inject({ url: '/internal/v1/health', headers });
      expect(health.statusCode).toBe(200);
      expect(VisionHealthSchema.parse(health.json())).toEqual(healthFixture);
      expect(health.body).not.toContain(token);
      const ready = await app.inject({ url: '/internal/v1/ready', headers });
      expect(ready.statusCode).toBe(503);
      expect(VisionReadinessSchema.parse(ready.json()).ready).toBe(false);
    } finally { await app.close(); }
  });
  it('does not parse, store or pretend to assess camera inputs before implementation', async () => {
    const app = createVisionApp(readConfig({ VISION_SERVICE_TOKEN: token, BUILD_ID: 'fixture-build' }));
    try {
      expect((await app.inject({ method: 'POST', url: '/internal/v1/inspections', payload: 'untrusted' })).statusCode).toBe(401);
      const response = await app.inject({ method: 'POST', url: '/internal/v1/inspections', headers: { ...headers, 'content-type': 'image/jpeg' }, payload: Buffer.alloc(100_000) });
      expect(response.statusCode).toBe(501);
      expect(response.json()).toEqual({ schemaVersion: 1, error: 'vision-not-implemented' });
    } finally { await app.close(); }
  });
  it.each([
    {}, { VISION_SERVICE_TOKEN: 'short' }, { VISION_SERVICE_TOKEN: token, VISION_PROVIDER: 'openai' },
    { VISION_SERVICE_TOKEN: token, VISION_HOST: '0.0.0.0' },
    { VISION_SERVICE_TOKEN: token, VISION_PORT: '0' },
  ])('fails closed for missing auth or unsupported provider/listener settings', env => {
    expect(() => readConfig(env)).toThrow('Invalid vision configuration');
  });
});
