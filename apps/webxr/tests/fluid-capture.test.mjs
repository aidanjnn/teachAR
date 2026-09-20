import test from 'node:test';import assert from 'node:assert/strict';
import {HoldSegmenter,filterLibrary} from '../public/fluid-capture.mjs';
const hand=x=>Array.from({length:25},()=>({p:[x,0,0],q:[0,0,0,1]}));
const hands=x=>({left:hand(x),right:hand(x+.3)});
test('stationary hands never arm a segment; movement and sustained hold do',()=>{
 const s=new HoldSegmenter();for(let t=0;t<4000;t+=40)assert(!s.update(hands(0),t));
 let saved=false;for(let t=4000;t<6400;t+=40)saved=s.update(hands(.2),t)||saved;assert(saved);
 s.reset();for(let t=6400;t<10400;t+=40)assert(!s.update(hands(.2),t));
});
test('missing active hand, focus interruption and frame stalls reset the hold',()=>{
 for(const interruption of ['missing','pause','stall']){
  const s=new HoldSegmenter();s.update(hands(0),0);for(let t=40;t<2000;t+=40)s.update(hands(.2),t);
  if(interruption==='missing')s.update({left:null,right:hand(.5)},2000);else if(interruption==='pause')s.interrupt();
  const time=interruption==='stall'?3000:2040;assert(!s.update(hands(.2),time));assert.equal(s.progress,0);
 }
});
test('one-hand tasks can segment, but cannot switch active hands mid-hold',()=>{
 const s=new HoldSegmenter();s.update({right:hand(0)},0);let saved=false;
 for(let t=40;t<3000;t+=40)saved=s.update({right:hand(.2)},t)||saved;assert(saved);
 s.interrupt();assert(!s.update({left:hand(.2)},3040));
});
test('library filters titles and layouts without mutating items',()=>{
 const items=[{title:'Fold cloth',setup:'Table',completion:{}},{title:'Assemble stand',setup:'Desk'}];
 assert.equal(filterLibrary(items,'CLOTH').length,1);assert.equal(filterLibrary(items,'desk','draft').length,1);assert.equal(filterLibrary(items,'desk','ready').length,0);assert.equal(items.length,2);
});

test('hold acceptance survives export honestly and trimming requires review',async()=>{
 const {newTutorial,prepareStep,finishTutorial,validateTutorial,trimStep,authoringReadiness}=await import('../public/tutorial-core.mjs');
 const tutorial=newTutorial('Example');tutorial.setup='Arrange the objects';tutorial.calibration_span_m=.5;
 const step=prepareStep(Array.from({length:80},(_,i)=>({t:i*40,...hands(i*.004)})),'Transfer');step.guide_hands='both';step.acceptance='hold';tutorial.steps=[step];
 const ready=validateTutorial(finishTutorial(tutorial));assert(!ready.steps[0].reviewed);assert(ready.completion.kind.startsWith('expert-accepted'));
 ready.steps[0]=trimStep(ready.steps[0],0,2000);assert(!authoringReadiness(ready).ready);
 step.acceptance='model-approved';assert.throws(()=>validateTutorial(tutorial),/acceptance/);
});

test('explicit required hands cannot silently shrink to the visible hand',()=>{
 const s=new HoldSegmenter();s.reset('both');
 for(let t=0;t<4000;t+=40)assert(!s.update({right:hand(t<40?0:.2)},t));
 assert.deepEqual(s.sides,['left','right']);assert.equal(s.progress,0);
});


test('save circle starts after a full second and cutoff excludes the circle',()=>{
 const s=new HoldSegmenter();s.reset('both');s.update(hands(0),0);
 for(let t=40;t<1040;t+=40){assert(!s.update(hands(.12),t));assert.equal(s.progress,0);}
 assert(!s.update(hands(.12),1040));assert.equal(s.progress,0);assert.equal(s.cutoff(1040),1040);
 for(let t=1080;t<2040;t+=40)assert(!s.update(hands(.12),t));
 assert(s.update(hands(.12),2040));assert.equal(s.cutoff(2040),1040);
 s.update(hands(.25),2080);assert.equal(s.progress,0);assert.equal(s.cutoff(2080),1040);
 s.interrupt();assert.equal(s.cutoff(2100),null);
});
