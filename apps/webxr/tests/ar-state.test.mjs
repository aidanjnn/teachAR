import test from 'node:test';
import assert from 'node:assert/strict';
import {feedback, SwapTrial, hitButton} from '../public/ar-state.mjs';

function status(verdict='pass',frame=1,observed=['goose','fox','square']) {
  return {capture:{revision:7,has_reference:true,age_ms:200},latest:{verdict,revision:7,frame_id:frame,age_ms:2000,
    message:'test observation',slots:['A','B','C'].map((slot,i)=>({slot,observed:observed[i]}))}};
}
const display=s=>feedback(s,0,100);
test('fresh incorrect placement is red, never pass',()=>{
  const r=display(status('fail'));assert.equal(r.verdict,'fail');assert.equal(r.title,'Wrong placement');
});
test('disconnect, stale video, stale response and changed reference cannot show green',()=>{
  const s=status();
  for(const r of [feedback(s,5000,100),feedback(s,0,4000),feedback({...s,latest:{...s.latest,age_ms:13000}},0,100),
    feedback({...s,capture:{...s.capture,revision:8}},0,100)]) {
    assert.equal(r.verdict,'unknown');assert.equal(r.usable,false);
  }
});
test('age uses server age plus elapsed time, not device wall clocks',()=>{
  const s=status();s.latest.captured_at_unix_ms=1;
  assert.equal(feedback(s,500,100).ageSeconds,2);
  s.latest.age_ms=11900;assert.equal(feedback(s,200,100).usable,false);
});
test('correct -> exact fox/square swap -> restored completes trial',()=>{
  const trial=new SwapTrial(7,10);
  const a=status('pass',11),b=status('fail',12,['goose','square','fox']),c=status('pass',13);
  for(const s of [a,b,c])assert.equal(trial.observe(s,display(s)),true);
  assert.equal(trial.phase,3);
});
test('passes alone, unrelated failures and occlusion cannot complete swap trial',()=>{
  const trial=new SwapTrial(7);const first=status();trial.observe(first,display(first));
  for(const s of [status('pass',2),status('unknown',3),status('fail',4,['fox','goose','square'])])trial.observe(s,display(s));
  assert.equal(trial.phase,1);
});
test('delayed or duplicate frames cannot advance and old reference rejected',()=>{
  const trial=new SwapTrial(7,5),a=status('pass',6);trial.observe(a,display(a));
  for(const n of [5,6]){const s=status('fail',n,['goose','square','fox']);assert.equal(trial.observe(s,display(s)),false);}
  const s=status('fail',7,['goose','square','fox']);s.latest.revision=8;
  assert.equal(trial.observe(s,{usable:true}),false);
  s.latest.revision=7;s.latest.age_ms=13000;
  assert.equal(trial.observe(s,display(s)),false);assert.equal(trial.phase,1);
});
test('canvas/3D UV mapping selects only intended buttons',()=>{
  assert.equal(hitButton(200/1080,1-450/560),'check');
  assert.equal(hitButton(550/1080,1-450/560),'auto');
  assert.equal(hitButton(900/1080,1-450/560),'exit');
  assert.equal(hitButton(.5,.5),null);assert.equal(hitButton(-1,-1),null);
});
