import test from 'node:test';
import assert from 'node:assert/strict';
import {createFrictionObserver} from '../public/telemetry-friction.mjs';

const id = n => `t_${n.toString(16).padStart(32, '0')}`;
const base = {tutorial_key: id(1), revision: 1, step_index: 0, attempt_id: id(2), source: 'synthetic', mode: 'learn', required_left: true, required_right: false, tracking_left: true, tracking_right: false};
const state = (t, data = {}) => ({seq: t + 1, t_ms: t, type: 'guide_state', data: {...base, phase: 'following', ...data}});
const action = (t, action, data = {}) => ({seq: t + 1, t_ms: t, type: 'guide_action', data: {...base, action, ...data}});
const row = observer => observer.snapshot().rows[0];

test('exclusive state durations use required hands, pause precedence, and unknown visibility/stalls', () => {
  const summaries = [], o = createFrictionObserver({emit: (type, data) => summaries.push({type, data})});
  o.consume(state(0));
  o.consume(state(1000, {tracking_left: false}));
  o.consume(state(2000, {phase: 'user_paused', tracking_left: false}));
  o.consume(state(3000, {phase: 'hidden'}));
  o.consume(state(4000));
  o.consume(state(9000)); // No evidence about the entire five-second stalled interval.
  o.consume(state(10000, {phase: 'checkpoint'}));
  o.consume(action(11000, 'confirm'));
  const r = row(o);
  assert.equal(r.following_ms, 2000);
  assert.equal(r.tracking_lost_ms, 1000);
  assert.equal(r.user_paused_ms, 1000);
  assert.equal(r.checkpoint_ms, 1000);
  assert.equal(r.unknown_ms, 6000);
  assert.equal(r.observed_ms, 5000);
  assert.equal(r.observed_ms + r.unknown_ms, 11000);
  assert.equal(r.tracking_interruptions, 1);
  assert.equal(r.completed, 1);
  assert.equal(r.interrupted, 0);
  assert.equal(r.checkpoint_attempts, 1);
  assert.equal(r.in_progress, false);
  assert.equal(summaries.length, 1);
  assert.equal(summaries[0].type, 'step_summary');
});

test('repeat closes old attempt, checkpoints stay distinct from explicit confirmation, and revision/source groups never merge', () => {
  const o = createFrictionObserver();
  o.consume(state(0)); o.consume(action(200, 'help')); o.consume(action(400, 'repeat'));
  o.consume(state(500, {attempt_id: id(3)}));
  o.consume(state(1000, {attempt_id: id(3), phase: 'checkpoint'}));
  o.consume(state(1500, {attempt_id: id(4), revision: 2}));
  o.consume(state(2000, {attempt_id: id(5), revision: 2, source: 'webxr'}));
  const rows = o.snapshot().rows;
  assert.equal(rows.length, 3);
  assert.equal(rows[0].attempts, 2);
  assert.equal(rows[0].completed, 0);
  assert.equal(rows[0].interrupted, 1); // Movement checkpoint completion is not an interruption.
  assert.equal(rows[0].checkpoint_attempts, 1);
  assert.equal(rows[0].help_requests, 1);
  assert.equal(rows[0].repeats, 1);
  assert.equal(rows[1].interrupted, 1);
  assert.equal(rows[2].in_progress, true);
});

test('idle finalizes once; stale observations and duplicate summary reentry do not create phantom attempts', () => {
  let o;
  o = createFrictionObserver({emit: (type, data) => o.consume({seq: 99, t_ms: 1000, type, data})});
  o.consume(state(0)); o.consume(state(1000, {phase: 'idle'}));
  o.consume(state(2000)); // Same ended identity, ignored.
  assert.equal(row(o).attempts, 1);
  assert.equal(row(o).interrupted, 1);
  o.consume(state(3000, {attempt_id: id(3)}));
  o.consume(state(2500, {attempt_id: id(4), revision: 2}));
  assert.equal(o.snapshot().rows.length, 1);
  assert.equal(row(o).attempts, 2);
});

test('observations and exports never retain unapproved payloads or infer unknown help actions', () => {
  const emitted = [], o = createFrictionObserver({emit: (type, data) => emitted.push(data)});
  o.consume(state(0, {title: '<script>secret</script>', narration: 'private words', left: [[1, 2, 3]], token: 'credential'}));
  o.consume(action(100, 'unimplemented-coach-help'));
  o.consume(action(200, 'confirm'));
  assert.equal(row(o).help_requests, 0);
  assert.equal(row(o).completed, 1); // Accepted confirmation is authoritative even between heartbeats.
  const json = JSON.stringify({snapshot: o.snapshot(), emitted});
  for (const forbidden of ['script', 'secret', 'private words', 'credential', 'narration', 'left']) assert(!json.includes(forbidden));
  o.consume(state(300, {tutorial_key: 'real-tutorial-name', attempt_id: 'user-id'}));
  assert.equal(o.snapshot().rows.length, 1);
});

test('step groups are bounded and interruption review cue requires multiple attempts', () => {
  const o = createFrictionObserver({maxSteps: 2});
  o.consume(state(0, {tracking_left: false})); o.consume(state(100)); o.consume(state(200, {tracking_left: false}));
  assert.equal(row(o).review_step, false);
  o.consume(action(300, 'repeat')); o.consume(state(400, {attempt_id: id(3), tracking_left: false}));
  assert.equal(row(o).review_step, true);
  o.consume(state(500, {attempt_id: id(4), step_index: 1}));
  o.consume(state(600, {attempt_id: id(5), step_index: 2}));
  assert.equal(o.snapshot().rows.length, 2);
  assert.equal(o.snapshot().dropped_steps, 1);
});

test('history hydration does not emit duplicate summaries and imported summaries restore ring-truncated attempts', () => {
  const emitted = [], o = createFrictionObserver({emit: (...args) => emitted.push(args)});
  o.consume(state(0), {emit: false}); o.consume(action(1000, 'confirm'), {emit: false});
  assert.equal(emitted.length, 0);
  o.consume({seq: 9, t_ms: 2000, type: 'step_summary', data: {...base, attempt_id: id(3), outcome: 'left', checkpoint_reached: false, following_ms: 800, observed_ms: 800, samples: 2}});
  assert.equal(row(o).attempts, 2);
  assert.equal(row(o).following_ms, 1800);
});

test('an explicit XR frame stall shorter than the heartbeat allowance is still unknown', () => {
  const o = createFrictionObserver();
  o.consume(state(0));
  o.consume(state(1000, {observation_gap_ms: 600}));
  o.consume(state(2000));
  assert.equal(row(o).unknown_ms, 1000);
  assert.equal(row(o).following_ms, 1000);
});


test('automatic previews and start waiting have exclusive durations; finished movement is never a user confirmation', () => {
  const summaries=[],o=createFrictionObserver({emit:(_type,data)=>summaries.push(data)});
  o.consume(state(0,{phase:'demo_preview',tracking_left:false}));
  o.consume(state(1000,{phase:'demo_preview',tracking_left:false}));
  o.consume(state(2000,{phase:'ready'}));
  o.consume(state(2500,{phase:'following'}));
  o.consume(state(3000,{phase:'checkpoint'}));
  o.consume(state(3500,{phase:'idle',mode:'finished'}));
  const r=row(o);
  assert.equal(r.demo_preview_ms,2000);
  assert.equal(r.ready_ms,500);
  assert.equal(r.following_ms,500);
  assert.equal(r.checkpoint_ms,500);
  assert.equal(r.tracking_interruptions,0,'Automatic previews do not require the learner to track');
  assert.equal(r.help_requests,0,'Automatic previews are not explicit Watch requests');
  assert.equal(r.observed_ms,3500);
  assert.equal(r.checkpoint_attempts,1);
  assert.equal(r.completed,0);
  assert.equal(r.interrupted,0);
  assert.equal(summaries[0].outcome,'checkpoint');
  assert.equal(summaries[0].demo_preview_ms,2000);
  assert.equal(summaries[0].confirmations,0);
});
