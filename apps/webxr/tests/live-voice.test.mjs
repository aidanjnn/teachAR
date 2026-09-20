import test from 'node:test';import assert from 'node:assert/strict';import {LiveVoiceControls} from '../public/live-voice.mjs';

test('exact spoken controls act from the transcript at once, a delegated echo is confirmed once, and questions are left to the model',async()=>{
 let handlers=null,onAction=null;const shown=[];
 const runtime={sessionState:async()=>({status:'no-pairing'}),createCoach:options=>{onAction=options.onAction;return {connect:async()=>'listening',onState(){},onTranscript(h){handlers=h;},onAnswer(){},onLiveError(){},dispose(){}};}};
 const guide={activeSession:true,mode:'learn',epoch:1,takeGeneration:1,gatePaused:false,tutorial:{id:'t',revision:2,completion:{revision:2},title:'Real tutorial',steps:[{id:'s1',title:'First',instruction:'Move forward'},{id:'s2',title:'Second',instruction:'Move back'}]},player:{index:0,step:{id:'s1',instruction:'Move forward'},confirm(){assert.fail('voice must never confirm a step');}},audioPlayer:{stop(){}},coach:{onAttempt(){}},log(){},notify(){},showStep(){shown.push(this.player.index);}};
 const voice=new LiveVoiceControls(guide,{runtime,visible:()=>true});
 try{
  await voice.start();assert.ok(handlers,'the live voice subscribes to transcripts');
  const say=text=>handlers({role:'learner',delta:text,stepRevision:0,stale:false});
  // A question containing a command word does nothing.
  say(' Is the next step harder than this one?');
  await new Promise(r=>setTimeout(r,20));
  assert.equal(guide.player.index,0);
  // The exact command applies as soon as the sentence ends, without any model or tool call.
  say(' Next step.');
  assert.equal(guide.player.index,1);assert.deepEqual(shown,[1]);
  // The model heard it too and delegates the same action: confirmed with the same message, not applied again, even though the view changed.
  const echo=await onAction('next','stale-context');
  assert.equal(echo.ok,true);assert.equal(guide.player.index,1);
  // A tool call for a different action still needs a current context.
  assert.equal((await onAction('previous','stale-context')).ok,false);
  // The same phrase again a moment later is transcript stutter, not a second request.
  say(' Next step.');
  assert.equal(guide.player.index,1);
  // On the last step the screen no longer allows next, so the phrase is ignored locally rather than failing loudly.
  await new Promise(r=>setTimeout(r,1600));
  say(' Next step.');
  assert.equal(guide.player.index,1,'there is no third step');
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
