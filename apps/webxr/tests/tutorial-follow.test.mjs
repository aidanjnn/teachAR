import test from 'node:test';import assert from 'node:assert/strict';
import {TutorialFollower} from '../public/tutorial-follow.mjs';
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

test('guided green zones use the same boundary as advancement, without sticky green', async()=>{
 const {PalmAlignment}=await import('../public/tutorial-assist.mjs');
 const {TutorialFollower}=await import('../public/tutorial-follow.mjs');
 const joint=x=>Array.from({length:25},()=>({p:[x,0,0]}));
 const step={quality:{right_tracked_fraction:1,left_tracked_fraction:0},frames:[{t:0,right:joint(0)},{t:100,right:joint(.2)}]};
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
