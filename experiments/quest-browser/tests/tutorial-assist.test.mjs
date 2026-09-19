import test from 'node:test';
import assert from 'node:assert/strict';
import {PalmAlignment,CaptureEndpoint} from '../public/tutorial-assist.mjs';
const hand=x=>Array.from({length:25},()=>({p:[x,0,0]}));
const pair=(x=0)=>({left:hand(x),right:hand(x+.4)});
test('palm guidance is forgiving, requires dwell, and never advances anything',()=>{
  const a=new PalmAlignment();const live=pair(.1),target=pair();
  live.left[9].p=[9,9,9]; // Finger posture deliberately does not control palm guidance.
  assert.equal(a.update(live,target,0).matched,false);
  a.update(live,target,150);assert.equal(a.update(live,target,300).matched,true);
  assert.equal(a.update(pair(.3),target,340).left.state,'outside');
  assert.equal(a.update(pair(.1),target,380).matched,false);
});
test('missing hand, target, or tracking gap cannot retain green',()=>{
  for(const kind of ['left','target','gap']){
    const a=new PalmAlignment();for(let t=0;t<=400;t+=100)a.update(pair(),pair(),t);
    const result=a.update(kind==='left'?{right:hand(.4)}:pair(),kind==='target'?null:pair(),kind==='gap'?900:440);
    assert.equal(result.matched,false);
  }
  const a=new PalmAlignment();const result=a.update({left:hand(.4),right:hand(0)},pair(),0);
  assert.equal(result.left.state,'outside');assert.equal(result.right.state,'outside');
});
function take(detector,{missing=false,returnHome=true}={}){
  let result=null;
  for(let t=0;t<=400;t+=40)detector.update(pair(),t);
  for(let t=440;t<=1600;t+=40)detector.update(pair(.25),t);
  const end=detector.candidate;
  for(let t=1640;t<=2000;t+=40)detector.update(pair(.25*(2000-t)/400),t);
  for(let t=2040;t<=3000;t+=40)result=detector.update(missing?{left:hand(0)}:pair(returnHome?0:.3),t)??result;
  return {result,end};
}
test('save gesture trims endpoint hold before the return motion',()=>{
  const {result,end}=take(new CaptureEndpoint());assert.equal(result,end);assert.equal(end,1600);
});
test('no accidental save for idle, incomplete return, tracking loss or stale endpoint',()=>{
  const idle=new CaptureEndpoint();for(let t=0;t<4000;t+=40)assert.equal(idle.update(pair(),t),null);
  assert.equal(take(new CaptureEndpoint(),{missing:true}).result,null);
  assert.equal(take(new CaptureEndpoint(),{returnHome:false}).result,null);
  const d=new CaptureEndpoint();take(d,{returnHome:false});d.interrupt();assert.equal(d.cutoff(3000),null);
  const stale=new CaptureEndpoint();take(stale);assert.equal(stale.cutoff(9000),null);
});

test('configured save zone survives take reset and is not replaced by a different starting pose',()=>{
 const home=[[0,0,0],[.4,0,0]],d=new CaptureEndpoint();
 for(const start of [.3,.6]){
  d.reset(home);d.update(pair(start),0);assert.deepEqual(d.home,home);
  for(let t=40;t<=1600;t+=40)d.update(pair(start+.2),t);
  const end=d.candidate;assert.notEqual(end,null);
  for(let t=1640;t<=2000;t+=40)d.update(pair(start),t);
  assert.equal(d.update(pair(start),2040),null,'Returning to take start must not save');
  let saved=null;for(let t=2080;t<=3040;t+=40)saved=d.update(pair(),t)??saved;
  assert.equal(saved,end);assert.deepEqual(d.home,home);
 }
});
test('save-position capture requires consecutive stable visible palms',async()=>{
 const {SavePositionCapture}=await import('../public/tutorial-assist.mjs');const d=new SavePositionCapture();
 for(let t=0;t<=400;t+=40)assert.equal(d.update(pair(),t),null);
 assert.equal(d.update({left:hand(0)},440),null);
 for(let t=480;t<1280;t+=40)assert.equal(d.update(pair(),t),null);
 assert.deepEqual(d.update(pair(),1280),[[0,0,0],[.4,0,0]]);
 assert.equal(d.update(pair(),1280),null,'duplicate timestamp invalidates hold');
 assert.equal(d.update(pair(),2000),null);assert.equal(d.update(pair(.2),2040),null);
});
