import test from 'node:test';import assert from 'node:assert/strict';import {LiveVoiceControls} from '../public/live-voice.mjs';
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
