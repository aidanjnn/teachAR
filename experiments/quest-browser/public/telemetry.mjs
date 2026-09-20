// Observation only: no persistence, coordinates, media, tutorial text or control effects.
const enums = {
  type: ['interaction', 'guide_state', 'guide_action', 'step_summary'],
  stage: ['targeted', 'activated', 'hit_test', 'dispatched', 'state_changed', 'feedback_rendered', 'rejected'],
  source: ['webxr', 'desktop', 'synthetic'],
  status: ['local', 'configured', 'error'],
  phase: ['idle', 'following', 'user_paused', 'tracking_lost', 'system_wait', 'checkpoint', 'hidden'],
  action: ['repeat', 'help', 'confirm', 'start', 'pause', 'resume', 'leave'],
  outcome: ['observed', 'matched', 'missed', 'dispatched', 'changed', 'ui_acknowledged', 'blocked', 'abandoned'],
  reason: ['none', 'target_left', 'no_pose', 'no_control', 'preview_only', 'hidden', 'session_ended', 'guide_rejected', 'dispatch_error', 'no_state_change', 'render_timeout', 'superseded', 'pending_limit'],
  summary_outcome: ['checkpoint', 'confirmed', 'repeated', 'left', 'superseded'],
  mode: ['home', 'loading-library', 'library', 'save-home', 'setup-new', 'setup-follow', 'start', 'end', 'placement', 'adjust-placement', 'author', 'author-options', 'capture', 'capture-paused', 'confirm-discard', 'saving', 'saving-tutorial', 'review-step', 'review-options', 'saved', 'learn', 'learn-options', 'finished', 'unknown'],
  control: ['none', 'create', 'library', 'edit-current', 'open-tutorial', 'library-prev', 'library-next', 'home', 'set-save-position', 'cancel-save-position', 'setup-ready', 'primary', 'redo-placement', 'placement-ready', 'adjust-placement', 'shift-left', 'shift-right', 'shift-away', 'shift-near', 'rotate-placement', 'placement-back', 'hand', 'clear', 'author-options', 'toggle-clean', 'change-save-position', 'capture-reference', 'author-back', 'replay', 'removeCue', 'discard-confirm', 'discard-take', 'keep-take', 'guide-hands', 'review-options', 'verify', 'cue', 'review-back', 'start-follow', 'try-follow', 'watch-demo', 'learn-options', 'restart-follow', 'move-tutorial', 'learn-back', 'retry-save', 'panel-place', 'exit', 'enter-ar'],
};
export const TELEMETRY_ENUMS = Object.freeze(Object.fromEntries(Object.entries(enums).map(([key, values]) => [key, Object.freeze(values)])));
export const isOpaqueId = value => typeof value === 'string' && /^t_[a-f0-9]{32}$/.test(value);
const enumValue = key => value => TELEMETRY_ENUMS[key].includes(value);
const integer = max => value => Number.isSafeInteger(value) && value >= 0 && value <= max;
const duration = value => Number.isFinite(value) && value >= 0 && value <= 86_400_000;
const boolean = value => typeof value === 'boolean';
const identity = { tutorial_key: isOpaqueId, revision: integer(1_000_000_000), step_index: integer(9999), attempt_id: isOpaqueId, source: enumValue('source'), mode: enumValue('mode') };
const schema = {
  interaction: { ...identity, interaction_id: isOpaqueId, stage: enumValue('stage'), control: enumValue('control'), reason: enumValue('reason'), outcome: enumValue('outcome') },
  guide_state: { ...identity, phase: enumValue('phase'), tracking_left: boolean, tracking_right: boolean, required_left: boolean, required_right: boolean, observation_gap_ms: duration },
  guide_action: { ...identity, action: enumValue('action') },
  step_summary: { ...identity, outcome: enumValue('summary_outcome'), checkpoint_reached: boolean, ...Object.fromEntries(['observed_ms', 'following_ms', 'user_paused_ms', 'tracking_lost_ms', 'system_wait_ms', 'checkpoint_ms', 'unknown_ms'].map(key => [key, duration])), ...Object.fromEntries(['tracking_interruptions', 'repeats', 'help_requests', 'confirmations', 'samples'].map(key => [key, integer(1_000_000)])) },
};
const required = { interaction: ['interaction_id', 'stage', 'control', 'source'], guide_state: ['phase', 'source'], guide_action: ['action', 'source'], step_summary: ['tutorial_key', 'attempt_id', 'step_index', 'outcome', 'source'] };

// Construct a fresh object from a closed schema. Unknown keys and invalid optional
// scalars are discarded; an invalid required discriminator drops the whole event.
export function sanitizeTelemetryData(type, data) {
  try {
    if (!Object.hasOwn(schema, type) || !data || typeof data !== 'object') return null;
    const safe = {};
    for (const [key, validate] of Object.entries(schema[type])) {
      const descriptor = Object.getOwnPropertyDescriptor(data, key);
      if (descriptor && 'value' in descriptor && validate(descriptor.value)) safe[key] = descriptor.value;
    }
    if (required[type].some(key => !Object.hasOwn(safe, key))) return null;
    return Object.freeze(safe);
  } catch { return null; }
}

let fallbackCounter = 0;
function opaqueId() {
  const bytes = new Uint8Array(16);
  try { globalThis.crypto.getRandomValues(bytes); }
  catch {
    for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
    const count = ++fallbackCounter;
    for (let i = 0; i < 4; i++) bytes[12 + i] = (count >>> (i * 8)) & 255;
  }
  return `t_${Array.from(bytes, value => value.toString(16).padStart(2, '0')).join('')}`;
}

export class Telemetry {
  #events = []; #listeners = new Set(); #queue = []; #dispatching = false;
  #seq = 0; #last = 0; #origin; #clock; #limit; #status = 'local'; #run;
  constructor({ clock = () => globalThis.performance?.now() ?? 0, limit = 300 } = {}) {
    this.#clock = typeof clock === 'function' ? clock : () => 0;
    this.#origin = this.#readClock();
    this.#limit = Number.isSafeInteger(limit) ? Math.max(1, Math.min(300, limit)) : 300;
    this.#run = opaqueId();
  }
  #readClock() { try { const value = this.#clock(); return Number.isFinite(value) ? value : this.#last; } catch { return this.#last; } }
  newId() { return opaqueId(); }
  snapshot() { return Object.freeze({ events: Object.freeze([...this.#events]), status: this.#status, run_id: this.#run }); }
  setStatus(status) {
    if (!TELEMETRY_ENUMS.status.includes(status) || status === this.#status) return;
    this.#status = status; this.#notify(null);
  }
  emit(type, data = {}) {
    if (this.#queue.length >= 32) return null;
    const safe = sanitizeTelemetryData(type, data);
    if (!safe) return null;
    this.#last = Math.max(this.#last, this.#readClock() - this.#origin, 0);
    const record = Object.freeze({ seq: ++this.#seq, t_ms: this.#last, run_id: this.#run, type, data: safe });
    this.#events.push(record);
    if (this.#events.length > this.#limit) this.#events.shift();
    this.#notify(record);
    return record;
  }
  subscribe(listener) {
    if (typeof listener !== 'function' || this.#listeners.size >= 16) return () => {};
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }
  #notify(record) {
    this.#queue.push(record);
    if (this.#dispatching) return;
    this.#dispatching = true;
    try {
      let remaining = 64;
      while (this.#queue.length && remaining-- > 0) {
        const next = this.#queue.shift(), snapshot = this.snapshot();
        for (const listener of [...this.#listeners]) { try { listener(next, snapshot); } catch { /* diagnostics must not affect the tutor */ } }
      }
    } finally { this.#queue.length = 0; this.#dispatching = false; }
  }
}
export const telemetry = new Telemetry();
