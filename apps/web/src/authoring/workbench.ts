import { RecordingSchema, TutorialSchema, SpectatorStateSchema, type Recording, type Tutorial, type TutorialDraftEdit, type SpectatorState, type StepSceneReference } from '@trail/contracts';
import { createAuthoringFixture } from '@trail/motion';
import { createViewer } from '../replay/viewer.js';

async function api(path: string, body?: unknown, method = 'POST'): Promise<unknown> {
  const response = await fetch(path, { method, credentials: 'same-origin', cache: 'no-store', headers: body === undefined ? {} : { 'Content-Type': 'application/json' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(20_000) });
  const value: unknown = await response.json();
  if (!response.ok) throw new Error(typeof value === 'object' && value && 'error' in value ? String(value.error) : `Request failed (${response.status})`);
  return value;
}
async function sha(value: unknown) {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(value)));
  return [...new Uint8Array(bytes)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}
function node<T extends HTMLElement>(root: HTMLElement, selector: string): T {
  const found = root.querySelector<T>(selector); if (!found) throw new Error(`Missing ${selector}`); return found;
}
function editOf(tutorial: Tutorial): TutorialDraftEdit {
  return { baseRevision: tutorial.revision, steps: tutorial.steps.map(step => ({ id: step.id, title: step.title, instruction: step.instruction, startFrame: step.startFrame, endFrameExclusive: step.endFrameExclusive, checkpointFrame: step.checkpointFrame, activeHands: step.targets.map(target => target.side), completionMode: step.completionMode })) };
}
export function mountWorkbench(root: HTMLElement) {
  root.innerHTML = `
    <nav class="workspace-tabs" aria-label="Workspace views"><button data-view="fixture" aria-pressed="true">Fixture replay</button><button data-view="authoring" aria-pressed="false">Author a guide</button><button data-view="spectator" aria-pressed="false">Spectator</button></nav>
    <section id="pair-panel" class="pair-panel" hidden aria-label="Pair this browser"><form id="pair-form"><label>Pairing code <input id="pair-code" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{8}" maxlength="8" required placeholder="8 digit code"></label><button type="submit">Connect workspace</button></form><label class="invite-role">New device <select id="invite-role"><option value="learner">Learner</option><option value="spectator">Spectator</option><option value="author">Author</option></select></label><label class="invite-role">Client <select id="invite-client"><option value="native">Quest app</option><option value="browser">Browser</option></select></label><button id="issue-code" type="button">Create pairing code</button><output id="invite-code"></output><p id="pair-state" role="status">Use the private code from the demo operator.</p></section>
    <section id="authoring-panel" hidden aria-label="Tutorial authoring">
      <div class="author-heading"><div><h1>Give every movement a moment.</h1><p>Review the starts, paths and checkpoints your learner will follow.</p></div><span id="author-source" class="source-label">No recording loaded</span></div>
      <div class="author-toolbar"><button id="import-demo" class="primary">Import four-step sample</button><label class="file-button">Import recording <input id="recording-file" type="file" accept=".json,application/json"></label><button id="discard-upload">Discard unfinished upload</button><button id="reload-library">Reload saved guides</button><select id="tutorial-library" aria-label="Saved guides"><option value="">Choose a saved guide</option></select></div>
      <p id="author-status" class="author-status" role="status">Pair your browser, then import a recording or try the synthetic sample.</p>
      <div id="review-layout" class="review-layout" hidden><ol id="step-strip" class="step-strip" aria-label="Ordered steps"></ol><div class="review-body"><div class="review-preview"><div id="review-scene"></div><div class="frame-actions"><button id="show-start">Show start</button><button id="show-checkpoint">Show checkpoint</button><label>Frame <input id="review-frame" type="range" min="0" step="1"></label><output id="frame-label"></output></div><p id="target-summary"></p></div><form id="step-form" class="step-form"><div class="step-heading"><h2 id="step-heading">Review step</h2><span id="label-provenance"></span></div><label>Title<input id="step-title" maxlength="60" required></label><label>Instruction<textarea id="step-instruction" rows="3" maxlength="240" required></textarea></label><div class="boundary-fields"><label>Start frame<input id="step-start" type="number" min="0" required></label><label>End (exclusive)<input id="step-end" type="number" min="1" required></label><label>Checkpoint<input id="step-checkpoint" type="number" min="0" required></label></div><div class="boundary-fields"><label>Active hands<select id="step-hands"><option value="right">Right hand</option><option value="left">Left hand</option><option value="both">Both hands</option></select></label><label>Completion<select id="step-mode"><option value="pose-match">Checkpoint pose</option><option value="path-and-pose">Ordered path + pose</option><option value="user-confirmed">Learner confirms</option></select></label></div><p class="review-hint">Keep a still, tracked hold at each end. Path targets are recalculated from the recording when you save.</p><button type="submit">Apply step edits</button></form><section class="reference-review" aria-label="Checkpoint reference"><h3>Reviewed checkpoint image</h3><p>Upload a captured view from this recording at the selected checkpoint. Save instruction edits first; later edits clear image approval.</p><label>Captured image <input id="reference-file" type="file" accept="image/png,image/jpeg"></label><label>Scene source <select id="reference-source"><option value="quest-camera">Quest camera</option><option value="workspace-webcam">Workspace webcam (reduced demo)</option></select></label><label>Visible outcome <input id="reference-outcome" maxlength="240" placeholder="Describe only what can be seen"></label><button id="review-reference" type="button">Approve checkpoint image</button><img id="reference-preview" alt="Reviewed expert checkpoint" hidden><p id="reference-state">No approved view for this step.</p></section></div><div class="review-footer"><span id="revision-label"></span><button id="save-review" class="primary">Save reviewed draft</button><button id="finalize-guide">Finalize guide</button></div></div>
    </section>
    <section id="spectator-panel" hidden aria-label="Read-only spectator"><div class="author-heading"><div><h1>At the learner’s pace.</h1><p>A schematic view of headset progress. Movement matching does not verify assembly.</p></div><span id="spectator-connection" class="source-label">Disconnected</span></div><div class="spectator-stage"><span id="spectator-phase">Waiting for a learner</span><h2 id="spectator-step">No active step</h2><progress id="spectator-progress" max="1" value="0"></progress><p id="spectator-evidence">Only the headset can advance the guide.</p><div id="spectator-tracking"></div></div><button id="spectator-reconnect">Reconnect spectator</button></section>`;
  let tutorial: Tutorial | undefined; let recording: Recording | undefined; let draft: TutorialDraftEdit | undefined; let selected = 0; let dirty = false; let references: StepSceneReference[] = [];
  let viewer: ReturnType<typeof createViewer> | undefined; let socket: WebSocket | undefined; let reconnect: ReturnType<typeof setTimeout> | undefined; let spectator: SpectatorState | undefined; let spectatorActive = false; let spectatorReceivedAt = 0;
  const status = (message: string) => { node(root, '#author-status').textContent = message; };
  const authorPanel = node(root, '#authoring-panel'); const spectatorPanel = node(root, '#spectator-panel');
  const busy = async (action: () => Promise<void>) => {
    const controls = root.querySelectorAll<HTMLButtonElement>('button'); controls.forEach(control => { control.disabled = true; });
    try { await action(); } catch (error) { status(error instanceof Error ? error.message : 'Operation failed.'); }
    finally { controls.forEach(control => { control.disabled = false; }); updateReadOnly(); }
  };
  const updateReadOnly = () => {
    const ready = tutorial?.status === 'ready';
    root.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement | HTMLButtonElement>('#step-form input, #step-form select, #step-form textarea, #step-form button').forEach(control => { control.disabled = !!ready; });
    node<HTMLButtonElement>(root, '#review-reference').disabled = !tutorial || !!ready || dirty;
    node<HTMLButtonElement>(root, '#save-review').disabled = !tutorial || !!ready;
    node<HTMLButtonElement>(root, '#finalize-guide').disabled = !tutorial || !!ready || dirty || tutorial.provenance.labels === 'fallback';
  };
  function showFrame(index: number) {
    if (!recording) return;
    const frame = recording.frames[index]; if (!frame) return;
    viewer?.showFrame(frame); node<HTMLInputElement>(root, '#review-frame').value = String(index); node(root, '#frame-label').textContent = `${index} / ${(frame.tMs / 1000).toFixed(2)} s`;
  }
  function renderSteps() {
    if (!tutorial || !draft || !recording) return;
    const strip = node(root, '#step-strip'); strip.replaceChildren();
    draft.steps.forEach((step, index) => {
      const item = document.createElement('li'); const button = document.createElement('button'); button.type = 'button'; button.setAttribute('aria-pressed', String(index === selected));
      const number = document.createElement('span'); number.textContent = String(index + 1).padStart(2, '0'); const title = document.createElement('strong'); title.textContent = step.title; const range = document.createElement('small'); range.textContent = `${step.startFrame}–${step.endFrameExclusive - 1}`;
      button.append(number, title, range); button.addEventListener('click', () => { captureFields(); selected = index; renderSteps(); }); item.append(button); strip.append(item);
    });
    const step = draft.steps[selected]!;
    node(root, '#step-heading').textContent = `Step ${selected + 1}`;
    node(root, '#label-provenance').textContent = `${tutorial.provenance.labels} instructions`;
    for (const [id, value] of [['title', step.title], ['instruction', step.instruction], ['start', step.startFrame], ['end', step.endFrameExclusive], ['checkpoint', step.checkpointFrame], ['hands', step.activeHands.length === 2 ? 'both' : step.activeHands[0]!], ['mode', step.completionMode]] as const) node<HTMLInputElement>(root, `#step-${id}`).value = String(value);
    const frameInput = node<HTMLInputElement>(root, '#review-frame'); frameInput.max = String(recording.frames.length - 1);
    node(root, '#revision-label').textContent = `Revision ${tutorial.revision} · ${tutorial.status}${dirty ? ' · unsaved changes' : ''}`;
    const targets = tutorial.steps[selected]!.targets;
    node(root, '#target-summary').textContent = targets.map(target => `${target.side}: start ${target.startPose.positionM.map(n => n.toFixed(2)).join(', ')} m → checkpoint ${target.checkpointPose.positionM.map(n => n.toFixed(2)).join(', ')} m; ${target.motionGates.length} intermediate gates`).join(' | ');
    const approved = references.find(reference => reference.stepId === step.id);
    node(root, '#reference-state').textContent = approved ? approved.visibleOutcome : 'No approved view for this step. Visual inspection is unavailable until a view is reviewed.';
    node<HTMLButtonElement>(root, '#review-reference').disabled = tutorial.status === 'ready' || dirty;
    node<HTMLImageElement>(root, '#reference-preview').hidden = true;
    node<HTMLInputElement>(root, '#reference-outcome').value = approved?.visibleOutcome ?? '';
    if (approved) {
      const expectedId = tutorial.id; const expectedRevision = tutorial.revision; const expectedStep = step.id;
      node<HTMLSelectElement>(root, '#reference-source').value = approved.source;
      void api(`/api/reference-images/${approved.assetId}/query`).then(value => {
        if (tutorial?.id !== expectedId || tutorial.revision !== expectedRevision || draft?.steps[selected]?.id !== expectedStep) return;
        const asset = value as { image: { mimeType: string; dataBase64: string } };
        const preview = node<HTMLImageElement>(root, '#reference-preview'); preview.src = `data:${asset.image.mimeType};base64,${asset.image.dataBase64}`; preview.hidden = false;
      }).catch(() => { if (draft?.steps[selected]?.id === expectedStep) node(root, '#reference-state').textContent = 'Approved image unavailable. Reload before relying on visual guidance.'; });
    }
    showFrame(step.startFrame); updateReadOnly();
  }
  function captureFields() {
    if (!draft || tutorial?.status === 'ready') return;
    const value = (id: string) => node<HTMLInputElement>(root, `#step-${id}`).value;
    const step = draft.steps[selected]!;
    const next = { ...step, title: value('title'), instruction: value('instruction'), startFrame: Number(value('start')), endFrameExclusive: Number(value('end')), checkpointFrame: Number(value('checkpoint')), activeHands: value('hands') === 'both' ? ['left', 'right'] as ('left' | 'right')[] : [value('hands') as 'left' | 'right'], completionMode: value('mode') as typeof step.completionMode };
    if (JSON.stringify(next) !== JSON.stringify(step)) dirty = true;
    draft.steps[selected] = next;
  }
  async function library() {
    const items = await api('/api/tutorials/query') as { id: string; title: string; revision: number; status: string; steps: number }[];
    const select = node<HTMLSelectElement>(root, '#tutorial-library'); select.replaceChildren(new Option('Choose a saved guide', ''));
    items.forEach(item => select.add(new Option(`${item.title} — ${item.steps} steps, ${item.status}`, item.id)));
    if (tutorial) select.value = tutorial.id;
  }
  async function load(id: string) {
    if (dirty) throw new Error('Save the current draft before switching guides.');
    tutorial = TutorialSchema.parse(await api(`/api/tutorials/${encodeURIComponent(id)}/query`));
    const result = await api(`/api/recordings/${encodeURIComponent(tutorial.recordingId)}/query`) as { recording: unknown };
    recording = RecordingSchema.parse(result.recording); references = await api(`/api/tutorials/${tutorial.id}/references/query`) as StepSceneReference[]; draft = editOf(tutorial); selected = 0; dirty = false;
    node(root, '#review-layout').hidden = false; viewer?.dispose();
    try { viewer = createViewer(node(root, '#review-scene'), recording); } catch { node(root, '#review-scene').textContent = 'WebGL unavailable. Frame and target review remain available.'; }
    node(root, '#author-source').textContent = recording.source === 'synthetic-fixture' ? 'Synthetic recording' : recording.source;
    renderSteps(); status(tutorial.status === 'ready' ? 'Finalized guide loaded. This version is immutable.' : 'Review each boundary, active hand and instruction, then save the draft.');
  }
  async function importRecording(input: unknown) {
    if (dirty) throw new Error('Save the current draft before importing another recording.');
    const original = RecordingSchema.parse(input);
    if (original.audio) throw new Error('This motion importer does not upload narration. Use a motion-only export.');
    const { frames, ...metadata } = original;
    const identity = await sha(original);
    const pending = localStorage.getItem('trail-pending-upload');
    let id: string;
    if (pending) {
      const saved = JSON.parse(pending) as { id: string; identity: string };
      if (saved.identity !== identity) throw new Error('Another upload is unfinished. Re-import the same recording to resume.');
      id = saved.id;
    } else {
      const uploads = await api('/api/recordings/uploads/query') as { id: string; metadata: unknown }[];
      const matching = uploads.find(upload => JSON.stringify(upload.metadata) === JSON.stringify(metadata));
      const created = matching ?? await api('/api/recordings', { metadata }) as { id: string }; id = created.id;
      localStorage.setItem('trail-pending-upload', JSON.stringify({ id, identity }));
    }
    const canonical = RecordingSchema.parse({ ...original, id });
    const chunks: typeof frames[] = [];
    let chunk: typeof frames = [];
    for (const frame of frames) {
      if (new TextEncoder().encode(JSON.stringify([...chunk, frame])).length > 1024 * 1024 && chunk.length) { chunks.push(chunk); chunk = []; }
      chunk.push(frame);
    }
    if (chunk.length) chunks.push(chunk);
    for (const [index, part] of chunks.entries()) { status(`Uploading motion ${index + 1} of ${chunks.length}…`); await api(`/api/recordings/${id}/motion/${index}`, { frames: part, sha256: await sha(part) }, 'PUT'); }
    const hash = await sha(canonical);
    await api(`/api/recordings/${id}/finalize`, { chunkCount: chunks.length, sha256: hash });
    status('Deriving steps from recorded motion…');
    const job = await api('/api/tutorial-jobs', { recordingId: id, recordingHash: hash, segmentationRevision: 1 }) as { status: string; tutorialId: string | null; error: string | null };
    localStorage.removeItem('trail-pending-upload');
    if (job.status !== 'complete' || !job.tutorialId) throw new Error(job.error ?? 'Compilation interrupted; retry the recording.');
    await load(job.tutorialId); await library();
  }
  root.querySelectorAll<HTMLButtonElement>('[data-view]').forEach(button => button.addEventListener('click', () => {
    const view = button.dataset.view; authorPanel.hidden = view !== 'authoring'; spectatorPanel.hidden = view !== 'spectator'; node(root, '#pair-panel').hidden = view === 'fixture';
    document.querySelectorAll<HTMLElement>('[data-fixture-view]').forEach(element => { element.hidden = view !== 'fixture'; });
    root.querySelectorAll<HTMLButtonElement>('[data-view]').forEach(other => other.setAttribute('aria-pressed', String(other === button)));
    spectatorActive = view === 'spectator'; if (spectatorActive) connectSpectator(); else { clearTimeout(reconnect); socket?.close(); }
  }));
  node(root, '#pair-form').addEventListener('submit', event => { event.preventDefault(); void busy(async () => {
    const result = await api('/api/pair', { code: node<HTMLInputElement>(root, '#pair-code').value, client: 'browser' }) as { role: string };
    node<HTMLInputElement>(root, '#pair-code').value = ''; node(root, '#pair-state').textContent = `Connected as ${result.role}.`;
    if (result.role === 'author') await library(); if (spectatorActive) connectSpectator(); status('Workspace connected. Import a recording to begin.');
  }); });
  let codeTimer: ReturnType<typeof setTimeout> | undefined;
  node(root, '#issue-code').addEventListener('click', () => { void busy(async () => {
    const issued = await api('/api/pairing-codes', { role: node<HTMLSelectElement>(root, '#invite-role').value, client: node<HTMLSelectElement>(root, '#invite-client').value }) as { code: string; expiresAt: number };
    node(root, '#invite-code').textContent = issued.code; clearTimeout(codeTimer); codeTimer = setTimeout(() => { node(root, '#invite-code').textContent = ''; }, Math.max(0, issued.expiresAt - Date.now()));
  }); });
  node(root, '#import-demo').addEventListener('click', () => { void busy(() => importRecording(createAuthoringFixture())); });
  node<HTMLInputElement>(root, '#recording-file').addEventListener('change', event => { const file = (event.target as HTMLInputElement).files?.[0]; if (!file) return; void busy(async () => { if (file.size > 64 * 1024 * 1024) throw new Error('Recording exceeds 64 MiB.'); await importRecording(JSON.parse(await file.text())); }); });
  node(root, '#discard-upload').addEventListener('click', () => { void busy(async () => {
    const uploads = await api('/api/recordings/uploads/query') as { id: string }[];
    if (!uploads.length) { status('No unfinished server upload. Re-import the same recording to finish compilation if needed.'); return; }
    await api(`/api/recordings/${uploads[0]!.id}/discard`); localStorage.removeItem('trail-pending-upload'); status('Unfinished upload discarded. The local source file is unchanged.');
  }); });
  node(root, '#reload-library').addEventListener('click', () => { void busy(library); });
  node<HTMLSelectElement>(root, '#tutorial-library').addEventListener('change', event => { const id = (event.target as HTMLSelectElement).value; if (id) void busy(() => load(id)); });
  node(root, '#step-form').addEventListener('submit', event => { event.preventDefault(); captureFields(); renderSteps(); status('Edits applied locally. Save the draft to recalculate and validate targets.'); });
  node(root, '#step-form').addEventListener('input', () => { dirty = true; updateReadOnly(); });
  node(root, '#save-review').addEventListener('click', () => { void busy(async () => {
    if (!tutorial || !draft) return; captureFields(); tutorial = TutorialSchema.parse(await api(`/api/tutorials/${tutorial.id}`, draft, 'PATCH')); draft = editOf(tutorial); references = []; dirty = false; renderSteps(); await library(); status('Reviewed draft saved. Targets were recalculated from the recording.');
  }); });
  node(root, '#finalize-guide').addEventListener('click', () => { void busy(async () => {
    if (!tutorial || dirty) return; tutorial = TutorialSchema.parse(await api(`/api/tutorials/${tutorial.id}/finalize`, { baseRevision: tutorial.revision })); draft = editOf(tutorial); renderSteps(); await library(); status('Guide finalized. This version is ready to preload and cannot be edited.');
  }); });
  node(root, '#review-reference').addEventListener('click', () => { void busy(async () => {
    if (!tutorial || !recording || dirty || tutorial.status === 'ready') throw new Error('Save the draft before approving its checkpoint image.');
    const file = node<HTMLInputElement>(root, '#reference-file').files?.[0]; const outcome = node<HTMLInputElement>(root, '#reference-outcome').value.trim();
    if (!file || !outcome || file.size > 2 * 1024 * 1024 || !['image/png', 'image/jpeg'].includes(file.type)) throw new Error('Choose a PNG/JPEG under 2 MiB and describe the visible outcome.');
    const bytes = new Uint8Array(await file.arrayBuffer()); const bitmap = await createImageBitmap(file); const width = bitmap.width; const height = bitmap.height; bitmap.close();
    if (width > 1280 || height > 1280) throw new Error('Reference dimensions must be at most 1280 pixels.');
    let binary = ''; for (let i = 0; i < bytes.length; i += 8192) binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
    const hash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(n => n.toString(16).padStart(2, '0')).join('');
    const source = node<HTMLSelectElement>(root, '#reference-source').value as 'quest-camera' | 'workspace-webcam';
    const asset = await api('/api/reference-images', { recordingId: tutorial.recordingId, recordingHash: tutorial.recordingHash, frameIndex: tutorial.steps[selected]!.checkpointFrame, source, image: { mimeType: file.type, dataBase64: btoa(binary), sha256: hash, width, height } }) as { id: string };
    const reference: StepSceneReference = { id: crypto.randomUUID(), recordingId: tutorial.recordingId, recordingHash: tutorial.recordingHash, tutorialId: tutorial.id, tutorialRevision: tutorial.revision, stepId: tutorial.steps[selected]!.id, assetId: asset.id, source, visibleOutcome: outcome };
    const batch = [...references.filter(value => value.stepId !== reference.stepId).map(value => ({ ...value, tutorialRevision: tutorial!.revision })), reference];
    const result = await api(`/api/tutorials/${tutorial.id}/references`, { baseRevision: tutorial.revision, references: batch }, 'PUT') as { tutorial: unknown; references: StepSceneReference[] };
    tutorial = TutorialSchema.parse(result.tutorial); references = result.references; draft = editOf(tutorial); renderSteps();
    const preview = node<HTMLImageElement>(root, '#reference-preview'); preview.src = `data:${file.type};base64,${btoa(binary)}`; preview.hidden = false; status('Checkpoint image approved for this revision.');
  }); });
  node(root, '#show-start').addEventListener('click', () => { if (draft) showFrame(draft.steps[selected]!.startFrame); });
  node(root, '#show-checkpoint').addEventListener('click', () => { if (draft) showFrame(draft.steps[selected]!.checkpointFrame); });
  node<HTMLInputElement>(root, '#review-frame').addEventListener('input', event => showFrame(Number((event.target as HTMLInputElement).value)));
  function renderSpectator() {
    const fresh = !!spectator?.connected && performance.now() - spectatorReceivedAt + spectator.ageMs < 3000 && socket?.readyState === WebSocket.OPEN;
    node(root, '#spectator-connection').textContent = fresh ? 'Live headset state' : 'Stale or disconnected';
    const snapshot = spectator?.snapshot;
    if (snapshot && 'state' in snapshot) {
      node(root, '#spectator-phase').textContent = snapshot.state.phase.replaceAll('-', ' '); node(root, '#spectator-step').textContent = spectator?.step ? `${spectator.step.index} / ${spectator.step.total}  ${spectator.step.title}` : snapshot.state.stepId ?? 'Run complete';
      node<HTMLProgressElement>(root, '#spectator-progress').value = snapshot.state.pathProgress;
      node(root, '#spectator-tracking').textContent = `Left hand ${snapshot.state.tracking.left}. Right hand ${snapshot.state.tracking.right}. Calibration ${snapshot.state.calibrationValid ? 'valid' : 'required'}.`;
      node(root, '#spectator-evidence').textContent = spectator?.step ? `${spectator.step.instruction} (${spectator.step.source}; ${spectator.step.completionMode})` : snapshot.state.phase === 'complete' ? 'Movement checkpoint reached. Physical outcome remains learner-confirmed.' : 'Only the headset can advance the guide.';
    } else if (snapshot?.type === 'guide-ended') {
      node(root, '#spectator-phase').textContent = snapshot.reason === 'completed' ? 'Run ended' : 'Run cancelled';
      node(root, '#spectator-step').textContent = 'No active step';
      node(root, '#spectator-evidence').textContent = 'The headset ended this run. Physical outcome is not verified by this display.';
    }
  }
  function connectSpectator() {
    clearTimeout(reconnect); if (socket) { socket.onclose = null; socket.close(); }
    socket = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/api/ws`);
    socket.onopen = () => socket?.send(JSON.stringify({ type: 'snapshot-request' }));
    socket.onmessage = event => { try { const parsed = SpectatorStateSchema.safeParse(JSON.parse(String(event.data))); if (parsed.success) { const incoming = parsed.data; const before = spectator?.snapshot; if (incoming.snapshot && before && incoming.snapshot.runId === before.runId && incoming.snapshot.seq < before.seq) return; spectator = incoming; spectatorReceivedAt = performance.now(); renderSpectator(); } } catch { socket?.close(); } };
    socket.onclose = () => { renderSpectator(); if (spectatorActive) reconnect = setTimeout(connectSpectator, 3000); };
  }
  node(root, '#spectator-reconnect').addEventListener('click', connectSpectator);
  const timer = setInterval(renderSpectator, 1000);
  const dispose = () => { spectatorActive = false; clearInterval(timer); clearTimeout(codeTimer); clearTimeout(reconnect); socket?.close(); viewer?.dispose(); };
  window.addEventListener('pagehide', dispose, { once: true });
  return dispose;
}
