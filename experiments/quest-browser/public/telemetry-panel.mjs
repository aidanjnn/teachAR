import {isOpaqueId, sanitizeTelemetryData} from './telemetry.mjs';
import {createFrictionObserver} from './telemetry-friction.mjs';

const STAGE_LABELS = {targeted: 'Targeted', activated: 'Activated', hit_test: 'Hit tested', dispatched: 'Dispatched', state_changed: 'State changed', feedback_rendered: 'UI acknowledged', rejected: 'Stopped'};
const PHASE_LABELS = {idle: 'Idle', following: 'Following', user_paused: 'Paused by learner', tracking_lost: 'Required hand unavailable', system_wait: 'Application waiting', checkpoint: 'Movement checkpoint reached', hidden: 'View hidden · observation unknown'};
const SOURCE_LABELS = {webxr: 'WebXR runtime', desktop: 'Desktop runtime', synthetic: 'Synthetic fixture'};
const STATUS_LABELS = {local: 'Local observation only', configured: 'Sentry configured · delivery unverified', error: 'Sentry unavailable · local observation active'};
const seconds = ms => `${(ms / 1000).toFixed(1)}s`;
const safeRecord = record => {
  if (!record || !Number.isSafeInteger(record.seq) || !Number.isFinite(record.t_ms) || record.t_ms < 0) return null;
  const data = sanitizeTelemetryData(record.type, record.data);
  return data ? {seq: record.seq, t_ms: Math.round(record.t_ms), type: record.type, data} : null;
};

export function mountDiagnostics({telemetry, document = globalThis.document} = {}) {
  if (!telemetry || !document?.body) return {dispose() {}};
  const existing = document.getElementById('trail-diagnostics');
  if (existing) return {dispose() {}};
  const win = document.defaultView || globalThis;
  const el = (tag, content, className) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (content !== undefined) { node.textContent = content; node.classList.add('trail-diagnostic-safe'); }
    return node;
  };
  const root = el('details'); root.id = 'trail-diagnostics';
  const summary = el('summary'), name = el('span', 'TRAIL / OBSERVATORY', 'td-eyebrow'), pulse = el('span', 'Idle', 'td-pulse');
  summary.append(name, pulse);
  const body = el('div', undefined, 'td-body'), heading = el('h2', 'Diagnostic reconstruction — not headset video');
  const status = el('p', STATUS_LABELS.local, 'td-status'); status.setAttribute('role', 'status');
  const state = el('dl', undefined, 'td-state');
  const stateFields = {};
  for (const key of ['Source', 'Mode', 'Phase', 'Required hands']) {
    const group = el('div'), term = el('dt', key), value = el('dd', 'No observation');
    group.append(term, value); state.append(group); stateFields[key] = value;
  }
  const timelineTitle = el('h3', 'Where did the gesture go?'), timeline = el('ol', undefined, 'td-timeline');
  const timelineNote = el('p', 'Stages describe software observations. UI acknowledgement does not prove the learner saw it.', 'td-note');
  const frictionTitle = el('h3', 'Step observations'), tableWrap = el('div', undefined, 'td-table-wrap'), table = el('table');
  const caption = el('caption', 'Current browser run · sources and revisions kept separate');
  const head = el('thead'), headRow = el('tr');
  for (const title of ['Step / source', 'Attempts¹', 'Confirmed / interrupted', 'Repeat / demo requests', 'Tracking loss', 'Time²']) { const th = el('th', title); th.scope = 'col'; headRow.append(th); }
  head.append(headRow); const rows = el('tbody'); table.append(caption, head, rows); tableWrap.append(table);
  const caveat = el('p', '¹ Includes the active attempt; confirmations are user reports. Demo requests count the explicit Watch demo action only. ² Exclusive observed states; hidden time, reported frame stalls and gaps over 2.5s are unknown. Time is not evidence of confusion or learning quality.', 'td-note');
  const review = el('p', 'No repeated interruption pattern observed.', 'td-review');
  const exportButton = el('button', 'Export safe observations'); exportButton.type = 'button';
  const exportNote = el('p', 'Contains generated aliases and state counts only. No room footage, hand coordinates, tutorial text, audio or credentials.', 'td-note');
  body.append(heading, status, state, timelineTitle, timeline, timelineNote, frictionTitle, tableWrap, review, caveat, exportButton, exportNote);
  root.append(summary, body); document.body.append(root);

  let records = [], latestState = null, telemetryStatus = 'local', scheduled = null, disposed = false;
  const aliases = new Map(); let nextAlias = 1;
  const alias = key => {
    if (!isOpaqueId(key)) return 'Tutorial';
    if (!aliases.has(key)) {
      if (aliases.size >= 60) aliases.delete(aliases.keys().next().value);
      aliases.set(key, `Tutorial ${nextAlias++}`);
    }
    return aliases.get(key);
  };
  const friction = createFrictionObserver({emit: (type, data) => telemetry.emit(type, data)});
  const ingest = (record, shouldEmit) => {
    const safe = safeRecord(record);
    if (!safe) return;
    records.push(safe); if (records.length > 300) records.shift();
    if (safe.type === 'guide_state') latestState = safe.data;
    friction.consume(safe, {emit: shouldEmit});
  };
  const renderTimeline = () => {
    const interactions = new Map();
    for (const record of records) if (record.type === 'interaction') {
      const id = record.data.interaction_id;
      if (!interactions.has(id)) interactions.set(id, []);
      interactions.get(id).push(record);
    }
    timeline.replaceChildren();
    if (!interactions.size) { timeline.append(el('li', 'No gesture observed yet.', 'td-empty')); return; }
    for (const history of [...interactions.values()].slice(-4).reverse()) {
      const events = history.slice(-8);
      const item = el('li'), first = events[0], last = events.at(-1);
      item.append(el('strong', `${first.data.control} · ${SOURCE_LABELS[first.data.source]}`));
      const stages = el('div', undefined, 'td-stages');
      for (let i = 0; i < events.length; i++) {
        const event = events[i], delta = i ? Math.max(0, event.t_ms - events[i - 1].t_ms) : 0;
        stages.append(el('span', `${STAGE_LABELS[event.data.stage]}${i ? ` +${Math.round(delta)}ms` : ''}`, event.data.stage === 'rejected' ? 'td-stage td-stopped' : 'td-stage'));
      }
      item.append(stages);
      if (last.data.reason && last.data.reason !== 'none') item.append(el('span', `Reason: ${last.data.reason.replaceAll('_', ' ')}`, 'td-note'));
      if (!['rejected', 'feedback_rendered'].includes(last.data.stage)) item.append(el('span', 'Awaiting the next observed stage.', 'td-note'));
      timeline.append(item);
    }
  };
  const render = () => {
    scheduled = null;
    if (disposed) return;
    try {
      status.textContent = STATUS_LABELS[telemetryStatus] || STATUS_LABELS.local;
      if (latestState) {
        pulse.textContent = PHASE_LABELS[latestState.phase] || 'No observation';
        stateFields.Source.textContent = SOURCE_LABELS[latestState.source] || 'Unknown';
        stateFields.Mode.textContent = latestState.mode || 'Unknown';
        stateFields.Phase.textContent = PHASE_LABELS[latestState.phase] || 'Unknown';
        stateFields['Required hands'].textContent = ['left', 'right'].filter(side => latestState[`required_${side}`]).map(side => `${side}: ${latestState[`tracking_${side}`] ? 'available' : 'unavailable'}`).join(' · ') || 'None required in current state';
      }
      renderTimeline();
      const data = friction.snapshot(); rows.replaceChildren();
      for (const row of data.rows.slice(-12)) {
        const tr = el('tr');
        const values = [
          `${alias(row.tutorial_key)} · v${row.revision} · step ${row.step_index + 1}\n${SOURCE_LABELS[row.source]}`,
          `${row.attempts}${row.in_progress ? ' · active' : ''}`,
          `${row.completed} / ${row.interrupted}`,
          `${row.repeats} / ${row.help_requests}`,
          `${row.tracking_interruptions} · ${seconds(row.tracking_lost_ms)}`,
          `Following ${seconds(row.following_ms)}\nPaused ${seconds(row.user_paused_ms)} · waiting ${seconds(row.system_wait_ms)}\nCheckpoint ${seconds(row.checkpoint_ms)} · unknown ${seconds(row.unknown_ms)}`,
        ];
        for (const value of values) tr.append(el('td', value));
        rows.append(tr);
      }
      if (!data.rows.length) { const tr = el('tr'), td = el('td', 'Follow a tutorial to collect step observations.'); td.colSpan = 6; tr.append(td); rows.append(tr); }
      const patterns = data.rows.filter(row => row.review_step);
      review.textContent = patterns.length
        ? `Review this step: ${patterns.slice(-3).map(row => `${alias(row.tutorial_key)}, v${row.revision}, step ${row.step_index + 1} (${SOURCE_LABELS[row.source]}; ${row.attempts} attempts)`).join('; ')}. Repeated tracking interruptions observed. Small, local sample; inspect the cause before changing a demonstration.`
        : 'No repeated interruption pattern observed. This local sample does not establish teaching quality.';
      if (data.rows.length > 12 || data.dropped_steps) review.textContent += ' Display shows the latest 12 step groups; storage is bounded to 60.';
    } catch { /* A diagnostic render failure must never interrupt guidance. */ }
  };
  const schedule = () => { if (!disposed && scheduled === null) scheduled = win.setTimeout(render, 250); };
  const exportData = () => ({schema: 'trail.observations.v1', provenance: 'diagnostic reconstruction, not headset video', status: telemetryStatus,
    boundary: 'State observations only; no assessment of confusion, learning quality or physical outcome.',
    events: records.map(record => ({...record, data: {...record.data}})), steps: friction.snapshot()});
  const download = () => {
    try {
      const blob = new win.Blob([JSON.stringify(exportData(), null, 2)], {type: 'application/json'}), url = win.URL.createObjectURL(blob);
      const a = el('a', 'Safe observations'); a.href = url; a.download = 'trail-safe-observations.json';
      a.classList.add('sentry-block'); a.hidden = true; document.body.append(a); a.click(); a.remove();
      win.setTimeout(() => win.URL.revokeObjectURL(url), 0);
    } catch { exportNote.textContent = 'Export unavailable in this browser. Observations remain local.'; }
  };
  exportButton.addEventListener('click', download);
  let unsubscribe = () => {};
  try {
    const initial = telemetry.snapshot(); telemetryStatus = Object.hasOwn(STATUS_LABELS, initial.status) ? initial.status : 'local';
    for (const record of initial.events || []) ingest(record, false);
    unsubscribe = telemetry.subscribe((record, snapshot) => {
      try { telemetryStatus = Object.hasOwn(STATUS_LABELS, snapshot?.status) ? snapshot.status : telemetryStatus; ingest(record, true); schedule(); } catch { /* isolated observer */ }
    });
    render();
  } catch { render(); }
  return {exportData, dispose() { disposed = true; try { unsubscribe(); } catch {} if (scheduled !== null) win.clearTimeout(scheduled); exportButton.removeEventListener('click', download); root.remove(); }};
}
