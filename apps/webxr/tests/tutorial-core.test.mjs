import test from 'node:test';
import assert from 'node:assert/strict';
import {prepareStep, TutorialPlayer} from '../public/tutorial-core.mjs';
import {TutorialFollower,requiredHands} from '../public/tutorial-follow.mjs';
const hand = x => Array.from({length:25},()=>({p:[x,0,0],q:[0,0,0,1]}));
const frames = () => Array.from({length:40},(_,i)=>({t:i*40,left:hand(Math.sin(i/39*Math.PI)*.2),right:hand(.3)}));

test('two-hand action returning to its starting point is accepted',()=>{
  const step=prepareStep(frames(),'Fold inward');
  assert.equal(step.duration_ms,1560);assert.equal(step.quality.left_tracked_fraction,1);
  assert.equal(step.verification.status,'unverified');
});
test('missing hand remains missing with honest coverage',()=>{
  const data=frames();data.slice(5,15).forEach(f=>f.left=null);
  const step=prepareStep(data);assert.equal(step.quality.left_tracked_fraction,.75);
  assert.equal(step.frames[8].left,null);
});
test('rejects unreliable tracking, short recordings and invalid timestamps',()=>{
  assert.throws(()=>prepareStep(frames().map(f=>({...f,left:null,right:null}))),/reliably/);
  assert.throws(()=>prepareStep(frames().slice(0,20)),/second/);
  const data=frames();data[10].t=data[9].t;assert.throws(()=>prepareStep(data),/increase/);
});
test('time passing never advances a learner or marks a fold correct',()=>{
  const p=new TutorialPlayer([prepareStep(frames()),prepareStep(frames())]);
  for(let i=0;i<1000;i++)p.tick(100);
  assert.equal(p.index,0);assert.equal(p.paused,true);assert.deepEqual(p.confirmations,[]);
  assert.equal(p.confirm(),false);assert.equal(p.index,1);
  assert.equal(p.confirm(),true);assert.equal(p.confirmations[1].kind,'learner-self-confirmed');
  assert.equal(p.step.verification.status,'unverified');
});
test('pause, repeat and previous preserve explicit learner control',()=>{
  const p=new TutorialPlayer([prepareStep(frames()),prepareStep(frames())]);
  p.tick(80);p.paused=true;p.tick(80);assert.equal(p.time,80);
  p.replay();assert.equal(p.time,0);assert.equal(p.paused,false);
  p.confirm();p.previous();assert.equal(p.index,0);
});

import {newTutorial,validateTutorial,parseTutorialJSON,trimStep,learningReadiness,SCHEMA,finishTutorial} from '../public/tutorial-core.mjs';
const tutorial=()=>({...newTutorial(),setup:'Lay the cloth flat between the same two table marks.',calibration_span_m:.4,steps:[{...prepareStep(frames(),'Fold inward'),guide_hands:'both'}]});
test('imports recompute derived quality/duration and discard verification claims',()=>{
  const input=tutorial();input.steps[0].duration_ms=1;input.steps[0].quality={left_tracked_fraction:100};input.steps[0].verification={status:'pass',kind:'AI'};
  const output=validateTutorial(input);assert.equal(output.steps[0].duration_ms,1560);assert.equal(output.steps[0].quality.left_tracked_fraction,1);assert.equal(output.steps[0].verification.status,'unverified');
});
test('legacy tutorial migrates with review required, no old runtime transform',()=>{
  const input=tutorial();input.schema='trail.tutorial.prototype.v1';input.steps[0].reviewed=true;input.worldTransform=[99,99,99];
  const output=validateTutorial(input);assert.equal(output.schema,SCHEMA);assert.equal(output.steps[0].reviewed,false);assert.equal(output.worldTransform,undefined);
});
test('invalid poses, units, joint order, duration, duplicate IDs and external photos rejected',()=>{
  for(const mutate of [x=>x.units='centimeters',x=>x.joint_names.reverse(),x=>x.steps[0].frames[3].right[0].q=[0,0,0,0],
    x=>x.steps[0].frames[3].right[0].p=[Infinity,0,0],x=>x.steps[0].frames[3].right[0].radius=50,
    x=>x.steps[0].frames.at(-1).t=180001,x=>x.steps.push(structuredClone(x.steps[0])),
    x=>x.steps[0].reference={image:'https://example.com/image.jpg',captured_at:new Date().toISOString()}]){
    const input=tutorial();mutate(input);assert.throws(()=>validateTutorial(input));
  }
  assert.throws(()=>parseTutorialJSON('not JSON'));assert.throws(()=>validateTutorial(null));
});
test('trim invalidates review and a changed final-state photo, preserving identity',()=>{
  const input=prepareStep(frames(),'Fold inward');input.reviewed=true;input.reference={image:'reference'};
  const trim=trimStep(input,0,1400);assert.equal(trim.id,input.id);assert.equal(trim.reviewed,false);assert.equal(trim.reference,null);
  const start=trimStep(input,200,input.duration_ms);assert.deepEqual(start.reference,input.reference);assert.equal(start.frames[0].t,0);
  assert.throws(()=>trimStep(input,1200,1400),/second/);
});
test('review is required but review is not physical verification',()=>{
  const data=tutorial();assert.equal(learningReadiness(data).ready,false);data.steps[0].reviewed=true;
  assert.equal(learningReadiness(data).ready,false);assert.equal(learningReadiness(finishTutorial(data)).ready,true);assert.equal(data.steps[0].verification.status,'unverified');
});
test('replay hides old hands in a timestamp gap and resumes on fresh recorded sample',()=>{
  const data=frames();data.slice(20).forEach(f=>f.t+=1000);const p=new TutorialPlayer([prepareStep(data)]);
  p.time=1100;p.paused=true;assert.equal(p.tick(0).right,null);
  p.time=data[20].t;assert.notEqual(p.tick(0).right,null);
});
test('repeated completion callback is idempotent within one playback attempt',()=>{
  const p=new TutorialPlayer([prepareStep(frames())]);assert.equal(p.confirm(),true);p.confirm();assert.equal(p.confirmations.length,1);
});
test('slower replay changes only playback time, preserves recordings and still cannot advance',()=>{
  const step=prepareStep(frames()),original=JSON.stringify(step),p=new TutorialPlayer([step]);
  p.setRate(.5);p.tick(100);assert.equal(p.time,50);p.paused=true;p.tick(100);assert.equal(p.time,50);
  p.replay();assert.equal(p.rate,.5);for(let i=0;i<100;i++)p.tick(100);
  assert.equal(p.time,step.duration_ms);assert.equal(p.index,0);assert.deepEqual(p.confirmations,[]);
  assert.equal(JSON.stringify(step),original);assert.throws(()=>p.setRate(0));assert.throws(()=>p.setRate(Infinity));
});

import {validateCues} from '../public/tutorial-core.mjs';
test('expert fold lines stay workspace-relative and survive trim with review reset',()=>{
  const cue={kind:'fold-line',source:'expert-marked',points:[[.05,0,-.1],[.35,0,-.1]]};
  const data=tutorial();data.steps[0].cues=[cue];data.steps[0].reviewed=true;
  const parsed=validateTutorial(data);assert.deepEqual(parsed.steps[0].cues,[cue]);
  const trimmed=trimStep(parsed.steps[0],0,1400);assert.deepEqual(trimmed.cues,[cue]);assert.equal(trimmed.reviewed,false);
  assert.throws(()=>validateCues([{...cue,points:[[0,0,0],[0,.3,0]]}]),/same tabletop/);
  assert.throws(()=>validateCues([{...cue,source:'AI-inferred'}]),/Invalid/);
});

import {validateReference} from '../public/tutorial-core.mjs';
test('JPEG dimensions are bounded before browser decoding, not trusted from MIME',()=>{
  const jpeg=(w,h)=>'data:image/jpeg;base64,'+Buffer.from([255,216,255,192,0,11,8,h>>8,h&255,w>>8,w&255,1,1,0x11,0,255,217]).toString('base64');
  const ref=image=>({image,captured_at:'2026-09-19T00:00:00.000Z'});
  assert.equal(validateReference(ref(jpeg(640,480))).source,'local-camera');
  assert.throws(()=>validateReference(ref(jpeg(65000,65000))),/1280/);
  assert.throws(()=>validateReference(ref('data:image/jpeg;base64,/9j/')));
});

test('tutorial save position round-trips independently of step poses and rejects malformed metadata',()=>{
 const input=newTutorial();input.save_position={space:'workspace',left:[-.2,.1,.3],right:[.2,.1,.3]};
 assert.deepEqual(validateTutorial(input).save_position,input.save_position);
 for(const position of [{...input.save_position,space:'world'},{...input.save_position,left:[NaN,0,0]},{...input.save_position,right:[0,0]}])assert.throws(()=>validateTutorial({...input,save_position:position}));
 delete input.save_position;assert.equal(validateTutorial(input).save_position,null);
});

test('step titles are optional, bounded and survive import and trim',()=>{
  const input=tutorial();input.steps[0].title='Seat the cap';
  const parsed=validateTutorial(input);assert.equal(parsed.steps[0].title,'Seat the cap');
  assert.equal(validateTutorial(tutorial()).steps[0].title,'');
  const trimmed=trimStep(parsed.steps[0],0,parsed.steps[0].duration_ms);assert.equal(trimmed.title,'Seat the cap');
  const long=tutorial();long.steps[0].title='x'.repeat(61);assert.throws(()=>validateTutorial(long),/Step title/);
  const wrong=tutorial();wrong.steps[0].title=7;assert.throws(()=>validateTutorial(wrong),/Step title/);
});

test('poor tracking cannot silently replace the moving hand with the resting hand',()=>{
  const motion=frames();motion.slice(10,20).forEach(f=>f.left=null);
  const data=tutorial();data.steps=[prepareStep(motion,'Move the part with the left hand.')];data.steps[0].reviewed=true;
  assert.equal(data.steps[0].quality.left_tracked_fraction,.75);
  assert.equal(data.steps[0].quality.right_tracked_fraction,1);
  assert.throws(()=>finishTutorial(data),/Required left hand is missing/);
  const follower=new TutorialFollower(data.steps[0]);
  for(let t=0;t<5000;t+=40)follower.update({left:null,right:hand(.3)},t);
  assert.deepEqual(requiredHands(data.steps[0]),['left','right']);assert.equal(follower.done,false);
  data.steps[0].guide_hands='left';
  assert.throws(()=>finishTutorial(data),/Required left hand is missing/);
  assert.deepEqual(requiredHands(data.steps[0]),['left']);
});

test('a single missing palm sample prevents finishing despite near-perfect coverage',()=>{
  const data=tutorial();data.steps[0].frames[10].left=null;data.steps[0].reviewed=true;
  assert.throws(()=>finishTutorial(data),/Step 1: Required left hand is missing at 0.40 s/);
  const partial=tutorial();partial.steps[0].frames[10].left[21]=null;partial.steps[0].reviewed=true;
  assert.throws(()=>finishTutorial(partial),/Required left hand is missing/);
  const gap=tutorial();gap.steps[0].frames.slice(10).forEach(f=>f.t+=240);gap.steps[0].reviewed=true;
  assert.throws(()=>finishTutorial(gap),/Recording timing gap/);
});

test('one-hand lessons can be explicitly reviewed without requiring the unused hand',()=>{
  const data=tutorial();data.steps[0].frames.forEach(f=>f.right=null);
  data.steps[0].guide_hands='left';data.steps[0].reviewed=true;
  const finished=finishTutorial(data);assert.equal(learningReadiness(finished).ready,true);
  const follower=new TutorialFollower(finished.steps[0]);let t=0;
  while(!follower.done&&t<10000){follower.update({left:follower.target.left,right:null},t);t+=40;}
  assert.equal(follower.done,true);
});

test('old automatic-hand completions default to both without losing motion',()=>{
  const finished=finishTutorial({...tutorial(),steps:tutorial().steps.map(s=>({...s,reviewed:true}))});
  for(const selection of [undefined,'recorded']){
    const old=structuredClone(finished);old.steps[0].guide_hands=selection;
    const restored=validateTutorial(JSON.parse(JSON.stringify(old)));
    assert(restored.completion);assert.equal(restored.steps[0].guide_hands,'both');
    assert.deepEqual(restored.steps[0].frames,old.steps[0].frames);
    assert.equal(learningReadiness(restored).ready,true);
  }
  const damaged=structuredClone(finished);damaged.steps[0].frames[10].left=null;
  assert.equal(validateTutorial(damaged).completion,null);
});
