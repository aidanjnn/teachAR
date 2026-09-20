// Portable local narration: canonical mono 16-bit PCM WAV at 16 kHz.
export const AUDIO_RATE=16000, MAX_AUDIO_MS=180500, MAX_AUDIO_CHARS=7800000;
const prefix='data:audio/wav;base64,';
const toBase64=bytes=>{let s='';for(let i=0;i<bytes.length;i+=8192)s+=String.fromCharCode(...bytes.subarray(i,i+8192));return btoa(s);};
export function encodeNarration(samples){
  if(!samples?.length||samples.length>AUDIO_RATE*MAX_AUDIO_MS/1000)throw Error('Narration is empty or too long.');
  const data=new Uint8Array(44+samples.length*2),v=new DataView(data.buffer);
  const text=(i,s)=>{for(let j=0;j<s.length;j++)data[i+j]=s.charCodeAt(j);};
  text(0,'RIFF');v.setUint32(4,data.length-8,true);text(8,'WAVE');text(12,'fmt ');v.setUint32(16,16,true);
  v.setUint16(20,1,true);v.setUint16(22,1,true);v.setUint32(24,AUDIO_RATE,true);v.setUint32(28,AUDIO_RATE*2,true);
  v.setUint16(32,2,true);v.setUint16(34,16,true);text(36,'data');v.setUint32(40,samples.length*2,true);
  for(let i=0;i<samples.length;i++){if(!Number.isFinite(samples[i]))throw Error('Invalid audio sample.');v.setInt16(44+i*2,Math.round(Math.max(-1,Math.min(1,samples[i]))*32767),true);}
  return {audio:prefix+toBase64(data),duration_ms:samples.length/AUDIO_RATE*1000,alignment:'browser-start-stop-approximate'};
}
export function decodeNarration(value){
  if(!value||typeof value.audio!=='string'||value.audio.length>MAX_AUDIO_CHARS||!value.audio.startsWith(prefix)||
    !/^[A-Za-z0-9+/]+={0,2}$/.test(value.audio.slice(prefix.length)))throw Error('Narration must be a bounded local PCM WAV, never a URL.');
  const raw=atob(value.audio.slice(prefix.length)),bytes=Uint8Array.from(raw,c=>c.charCodeAt(0));
  if(bytes.length<46)throw Error('Narration is truncated.');
  const v=new DataView(bytes.buffer),text=(i,n)=>raw.slice(i,i+n),count=(bytes.length-44)/2;
  if(text(0,4)!=='RIFF'||text(8,4)!=='WAVE'||text(12,4)!=='fmt '||text(36,4)!=='data'||v.getUint32(4,true)!==bytes.length-8||
    v.getUint32(16,true)!==16||v.getUint16(20,true)!==1||v.getUint16(22,true)!==1||v.getUint32(24,true)!==AUDIO_RATE||
    v.getUint32(28,true)!==AUDIO_RATE*2||v.getUint16(32,true)!==2||v.getUint16(34,true)!==16||
    v.getUint32(40,true)!==bytes.length-44||!Number.isInteger(count)||count>AUDIO_RATE*MAX_AUDIO_MS/1000)
    throw Error('Unsupported or inconsistent narration WAV.');
  const samples=new Float32Array(count);for(let i=0;i<count;i++)samples[i]=v.getInt16(44+i*2,true)/32767;
  return samples;
}
export function validateNarration(value,duration){
  if(value==null)return null;
  const samples=decodeNarration(value),actual=samples.length/AUDIO_RATE*1000;
  if(Math.abs(actual-duration)>500)throw Error('Narration and motion durations differ by over 0.5 seconds. Re-record or remove narration.');
  return {audio:value.audio,duration_ms:actual,alignment:'browser-start-stop-approximate'};
}
export function trimNarration(value,start,end){
  if(!value)return null;
  const samples=decodeNarration(value),clip=samples.slice(Math.round(start*AUDIO_RATE/1000),Math.round(end*AUDIO_RATE/1000));
  return clip.length?encodeNarration(clip):null;
}
