import test from 'node:test';import assert from 'node:assert/strict';
import {TutorialFollower} from '../public/tutorial-follow.mjs';
import {prepareStep} from '../public/tutorial-core.mjs';
const hand=x=>Array.from({length:25},()=>({p:[x,0,0]}));
const hands=x=>({left:hand(x),right:hand(x+.4)});
const step=(xs=[0,.15,.3,.15,0])=>({guide_hands:'both',quality:{left_tracked_fraction:1,right_tracked_fraction:1},frames:xs.flatMap((x,i)=>Array.from({length:5},(_,j)=>({t:(i*5+j)*40,...hands(x)})))});
test('waits for a fresh start hold; off-path and hidden hands cannot advance',()=>{
 const f=new TutorialFollower(step());for(let t=0;t<=800;t+=40)f.update(hands(1),t);assert.equal(f.index,0);
 for(let t=840;t<=1480;t+=40)f.update(hands(0),t);assert.equal(f.started,true);const i=f.index;
 for(let t=1520;t<2200;t+=40)f.update({},t);assert.equal(f.index,i);assert.equal(f.state,'tracking');
});
test('loop endpoint cannot skip ordered waypoints; recovery progresses locally',()=>{
 const f=new TutorialFollower(step());let t=0;for(;t<2500;t+=40)f.update(hands(0),t);assert.equal(f.index,1);assert.equal(f.done,false);
 for(const x of [.15,.3,.15,0])for(let j=0;j<20;j++)f.update(hands(x),t+=40);
 assert.equal(f.done,true);assert.equal(f.state,'checkpoint');
});
test('stale timestamps, long gaps and pauses clear accumulated hold',()=>{
 const f=new TutorialFollower(step());for(let t=0;t<520;t+=40)f.update(hands(0),t);
 f.update(hands(0),2000);assert.equal(f.index,0);f.update(hands(0),2000);assert.equal(f.dwell,0);
 f.pause();f.update(hands(0),2040);assert.equal(f.index,0);
});
test('missing reference samples are unknown, never silently interpolated',()=>{
 const s=step();s.frames[5].left=null;const f=new TutorialFollower(s);f.update(hands(0),0);assert.equal(f.state,'reference-gap');assert.equal(f.done,false);
 s.guide_hands='right';assert.equal(new TutorialFollower(s).invalid,false);
});

test('guided green zones match the positional boundary, without sticky green', async()=>{
 const {PalmAlignment}=await import('../public/tutorial-assist.mjs');
 const {TutorialFollower}=await import('../public/tutorial-follow.mjs');
 const joint=x=>Array.from({length:25},()=>({p:[x,0,0]}));
 const step={guide_hands:'right',quality:{right_tracked_fraction:1,left_tracked_fraction:0},frames:[{t:0,right:joint(0)},{t:100,right:joint(.2)}]};
 const follower=new TutorialFollower(step),alignment=new PalmAlignment();follower.started=true;
 alignment.radius=follower.radius;alignment.hysteresis=0;alignment.holdMs=0;
 assert.equal(alignment.update({right:joint(.09)},step.frames[0],100).right.state,'inside');
 assert.equal(alignment.update({right:joint(.11)},step.frames[0],140).right.state,'outside');
 assert.equal(follower.update({right:joint(.11)},140),'waiting');
});

test('relaxed practice previews first and stationary hands cannot skip a movement',async()=>{
 const {TutorialPractice}=await import('../public/tutorial-follow.mjs');const p=new TutorialPractice(step([0,.2,.4]));let t=0;
 for(;t<1000;t+=40)p.update(hands(.4),t);assert.equal(p.follower.started,false);assert.equal(p.phase,'preview');
 p.update(hands(0),t,true);assert.equal(p.phase,'ready');
 for(;t<3000;t+=40)p.update(hands(0),t);assert(p.follower.started);assert.equal(p.follower.done,false);
 for(const x of [.2,.4])for(let i=0;i<25;i++)p.update(hands(x),t+=40);
 assert.equal(p.phase,'transition');assert.equal(p.advance,false);
 // A lost hand and a pause cannot consume the transition timer.
 p.update({},t+=40);p.pause();p.update(hands(.4),t+=5000);assert.equal(p.advance,false);
 for(let i=0;i<35;i++)p.update(hands(.4),t+=40);assert.equal(p.advance,true);
});
test('relaxed movement accepts lateral variation without finger-pose matching',()=>{
 const f=new TutorialFollower(step([0,.2,.4]),{relaxed:true});let t=0;
 const offset=x=>Object.fromEntries(Object.entries(hands(x)).map(([side,joints])=>[side,joints.map(j=>({p:[j.p[0],.09,0]}))]));
 for(const x of [0,.2,.4])for(let i=0;i<25;i++)f.update(offset(x),t+=40);
 assert.equal(f.done,true);
});

test('overlapping start and end regions cannot complete a short action without movement',()=>{
 const f=new TutorialFollower(step([0,.18]),{relaxed:true});
 for(let t=0;t<5000;t+=40)f.update(hands(.17),t);
 assert.equal(f.started,true);assert.equal(f.done,false);
});

// Match the reviewed reproduction through the real recording validator.
function linearStep(length=.18,guide_hands='both'){
 const frames=Array.from({length:41},(_,i)=>({t:i*40,...hands(length*i/40)}));
 for(const frame of frames)for(const side of ['left','right'])for(const joint of frame[side])joint.q=[0,0,0,1];
 return {...prepareStep(frames),guide_hands};
}
function driver(follower){
 let time=0;
 return {
  tick(pose){follower.update(pose,time+=40);},
  hold(pose,ms=800){for(let elapsed=0;elapsed<ms;elapsed+=40)this.tick(pose);},
  get time(){return time;},
  stall(){time+=1000;},
 };
}

for(const relaxed of [false,true]){
 const follow=step=>new TutorialFollower(step,{relaxed});
test(`stationary midpoint palms cannot complete the reviewed 18 cm movement (${relaxed?'practice':'ordered'})`,()=>{
 const f=follow(linearStep()),d=driver(f);
 assert.equal(f.invalid,false);assert.equal(f.step.duration_ms,1600);
 d.hold(hands(.09),5000);
 assert.equal(f.started,true);assert.equal(f.index,1);assert.equal(f.done,false);
});

test(`each moving required hand must progress, even inside overlapping targets (${relaxed?'practice':'ordered'})`,()=>{
 const f=follow(linearStep()),d=driver(f);
 d.hold(hands(0));
 for(let i=0;i<125;i++)d.tick({left:f.target.left,right:hand(.4)});
 assert.equal(f.index,1);assert.equal(f.done,false);
});

test(`wrong-direction, sideways and small oscillating motion cannot satisfy a gate (${relaxed?'practice':'ordered'})`,()=>{
 const sideways={left:hand(.05).map(j=>({p:[j.p[0],.04,0]})),right:hand(.45).map(j=>({p:[j.p[0],.04,0]}))};
 for(const [start,pose] of [[0,hands(-.005)],[.05,sideways]]){
  const f=follow(linearStep()),d=driver(f);d.hold(hands(start));d.hold(pose,5000);
  assert.equal(f.index,1);assert.equal(f.done,false);
 }
 const f=follow(linearStep()),d=driver(f);d.hold(hands(0));
 for(let i=0;i<125;i++)d.tick(hands(i%2?.01:0));
 assert.equal(f.index,1);assert.equal(f.done,false);
});

test(`short movements still require observed motion; static references only require a hold (${relaxed?'practice':'ordered'})`,()=>{
 const f=follow(linearStep(.03)),d=driver(f);d.hold(hands(.015),5000);
 assert.equal(f.done,false);d.hold(hands(0));d.hold(hands(.03));assert.equal(f.done,true);
 const still=follow(linearStep(0));driver(still).hold(hands(0),2000);assert.equal(still.done,true);
});

test(`fresh ordered motion completes with one or both required hands (${relaxed?'practice':'ordered'})`,()=>{
 for(const choice of ['left','right','both']){
  const f=follow(linearStep(.18,choice)),d=driver(f);
  const pose=x=>Object.fromEntries(f.hands.map(side=>[side,hands(x)[side]]));
  d.hold(pose(0));
  for(const x of [.09,.18])d.hold(pose(x));
  assert.equal(f.done,true,choice);assert.equal(f.state,'checkpoint');
 }
});

test(`a stationary support hand stays required without inventing motion for it (${relaxed?'practice':'ordered'})`,()=>{
 const s=linearStep();for(const frame of s.frames)frame.right=hand(.4);
 const f=follow(s),d=driver(f);d.hold(hands(0));
 for(const x of [.09,.18])d.hold({left:hand(x),right:hand(.4)});
 assert.equal(f.done,true);
});

test(`interruptions discard partial movement and do not credit a hidden jump (${relaxed?'practice':'ordered'})`,()=>{
 const interruptions=[
  (f,d)=>f.pause(),
  (f,d)=>d.tick({}),
  (f,d)=>d.stall(),
  (f,d)=>f.update(hands(.03),d.time),
  (f,d)=>f.update(hands(.03),NaN),
 ];
 for(const interrupt of interruptions){
  const f=follow(linearStep()),d=driver(f);d.hold(hands(0));d.tick(hands(.03));
  interrupt(f,d);d.hold(hands(.09),2000);
  assert.equal(f.index,1);assert.equal(f.done,false);
  // Returning and repeating the motion supplies fresh evidence after recovery.
  d.hold(hands(0));d.hold(hands(.09));d.hold(hands(.18));assert.equal(f.done,true);
 }
});
}
