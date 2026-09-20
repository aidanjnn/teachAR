import test from 'node:test';
import assert from 'node:assert/strict';
import { Telemetry, isOpaqueId, sanitizeTelemetryData } from '../public/telemetry.mjs';
import { initializeSentry, sanitizeError, sanitizeTransaction, sanitizeLog, createPrivateTransport, createReplayProjector } from '../public/telemetry-sentry.mjs';

const SECRET = 'PRIVATE_CAMERA_TRANSCRIPT_TOKEN_SENTINEL';
const config = { enabled: true, dsn: 'https://0123456789abcdef0123456789abcdef@o1.ingest.sentry.io/1', environment: 'synthetic-test', release: 'trail-test', traces_sample_rate: 1, replay_enabled: false };
const interaction = (bus, fields = {}) => ({ interaction_id: bus.newId(), control: 'primary', source: 'synthetic', stage: 'activated', ...fields });

test('closed event schema strips media, text, coordinates, inherited fields and hostile accessors', () => {
  const bus = new Telemetry();
  const data = { ...interaction(bus), title: SECRET, body: SECRET, token: SECRET, position: [1, 2, 3], mode: SECRET, reason: SECRET, step_index: Infinity };
  Object.defineProperty(data, 'outcome', { get() { throw new Error(SECRET); } });
  const event = bus.emit('interaction', data);
  assert.ok(event);
  assert.ok(!JSON.stringify(event).includes(SECRET));
  assert.equal(event.data.position, undefined);
  assert.equal(event.data.reason, undefined);
  assert.ok(Object.isFrozen(event)); assert.ok(Object.isFrozen(event.data));
  assert.equal(bus.emit(SECRET, data), null);
  assert.equal(bus.emit('__proto__', data), null);
  assert.equal(bus.emit('interaction', { ...data, control: SECRET }), null);
  assert.equal(sanitizeTelemetryData('guide_state', Object.create({ phase: 'idle', source: 'synthetic' })), null);
});

test('ring and subscriber limits, monotonic timestamps and exception isolation are bounded', () => {
  let now = 100;
  const bus = new Telemetry({ clock: () => now, limit: 10000 });
  let calls = 0;
  bus.subscribe(() => { throw new Error(SECRET); });
  const off = bus.subscribe(() => calls++);
  now = 110; const a = bus.emit('interaction', interaction(bus));
  now = 105; const b = bus.emit('interaction', interaction(bus));
  assert.equal(a.t_ms, 10); assert.equal(b.t_ms, 10); assert.equal(calls, 2);
  off(); for (let i = 0; i < 320; i++) bus.emit('interaction', interaction(bus));
  assert.equal(bus.snapshot().events.length, 300); assert.equal(calls, 2);
  let listeners = 0;
  for (let i = 0; i < 100; i++) bus.subscribe(() => listeners++);
  bus.emit('interaction', interaction(bus)); assert.equal(listeners, 15);
  assert.ok(isOpaqueId(bus.newId())); assert.notEqual(bus.newId(), bus.newId());
  bus.setStatus(SECRET); assert.equal(bus.snapshot().status, 'local');
  bus.setStatus('configured'); assert.equal(bus.snapshot().status, 'configured');
});

test('subscriber recursive publication cannot starve tutor', () => {
  const bus = new Telemetry(); let calls = 0;
  bus.subscribe(() => { calls++; bus.emit('guide_state', { source: 'synthetic', phase: 'idle' }); });
  bus.emit('guide_state', { source: 'synthetic', phase: 'idle' });
  assert.equal(calls, 64); assert.ok(bus.snapshot().events.length <= 300);
});

test('summary schema retains explicit measured categories and checkpoint distinction only', () => {
  const bus = new Telemetry();
  const summary = bus.emit('step_summary', { tutorial_key: bus.newId(), attempt_id: bus.newId(), source: 'synthetic', step_index: 2, outcome: 'confirmed', checkpoint_reached: true, observed_ms: 2500, following_ms: 1000, unknown_ms: 1500, confirmations: 1, hidden_ms: Infinity, secret: SECRET });
  assert.equal(summary.data.checkpoint_reached, true);
  assert.equal(summary.data.confirmations, 1);
  assert.equal(summary.data.unknown_ms, 1500);
  assert.equal(summary.data.secret, undefined);
});

function mockSdk() {
  const result = { options: null, replay: null, spans: [], logs: [], active: null, closeCalls: 0 };
  const sdk = {
    init(options) { result.options = options; }, globalHandlersIntegration() { return { name: 'GlobalHandlers' }; },
    replayIntegration(options) { result.replay = options; return { name: 'Replay' }; },
    makeFetchTransport() { return { send: async () => ({ statusCode: 200 }), flush: async () => true }; },
    startInactiveSpan(options) {
      const span = { options, parent: result.active, ended: false, end() { this.ended = true; }, setStatus(status) { this.status = status; } };
      result.spans.push(span); return span;
    },
    withActiveSpan(span, fn) { const old = result.active; result.active = span; try { return fn(); } finally { result.active = old; } },
    logger: Object.fromEntries(['info', 'warn'].map(level => [level, (message, attributes) => result.logs.push({ level, message, attributes, span: result.active })])),
    async close() { result.closeCalls++; },
  };
  return { sdk, result };
}

test('absent/disabled/invalid configuration never loads SDK and import/init failure is isolated', async () => {
  const bus = new Telemetry(); let loaded = 0;
  const options = { telemetry: bus, loadSdk: () => { loaded++; throw new Error(SECRET); } };
  assert.equal((await initializeSentry({}, options)).status, 'local');
  assert.equal((await initializeSentry({ ...config, enabled: false }, options)).status, 'local');
  assert.equal((await initializeSentry({ ...config, dsn: 'https://user:SECRET@example.com/1' }, options)).status, 'local');
  for (const change of [{ dsn: config.dsn.replace('o1.ingest.sentry.io', 'example.com') }, { environment: 'private environment' }, { environment: 'a'.repeat(33) }, { release: 'a'.repeat(129) }, { traces_sample_rate: 1.1 }]) {
    assert.equal((await initializeSentry({ ...config, ...change }, options)).status, 'local');
  }
  assert.equal(loaded, 0);
  assert.equal((await initializeSentry(config, options)).status, 'error');
  assert.equal(bus.snapshot().status, 'error');
  assert.equal(loaded, 1); assert.ok(!JSON.stringify(bus.snapshot()).includes(SECRET));
});

test('Sentry trace stages and actual Logs API correlate and teardown ends incomplete spans', async () => {
  const bus = new Telemetry(), { sdk, result } = mockSdk();
  const bridge = await initializeSentry(config, { telemetry: bus, loadSdk: async () => sdk });
  assert.equal(bridge.status, 'configured'); assert.equal(result.options.defaultIntegrations, false);
  assert.equal(result.options.enableLogs, true); assert.equal(result.options.autoSessionTracking, false);
  assert.deepEqual(result.options.tracePropagationTargets, []); assert.equal(result.replay, null);
  const data = interaction(bus, { stage: 'targeted' });
  for (const stage of ['targeted', 'activated', 'hit_test', 'dispatched', 'state_changed', 'feedback_rendered']) bus.emit('interaction', { ...data, stage, body: SECRET });
  const roots = result.spans.filter(span => !span.parent);
  assert.equal(roots.length, 1); assert.equal(roots[0].ended, true);
  assert.equal(result.logs.length, 6); assert.ok(result.logs.every(log => log.span === roots[0]));
  assert.ok(!JSON.stringify(result.logs.map(log => log.attributes)).includes(SECRET));
  bus.emit('step_summary', { tutorial_key: bus.newId(), attempt_id: bus.newId(), step_index: 0, source: 'synthetic', outcome: 'left', observed_ms: 2000, unknown_ms: 5000 });
  const summary = result.spans.find(span => span.options.name === 'trail.step_summary');
  assert.equal(summary.options.startTime, undefined, 'Summary must not claim a continuous backdated measured operation');
  assert.equal(summary.options.attributes['trail.unknown_ms'], 5000);
  bus.emit('interaction', interaction(bus));
  await bridge.close(); await bridge.close();
  assert.ok(result.spans.every(span => span.ended)); assert.equal(result.closeCalls, 1);
  const count = result.logs.length; bus.emit('interaction', interaction(bus)); assert.equal(result.logs.length, count);
});

test('Replay is explicit opt-in, full page blocked, network/canvas/console disabled', async () => {
  const bus = new Telemetry(), { sdk, result } = mockSdk();
  const bridge = await initializeSentry({ ...config, replay_enabled: true }, { telemetry: bus, loadSdk: async () => sdk });
  assert.equal(result.replay.useCompression, false); assert.equal(result.replay.stickySession, false);
  assert.equal(result.replay.maskAllText, true); assert.equal(result.replay.maskAllInputs, true); assert.equal(result.replay.blockAllMedia, true);
  assert.ok(result.replay.block.includes('body > :not(#trail-diagnostics)'));
  assert.deepEqual(result.replay.unmask, ['#trail-diagnostics .trail-diagnostic-safe']);
  assert.equal(result.replay.networkCaptureBodies, false);
  assert.equal(result.replay.beforeAddRecordingEvent({ data: { payload: SECRET } }), null);
  await bridge.close();
});

test('independent event/log/span sanitizers discard sensitive SDK enrichments', () => {
  const bus = new Telemetry(), attrs = { 'trail.type': 'interaction', ...Object.fromEntries(Object.entries(interaction(bus)).map(([key, value]) => [`trail.${key}`, value])), 'user.email': SECRET, 'url.query': SECRET };
  const log = sanitizeLog({ message: SECRET, attributes: attrs, level: 'info' });
  assert.equal(log.message, 'trail.interaction'); assert.ok(!JSON.stringify(log).includes(SECRET));
  assert.equal(sanitizeLog({ message: SECRET, attributes: { secret: SECRET } }), null);
  const error = sanitizeError({ message: SECRET, request: { url: SECRET }, breadcrumbs: [SECRET], user: { email: SECRET }, exception: { values: [{ value: SECRET, stacktrace: { frames: [{ filename: `https://example.com/ar.js?token=${SECRET}`, lineno: 20, function: SECRET, vars: { secret: SECRET } }, { filename: SECRET }] } }] } });
  assert.equal(error.exception.values[0].stacktrace.frames[0].filename, 'ar.js');
  assert.ok(!JSON.stringify(error).includes(SECRET));
  const transaction = sanitizeTransaction({ transaction: 'trail.interaction', type: 'transaction', request: { url: SECRET }, contexts: { trace: { trace_id: 'a'.repeat(32), span_id: 'b'.repeat(16), data: attrs, private: SECRET } }, spans: [{ description: SECRET, data: attrs, secret: SECRET }] });
  assert.ok(!JSON.stringify(transaction).includes(SECRET));
  assert.equal(sanitizeTransaction({ transaction: SECRET }), null);
});

test('final transport strips scope attributes added after beforeSendLog and preserves log wire headers', async () => {
  const bus = new Telemetry(), record = bus.emit('guide_state', { phase: 'tracking_lost', source: 'synthetic' });
  const attrs = { 'trail.type': { type: 'string', value: 'guide_state' }, 'trail.phase': { type: 'string', value: record.data.phase }, 'trail.source': { type: 'string', value: 'synthetic' }, 'user.email': { type: 'string', value: SECRET } };
  const envelopes = [];
  const transport = createPrivateTransport({ send: async envelope => { envelopes.push(envelope); return { statusCode: 200 }; }, flush: async () => true }, config);
  await transport.send([{ secret: SECRET }, [[{ type: 'log', private: SECRET }, { items: [{ body: SECRET, timestamp: 1, trace_id: 'a'.repeat(32), attributes: attrs }] }], [{ type: 'attachment' }, SECRET]]]);
  assert.equal(envelopes.length, 1); assert.ok(!JSON.stringify(envelopes).includes(SECRET));
  assert.equal(envelopes[0][1][0][0].content_type, 'application/vnd.sentry.items.log+json');
  assert.equal(envelopes[0][1][0][1].version, 2);
  assert.deepEqual(envelopes[0][1][0][1].ingest_settings, { infer_ip: 'never', infer_user_agent: 'never' });
  assert.equal(envelopes[0][1][0][1].items[0].trace_id, 'a'.repeat(32));
});

test('final event payloads retain the explicit Relay IP-inference opt-out', async () => {
  const sdk = { name: SECRET, version: SECRET, settings: { infer_ip: 'auto', private: SECRET }, client_ip: SECRET };
  const base = { event_id: 'a'.repeat(32), timestamp: 1, sdk, user: { ip_address: SECRET } };
  const recording = JSON.stringify({ segment_id: 0 }) + '\n' + JSON.stringify([{ type: 4, timestamp: 1, data: { href: SECRET } }]);
  const envelopes = [];
  const transport = createPrivateTransport({ send: async envelope => { envelopes.push(envelope); return { statusCode: 200 }; }, flush: async () => true }, config);
  await transport.send([{}, [
    [{ type: 'event' }, base],
    [{ type: 'transaction' }, { ...base, transaction: 'trail.interaction' }],
    [{ type: 'replay_event' }, { ...base, replay_id: 'b'.repeat(32), segment_id: 0 }],
    [{ type: 'replay_recording' }, recording],
  ]]);
  const events = envelopes[0][1].filter(([header]) => header.type !== 'replay_recording');
  assert.equal(events.length, 3);
  for (const [, event] of events) {
    assert.deepEqual(event.sdk, { name: 'sentry.javascript.browser', version: '10.75.0', settings: { infer_ip: 'never' } });
    assert.equal(event.user, undefined);
  }
  assert.ok(!JSON.stringify(envelopes).includes(SECRET));
});

test('Replay transport projection preserves safe DOM updates and excludes private DOM, URLs, attributes, console and input events', () => {
  const project = createReplayProjector();
  const element = (id, tagName, attributes, childNodes = []) => ({ type: 2, id, tagName, attributes, childNodes });
  const text = (id, textContent) => ({ type: 3, id, textContent });
  const tree = { type: 0, id: 0, childNodes: [element(1, 'html', { secret: SECRET }, [element(2, 'head', {}, [element(3, 'script', { src: SECRET })]), element(4, 'body', {}, [element(5, 'div', { id: 'actual-app', title: SECRET }, [text(6, SECRET)]), element(7, 'section', { id: 'trail-diagnostics', token: SECRET }, [element(8, 'span', { class: 'trail-diagnostic-safe', title: SECRET }, [text(9, 'tracking_lost')])])])])] };
  const recording = JSON.stringify({ segment_id: 0 }) + '\n' + JSON.stringify([{ type: 4, timestamp: 1, data: { href: SECRET } }, { type: 2, timestamp: 2, data: { node: tree } }, { type: 5, timestamp: 3, data: { tag: 'console', payload: SECRET } }]);
  const initial = project(recording);
  assert.ok(initial.includes('tracking_lost')); assert.ok(!initial.includes(SECRET));
  const mutations = JSON.stringify({ segment_id: 1 }) + '\n' + JSON.stringify([{ type: 3, timestamp: 4, data: { source: 0, texts: [{ id: 9, value: 'following' }, { id: 6, value: SECRET }], attributes: [{ id: 8, attributes: { title: SECRET } }], adds: [{ parentId: 5, node: text(10, SECRET) }], removes: [] } }, { type: 3, timestamp: 5, data: { source: 5, id: 9, text: SECRET } }]);
  const update = project(mutations); assert.ok(update.includes('following')); assert.ok(!update.includes(SECRET));
  const removal = JSON.stringify({ segment_id: 2 }) + '\n' + JSON.stringify([{ type: 3, timestamp: 6, data: { source: 0, removes: [{ parentId: 7, id: 8 }] } }]);
  assert.ok(project(removal).includes('removes'));
  const staleChild = JSON.stringify({ segment_id: 3 }) + '\n' + JSON.stringify([{ type: 3, timestamp: 7, data: { source: 0, texts: [{ id: 9, value: SECRET }] } }]);
  assert.equal(project(staleChild), null, 'Removed subtree IDs must no longer authorize text');
  assert.equal(project(new Uint8Array([1, 2, 3])), null);
  assert.equal(project('invalid'), null);
});
