import {AUDIO_RATE,encodeNarration,decodeNarration} from './narration-core.mjs';
import {wavBytesFromDataUrl} from './narration-labels.mjs';

// Generated instruction speech has its own timeline. Never stretch it to fit joint timestamps.
export function validateInstructionVoice(value,instruction){
  if(value==null)return null;
  if(value.source!=='ai'||typeof value.text!=='string'||value.text.length>240||typeof value.audio!=='string'||value.audio.length>1280100)throw Error('Invalid generated instruction voice.');
  const duration=decodeNarration(value).length/AUDIO_RATE*1000;
  if(duration>30000)throw Error('Instruction voice must be at most 30 seconds.');
  // An edited instruction cannot retain speech that says something different.
  if(value.text!==instruction)return null;
  return {source:'ai',text:value.text,audio:value.audio,duration_ms:duration};
}
async function responseOrError(response){
  if(response.ok)return response;
  if(response.status===401||response.status===403)throw Error('Pair this browser as the author in Voice before polishing instructions.');
  let message;try{message=(await response.json()).message;}catch{}
  const error=Error(message||'Could not prepare instruction audio. Your recording is unchanged.');error.status=response.status;throw error;
}
export async function polishStep(step,{fetchImpl=fetch,signal}={}){
  if(!step.narration||step.narration_issue)throw Error('This step needs a usable narration recording. You can also write an instruction and generate its voice.');
  if(step.narration.duration_ms>120000)throw Error('Trim narration to two minutes before polishing.');
  const response=await responseOrError(await fetchImpl('/api/voice/polish',{method:'POST',credentials:'same-origin',headers:{'content-type':'audio/wav'},body:wavBytesFromDataUrl(step.narration.audio),signal}));
  const p=await response.json();
  if(typeof p.needsReview!=='boolean'||typeof p.title!=='string'||p.title.length>60||typeof p.instruction!=='string'||!p.instruction.trim()||p.instruction.length>240||typeof p.transcript!=='string'||p.transcript.length>4000)throw Error('The instruction draft was invalid.');
  return p;
}
export async function generateInstructionVoice(text,{fetchImpl=fetch,signal,automatic=false,decode=decodeSpeech}={}){
  const response=await responseOrError(await fetchImpl('/api/voice/instruction-audio',{method:'POST',credentials:'same-origin',headers:{'content-type':'application/json'},body:JSON.stringify(automatic?{text,automatic:true}:{text,approved:true}),signal}));
  const bytes=await response.arrayBuffer();if(bytes.byteLength>1024*1024)throw Error('Instruction audio was too large.');
  const voice=await decode(bytes);
  return validateInstructionVoice({...voice,text,source:'ai'},text);
}
async function decodeSpeech(bytes){
  const context=new OfflineAudioContext(1,AUDIO_RATE,AUDIO_RATE),buffer=await context.decodeAudioData(bytes);
  if(buffer.duration>30||!buffer.length)throw Error('Instruction audio is too long. Shorten the instruction and try again.');
  const samples=new Float32Array(buffer.length);
  for(let c=0;c<buffer.numberOfChannels;c++){const channel=buffer.getChannelData(c);for(let i=0;i<samples.length;i++)samples[i]+=channel[i]/buffer.numberOfChannels;}
  return encodeNarration(samples);
}

// Finish is the author's request to prepare the whole tutorial. Work sequentially,
// preserve the original narration, and never promote ambiguous wording silently.
export async function polishTutorialInstructions(tutorial,{signal,onProgress=()=>{},services={polishStep,generateInstructionVoice},wait=waitForCooldown}={}){
  const result=structuredClone(tutorial),issues=[];let prepared=0,requests=0;
  const candidates=result.steps.filter(s=>s.narration&&!s.narration_issue&&!s.instruction_voice);
  for(const [index,step] of candidates.entries()){
    signal?.throwIfAborted();onProgress({index:index+1,total:candidates.length,phase:'wording'});
    try{
      if(requests++)await wait(signal);
      const draft=await services.polishStep(step,{signal:signal?AbortSignal.any([signal,AbortSignal.timeout(100000)]):AbortSignal.timeout(100000)});
      signal?.throwIfAborted();
      if(draft.needsReview){issues.push(`Step ${result.steps.indexOf(step)+1}: wording was unclear; original kept.`);continue;}
      onProgress({index:index+1,total:candidates.length,phase:'speech'});await wait(signal);requests++;
      const voice=await services.generateInstructionVoice(draft.instruction,{automatic:true,signal:signal?AbortSignal.any([signal,AbortSignal.timeout(30000)]):AbortSignal.timeout(30000)});
      signal?.throwIfAborted();
      step.title=draft.title;step.instruction=draft.instruction;step.instruction_voice=voice;
      // Motion was accepted by the expert; generated wording was not replay-reviewed.
      step.reviewed=false;step.acceptance=step.acceptance||'finish';prepared++;
    }catch(e){
      signal?.throwIfAborted();issues.push(`Step ${result.steps.indexOf(step)+1}: ${e.message}`);
      // Do not burn more requests after auth, allowance or provider failure.
      break;
    }
  }
  if(prepared){result.revision++;if(result.completion)result.completion={...result.completion,revision:result.revision,kind:'expert-accepted; physical result unverified'};}
  return {tutorial:result,prepared,total:candidates.length,issues};
}
function waitForCooldown(signal){return new Promise((resolve,reject)=>{
  signal?.throwIfAborted();const abort=()=>{clearTimeout(timer);reject(signal.reason);};
  const timer=setTimeout(()=>{signal?.removeEventListener('abort',abort);resolve();},2100);signal?.addEventListener('abort',abort,{once:true});
});}
