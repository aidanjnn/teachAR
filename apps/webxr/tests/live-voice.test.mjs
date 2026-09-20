import test from 'node:test';import assert from 'node:assert/strict';import {LiveVoiceControls} from '../public/live-voice.mjs';

test('exact spoken controls act from the transcript at once, both dedup directions hold, and questions are left to the model',async()=>{
 let handlers=null,onAction=null;const shown=[];
 const runtime={sessionState:async()=>({status:'no-pairing'}),createCoach:options=>{onAction=options.onAction;return {connect:async()=>'listening',onState(){},onTranscript(h){handlers=h;},onAnswer(){},onLiveError(){},dispose(){}};}};
 const steps=[{id:'s1',title:'First',instruction:'Move forward'},{id:'s2',title:'Second',instruction:'Move back'},{id:'s3',title:'Third',instruction:'Hold'}];
 const guide={activeSession:true,mode:'learn',epoch:1,takeGeneration:1,gatePaused:false,tutorial:{id:'t',revision:2,completion:{revision:2},title:'Real tutorial',steps},player:{index:0,step:steps[0],confirm(){assert.fail('voice must never confirm a step');}},audioPlayer:{stop(){}},coach:{onAttempt(){}},log(){},notify(){},showStep(){this.player.step=steps[this.player.index];shown.push(this.player.index);}};
 const voice=new LiveVoiceControls(guide,{runtime,visible:()=>true});
 try{
  await voice.start();assert.ok(handlers,'the live voice subscribes to transcripts');
  const say=text=>handlers({role:'learner',delta:text,stepRevision:0,stale:false});
  const coachSays=text=>handlers({role:'coach',delta:text,stepRevision:0,stale:false});
  // A question containing a command word does nothing, and neither does its fragmented tail.
  say(' Is the next step harder');say(' than this one?');
  await new Promise(r=>setTimeout(r,20));
  assert.equal(guide.player.index,0);
  // The exact command applies as soon as the sentence ends, without any model or tool call.
  say(' Next step.');
  assert.equal(guide.player.index,1);assert.deepEqual(shown,[1]);
  // The same phrase again at once is transcript stutter, not a second request.
  say(' Next step.');
  assert.equal(guide.player.index,1);
  // The model heard it too and delegates the same action: confirmed with the same message, not applied again, even though the view changed.
  const echo=await onAction('next','stale-context');
  assert.equal(echo.ok,true);assert.equal(guide.player.index,1);
  // A tool call for a different action still needs a current context.
  assert.equal((await onAction('previous','stale-context')).ok,false);
  // The other direction: the tool acts first, then the lagging transcript of the same request arrives.
  voice.recent=null;
  const applied=await onAction('previous',guide.mode&&[guide.takeGeneration,guide.tutorial.id,guide.tutorial.revision,guide.mode,guide.player.index,guide.epoch,guide.gatePaused].join('|'));
  assert.equal(applied.ok,true);assert.equal(guide.player.index,0);
  say(' Go back.');
  assert.equal(guide.player.index,0,'the lagging transcript did not apply the tool action twice');
  // A different utterance ends the echo window, so a genuine new request applies.
  say(' Okay.');await new Promise(r=>setTimeout(r,20));
  say(' Next step.');
  assert.equal(guide.player.index,1);
  // A command the coach interrupts before the quiet timer is judged on the speaker change, not dropped.
  say(' Go back');coachSays('Sure');
  assert.equal(guide.player.index,0);
  // A guide failure inside the local path is caught and reported, never thrown into the transcript event.
  guide.showStep=()=>{throw Error('renderer gone');};voice.recent=null;
  say(' Next step.');
  assert.match(voice.message,/Could not apply next/);
 }finally{voice.stop();}
});

test('one live voice adapts Home to the selected tutorial, without publishing a phantom local step',async()=>{
 const contexts=[];let disposed=0;
 const runtime={sessionState:async()=>({status:'no-pairing'}),createCoach:options=>{contexts.push(options);return {connect:async()=> 'listening',onState(){},onTranscript(){},onAnswer(){},onLiveError(){},dispose(){disposed++;}};}};
 const guide={mode:'home',epoch:1,tutorial:{id:'t',revision:2,completion:{revision:2},title:'Real tutorial',steps:[{id:'s1',title:'First',instruction:'Move forward'}]},notify(){}};
 const voice=new LiveVoiceControls(guide,{runtime,visible:()=>true});
 try{await voice.start();assert.equal(voice.authoring,true);assert.equal(contexts.length,1);assert.equal(guide.tutorial.steps.length,1);
  guide.mode='learn';await voice.observe();assert.equal(voice.authoring,false);assert.equal(contexts[1].context.steps[0].instruction,'Move forward');assert.equal(contexts[1].continuous,true);
  await voice.observe();assert.equal(contexts.length,2);voice.stop();guide.tutorial.revision++;await voice.observe();assert.equal(contexts.length,2);assert.ok(disposed>=2);
 }finally{voice.stop();}
});
