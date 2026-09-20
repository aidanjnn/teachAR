import {isOpaqueId, sanitizeTelemetryData} from './telemetry.mjs';

// This observer measures application states. It never assesses learning or drives progression.
const DURATION_KEYS = ['following_ms', 'user_paused_ms', 'tracking_lost_ms', 'system_wait_ms', 'checkpoint_ms', 'unknown_ms'];
const COUNT_KEYS = ['tracking_interruptions', 'repeats', 'help_requests', 'confirmations', 'samples'];
const PHASE_KEYS = {following: 'following_ms', user_paused: 'user_paused_ms', tracking_lost: 'tracking_lost_ms', system_wait: 'system_wait_ms', checkpoint: 'checkpoint_ms'};
const identityKey = data => [data.tutorial_key, data.revision, data.step_index, data.attempt_id, data.source].join(':');
const stepKey = data => [data.tutorial_key, data.revision, data.step_index, data.source].join(':');
const identity = data => ({tutorial_key: data.tutorial_key, revision: data.revision, step_index: data.step_index, attempt_id: data.attempt_id, source: data.source});
const validIdentity = data => data && isOpaqueId(data.tutorial_key) && isOpaqueId(data.attempt_id)
  && Number.isInteger(data.revision) && Number.isInteger(data.step_index) && data.step_index >= 0
  && ['webxr', 'desktop', 'synthetic'].includes(data.source);
const zeroCounters = () => Object.fromEntries([...DURATION_KEYS, ...COUNT_KEYS].map(key => [key, 0]));
const phaseOf = data => {
  if (data.phase === 'hidden') return 'hidden';
  if (['idle', 'user_paused', 'system_wait', 'checkpoint'].includes(data.phase)) return data.phase;
  if ((data.required_left && !data.tracking_left) || (data.required_right && !data.tracking_right)) return 'tracking_lost';
  return data.phase;
};

export function createFrictionObserver({emit = () => {}, maxSteps = 60, maxGapMs = 2500} = {}) {
  const groups = new Map(), ended = new Set();
  let active = null, droppedSteps = 0;
  const rememberEnded = key => {
    ended.add(key);
    if (ended.size > 2000) ended.delete(ended.values().next().value);
  };
  const groupFor = data => {
    const key = stepKey(data);
    if (!groups.has(key)) {
      if (groups.size >= maxSteps) { groups.delete(groups.keys().next().value); droppedSteps++; }
      groups.set(key, {...identity(data), ...zeroCounters(), attempts: 0, completed: 0, interrupted: 0, checkpoint_attempts: 0});
    }
    return groups.get(key);
  };
  const aggregate = summary => {
    const key = identityKey(summary);
    if (ended.has(key)) return;
    rememberEnded(key);
    const group = groupFor(summary);
    group.attempts++;
    if (summary.outcome === 'confirmed') group.completed++;
    else group.interrupted++;
    if (summary.checkpoint_reached) group.checkpoint_attempts++;
    for (const field of [...DURATION_KEYS, ...COUNT_KEYS]) group[field] += summary[field] || 0;
  };
  const advance = (t, observationGapMs = 0) => {
    if (!active || t < active.lastT) return;
    const elapsed = Math.min(86_400_000, t - active.lastT);
    const category = elapsed > maxGapMs || observationGapMs > 250 ? 'unknown_ms' : PHASE_KEYS[active.phase] || 'unknown_ms';
    active[category] += elapsed;
    active.lastT = t;
  };
  const finish = (outcome, shouldEmit) => {
    if (!active) return;
    const summary = {...identity(active), ...Object.fromEntries([...DURATION_KEYS, ...COUNT_KEYS].map(key => [key, Math.round(active[key])])),
      outcome, checkpoint_reached: active.checkpoint_reached,
      observed_ms: Math.round(DURATION_KEYS.filter(key => key !== 'unknown_ms').reduce((sum, key) => sum + active[key], 0))};
    active = null;
    aggregate(summary);
    // Mark ended before emitting: telemetry subscribers can synchronously re-enter us.
    if (shouldEmit) { try { emit('step_summary', summary); } catch { /* Observability cannot affect the tutor. */ } }
  };
  const consume = (record, {emit: shouldEmit = true} = {}) => {
    if (!record || !Number.isFinite(record.t_ms) || record.t_ms < 0) return;
    const data = sanitizeTelemetryData(record.type, record.data);
    if (!data) return;
    if (record.type === 'step_summary') {
      if (validIdentity(data)) {
        if (active && identityKey(active) === identityKey(data)) active = null;
        aggregate(data);
      }
      return;
    }
    if (!['guide_state', 'guide_action'].includes(record.type)) return;
    // A stale observation must not move time backwards or start an old attempt.
    if (active && record.t_ms < active.lastT) return;
    if (record.type === 'guide_state' && (data.phase === 'idle' || !validIdentity(data))) {
      advance(record.t_ms, data.observation_gap_ms); finish('left', shouldEmit); return;
    }
    if (!validIdentity(data) || ended.has(identityKey(data))) return;
    if (active && identityKey(active) !== identityKey(data)) {
      advance(record.t_ms, data.observation_gap_ms); finish(active.checkpoint_reached ? 'checkpoint' : 'superseded', shouldEmit);
    }
    if (!active) {
      // State snapshots are authoritative; a stray action alone cannot invent an attempt.
      if (record.type !== 'guide_state') return;
      active = {...identity(data), ...zeroCounters(), phase: phaseOf(data), lastT: record.t_ms, checkpoint_reached: false};
      groupFor(data);
      if (active.phase === 'tracking_lost') active.tracking_interruptions++;
    } else advance(record.t_ms, data.observation_gap_ms);
    if (record.type === 'guide_state') {
      const phase = phaseOf(data);
      if (phase === 'tracking_lost' && active.phase !== phase) active.tracking_interruptions++;
      active.phase = phase;
      active.samples++;
      active.checkpoint_reached ||= phase === 'checkpoint';
      return;
    }
    if (data.action === 'help') active.help_requests++;
    if (data.action === 'repeat') { active.repeats++; finish('repeated', shouldEmit); }
    // The runtime emits confirm only after an accepted result confirmation, never on a click request.
    if (data.action === 'confirm') { active.confirmations++; active.checkpoint_reached = true; finish('confirmed', shouldEmit); }
    if (data.action === 'leave') finish('left', shouldEmit);
  };
  const snapshot = () => ({
    rows: [...groups.entries()].map(([key, group]) => {
      const current = active && key === stepKey(active) ? active : null;
      const row = {...group, in_progress: !!current};
      // Counts labelled attempts include the current attempt; completed/interrupted are final outcomes only.
      if (current) {
        row.attempts++;
        for (const field of [...DURATION_KEYS, ...COUNT_KEYS]) row[field] += current[field];
        if (current.checkpoint_reached) row.checkpoint_attempts++;
      }
      row.observed_ms = DURATION_KEYS.filter(field => field !== 'unknown_ms').reduce((sum, field) => sum + row[field], 0);
      // This is a review cue from observed interruptions, not a validated diagnosis or threshold.
      row.review_step = row.attempts >= 2 && row.tracking_interruptions >= 2;
      delete row.attempt_id;
      return row;
    }),
    dropped_steps: droppedSteps,
    gap_limit_ms: maxGapMs,
  });
  return {consume, snapshot};
}
