import { fork, type ChildProcess } from 'node:child_process';
import { once } from 'node:events';
import { request } from 'node:http';
import { fileURLToPath } from 'node:url';
import { afterEach, expect, it } from 'vitest';
import type { InspectionCapture } from '@trail/contracts';
import { input } from './fixtures.js';
const children = new Set<ChildProcess>();
afterEach(async () => {
  await Promise.all([...children].map(async child => { if (child.exitCode !== null || child.signalCode !== null) return;
    child.kill('SIGTERM'); const timer = setTimeout(() => child.kill('SIGKILL'), 1500); await once(child, 'exit'); clearTimeout(timer); }));
  children.clear();
});
async function worker(service: 'main' | 'vision', port = 0, vision = '') {
  const child = fork(fileURLToPath(new URL('./process-worker.ts', import.meta.url)), [], {
    execArgv: ['--import', 'tsx'], env: { ...process.env, TEST_SERVICE: service, TEST_PORT: String(port), TEST_VISION_URL: vision },
    stdio: ['ignore', 'ignore', 'pipe', 'ipc'],
  }); children.add(child);
  let error = ''; child.stderr?.on('data', chunk => { error += String(chunk); });
  const ready = await Promise.race([once(child, 'message'), once(child, 'exit').then(() => { throw new Error(`worker exited: ${error}`); })]);
  const data = ready[0] as { port: number; code?: string };
  return { child, url: `http://127.0.0.1:${data.port}`, ...data };
}
async function mode(child: ChildProcess, value: string) { const changed = once(child, 'message'); child.send({ mode: value }); await changed; }
// Node fetch adds Sec-Fetch-Mode: cors, which correctly disqualifies native pairing.
function pairNative(url: string, code: string | undefined): Promise<Response> {
  return new Promise((resolve, reject) => {
    const req = request(`${url}/api/pair`, { method: 'POST', headers: { 'content-type': 'application/json' } }, res => {
      let body = ''; res.setEncoding('utf8');
      res.on('data', chunk => { body += String(chunk); });
      res.on('error', reject);
      res.on('end', () => resolve(new Response(body, { status: res.statusCode ?? 500 })));
    });
    req.on('error', reject);
    req.setTimeout(5000, () => req.destroy(new Error('Native pairing timed out')));
    req.end(JSON.stringify({ code, client: 'native' }));
  });
}
it('runs authenticated main and vision processes through wrong/obscured, cancellation, crash and recovery', async () => {
  let vision = await worker('vision');
  const main = await worker('main', 0, vision.url);
  const paired = await pairNative(main.url, main.code);
  expect(paired.status).toBe(200);
  const credential = await paired.json() as { token: string };
  const headers = { 'content-type': 'application/json', authorization: `Bearer ${credential.token}` };
  const fixture = await input(); let epoch = 0; let sequence = 1;
  async function start() {
    const r = fixture.request;
    const response = await fetch(`${main.url}/api/inspections`, { method: 'POST', headers, body: JSON.stringify({ schemaVersion: 1,
      context: { runId: r.runId, tutorialId: r.tutorialId, tutorialRevision: r.tutorialRevision, stepId: r.stepId, stepRevision: r.stepRevision, attemptId: r.attemptId },
      liveSessionId: 'app-check', sessionGeneration: 1, requestEpoch: ++epoch, question: r.question,
      sourceSessionId: 'synthetic-camera', source: 'quest-camera', sourceFrameSeq: sequence++,
    }) });
    expect(response.status).toBe(200); return await response.json() as InspectionCapture;
  }
  function upload(capture: InspectionCapture) {
    return fetch(`${main.url}/api/scene-observations`, { method: 'POST', headers, body: JSON.stringify({ schemaVersion: 1,
      requestId: capture.request.requestId, requestEpoch: capture.request.requestEpoch, captureNonce: capture.captureNonce,
      sourceSessionId: 'synthetic-camera', source: 'quest-camera', sourceFrameSeq: ++sequence, captureAgeAtSendMs: 10, image: fixture.currentImage,
    }) });
  }
  for (const [setting, verdict] of [['correct', 'visible-match'], ['wrong', 'adjustment-needed'], ['obscured', 'uncertain']]) {
    await mode(vision.child, setting!); const response = await upload(await start());
    expect(response.status).toBe(200); expect((await response.json() as { assessment: { verdict: string } }).assessment.verdict).toBe(verdict);
  }
  await mode(vision.child, 'slow'); let capture = await start(); let pending = upload(capture);
  // Wait for main request to reach the independently listening service by observing readiness busy.
  const internal = { authorization: 'Bearer synthetic-service-token-for-tests-0001' };
  await expect.poll(async () => (await fetch(`${vision.url}/internal/v1/ready`, { headers: internal })).status).toBe(503);
  expect((await fetch(`${main.url}/api/inspections/${capture.request.requestId}?epoch=${capture.request.requestEpoch}`, { method: 'DELETE', headers: { authorization: headers.authorization } })).status).toBe(204);
  expect((await pending).status).toBe(409);
  await expect.poll(async () => (await fetch(`${vision.url}/internal/v1/ready`, { headers: internal })).status).toBe(200);
  capture = await start(); pending = upload(capture);
  await expect.poll(async () => (await fetch(`${vision.url}/internal/v1/ready`, { headers: internal })).status).toBe(503);
  const port = vision.port; vision.child.kill('SIGKILL'); await once(vision.child, 'exit');
  expect((await pending).status).toBe(503);
  expect((await fetch(`${main.url}/health`)).status).toBe(200);
  vision = await worker('vision', port);
  const recovered = await upload(await start());
  expect(recovered.status).toBe(200);
  expect((await recovered.json() as { provenance: string }).provenance).toBe('mock');
}, 20_000);
