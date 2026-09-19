import {
  HealthSchema, LabelResultSchema, TranscriptResultSchema,
  type CoachContext, type CoachStep, type LabelResult, type LabelSegment, type NarrationCapture, type TranscriptResult,
} from '@trail/contracts';
import fixtureTranscript from '../../../fixtures/narration-transcript.v1.json';
import { createCoach, type CoachApi } from './guide/coach.js';
import { createNarrationRecorder, NarrationError, type NarrationRecorder } from './record/audio.js';
import './style.css';
import './voice-lab.css';

const FIXTURE_STEPS: CoachStep[] = [
  { id: 'seg-1', title: 'Place the base', instruction: 'Slide the base from its outline into the center of the mat.' },
  { id: 'seg-2', title: 'Insert the support', instruction: 'Drop the tall support straight down into the base slot.' },
  { id: 'seg-3', title: 'Add the crosspiece and cap', instruction: 'Lay the crosspiece across the support, then press the cap on.' },
];

function element<T extends HTMLElement>(selector: string): T {
  const node = document.querySelector<T>(selector);
  if (!node) throw new Error(`Missing element: ${selector}`);
  return node;
}
function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char] ?? char);
}
function setStatus(node: HTMLElement, text: string, tone: 'ok' | 'warn' | 'info' = 'info') {
  node.textContent = text;
  node.dataset.tone = tone;
}

element('#app').innerHTML = `
  <header class="masthead">
    <a class="brand" href="/" aria-label="Trail home"><span class="brand-mark" aria-hidden="true">⌁</span> Trail</a>
    <nav class="masthead-links" aria-label="Pages"><a href="/">Motion workspace</a><a href="/voice-lab.html" aria-current="page">Voice lab</a></nav>
    <span class="stage-label" id="provider">AI provider: checking…</span>
  </header>
  <main class="lab">
    <div class="introduction"><div><h1>Voice lab</h1><p>Record narration, turn it into step labels, and talk to the coach. Everything here runs against the local server; mock mode needs no key.</p></div><span class="source-label">Development tool</span></div>

    <section class="panel" aria-labelledby="narration-heading">
      <h2 id="narration-heading">1. Narration</h2>
      <p class="lede">Records your microphone on a monotonic clock and reports the offset from the recording epoch, like the native headset recorder will. This page is a desktop diagnostic.</p>
      <div class="row">
        <button id="record" class="primary" type="button">Record</button>
        <button id="stop" type="button" disabled>Stop</button>
        <button id="play" type="button" disabled>Play</button>
        <button id="transcribe" type="button" disabled>Transcribe</button>
        <button id="use-fixture" type="button">Use fixture transcript</button>
        <span id="narration-status" class="status" role="status">Idle</span>
      </div>
      <audio id="playback" controls hidden></audio>
      <dl class="details">
        <div><dt>MIME</dt><dd id="capture-mime">—</dd></div>
        <div><dt>Duration</dt><dd id="capture-duration">—</dd></div>
        <div><dt>Audio start offset</dt><dd id="capture-offset">—</dd></div>
        <div><dt>Sync error</dt><dd id="capture-sync">—</dd></div>
        <div><dt>Size</dt><dd id="capture-size">—</dd></div>
        <div><dt>Transcript source</dt><dd id="transcript-source">—</dd></div>
      </dl>
      <table id="transcript-table"><thead><tr><th>Span</th><th>Start</th><th>End</th><th>Text</th></tr></thead><tbody></tbody></table>
    </section>

    <section class="panel" aria-labelledby="labels-heading">
      <h2 id="labels-heading">2. Step labels</h2>
      <p class="lede">Splits the transcript into simulated equal segments (the motion package will supply real ones) and asks the server for a title and instruction per segment.</p>
      <div class="row">
        <label for="segment-count">Simulated segments</label>
        <select id="segment-count"><option>2</option><option selected>3</option><option>4</option><option>5</option></select>
        <button id="label" class="primary" type="button" disabled>Generate labels</button>
        <span class="status">Provenance: <strong id="labels-provenance">—</strong></span>
        <span id="labels-status" class="status" role="status"></span>
      </div>
      <table id="labels-table"><thead><tr><th>Step</th><th>Title</th><th>Instruction</th><th>Spans</th><th>Review</th></tr></thead><tbody></tbody></table>
    </section>

    <section class="panel" aria-labelledby="coach-heading">
      <h2 id="coach-heading">3. Coach</h2>
      <p class="lede">Uses the labels above (or the fixture steps) as the approved tutorial. Live mode needs <code>AI_PROVIDER=openai</code>; otherwise answers come back as text.</p>
      <div class="row">
        <label for="steps">Current step</label>
        <select id="steps"></select>
        <button id="coach-connect" class="primary" type="button">Connect coach</button>
        <button id="coach-ask" type="button" disabled>Ask by voice</button>
        <button id="coach-repeat" type="button" disabled>Repeat step</button>
        <span class="badge" id="coach-mode" data-mode="idle">idle</span>
        <span id="coach-note" class="status"></span>
      </div>
      <div class="row">
        <input id="question" type="text" placeholder="Type a question, for example: What now?" aria-label="Question" />
        <button id="coach-ask-text" type="button" disabled>Ask by text</button>
      </div>
      <div class="answer" id="coach-answer" role="status">No answer yet.</div>
      <p class="status">Answer source: <strong id="coach-source">—</strong></p>
      <audio id="coach-audio" autoplay hidden></audio>
      <ul class="log" id="coach-log" aria-label="Transcript"></ul>
    </section>
    <footer>Voice lab · Mock answers never claim model provenance.<span>Headset validation pending</span></footer>
  </main>`;

// ---- Health -------------------------------------------------------------
async function refreshProvider() {
  try {
    const response = await fetch('/api/health', { signal: AbortSignal.timeout(3000), cache: 'no-store' });
    const health = HealthSchema.parse(await response.json());
    element('#provider').textContent = `AI provider: ${health.providers.ai}`;
  } catch {
    element('#provider').textContent = 'AI provider: server unavailable';
  }
}
void refreshProvider();

// ---- Narration -----------------------------------------------------------
let recorder: NarrationRecorder | null = null;
let recording: { blob: Blob; capture: NarrationCapture } | null = null;
let transcript: TranscriptResult | null = null;
const narrationStatus = element('#narration-status');
const recordButton = element<HTMLButtonElement>('#record');
const stopButton = element<HTMLButtonElement>('#stop');
const playButton = element<HTMLButtonElement>('#play');
const transcribeButton = element<HTMLButtonElement>('#transcribe');
const playback = element<HTMLAudioElement>('#playback');

function showCapture(capture: NarrationCapture | null) {
  element('#capture-mime').textContent = capture?.mimeType ?? '—';
  element('#capture-duration').textContent = capture ? `${(capture.durationMs / 1000).toFixed(2)} s` : '—';
  element('#capture-offset').textContent = capture ? `${capture.audioStartOffsetMs} ms` : '—';
  element('#capture-sync').textContent = capture ? `${capture.estimatedSyncErrorMs} ms` : '—';
  element('#capture-size').textContent = capture ? `${(capture.sizeBytes / 1024).toFixed(1)} KiB` : '—';
}
function showTranscript(result: TranscriptResult | null) {
  transcript = result;
  element('#transcript-source').textContent = result?.source ?? '—';
  element('#transcript-table tbody').innerHTML = (result?.spans ?? []).map(span =>
    `<tr><td>${escapeHtml(span.id)}</td><td class="num">${span.startMs} ms</td><td class="num">${span.endMs} ms</td><td>${escapeHtml(span.text)}</td></tr>`).join('');
  element<HTMLButtonElement>('#label').disabled = !result;
}

recordButton.addEventListener('click', async () => {
  recordButton.disabled = true;
  recording = null;
  showCapture(null);
  recorder = createNarrationRecorder({ epochMs: performance.now() });
  try {
    await recorder.start();
    stopButton.disabled = false;
    setStatus(narrationStatus, 'Recording…', 'ok');
  } catch (error) {
    recordButton.disabled = false;
    setStatus(narrationStatus, error instanceof NarrationError ? error.message : 'Could not start recording.', 'warn');
  }
});
stopButton.addEventListener('click', async () => {
  if (!recorder) return;
  stopButton.disabled = true;
  try {
    recording = await recorder.stop();
    showCapture(recording.capture);
    if (playback.src.startsWith('blob:')) URL.revokeObjectURL(playback.src);
    playback.src = URL.createObjectURL(recording.blob);
    playback.hidden = false;
    playButton.disabled = false;
    transcribeButton.disabled = false;
    setStatus(narrationStatus, `Recorded ${(recording.capture.durationMs / 1000).toFixed(2)} s`, 'ok');
  } catch (error) {
    setStatus(narrationStatus, error instanceof NarrationError ? error.message : 'Recording failed.', 'warn');
  } finally {
    recordButton.disabled = false;
  }
});
playButton.addEventListener('click', () => { void playback.play(); });
transcribeButton.addEventListener('click', async () => {
  if (!recording) return;
  transcribeButton.disabled = true;
  setStatus(narrationStatus, 'Transcribing…');
  try {
    const response = await fetch('/api/voice/transcriptions', {
      method: 'POST',
      headers: {
        'content-type': recording.capture.mimeType,
        'x-audio-start-offset-ms': String(recording.capture.audioStartOffsetMs),
        'x-audio-duration-ms': String(recording.capture.durationMs),
      },
      body: recording.blob,
      signal: AbortSignal.timeout(65_000),
    });
    if (!response.ok) throw new Error(`Server answered ${response.status}`);
    showTranscript(TranscriptResultSchema.parse(await response.json()));
    setStatus(narrationStatus, `Transcribed ${transcript?.spans.length ?? 0} spans`, 'ok');
  } catch (error) {
    setStatus(narrationStatus, error instanceof Error ? error.message : 'Transcription failed.', 'warn');
  } finally {
    transcribeButton.disabled = false;
  }
});
element('#use-fixture').addEventListener('click', () => {
  showTranscript(TranscriptResultSchema.parse(fixtureTranscript));
  setStatus(narrationStatus, 'Loaded the synthetic fixture transcript', 'ok');
});

// ---- Labels ---------------------------------------------------------------
let labels: LabelResult | null = null;
/** Equal slices over the span the narration actually covers (spans are shifted by the audio start offset). */
function simulatedSegments(result: TranscriptResult, count: number): LabelSegment[] {
  const first = result.spans.length ? Math.min(...result.spans.map(span => span.startMs)) : 0;
  const last = result.spans.length ? Math.max(...result.spans.map(span => span.endMs)) : result.audioDurationMs;
  const start = Math.max(0, first);
  const end = Math.max(start + count, last);
  return Array.from({ length: count }, (_, index) => ({
    id: `sim-${index + 1}`,
    startMs: start + Math.round(((end - start) * index) / count),
    endMs: index === count - 1 ? end : start + Math.round(((end - start) * (index + 1)) / count),
  }));
}
element('#label').addEventListener('click', async () => {
  if (!transcript) return;
  const status = element('#labels-status');
  setStatus(status, 'Generating…');
  try {
    const segments = simulatedSegments(transcript, Number(element<HTMLSelectElement>('#segment-count').value));
    const response = await fetch('/api/voice/labels', {
      method: 'POST', headers: { 'content-type': 'application/json' }, signal: AbortSignal.timeout(35_000),
      body: JSON.stringify({ schemaVersion: 1, segments, transcript, taskContext: 'Four large lightweight parts assembled on a 50 by 35 cm mat.' }),
    });
    if (!response.ok) throw new Error(`Server answered ${response.status}`);
    labels = LabelResultSchema.parse(await response.json());
    element('#labels-provenance').textContent = labels.provenance.labels;
    element('#labels-table tbody').innerHTML = labels.labels.map(label =>
      `<tr><td>${escapeHtml(label.stepId)}</td><td>${escapeHtml(label.title)}</td><td>${escapeHtml(label.instruction)}</td><td>${escapeHtml(label.narrationSpanIds.join(', '))}</td><td>${label.needsReview ? 'yes' : 'no'}</td></tr>`).join('');
    setStatus(status, labels.failure ? `Fallback used: ${labels.failure.code}` : `Model: ${labels.provenance.model ?? 'none'}`, labels.failure ? 'warn' : 'ok');
    populateSteps();
  } catch (error) {
    setStatus(status, error instanceof Error ? error.message : 'Labeling failed.', 'warn');
  }
});

// ---- Coach ----------------------------------------------------------------
let coach: CoachApi | null = null;
let stepRevision = 0;
let attemptCounter = 1;
let askInFlight = false;
const stepsSelect = element<HTMLSelectElement>('#steps');
const askButton = element<HTMLButtonElement>('#coach-ask');
const askTextButton = element<HTMLButtonElement>('#coach-ask-text');
const modeBadge = element('#coach-mode');

function currentSteps(): CoachStep[] {
  return labels ? labels.labels.map(label => ({ id: label.stepId, title: label.title, instruction: label.instruction })) : FIXTURE_STEPS;
}
function populateSteps() {
  const steps = currentSteps();
  stepsSelect.innerHTML = steps.map((step, index) => `<option value="${escapeHtml(step.id)}">${index + 1}. ${escapeHtml(step.title)}</option>`).join('');
  if (coach) { coach.dispose(); coach = null; renderMode('idle'); }
}
function renderMode(mode: string, note = '') {
  modeBadge.textContent = mode;
  modeBadge.dataset.mode = mode;
  element('#coach-note').textContent = note;
  askButton.disabled = !(mode === 'live' || mode === 'listening');
  askButton.textContent = mode === 'listening' ? 'Stop listening' : 'Ask by voice';
  element<HTMLButtonElement>('#coach-repeat').disabled = mode === 'idle' || mode === 'connecting';
  askTextButton.disabled = askInFlight || mode === 'idle' || mode === 'connecting';
}
function appendLog(role: 'learner' | 'coach', delta: string) {
  const log = element('#coach-log');
  const last = log.lastElementChild;
  if (last instanceof HTMLLIElement && last.dataset.role === role && last.dataset.open === 'true') {
    last.textContent = `${last.textContent ?? ''}${delta}`;
  } else {
    for (const item of log.children) (item as HTMLElement).dataset.open = 'false';
    const item = document.createElement('li');
    item.dataset.role = role;
    item.dataset.open = 'true';
    item.textContent = `${role === 'learner' ? 'You' : 'Coach'}: ${delta}`;
    log.append(item);
  }
  log.scrollTop = log.scrollHeight;
}
function buildContext(): CoachContext {
  const steps = currentSteps();
  const currentStepId = stepsSelect.value || steps[0]?.id || 'seg-1';
  return {
    tutorialId: 'voice-lab', tutorialRevision: 0, runId: `run-${Date.now()}`, attemptId: 'attempt-1', title: 'Voice lab tutorial',
    steps, currentStepId, stepRevision, layoutNotes: 'Parts start in outlined positions on the left of the mat.',
  };
}

element('#coach-connect').addEventListener('click', async () => {
  coach?.dispose();
  element('#coach-log').innerHTML = '';
  element('#coach-answer').textContent = 'No answer yet.';
  element('#coach-source').textContent = '—';
  stepRevision = 0;
  coach = createCoach({ context: buildContext(), audioSink: element<HTMLAudioElement>('#coach-audio') });
  coach.onState(state => renderMode(state.mode, state.liveClosed ? 'Live session ended; text answers continue.' : ''));
  coach.onTranscript(entry => appendLog(entry.role, entry.delta));
  coach.onLiveError(error => { element('#coach-note').textContent = `Live session error: ${error.code}`; });
  coach.onAnswer(answer => {
    element('#coach-answer').textContent = answer.answer;
    element('#coach-source').textContent = `${answer.source}${answer.model ? ` (${answer.model})` : ''}`;
  });
  renderMode('connecting');
  const mode = await coach.connect();
  renderMode(mode, mode === 'text' ? 'Live coach unavailable; using text answers.' : '');
});
askButton.addEventListener('click', () => { coach?.ask(); });
askTextButton.addEventListener('click', async () => {
  const question = element<HTMLInputElement>('#question').value.trim();
  if (!coach || !question || askInFlight) return;
  askInFlight = true;
  renderMode(coach.state.mode);
  const answer = await coach.askText(question);
  askInFlight = false;
  renderMode(coach.state.mode);
  if (!answer) element('#coach-answer').textContent = 'Answer dropped: the step changed before it arrived.';
});
element('#coach-repeat').addEventListener('click', () => {
  if (!coach) return;
  attemptCounter += 1;
  coach.setAttempt(`attempt-${attemptCounter}`);
  element('#coach-answer').textContent = 'New attempt started. Earlier answers no longer apply.';
});
stepsSelect.addEventListener('change', () => {
  if (!coach) return;
  stepRevision += 1;
  coach.setStep(stepsSelect.value, stepRevision);
});
populateSteps();
renderMode('idle');
