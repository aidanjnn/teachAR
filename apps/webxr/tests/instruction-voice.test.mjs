import test from 'node:test';
import assert from 'node:assert/strict';
import {encodeNarration} from '../public/narration-core.mjs';
import {validateInstructionVoice,polishStep,generateInstructionVoice} from '../public/instruction-voice.mjs';
import {newTutorial,prepareStep,validateTutorial,trimStep,TutorialPlayer} from '../public/tutorial-core.mjs';
import {NarrationPlayback} from '../public/narration.mjs';
const audio=seconds=>encodeNarration(new Float32Array(seconds*16000));
const joints=()=>Array.from({length:25},()=>({p:[0,0,0],q:[0,0,0,1]}));
const step=()=>({...prepareStep(Array.from({length:51},(_,i)=>({t:i*40,left:joints(),right:joints()})),'Fold in half.'),guide_hands:'both',narration:audio(2),instruction_voice:{...audio(4),source:'ai',text:'Fold in half.'}});
test('polished audio survives export/import with independent duration and intact original; trims and text edits invalidate it',()=>{
 const t={...newTutorial(),calibration_span_m:.4,steps:[step()]},saved=validateTutorial(JSON.parse(JSON.stringify(t)));
 assert.equal(saved.steps[0].instruction_voice.duration_ms,4000);assert.equal(saved.steps[0].narration.duration_ms,2000);
 assert.equal(trimStep(saved.steps[0],0,1000).instruction_voice,undefined);
 saved.steps[0].instruction='Fold the other side.';assert.equal(validateTutorial(saved).steps[0].instruction_voice,null);
 assert.throws(()=>validateInstructionVoice({source:'ai',text:'Fold',audio:'https://audio.test'},'Fold'));
 assert.throws(()=>validateInstructionVoice({...audio(31),source:'ai',text:'Fold'},'Fold'),/30 seconds|Invalid/);
});
test('generation sends only approved wording, validates output and does not overwrite source narration',async()=>{
 const s=step(),original=structuredClone(s);let sent;
 const voice=await generateInstructionVoice('Fold in half.',{fetchImpl:async(url,init)=>{sent=JSON.parse(init.body);return {ok:true,arrayBuffer:async()=>new ArrayBuffer(3)};},decode:async()=>audio(3)});
 assert.deepEqual(sent,{text:'Fold in half.',approved:true});assert.equal(voice.source,'ai');assert.deepEqual(s,original);
 await assert.rejects(()=>polishStep(s,{fetchImpl:async()=>({ok:false,status:401})}),/Pair/);
 await assert.rejects(()=>polishStep({...s,narration_issue:'failed'}),/usable narration/);
});
test('instruction playback stays normal speed, survives short motion, resumes and repeats without replay calls to AI',()=>{
 const p=new TutorialPlayer([step()]),a=new NarrationPlayback();p.setRate(.5);
 let starts=0;const context={state:'running',currentTime:0,destination:{},createBuffer:(_c,len,rate)=>({duration:len/rate,copyToChannel(){}}),createBufferSource:()=>({playbackRate:{value:1},connect(){},disconnect(){},stop(){},start(){starts++;}})};
 a.context=context;a.sync(p);assert.equal(a.node.playbackRate.value,1);assert.equal(a.instructionPending(p),true);
 context.currentTime=1;p.paused=true;p.time=1000;a.sync(p);assert.equal(a.node,null);assert.equal(a.instructionOffset,1);
 p.paused=false;a.sync(p);assert.equal(a.offset,1);assert.equal(starts,2);
 p.time=p.step.duration_ms;p.paused=true;a.sync(p);assert.ok(a.node,'natural motion ending must not truncate speech');
 a.node.onended();a.sync(p);assert.equal(starts,2);assert.equal(a.instructionPending(p),false);
 p.replay();a.sync(p);assert.equal(starts,3);assert.equal(a.offset,0);a.enabled=false;a.sync(p);assert.equal(a.node,null);assert.equal(a.instructionPending(p),false);
});
test('finish prepares clear narration sequentially, keeps originals and skips ambiguous or existing voice',async()=>{
 const {polishTutorialInstructions}=await import('../public/instruction-voice.mjs');
 const s=step();delete s.instruction_voice;
 const input={revision:2,completion:{revision:2},steps:[{...s,id:'a',reviewed:true},{...s,id:'b'},{...step(),id:'c'}]},calls=[];
 const result=await polishTutorialInstructions(input,{wait:async()=>{},services:{polishStep:async s=>{calls.push(`draft:${s.id}`);return {title:'Fold',instruction:'Bring the edges together.',needsReview:s.id==='b'};},generateInstructionVoice:async(text,options)=>{assert.equal(options.automatic,true);calls.push('speak');return {...step().instruction_voice,text};}}});
 assert.deepEqual(calls,['draft:a','speak','draft:b']);assert.equal(result.prepared,1);assert.equal(result.issues.length,1);assert.equal(result.tutorial.steps[0].narration.audio,input.steps[0].narration.audio);assert.equal(result.tutorial.steps[0].reviewed,false);assert.equal(result.tutorial.steps[0].acceptance,'finish');assert.equal(input.revision,2);assert.equal(result.tutorial.completion.revision,3);
});
test('finish stops after provider failure and rejects late cancelled results',async()=>{
 const {polishTutorialInstructions}=await import('../public/instruction-voice.mjs');const s=step();delete s.instruction_voice;let calls=0;
 const result=await polishTutorialInstructions({revision:1,steps:[s,s]},{wait:async()=>{},services:{polishStep:async()=>{calls++;throw Error('Pair first');}}});assert.equal(calls,1);assert.equal(result.prepared,0);assert.match(result.issues[0],/Pair first/);
 const controller=new AbortController();await assert.rejects(()=>polishTutorialInstructions({revision:1,steps:[s]},{signal:controller.signal,services:{polishStep:async()=>{controller.abort();return {needsReview:false};}}}),{name:'AbortError'});
});
