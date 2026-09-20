// Real-gateway smoke for the scene coach: one synthetic frame and one question through the configured OMNI model.
// Run after `pnpm build` with SCENE_COACH=omni and OMNI_API_KEY in the root .env:  node scripts/omni-smoke.mjs
// Prints the transcript, whether audio came back, and the round trip. No files are written; the key never leaves the process.
import { loadEnvFile } from 'node:process';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const root = fileURLToPath(new URL('..', import.meta.url));
try { loadEnvFile(resolve(root, '.env')); } catch { /* environment already set */ }
const { createOmniSceneCoach } = await import(resolve(root, 'apps/server/dist/ai/scene-coach.js'));

const apiKey = (process.env.OMNI_API_KEY ?? '').trim();
if (!apiKey) { console.error('OMNI_API_KEY is empty. Put the key in the root .env and try again.'); process.exit(1); }
const baseUrl = (process.env.OMNI_BASE_URL || 'https://yibuapi.com/v1').replace(/\/+$/, '');
const model = process.env.OMNI_MODEL || 'qwen3.5-omni-flash';
const voice = process.env.OMNI_VOICE || 'Cherry';

// A 96x64 grey JPEG so the smoke needs no camera; the point is the gateway, not the picture.
const dataBase64 = '/9j/2wBDAAoHBwgHBgoICAgLCgoLDhgQDg0NDh0VFhEYIx8lJCIfIiEmKzcvJik0KSEiMEExNDk7Pj4+JS5ESUM8SDc9Pjv/2wBDAQoLCw4NDhwQEBw7KCIoOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozv/wAARCABAAGADASIAAhEBAxEB/8QAFAABAAAAAAAAAAAAAAAAAAAAAP/EABQQAQAAAAAAAAAAAAAAAAAAAAD/xAAVAQEBAAAAAAAAAAAAAAAAAAAAA//EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAMAwEAAhEDEQA/AACyQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD/2Q==';
const context = {
  tutorialId: 'smoke', tutorialRevision: 1, runId: 'smoke-run', attemptId: 'smoke-attempt', title: 'Paper crane',
  steps: [{ id: 's1', title: 'Place the square', instruction: 'Lay the square flat with the marked corner nearest you.' }],
  currentStepId: 's1', stepRevision: 0,
};
const coach = createOmniSceneCoach({ apiKey, baseUrl, model, voice });
const started = Date.now();
try {
  const advice = await coach.advise({ context, question: 'Describe what you see and tell me if the sheet should move.', image: { mimeType: 'image/jpeg', dataBase64 }, reference: null, source: 'workspace-webcam' }, AbortSignal.timeout(20_000));
  console.log(`gateway: ${baseUrl}  model: ${model}  voice: ${voice}`);
  console.log(`round trip: ${Date.now() - started} ms`);
  console.log(`transcript: ${advice.transcript}`);
  console.log(advice.audio ? `audio: yes (${Math.round(Buffer.byteLength(advice.audio.dataBase64, 'base64') / 1024)} KiB WAV)` : 'audio: none (the tutor voice will read the answer instead)');
} catch (error) {
  console.error(`smoke failed after ${Date.now() - started} ms: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(2);
}
