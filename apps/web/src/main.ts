import { mountWorkbench } from './authoring/workbench.js';
import { HealthSchema, VisionDependencySchema } from '@trail/contracts';
import { mountShell } from './dashboard/shell.js';
import { fixture, frameAtTime } from './replay/fixture-source.js';
import { createViewer } from './replay/viewer.js';
import './style.css';

function element<T extends HTMLElement>(selector: string): T {
  const node = document.querySelector<T>(selector);
  if (!node) throw new Error(`Missing application element: ${selector}`);
  return node;
}
mountShell(element('#app'));
const disposeWorkbench = mountWorkbench(element('#workbench'));
const play = element<HTMLButtonElement>('#play');
const timeline = element<HTMLInputElement>('#timeline');
const tracking = element('#tracking');
const time = element<HTMLOutputElement>('#time');
let viewer: ReturnType<typeof createViewer> | undefined;
try {
  viewer = createViewer(element('#scene'), fixture);
} catch {
  element('#scene').textContent = '3D preview unavailable. Enable WebGL or use a supported browser. Timeline diagnostics remain available.';
}
let playing = false;
let currentMs = 0;
let lastNow = 0;
let animationId = 0;

function show(tMs: number) {
  currentMs = Math.min(fixture.durationMs, Math.max(0, tMs));
  timeline.value = String(currentMs);
  time.value = `${(currentMs / 1000).toFixed(2)} / 2.00 s`;
  const frame = frameAtTime(fixture, currentMs);
  tracking.textContent = frame.hands.right.status === 'valid' ? 'Tracked' : 'Missing — hand hidden';
  tracking.dataset.state = frame.hands.right.status;
  viewer?.showFrame(frame);
}
function pause() {
  playing = false;
  cancelAnimationFrame(animationId);
  play.textContent = 'Play motion';
}
function tick(now: number) {
  if (!playing) return;
  show(currentMs + now - lastNow);
  lastNow = now;
  if (currentMs >= fixture.durationMs) { pause(); return; }
  animationId = requestAnimationFrame(tick);
}
play.addEventListener('click', () => {
  if (playing) { pause(); return; }
  if (currentMs >= fixture.durationMs) show(0);
  playing = true;
  play.textContent = 'Pause motion';
  lastNow = performance.now();
  animationId = requestAnimationFrame(tick);
});
timeline.addEventListener('input', () => { pause(); show(Number(timeline.value)); });
element('#reset').addEventListener('click', () => { pause(); show(0); });
element('#gap').addEventListener('click', () => { pause(); show(1000); });
document.addEventListener('visibilitychange', () => { if (document.hidden) pause(); });
window.addEventListener('pagehide', () => { pause(); });

async function refreshHealth() {
  const status = element('#health');
  const button = element<HTMLButtonElement>('#refresh-health');
  button.disabled = true;
  status.textContent = 'Checking…';
  try {
    const response = await fetch('/api/health', { signal: AbortSignal.timeout(3000), cache: 'no-store' });
    const health = HealthSchema.parse(await response.json());
    status.textContent = health.status === 'ok' && response.ok ? 'Connected · storage writable' : 'Storage unavailable';
  } catch {
    status.textContent = 'Unavailable · start the local server';
  } finally {
    button.disabled = false;
  }
}
element('#refresh-health').addEventListener('click', () => { void refreshHealth(); });
void refreshHealth();
async function refreshVision() {
  try {
    const response = await fetch('/api/dependencies/vision', { signal: AbortSignal.timeout(3000), cache: 'no-store' });
    const dependency = VisionDependencySchema.parse(await response.json());
    element('#vision').textContent = dependency.status === 'reachable'
      ? dependency.health.capabilities.imageInterpretation ? 'Connected · image interpretation configured' : 'Connected · visual interpretation unavailable' : dependency.status === 'disabled'
      ? 'Not configured' : 'Unavailable';
  } catch { element('#vision').textContent = 'Unavailable'; }
}
element('#refresh-health').addEventListener('click', () => { void refreshVision(); });
void refreshVision();
show(0);
if (import.meta.hot) import.meta.hot.dispose(() => { pause(); viewer?.dispose(); disposeWorkbench(); });
