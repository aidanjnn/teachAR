import test from 'node:test';
import assert from 'node:assert/strict';
import {nextVideoSnapshot} from '../public/camera-snapshot.mjs';
function fixture(){
  let t=1000,cb,timer,valid=true,draws=0;
  const video={readyState:2,videoWidth:640,currentTime:4,requestVideoFrameCallback(fn){cb=fn;return 1;},cancelVideoFrameCallback(){cb=null;}};
  const promise=nextVideoSnapshot({video,valid:()=>valid,draw:()=>{draws++;return {image:'new image'};},now:()=>t,setTimer:fn=>{timer=fn;return 1;},clearTimer:()=>{timer=null;}});
  return {promise,deliver(mediaTime,elapsed=30){t=1000+elapsed;const fn=cb;cb=null;fn(t,{mediaTime});},invalidate(){valid=false;},expire(){timer();},draws:()=>draws};
}
test('waits for a newer frame, not the visible old preview',async()=>{
  const f=fixture();f.deliver(4);assert.equal(f.draws(),0);f.deliver(4.1);
  const result=await f.promise;assert.equal(f.draws(),1);assert.equal(result.capture.media_time_s,4.1);
});
test('camera switch, session end or hiding rejects a callback without drawing',async()=>{
  const f=fixture();f.invalidate();f.deliver(5);await assert.rejects(f.promise,/changed/);assert.equal(f.draws(),0);
});
test('stalled and late frames reject; they are not relabelled as fresh',async()=>{
  const f=fixture();f.expire();await assert.rejects(f.promise,/fresh frame/);assert.equal(f.draws(),0);
  const late=fixture();late.deliver(5,3000);await assert.rejects(late.promise,/too late/);
});
test('unsupported fresh-frame capture rejects instead of using a cached canvas',async()=>{
  await assert.rejects(nextVideoSnapshot({video:{readyState:2,videoWidth:640},valid:()=>true,draw:()=>{throw Error('must not draw');}}),/fresh camera/);
});
