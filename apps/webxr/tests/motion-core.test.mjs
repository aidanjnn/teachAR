import test from 'node:test';import assert from 'node:assert/strict';
import {JOINTS,workspace,toLocal,toWorld,tracked,prepareRecording,PathFollower} from '../public/motion-core.mjs';
const w=workspace([0,0,0],[.4,0,0]);
function hand(x,y=.1,z=0){return JOINTS.map((_,i)=>({p:[x+i*.0001,y,z],q:[0,0,0,1]}));}
function recording(){const frames=Array.from({length:61},(_,i)=>({t:i*40,joints:hand(i/60*.4)}));return prepareRecording(frames,w,'right');}
function hold(g,joints,start,ms=650){let result;for(let t=start;t<=start+ms;t+=20)result=g.update(joints,t);return result;}

test('25 joints, gravity aligned workspace round-trips rotated and translated coordinates',()=>{
  assert.equal(JOINTS.length,25);const basis=workspace([1,2,3],[1,2,3.4]),p=[1.1,2.2,3.3];
  const recovered=toWorld(toLocal(p,basis),basis);p.forEach((v,i)=>assert.ok(Math.abs(v-recovered[i])<1e-9));
});
test('degenerate or different-height workspace rejected',()=>{
  for(const e of [[.1,0,0],[.5,.4,0],[2,0,0]])assert.throws(()=>workspace([0,0,0],e));
});
test('record retains all joints, orientations, timestamps and quality',()=>{
  const r=recording();assert.equal(r.frames.length,61);assert.equal(r.joint_names.length,25);assert.equal(r.hand,'right');assert.equal(r.quality.tracked_fraction,1);assert.ok(r.checkpoints.length>8);
});
test('long loss, poor coverage and stationary demonstration rejected',()=>{
  let f=recording().frames;for(let i=20;i<40;i++)f[i]={...f[i],joints:null};assert.throws(()=>prepareRecording(f,w,'right'),/tracking loss/);
  f=Array.from({length:61},(_,i)=>({t:i*40,joints:hand(0)}));assert.throws(()=>prepareRecording(f,w,'right'),/Move from start/);
});
test('out-of-order timestamps are rejected',()=>{
  const f=recording().frames;f[15].t=f[14].t;assert.throws(()=>prepareRecording(f,w,'right'),/timestamps/);
});
test('missing wrist or palm joints is tracking loss',()=>{
  const j=hand(0);j[0]=null;assert.equal(tracked(j),false);
  const g=new PathFollower(recording());assert.equal(g.update(j,0).state,'lost');assert.equal(g.index,0);
});
test('starting at the destination cannot bypass the path',()=>{
  const g=new PathFollower(recording());const r=hold(g,hand(.4),0,5000);
  assert.equal(r.state,'off');assert.equal(g.index,0);assert.equal(g.done,false);
});
test('sideways warning clears on return without losing reached checkpoint',()=>{
  const g=new PathFollower(recording());hold(g,hand(0),0);const reached=g.index;
  const wrong=g.update(hand(.03,.1,.20),680);assert.equal(wrong.state,'off');assert.equal(g.index,reached);
  const back=g.update(hand(.03),700);assert.equal(back.state,'on');assert.equal(g.index,reached);assert.equal(g.warned,true);assert.equal(g.recovered,true);
});
test('hand can follow slowly; no wall-clock chase',()=>{
  const g=new PathFollower(recording());let t=0;hold(g,hand(0),t);t+=800;
  for(let i=0;i<100&&!g.done;i++){
    const target=g.recording.checkpoints[g.index].joints;hold(g,target,t,650);t+=800;
  }
  assert.equal(g.done,true);assert.equal(g.progress,1);
});
test('holding first pose forever does not finish transfer',()=>{
  const g=new PathFollower(recording());hold(g,hand(0),0,10000);assert.equal(g.done,false);assert.ok(g.index<4);
});
test('tracking loss resets endpoint dwell and cannot finish',()=>{
  const g=new PathFollower(recording());g.index=g.recording.checkpoints.length-1;g.started=true;
  hold(g,hand(.4),0,300);assert.equal(g.done,false);g.update(null,320);
  hold(g,hand(.4),340,300);assert.equal(g.done,false);hold(g,hand(.4),660,300);assert.equal(g.done,true);
});
test('long frame gap and pause do not count as held time',()=>{
  const g=new PathFollower(recording());hold(g,hand(0),0,300);g.update(hand(0),10000);assert.equal(g.started,false);
  g.pause();hold(g,hand(0),10100,300);assert.equal(g.started,false);
});
