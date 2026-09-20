import {voiceIntentContext,voiceContext,applyVoiceCommand} from './voice-actions.mjs';
export function pcmWav(blocks,rate){
 const count=blocks.reduce((n,b)=>n+b.length,0),buffer=new ArrayBuffer(44+count*2),v=new DataView(buffer);
 const str=(offset,text)=>[...text].forEach((c,i)=>v.setUint8(offset+i,c.charCodeAt(0)));
 str(0,'RIFF');v.setUint32(4,buffer.byteLength-8,true);str(8,'WAVEfmt ');v.setUint32(16,16,true);v.setUint16(20,1,true);v.setUint16(22,1,true);v.setUint32(24,rate,true);v.setUint32(28,rate*2,true);v.setUint16(32,2,true);v.setUint16(34,16,true);str(36,'data');v.setUint32(40,count*2,true);
 let offset=44;for(const block of blocks)for(const x of block){v.setInt16(offset,Math.round(Math.max(-1,Math.min(1,x))*32767),true);offset+=2;}return buffer;
}
// Local energy gate retains a short lead-in, bounds clips and sends nothing for silence.
export class UtteranceGate{
 constructor(rate){this.rate=rate;this.reset();}
 reset(){this.lead=[];this.blocks=[];this.duration=0;this.silence=0;this.started=false;}
 push(block){
  const ms=block.length/this.rate*1000,rms=Math.sqrt(block.reduce((n,v)=>n+v*v,0)/block.length),speech=rms>.018;
  if(!this.started){this.lead.push(block);while(this.lead.length*ms>250)this.lead.shift();if(!speech)return null;this.started=true;this.blocks=this.lead;this.lead=[];this.duration=this.blocks.reduce((n,b)=>n+b.length/this.rate*1000,0);}
  else {this.blocks.push(block);this.duration+=ms;}
  this.silence=speech?0:this.silence+ms;
  if(this.duration>5400||this.silence>=350){const blocks=this.blocks,result=this.duration>=350?blocks:null;this.reset();return result;}
  return null;
 }
}
export class VoiceCommands{
 constructor(guide,{fetchImpl=(...args)=>globalThis.fetch(...args),getUserMedia=c=>navigator.mediaDevices.getUserMedia(c),tell=()=>{},respond=()=>{},canListen=()=>true}={}){Object.assign(this,{guide,fetchImpl,getUserMedia,tell,respond,canListen});this.generation=0;this.active=false;this.state='off';this.message='Voice controls off';this.attempts=0;this.limit=60;this.muteUntil=0;}
 async start(){
  this.stop();const generation=this.generation;this.state='connecting';this.message='Preparing voice controls…';
  try{
   const response=await this.fetchImpl('/api/voice/commands/status',{method:'POST',credentials:'same-origin'});
   if(!response.ok)throw Error(response.status===401||response.status===403?'Pair this browser in Voice setup first.':'Voice API unavailable. Run the paired Trail server.');
   const status=await response.json();if(!status.enabled)throw Error('Transcription provider is off. Configure server voice first.');if(!status.remaining)throw Error('Server voice allowance used. Buttons still work.');
   if(generation!==this.generation)return;
   const stream=await this.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true,channelCount:1},video:false});
   if(generation!==this.generation){stream.getTracks().forEach(t=>t.stop());return;}
   this.stream=stream;const context=new AudioContext();this.context=context;await context.resume();if(generation!==this.generation)return;await context.audioWorklet.addModule('/command-audio-worklet.js');
   if(generation!==this.generation)return;
   const node=new AudioWorkletNode(this.context,'trail-command-audio');this.node=node;this.source=this.context.createMediaStreamSource(stream);this.source.connect(node);const silent=this.context.createGain();silent.gain.value=0;node.connect(silent).connect(this.context.destination);
   this.gate=new UtteranceGate(this.context.sampleRate);this.active=true;this.state='listening';this.message='Listening. Speak naturally: “save it now” or “go back please”.';this.attempts=0;this.startedAt=Date.now();this.muteFor(1200);
   this.timer=setTimeout(()=>this.stop('Voice session ended after 10 minutes. Enable again to continue.'),600000);
   stream.getTracks().forEach(t=>t.addEventListener('ended',()=>{if(generation===this.generation)this.stop('Microphone disconnected. Enable voice again.');}));
   node.port.onmessage=e=>{
    if(generation!==this.generation||!this.active)return;
    this.inputLevel=this.canListen()&&!this.busy?Math.sqrt(e.data.reduce((n,v)=>n+v*v,0)/e.data.length):0;
    const key=voiceContext(this.guide);
    if(!this.canListen()||Date.now()<this.muteUntil||this.busy){this.gate.reset();this.clipContext=null;return;}
    if(this.clipContext&&this.clipContext!==key){this.gate.reset();this.clipContext=null;}
    const blocks=this.gate.push(e.data);if(this.gate.started)this.clipContext??=key;
    if(blocks){const context=this.clipContext||key;this.clipContext=null;void this.submit(pcmWav(blocks,this.context.sampleRate),context);}
   };
  }catch(e){if(generation===this.generation)this.stop(e.message);}
 }
 muteFor(ms){this.muteUntil=Math.max(this.muteUntil,Date.now()+ms);this.gate?.reset();this.clipContext=null;}
 async submit(audio,context){
  if(!this.active||this.busy)return;if(this.attempts>=this.limit){this.stop('Voice clip limit reached. Enable again when needed.');return;}
  const saveCutoff=this.guide.segmenter?.cutoff(this.guide.recordElapsed);const generation=this.generation;this.busy=true;this.state='processing';this.message='Hearing command…';this.attempts++;const abort=new AbortController();this.abort=abort;const timeout=setTimeout(()=>abort.abort(),22000);
  try{
   const response=await this.fetchImpl('/api/voice/commands',{method:'POST',credentials:'same-origin',headers:{'content-type':'audio/wav','x-trail-voice-context':encodeURIComponent(JSON.stringify(voiceIntentContext(this.guide)))},body:audio,signal:this.abort.signal});const result=await response.json();
   if(generation!==this.generation)return;
   if(!response.ok){if([401,403,503].includes(response.status)||result.remaining===0){this.stop(result.message||'Voice unavailable.');return;}throw Error(result.message||'Try again in a moment.');}
   if(!this.canListen()||voiceContext(this.guide)!==context){this.message='View changed; please repeat the command.';return;}
   const command=result.action;
   if(command==='none'){this.message=String(result.response||'Listening…').slice(0,240);if(result.response)await this.reply(this.message,result.speechTicket);return;}
   if(!voiceIntentContext(this.guide).allowed.includes(command)){this.message='That action is not available here.';return;}
   if(command==='stop'){this.active=false;this.state='off';this.stream?.getTracks().forEach(t=>t.stop());this.message='Voice controls off.';await this.reply('Voice controls off.',result.speechTicket);if(generation===this.generation)this.stop('Voice controls off.');return;}
   const outcome=applyVoiceCommand(this.guide,command,{saveCutoff});this.message=outcome.message;this.tell(outcome.message);this.guide.notify(outcome.ok?'open':'error',outcome.message);this.muteFor(900);await this.reply(outcome.message,result.speechTicket);
  }catch(e){if(generation===this.generation)this.message=e.name==='AbortError'?'Voice timed out. Try again.':e.message;}
  finally{clearTimeout(timeout);if(generation===this.generation){this.busy=false;this.state=this.active?'listening':'off';this.muteFor(700);}}
 }
 async reply(text,ticket){
  this.respond(text); // Optional host caption/testing hook; audio is owned here.
  if(!ticket||!this.context)return;
  const generation=this.generation,key=voiceContext(this.guide),context=this.context;
  try{
   const response=await this.fetchImpl('/api/voice/speech',{method:'POST',credentials:'same-origin',headers:{'content-type':'application/json'},body:JSON.stringify({ticket,text:String(text).slice(0,240)}),signal:AbortSignal.timeout(12000)});
   if(!response.ok)throw Error('Speech unavailable');
   const decoded=await context.decodeAudioData(await response.arrayBuffer());
   if(generation!==this.generation||key!==voiceContext(this.guide)||!this.canListen())return;
   const node=context.createBufferSource();this.replyNode=node;node.buffer=decoded;node.connect(context.destination);
   await new Promise(resolve=>{
    let settled=false;const done=()=>{if(settled)return;settled=true;clearInterval(watchdog);clearTimeout(deadline);node.disconnect();if(this.replyNode===node)this.replyNode=null;resolve();};
    const watchdog=setInterval(()=>{if(generation!==this.generation||key!==voiceContext(this.guide)||!this.canListen()){node.stop();done();}},100);
    const deadline=setTimeout(()=>{node.stop();if(generation===this.generation)this.message=text+' · Audio interrupted; reply shown here.';done();},Math.min(20000,decoded.duration*1000+2500));
    node.onended=done;node.start();
   });
   this.muteFor(900);
  }catch{if(generation===this.generation)this.message=text+' · Audio unavailable; reply shown here.';}
 }
 stop(message='Voice controls off'){
  this.inputLevel=0;this.generation++;this.active=false;this.busy=false;this.state='off';this.message=message;this.abort?.abort();this.replyNode?.stop();this.replyNode=null;clearTimeout(this.timer);this.node?.disconnect();this.source?.disconnect();this.stream?.getTracks().forEach(t=>t.stop());this.stream=null;void this.context?.close().catch(()=>{});this.context=null;this.gate?.reset();this.clipContext=null;
 }
}
