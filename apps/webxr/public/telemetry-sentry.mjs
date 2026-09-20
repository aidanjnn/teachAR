import { telemetry as defaultTelemetry, sanitizeTelemetryData, isOpaqueId, TELEMETRY_ENUMS } from './telemetry.mjs';

// Explicit SDK adapter. Local diagnostics work without a DSN or network access.
const HEX32 = /^[a-f0-9]{32}$/;
const HEX16 = /^[a-f0-9]{16}$/;
const SAFE_ENVIRONMENT = /^[a-zA-Z0-9._-]{1,32}$/;
const SAFE_RELEASE = /^[a-zA-Z0-9._@+/-]{1,128}$/;
const HOSTED_DSN = /^https:\/\/[a-fA-F0-9]{16,64}@(?:o\d+\.)?ingest(?:\.[a-z0-9-]+)?\.sentry\.io\/\d+$/;
const finite = value => typeof value === 'number' && Number.isFinite(value) && value >= 0;
const pickNumber = (out, key, value) => { if (finite(value)) out[key] = value; };
const pickId = (out, key, value, pattern = HEX32) => { if (typeof value === 'string' && pattern.test(value)) out[key] = value; };

function attributesFor(record) {
  return { 'trail.type': record.type, 'trail.run_id': record.run_id, 'trail.seq': record.seq, 'trail.t_ms': record.t_ms,
    ...Object.fromEntries(Object.entries(record.data).map(([key, value]) => [`trail.${key}`, value])) };
}

export function sanitizeAttributes(input = {}, serialized = false) {
  if (!input || typeof input !== 'object') return null;
  const unwrap = value => serialized ? value?.value : value;
  const type = unwrap(input['trail.type']);
  if (!TELEMETRY_ENUMS.type.includes(type)) return null;
  const candidate = {};
  for (const key of Object.keys(input)) if (key.startsWith('trail.')) candidate[key.slice(6)] = unwrap(input[key]);
  const data = sanitizeTelemetryData(type, candidate);
  if (!data) return null;
  const safe = Object.fromEntries(Object.entries(data).map(([key, value]) => [`trail.${key}`, value]));
  safe['trail.type'] = type;
  if (isOpaqueId(candidate.run_id)) safe['trail.run_id'] = candidate.run_id;
  if (Number.isSafeInteger(candidate.seq) && candidate.seq >= 0) safe['trail.seq'] = candidate.seq;
  if (finite(candidate.t_ms)) safe['trail.t_ms'] = candidate.t_ms;
  for (const key of ['sentry.trace.parent_span_id', 'sentry.replay_id']) {
    const value = unwrap(input[key]);
    if (typeof value === 'string' && (key.endsWith('span_id') ? HEX16 : HEX32).test(value)) safe[key] = value;
  }
  for (const key of ['sentry.release', 'sentry.environment']) {
    const value = unwrap(input[key]);
    if (typeof value === 'string' && (key === 'sentry.release' ? SAFE_RELEASE : SAFE_ENVIRONMENT).test(value)) safe[key] = value;
  }
  if (serialized) return Object.fromEntries(Object.entries(safe).map(([key, value]) => [key, { type: typeof value === 'number' ? (Number.isInteger(value) ? 'integer' : 'double') : typeof value, value }]));
  return safe;
}

export function sanitizeLog(log) {
  const attributes = sanitizeAttributes(log?.attributes);
  if (!attributes) return null;
  return { level: log.level === 'warn' ? 'warn' : 'info', message: `trail.${attributes['trail.type']}`, attributes };
}

function traceContext(context = {}) {
  const safe = {};
  pickId(safe, 'trace_id', context.trace_id);
  pickId(safe, 'span_id', context.span_id, HEX16);
  pickId(safe, 'parent_span_id', context.parent_span_id, HEX16);
  if (['ok', 'cancelled', 'deadline_exceeded', 'internal_error', 'unknown_error'].includes(context.status)) safe.status = context.status;
  if (['ui.interaction', 'ui.stage', 'guide.step.summary'].includes(context.op)) safe.op = context.op;
  const data = sanitizeAttributes(context.data);
  if (data) safe.data = data;
  return safe;
}
export function sanitizeSpan(span) {
  const safe = traceContext(span);
  const data = sanitizeAttributes(span?.data);
  safe.data = data ?? {};
  const description = span?.description;
  safe.description = typeof description === 'string' && /^trail\.(interaction|step_summary|stage\.(targeted|activated|hit_test|dispatched|state_changed|feedback_rendered|rejected))$/.test(description) ? description : 'trail.interaction';
  pickNumber(safe, 'start_timestamp', span?.start_timestamp);
  pickNumber(safe, 'timestamp', span?.timestamp);
  return safe;
}
function eventBase(event, config) {
  // Relay's legacy JavaScript behavior infers the connection IP when this SDK
  // setting is absent, even with no user in the payload. Reconstruct the pinned
  // SDK's explicit opt-out instead of stripping it with other SDK enrichments.
  const out = { platform: 'javascript', environment: config.environment, release: config.release,
    sdk: { name: 'sentry.javascript.browser', version: '10.75.0', settings: { infer_ip: 'never' } } };
  pickId(out, 'event_id', event?.event_id);
  pickNumber(out, 'timestamp', event?.timestamp);
  if (event?.contexts?.trace) out.contexts = { trace: traceContext(event.contexts.trace) };
  if (HEX32.test(event?.contexts?.replay?.replay_id ?? '')) out.contexts = { ...out.contexts, replay: { replay_id: event.contexts.replay.replay_id } };
  return out;
}
export function sanitizeError(event, config = {}) {
  if (!event || event.type) return null;
  // Raw exception messages, stack locals, requests and breadcrumbs can include
  // tutorial text, device paths or provider data. Preserve only known source lines.
  const frames = event.exception?.values?.flatMap(value => value.stacktrace?.frames ?? []).slice(-24).flatMap(frame => {
    const name = typeof frame.filename === 'string' ? frame.filename.split('/').pop()?.split(/[?#]/)[0] : '';
    if (!['ar.js', 'tutorial-guide.mjs', 'tutorial-ui.mjs', 'tutorial-follow.mjs', 'telemetry-runtime.mjs', 'telemetry.mjs', 'telemetry-friction.mjs', 'telemetry-panel.mjs'].includes(name)) return [];
    const safe = { filename: name, in_app: true };
    if (Number.isInteger(frame.lineno) && frame.lineno > 0) safe.lineno = frame.lineno;
    if (Number.isInteger(frame.colno) && frame.colno > 0) safe.colno = frame.colno;
    return [safe];
  }) ?? [];
  return { ...eventBase(event, config), level: 'error', exception: { values: [{ type: 'TrailRuntimeError', value: 'TeachAR runtime error; private details withheld', ...(frames.length ? { stacktrace: { frames } } : {}) }] } };
}
export function sanitizeTransaction(event, config = {}) {
  if (!['trail.interaction', 'trail.step_summary'].includes(event?.transaction)) return null;
  const safe = { ...eventBase(event, config), type: 'transaction', transaction: event.transaction, transaction_info: { source: 'custom' }, spans: (event.spans ?? []).slice(0, 32).map(sanitizeSpan) };
  pickNumber(safe, 'start_timestamp', event.start_timestamp);
  return safe;
}

// rrweb's beforeAddRecordingEvent hook excludes its DOM/meta events. The final
// transport therefore projects the *uncompressed* recording to this safe DOM
// subtree and retained node IDs. No page URL, arbitrary attributes or input
// interactions reach the Replay envelope, even if a later page adds new media.
export function createReplayProjector() {
  let allowed = new Set(), descendants = new Map(), bodyId = null;
  const nodeId = value => Number.isSafeInteger(value) && value >= 0;
  const tags = new Set(['html', 'body', 'section', 'details', 'summary', 'h2', 'h3', 'p', 'small', 'strong', 'span', 'div', 'dl', 'dt', 'dd', 'table', 'caption', 'thead', 'tbody', 'tr', 'td', 'th', 'pre', 'code', 'ul', 'ol', 'li', 'button', 'br']);
  function forget(id) {
    for (const child of descendants.get(id) ?? []) forget(child);
    allowed.delete(id); descendants.delete(id);
  }
  function node(raw, inside = false) {
    if (allowed.size >= 5000) throw new Error('Replay diagnostic tree exceeds bounds');
    if (!raw || !nodeId(raw.id)) return null;
    if (raw.type === 0) return { type: 0, id: raw.id, childNodes: (raw.childNodes ?? []).map(child => node(child)).filter(Boolean) };
    if (raw.type === 3 && inside) {
      allowed.add(raw.id);
      return { type: 3, id: raw.id, textContent: typeof raw.textContent === 'string' ? raw.textContent.slice(0, 12000) : '' };
    }
    if (raw.type !== 2 || !tags.has(raw.tagName)) return null;
    const root = raw.attributes?.id === 'trail-diagnostics';
    if (!inside && !root && !['html', 'body'].includes(raw.tagName)) return null;
    if (raw.tagName === 'body') bodyId = raw.id;
    const safe = { type: 2, id: raw.id, tagName: raw.tagName, attributes: {}, childNodes: [] };
    if (root) safe.attributes.id = 'trail-diagnostics';
    if (root || inside) allowed.add(raw.id);
    if (raw.tagName === 'details') safe.attributes.open = '';
    safe.childNodes = (raw.childNodes ?? []).map(child => node(child, inside || root)).filter(Boolean);
    if (root || inside) descendants.set(raw.id, new Set(safe.childNodes.map(child => child.id)));
    return safe;
  }
  return payload => {
    try {
      if (typeof payload !== 'string' || payload.length > 2_000_000) return null;
      const newline = payload.indexOf('\n');
      const header = JSON.parse(payload.slice(0, newline));
      if (!Number.isSafeInteger(header.segment_id) || header.segment_id < 0) return null;
      const rawEvents = JSON.parse(payload.slice(newline + 1));
      if (!Array.isArray(rawEvents) || rawEvents.length > 10000) return null;
      const events = [];
      for (const raw of rawEvents) {
        if (!raw || !finite(raw.timestamp)) continue;
        const base = { type: raw.type, timestamp: raw.timestamp };
        if (raw.type === 2) {
          allowed = new Set(); descendants = new Map(); bodyId = null;
          const root = node(raw.data?.node);
          if (root) events.push({ ...base, data: { node: root, initialOffset: { left: 0, top: 0 } } });
        } else if (raw.type === 4) {
          events.push({ ...base, data: { href: 'https://trail.invalid/diagnostics', width: 1024, height: 768 } });
        } else if (raw.type === 0 || raw.type === 1) {
          events.push({ ...base, data: {} });
        } else if (raw.type === 3 && raw.data?.source === 0) {
          const data = { source: 0, texts: [], attributes: [], removes: [], adds: [] };
          // Forget moved/removed subtrees before evaluating text in this batch.
          for (const change of (raw.data.removes ?? []).slice(0, 2000)) if (allowed.has(change.id)) {
            data.removes.push({ parentId: change.parentId, id: change.id });
            descendants.get(change.parentId)?.delete(change.id); forget(change.id);
          }
          for (const change of (raw.data.texts ?? []).slice(0, 2000)) if (allowed.has(change.id)) data.texts.push({ id: change.id, value: typeof change.value === 'string' ? change.value.slice(0, 12000) : '' });
          for (const change of (raw.data.adds ?? []).slice(0, 2000)) {
            if (!allowed.has(change.parentId) && !(change.parentId === bodyId && change.node?.attributes?.id === 'trail-diagnostics')) continue;
            const safeNode = node(change.node, allowed.has(change.parentId));
            if (safeNode) {
              data.adds.push({ parentId: change.parentId, nextId: allowed.has(change.nextId) ? change.nextId : null, node: safeNode });
              descendants.get(change.parentId)?.add(safeNode.id);
            }
          }
          if (data.texts.length || data.removes.length || data.adds.length) events.push({ ...base, data });
        }
      }
      if (!events.length) return null;
      return `${JSON.stringify({ segment_id: header.segment_id })}\n${JSON.stringify(events)}`;
    } catch { allowed = new Set(); descendants = new Map(); bodyId = null; return null; }
  };
}

function sanitizeReplayEvent(raw, config) {
  if (!HEX32.test(raw?.replay_id ?? '') || !Number.isSafeInteger(raw.segment_id)) return null;
  const safe = { ...eventBase(raw, config), type: 'replay_event', replay_id: raw.replay_id, segment_id: raw.segment_id, replay_type: 'session', urls: [], error_ids: (raw.error_ids ?? []).filter(id => HEX32.test(id)).slice(0, 32), trace_ids: (raw.trace_ids ?? []).filter(id => HEX32.test(id)).slice(0, 32), segment_names: [] };
  pickNumber(safe, 'replay_start_timestamp', raw.replay_start_timestamp);
  return safe;
}

export function createPrivateTransport(base, config, onFailure = () => {}) {
  const projectReplay = createReplayProjector();
  return {
    async send(envelope) {
      try {
        const items = [];
        const hasRecording = envelope[1].some(([header]) => header.type === 'replay_recording');
        let projectedReplay = null;
        if (hasRecording) projectedReplay = projectReplay(envelope[1].find(([header]) => header.type === 'replay_recording')[1]);
        for (const [header, payload] of envelope[1]) {
          let safe = null;
          if (header.type === 'event') safe = sanitizeError(payload, config);
          if (header.type === 'transaction') safe = sanitizeTransaction(payload, config);
          if (header.type === 'log' && Array.isArray(payload?.items)) {
            const logs = payload.items.slice(0, 100).flatMap(log => {
              const attributes = sanitizeAttributes(log.attributes, true);
              if (!attributes) return [];
              const safeLog = { timestamp: log.timestamp, level: log.level === 'warn' ? 'warn' : 'info', body: `trail.${attributes['trail.type'].value}`, attributes };
              pickId(safeLog, 'trace_id', log.trace_id);
              return [safeLog];
            });
            if (logs.length) safe = { version: 2, items: logs, ingest_settings: { infer_ip: 'never', infer_user_agent: 'never' } };
          }
          if (header.type === 'replay_event' && projectedReplay) safe = sanitizeReplayEvent(payload, config);
          if (header.type === 'replay_recording' && projectedReplay) safe = projectedReplay;
          if (safe) items.push([{ type: header.type, ...(header.type === 'log' ? { item_count: safe.items.length, content_type: 'application/vnd.sentry.items.log+json' } : {}), ...(header.type === 'replay_recording' ? { length: new TextEncoder().encode(safe).length } : {}) }, safe]);
        }
        if (!items.length) return { statusCode: 200 };
        const envelopeHeader = {};
        pickId(envelopeHeader, 'event_id', envelope[0]?.event_id);
        const result = await base.send([envelopeHeader, items]);
        if (result?.statusCode >= 400) onFailure();
        return result;
      } catch { onFailure(); return { statusCode: 0 }; }
    },
    flush(timeout) { try { return Promise.resolve(base.flush(timeout)).catch(() => { onFailure(); return false; }); } catch { onFailure(); return Promise.resolve(false); } },
  };
}

function safeConfig(raw) {
  try {
    if (raw?.enabled !== true || typeof raw.dsn !== 'string' || !HOSTED_DSN.test(raw.dsn)) return null;
    if (!SAFE_ENVIRONMENT.test(raw.environment ?? '') || !SAFE_RELEASE.test(raw.release ?? '')) return null;
    if (!finite(raw.traces_sample_rate) || raw.traces_sample_rate > 1) return null;
    return { dsn: raw.dsn, environment: raw.environment, release: raw.release, replay_enabled: raw.replay_enabled === true, tracesSampleRate: raw.traces_sample_rate };
  } catch { return null; }
}

export async function initializeSentry(rawConfig, { telemetry = defaultTelemetry, loadSdk = () => import('/vendor/sentry.mjs') } = {}) {
  const config = safeConfig(rawConfig);
  if (!config) { telemetry.setStatus('local'); return { status: 'local', close: async () => {} }; }
  let sdk, unsubscribe = () => {}, timer, closed = false;
  const pending = new Map();
  const fail = () => telemetry.setStatus('error');
  const finish = (id, reason = null) => {
    const active = pending.get(id);
    if (!active) return;
    pending.delete(id);
    try {
      active.stage?.end();
      if (reason) active.span.setStatus({ code: 2, message: reason === 'timeout' ? 'deadline_exceeded' : 'cancelled' });
      active.span.end();
    } catch { fail(); }
  };
  const close = async () => {
    if (closed) return;
    closed = true; unsubscribe(); clearInterval(timer);
    for (const id of pending.keys()) finish(id, 'closed');
    try { await sdk?.getReplay?.()?.stop(); await sdk?.close?.(1500); } catch { fail(); }
  };
  try {
    sdk = await loadSdk();
    const integrations = [];
    if (sdk.globalHandlersIntegration) integrations.push(sdk.globalHandlersIntegration());
    if (config.replay_enabled) integrations.push(sdk.replayIntegration({
      useCompression: false, stickySession: false, maskAllText: true, maskAllInputs: true, blockAllMedia: true,
      block: ['body > :not(#trail-diagnostics)', 'canvas', 'video', 'audio', 'img', 'input', 'textarea', 'select', 'iframe', 'object', 'embed', '[contenteditable]'],
      unmask: ['#trail-diagnostics .trail-diagnostic-safe'], networkDetailAllowUrls: [], networkDetailDenyUrls: [/.*/], networkCaptureBodies: false,
      networkRequestHeaders: [], networkResponseHeaders: [], slowClickTimeout: 0,
      beforeAddRecordingEvent: () => null, onError: fail,
    }));
    sdk.init({ dsn: config.dsn, environment: config.environment, release: config.release, defaultIntegrations: false, integrations,
      sendDefaultPii: false, autoSessionTracking: false, enableLogs: true, maxBreadcrumbs: 0, sendClientReports: false,
      tracesSampleRate: config.tracesSampleRate, tracePropagationTargets: [], replaysSessionSampleRate: config.replay_enabled ? 1 : 0, replaysOnErrorSampleRate: 0,
      beforeSend: event => sanitizeError(event, config), beforeSendTransaction: event => sanitizeTransaction(event, config), beforeSendSpan: sanitizeSpan,
      beforeSendLog: sanitizeLog, transport: options => createPrivateTransport(sdk.makeFetchTransport(options), config, fail),
    });
    unsubscribe = telemetry.subscribe(record => {
      if (!record || closed) return;
      try {
        const attrs = attributesFor(record);
        const log = () => sdk.logger[record.data.stage === 'rejected' ? 'warn' : 'info'](`trail.${record.type}`, attrs);
        if (record.type === 'interaction') {
          const id = record.data.interaction_id;
          let active = pending.get(id);
          if (!active) {
            if (pending.size >= 32) finish(pending.keys().next().value, 'closed');
            active = { span: sdk.startInactiveSpan({ name: 'trail.interaction', op: 'ui.interaction', forceTransaction: true, attributes: attrs }), touched: Date.now(), stage: null };
            pending.set(id, active);
          }
          active.stage?.end(); active.touched = Date.now();
          sdk.withActiveSpan(active.span, () => {
            active.stage = sdk.startInactiveSpan({ name: `trail.stage.${record.data.stage}`, op: 'ui.stage', attributes: attrs });
            log();
          });
          if (['feedback_rendered', 'rejected'].includes(record.data.stage)) finish(id);
        } else if (record.type === 'step_summary') {
          // This is a summary event. Its categories can contain unknown time and
          // must not be presented as one continuous measured operation.
          const span = sdk.startInactiveSpan({ name: 'trail.step_summary', op: 'guide.step.summary', forceTransaction: true, attributes: attrs });
          sdk.withActiveSpan(span, log); span.end();
        } else log();
      } catch { fail(); }
    });
    timer = setInterval(() => { for (const [id, active] of pending) if (Date.now() - active.touched > 15000) finish(id, 'timeout'); }, 5000);
    timer.unref?.();
    telemetry.setStatus('configured');
    return { status: 'configured', close };
  } catch { fail(); await close(); return { status: 'error', close }; }
}
