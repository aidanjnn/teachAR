import test from 'node:test';
import assert from 'node:assert/strict';
import {voiceIntentContext,voiceContext,applyVoiceCommand} from '../public/voice-actions.mjs';
import {VoiceCommands,UtteranceGate,pcmWav} from '../public/voice-commands.mjs';
const guide=()=>({activeSession:true,mode:'learn',epoch:1,takeGeneration:1,tutorial:{id:'t',revision:1,steps:[{},{}]},player:{index:0,step:{instruction:'Lift the edge.'}},practice:{phase:'ready'},log(){},notify(){},showStep(){this.shown=true;},action(id){this.lastAction=id;if(id==='replay')this.gatePaused=!this.gatePaused;}});
const response=body=>({ok:true,json:async()=>body});
test('context exposes only relevant commands and never physical confirmation',()=>{
 const g=guide();assert.ok(voiceIntentContext(g).allowed.includes('next'));assert.ok(!voiceIntentContext(g).allowed.includes('save'));assert.ok(!voiceIntentContext(g).allowed.includes('previous'));
 const before=voiceContext(g);g.epoch++;assert.notEqual(before,voiceContext(g));g.mode='capture';g.fluidCapture=true;assert.ok(voiceIntentContext(g).allowed.includes('save'));g.pending={};assert.deepEqual(voiceIntentContext(g).allowed,['stop']);
});
test('next/replay create a new local attempt without confirming a step',()=>{
 const g=guide();g.player.confirm=()=>assert.fail('must not confirm');assert.ok(applyVoiceCommand(g,'next').ok);assert.equal(g.player.index,1);assert.equal(g.epoch,2);assert.ok(g.shown);assert.ok(!applyVoiceCommand(g,'next').ok);assert.ok(applyVoiceCommand(g,'replay').ok);assert.equal(g.player.index,1);assert.equal(g.epoch,3);
 g.pending={};assert.ok(!applyVoiceCommand(g,'previous').ok);
});
test('recording commands use real capture actions; pause and resume are idempotent',()=>{
 const g=guide();g.mode='author';applyVoiceCommand(g,'record');assert.equal(g.lastAction,'primary');g.mode='capture';applyVoiceCommand(g,'pause');assert.equal(g.lastAction,'replay');g.fluidCapture=true;g.sealFluidSegment=(final,acceptance)=>{assert.equal(final,false);assert.equal(acceptance,'finish');return true;};assert.ok(applyVoiceCommand(g,'save').ok);
 g.mode='learn';g.gatePaused=false;applyVoiceCommand(g,'pause');assert.equal(g.gatePaused,true);applyVoiceCommand(g,'pause');assert.equal(g.gatePaused,true);applyVoiceCommand(g,'resume');assert.equal(g.gatePaused,false);
});
test('energy gate sends no silence and produces a bounded mono WAV',()=>{
 const gate=new UtteranceGate(16000),silence=new Float32Array(1600);for(let i=0;i<100;i++)assert.equal(gate.push(silence),null);
 let clip;for(let i=0;i<8;i++)gate.push(new Float32Array(1600).fill(.1));for(let i=0;i<6;i++)clip=gate.push(silence)||clip;assert.ok(clip);const wav=pcmWav(clip,16000),v=new DataView(wav);assert.equal(v.getUint16(22,true),1);assert.equal(v.getUint32(24,true),16000);assert.ok(wav.byteLength<192044);
});
test('late intent cannot act after a step change or stop',async()=>{
 const g=guide();let finish;const v=new VoiceCommands(g,{fetchImpl:()=>new Promise(r=>finish=r)});v.active=true;
 const request=v.submit(new ArrayBuffer(2),voiceContext(g));g.epoch++;finish(response({action:'next',response:''}));await request;assert.equal(g.player.index,0);assert.match(v.message,/changed/);
 const second=v.submit(new ArrayBuffer(2),voiceContext(g));v.stop();finish(response({action:'next',response:''}));await second;assert.equal(g.player.index,0);
});
test('natural intent acts locally; answers and invalid action names never dispatch',async()=>{
 const g=guide(),spoken=[];let result={action:'pause',response:''};const v=new VoiceCommands(g,{respond:t=>spoken.push(t),fetchImpl:async(_url,init)=>{assert.equal(JSON.parse(decodeURIComponent(init.headers['x-trail-voice-context'])).mode,'learn');return response(result);}});v.active=true;
 await v.submit(new ArrayBuffer(2),voiceContext(g));assert.equal(g.gatePaused,true);assert.match(spoken[0],/paused/);
 result={action:'none',response:'Would you like to replay this step?'};await v.submit(new ArrayBuffer(2),voiceContext(g));assert.equal(g.player.index,0);assert.equal(spoken.at(-1),result.response);
 result={action:'delete-all'};await v.submit(new ArrayBuffer(2),voiceContext(g));assert.equal(g.player.index,0);v.stop();
});
