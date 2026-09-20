import test from 'node:test';
import assert from 'node:assert/strict';
import {AUDIO_RATE,encodeNarration,decodeNarration,validateNarration,trimNarration} from '../public/narration-core.mjs';
import {newTutorial,prepareStep,finishTutorial,validateTutorial,learningReadiness,trimStep} from '../public/tutorial-core.mjs';
const tone=(seconds=2)=>Float32Array.from({length:seconds*AUDIO_RATE},(_,i)=>Math.sin(i*.1)*.3);
const hand=()=>Array.from({length:25},()=>({p:[0,0,0],q:[0,0,0,1]}));
const draft=()=>({...newTutorial(),setup:'Cloth flat; collar facing away.',calibration_span_m:.4,steps:[{guide_hands:'both',...prepareStep(Array.from({length:51},(_,i)=>({t:i*40,left:hand(),right:hand()})),'Fold the left side inward.')}]});
test('narration round-trips PCM and derives duration from bytes rather than import claims',()=>{
  const voice=encodeNarration(tone());voice.duration_ms=999999;
  const valid=validateNarration(voice,2000),samples=decodeNarration(valid);
  assert.equal(valid.duration_ms,2000);assert.ok(Math.abs(samples[101]-tone()[101])<1/32767);
});
test('rejects external media, corrupt headers and motion/audio duration mismatch',()=>{
  assert.throws(()=>validateNarration({audio:'https://example.com/audio.wav'},2000));
  const voice=encodeNarration(tone());assert.throws(()=>validateNarration(voice,1000),/durations differ/);
  const bytes=Buffer.from(voice.audio.split(',')[1],'base64');bytes.writeUInt32LE(90000000,40);
  assert.throws(()=>decodeNarration({...voice,audio:'data:audio/wav;base64,'+bytes.toString('base64')}),/inconsistent/);
});
test('trim crops narration at the same sampled motion boundaries, not the requested unsampled point',()=>{
  const d=draft(),step=d.steps[0];step.narration=encodeNarration(tone());step.reviewed=true;
  const trimmed=trimStep(step,201,1801);assert.equal(trimmed.duration_ms,1560);assert.equal(trimmed.narration.duration_ms,1560);assert.equal(trimmed.reviewed,false);
  const expected=decodeNarration(trimNarration(step.narration,240,1800));assert.deepEqual(decodeNarration(trimmed.narration),expected);
});
test('finishing requires setup, useful instructions, review and no unresolved audio failure',()=>{
  const d=draft();assert.throws(()=>finishTutorial(d),/Review step/);d.steps[0].reviewed=true;
  for(const mutate of [x=>x.setup='',x=>x.steps[0].instruction=' ',x=>x.steps[0].narration_issue='microphone disconnected']){
    const bad=structuredClone(d);mutate(bad);assert.throws(()=>finishTutorial(bad));
  }
  const done=finishTutorial(d);assert.equal(learningReadiness(done).ready,true);assert.equal(done.steps[0].verification.status,'unverified');
});
test('finished audio tutorial exports/imports and content revision changes invalidate finishing',()=>{
  const d=draft();d.steps[0].narration=encodeNarration(tone());d.steps[0].reviewed=true;
  const done=validateTutorial(JSON.parse(JSON.stringify(finishTutorial(d))));assert.equal(learningReadiness(done).ready,true);
  assert.equal(decodeNarration(done.steps[0].narration).length,32000);
  done.revision++;assert.equal(validateTutorial(done).completion,null);assert.equal(learningReadiness(done).ready,false);
});
test('v2 files migrate as drafts without silently claiming finished authoring',()=>{
  const d=draft();d.schema='trail.tutorial.prototype.v2';d.steps[0].reviewed=true;
  const parsed=validateTutorial(d);assert.equal(parsed.steps[0].reviewed,true);assert.equal(parsed.completion,null);
});
