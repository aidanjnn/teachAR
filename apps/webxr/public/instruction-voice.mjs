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
  throw Error(message||'Could not prepare instruction audio. Your recording is unchanged.');
}
export async function polishStep(step,{fetchImpl=fetch,signal}={}){
  if(!step.narration||step.narration_issue)throw Error('This step needs a usable narration recording. You can also write an instruction and generate its voice.');
  if(step.narration.duration_ms>120000)throw Error('Trim narration to two minutes before polishing.');
  const response=await responseOrError(await fetchImpl('/api/voice/polish',{method:'POST',credentials:'same-origin',headers:{'content-type':'audio/wav'},body:wavBytesFromDataUrl(step.narration.audio),signal}));
  const p=await response.json();
  if(typeof p.title!=='string'||p.title.length>60||typeof p.instruction!=='string'||!p.instruction.trim()||p.instruction.length>240||typeof p.transcript!=='string'||p.transcript.length>4000)throw Error('The instruction draft was invalid.');
  return p;
}
export async function generateInstructionVoice(text,{fetchImpl=fetch,signal,decode=decodeSpeech}={}){
  const response=await responseOrError(await fetchImpl('/api/voice/instruction-audio',{method:'POST',credentials:'same-origin',headers:{'content-type':'application/json'},body:JSON.stringify({text,approved:true}),signal}));
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
