import { createHash } from 'node:crypto';
import { describe, it, expect } from 'vitest';
import { createVisionApp } from '../src/app.js';
import { readConfig } from '../src/config.js';
import { InspectionJobs } from '../src/jobs.js';
import { createOpenAIProvider, validateAssessment } from '../src/provider.js';
import { validateImage } from '../src/images.js';
import { assessment, input, image, token, auth } from './fixtures.js';

const config = () => readConfig({ VISION_SERVICE_TOKEN: token });
describe('bounded image inspection', () => {
  it.each(['visible-match', 'adjustment-needed', 'uncertain'] as const)('returns explicit synthetic %s evidence with bound identity', async verdict => {
    const app = createVisionApp(config(), { provider: { name: 'mock', model: 'synthetic-test', assess: async () => assessment(verdict) } });
    try {
      const payload = await input();
      const response = await app.inject({ method: 'POST', url: '/internal/v1/inspections', headers: auth, payload });
      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({ requestId: payload.request.requestId, requestEpoch: 1, observationId: 'observation-1', provider: 'mock', assessment: { verdict } });
      expect((await app.inject({ method: 'POST', url: '/internal/v1/inspections', headers: auth, payload })).statusCode).toBe(409);
    } finally { await app.close(); }
  });
  it('default mock is unavailable and never invents a verdict', async () => {
    const app = createVisionApp(config());
    try {
      const response = await app.inject({ method: 'POST', url: '/internal/v1/inspections', headers: auth, payload: await input() });
      expect(response.statusCode).toBe(503); expect(response.json().error).toBe('provider-unavailable');
    } finally { await app.close(); }
  });
  it('deduplicates active payloads, rejects conflicts/excess admission, and cancels exact epoch', async () => {
    let calls = 0; let finish!: (value: ReturnType<typeof assessment>) => void;
    const jobs = new InspectionJobs({ name: 'mock', model: 'test', assess: async () => { calls++; return new Promise(resolve => { finish = resolve; }); } });
    const body = await input();
    const first = jobs.inspect(body); const duplicate = jobs.inspect(body);
    const firstRejected = expect(first).rejects.toMatchObject({ code: 'cancelled' });
    const duplicateRejected = expect(duplicate).rejects.toMatchObject({ code: 'cancelled' });
    await expect(jobs.inspect({ ...body, request: { ...body.request, question: 'different' } })).rejects.toMatchObject({ code: 'conflict' });
    await expect(jobs.inspect({ ...body, request: { ...body.request, requestId: 'another' }, observation: { ...body.observation, requestId: 'another' } })).rejects.toMatchObject({ code: 'busy' });
    await expect.poll(() => calls).toBe(1);
    expect(() => jobs.cancel('request-1', 2)).toThrow('conflict');
    jobs.cancel('request-1', 1); await firstRejected; await duplicateRejected;
    expect(jobs.ready).toBe(false); // ignored cancellation still holds admission until actual provider settles
    finish(assessment()); await expect.poll(() => jobs.ready).toBe(true);
    expect(calls).toBe(1);
  });
  it('preserves timeout even for a provider that ignores cancellation', async () => {
    let finish!: (value: ReturnType<typeof assessment>) => void;
    const jobs = new InspectionJobs({ name: 'mock', model: 'test', assess: async () => new Promise(resolve => { finish = resolve; }) });
    const body = await input(); body.remainingBudgetMs = 30;
    await expect(jobs.inspect(body)).rejects.toMatchObject({ code: 'deadline' });
    expect(jobs.ready).toBe(false); finish(assessment());
  });
  it.each(['hash', 'mime', 'dimensions', 'truncated', 'base64'] as const)('rejects %s mismatch before provider use', async mode => {
    const img = await image();
    if (mode === 'hash') img.sha256 = '0'.repeat(64);
    if (mode === 'mime') img.mimeType = 'image/jpeg';
    if (mode === 'dimensions') img.width++;
    if (mode === 'base64') img.dataBase64 += '\n';
    if (mode === 'truncated') {
      const bytes = Buffer.from(img.dataBase64, 'base64').subarray(0, 50);
      img.dataBase64 = bytes.toString('base64'); img.sha256 = createHash('sha256').update(bytes).digest('hex');
    }
    await expect(validateImage(img, new AbortController().signal)).rejects.toMatchObject({ code: 'invalid-image' });
  });
  it('rejects excessive decoded dimensions and body bytes', async () => {
    await expect(validateImage(await image(1281, 1), new AbortController().signal)).rejects.toMatchObject({ code: 'invalid-image' });
    const app = createVisionApp(config(), { provider: { name: 'mock', model: 'test', assess: async () => assessment() } });
    try {
      const response = await app.inject({ method: 'POST', url: '/internal/v1/inspections', headers: { ...auth, 'content-type': 'application/json' }, payload: 'x'.repeat(9 * 1024 * 1024) });
      expect(response.statusCode).toBe(413); expect(response.body.length).toBeLessThan(100);
    } finally { await app.close(); }
  });
  it('rejects stale or mismatched evidence and model-supplied identity/coordinates', async () => {
    const jobs = new InspectionJobs(null); const body = await input();
    body.observation.requestId = 'other'; await expect(jobs.inspect(body)).rejects.toMatchObject({ code: 'invalid-input' });
    expect(() => validateAssessment({ ...assessment(), coordinates: [0, 1, 2] })).toThrow('invalid-assessment');
    expect(() => validateAssessment({ ...assessment(), observedEvidence: [] })).toThrow('invalid-assessment');
    expect(() => validateAssessment({ ...assessment(), feedback: 'Assembly verified.' })).toThrow('invalid-assessment');
    expect(() => validateAssessment({ ...assessment('uncertain'), suggestedAction: 'none' })).toThrow('invalid-assessment');
  });
  it('sends actual labelled images using Responses structured outputs with no retention request', async () => {
    let sent: Record<string, unknown> = {};
    const provider = createOpenAIProvider('synthetic-secret', 'configured-image-model', async (url, options) => {
      expect(url).toBe('https://api.openai.com/v1/responses');
      sent = JSON.parse(options!.body as string);
      return Response.json({ status: 'completed', output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify(assessment()) }] }] });
    });
    expect((await provider.assess(await input(), new AbortController().signal)).verdict).toBe('visible-match');
    expect(sent).toMatchObject({ store: false, model: 'configured-image-model', text: { format: { type: 'json_schema', strict: true } } });
    const content = (sent.input as Array<{ content: Array<{ type: string }> }>)[0]!.content;
    expect(content.filter(item => item.type === 'input_image')).toHaveLength(2);
    expect(JSON.stringify(sent)).toContain('expertReference');
  });
  it.each(['refusal', 'incomplete', 'oversized', 'invalid-json'])('rejects %s provider output without leaking content', async mode => {
    const provider = createOpenAIProvider('synthetic-secret', 'test', async () => mode === 'oversized' ? new Response('x'.repeat(70_000)) :
      Response.json({ status: mode === 'incomplete' ? 'incomplete' : 'completed', output: [{ type: 'message', content: mode === 'refusal'
        ? [{ type: 'refusal', refusal: 'no' }] : [{ type: 'output_text', text: 'not JSON with secret' }] }] }));
    await expect(provider.assess(await input(), new AbortController().signal)).rejects.toThrow('invalid-assessment');
  });
});
it('rejects duplicate JSON keys at the service boundary before provider work', async () => {
  let calls = 0;
  const app = createVisionApp(config(), { provider: { name: 'mock', model: 'test', assess: async () => { calls++; return assessment(); } } });
  try {
    const json = JSON.stringify(await input()).replace('"schemaVersion":1', '"schemaVersion":1,"schemaVersion":1');
    const response = await app.inject({ method: 'POST', url: '/internal/v1/inspections', headers: { ...auth, 'content-type': 'application/json' }, payload: json });
    expect(response.statusCode).toBe(400); expect(calls).toBe(0);
  } finally { await app.close(); }
});
it('rejects animated PNG control chunks before decoding', async () => {
  const img = await image(); const raw = Buffer.from(img.dataBase64, 'base64');
  const animation = Buffer.alloc(20); animation.writeUInt32BE(8, 0); animation.write('acTL', 4, 'ascii');
  const data = Buffer.concat([raw.subarray(0, 33), animation, raw.subarray(33)]);
  await expect(validateImage({ ...img, dataBase64: data.toString('base64'), sha256: createHash('sha256').update(data).digest('hex') }, new AbortController().signal))
    .rejects.toMatchObject({ code: 'invalid-image' });
});
