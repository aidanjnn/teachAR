import test from 'node:test';import assert from 'node:assert/strict';
import {LandmarkHold,nearestPracticePose,validateLandmarks} from '../public/workspace-assist.mjs';
const hand=x=>Array.from({length:25},()=>({p:[x,0,0]}));
test('landmarks require a continuous stable window; tracking gaps and movement reset it',()=>{
 const h=new LandmarkHold();for(let t=0;t<1500;t+=50)assert.equal(h.update([.2+(t%100?.001:0),1,0],t),null);
 assert.ok(Math.abs(h.update([.2,1,0],1500)[0]-.2)<.002);
 assert.equal(h.update(null,1550),null);assert.equal(h.progress,0);
 for(let t=1600;t<2500;t+=50)h.update([0,1,0],t);
 assert.equal(h.update([.1,1,0],2500),null);assert.equal(h.progress,0);
 assert.equal(h.update([.1,1,0],2900),null);assert.equal(h.progress,0);
});
test('untimed practice compares palms from one shared reference pose; missing hands cannot turn green',()=>{
 const step={guide_hands:'both',frames:[{left:hand(0),right:hand(.4)},{left:hand(.5),right:hand(.9)}]};
 assert.equal(nearestPracticePose(step,{left:hand(.52),right:hand(.92)}).state,'inside');
 assert.equal(nearestPracticePose(step,{left:hand(0),right:hand(.9)}).state,'outside');
 assert.equal(nearestPracticePose(step,{left:null,right:hand(.9)}).state,'unknown');
 assert.equal(nearestPracticePose({...step,guide_hands:'right'},{right:hand(.9)}).state,'inside');
});
test('visual suggestions are bounded image points, not model supplied world coordinates',()=>{
 const x={status:'uncertain',note:'Confirm paper orientation',landmarks:[{label:'Near left corner',uv:[.2,.5]},{label:'Near right corner',uv:[.8,.5]}]};
 assert.equal(validateLandmarks(x).status,'uncertain');assert.throws(()=>validateLandmarks({...x,landmarks:[{label:'x',uv:[12,3]},x.landmarks[1]]}));
});
