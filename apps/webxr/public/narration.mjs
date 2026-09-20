import {AUDIO_RATE,encodeNarration,decodeNarration,validateNarration} from './narration-core.mjs';

// MediaRecorder is only a capture transport; saved/replayed media is bounded PCM WAV.
export class NarrationRecorder{
  constructor({onStatus=()=>{}}={}){this.onStatus=onStatus;this.generation=0;this.stream=null;this.take=null;this.message='Microphone off. Steps can use written instructions.';}
  report(message){this.message=message;this.onStatus(message);}
  get ready(){return this.stream?.getAudioTracks().some(t=>t.readyState==='live')||false;}
  async enable(){
    const generation=++this.generation;
    try{
      if(!globalThis.MediaRecorder)throw Error('Audio recording is unavailable in this browser.');
      const stream=await navigator.mediaDevices.getUserMedia({audio:{channelCount:1,echoCancellation:true},video:false});
      if(generation!==this.generation){stream.getTracks().forEach(t=>t.stop());return;}
      this.stream?.getTracks().forEach(t=>t.stop());this.stream=stream;
      stream.getAudioTracks().forEach(t=>t.addEventListener('ended',()=>{if(this.stream===stream){if(this.take)this.take.error='Microphone disconnected during this take.';this.report('Microphone disconnected. Re-enable before recording narration.');}}));
      this.report('Microphone ready. Narration records only while a step is recording.');
    }catch(e){if(generation===this.generation)this.report(`Microphone unavailable: ${e.message}`);throw e;}
  }
  disable(){this.generation++;this.cancel();const stream=this.stream;this.stream=null;stream?.getTracks().forEach(t=>t.stop());this.report('Microphone off.');}
  begin(){
    this.cancel();if(!this.ready)return false;
    const mime=['audio/webm;codecs=opus','audio/ogg;codecs=opus','audio/mp4'].find(m=>MediaRecorder.isTypeSupported(m));
    const recorder=new MediaRecorder(this.stream,{...(mime?{mimeType:mime}:{}),audioBitsPerSecond:64000});
    const take={recorder,chunks:[],bytes:0,error:null,cancelled:false};this.take=take;
    take.stopped=new Promise(resolve=>recorder.addEventListener('stop',resolve,{once:true}));
    recorder.addEventListener('error',()=>{take.error='Browser could not record narration.';});
    recorder.addEventListener('dataavailable',e=>{
      if(take.cancelled)return;take.bytes+=e.data.size;
      if(take.bytes>4*1024*1024){take.error='Narration exceeded its capture limit.';if(recorder.state!=='inactive')recorder.stop();return;}
      take.chunks.push(e.data);
    });
    recorder.start(250);this.report('Recording narration locally.');return true;
  }
  pause(){if(this.take?.recorder.state==='recording')this.take.recorder.pause();}
  resume(){if(this.take?.recorder.state==='paused')this.take.recorder.resume();}
  invalidate(reason){if(this.take){this.take.error=reason;this.pause();}}
  cancel(){const take=this.take;this.take=null;if(take){take.cancelled=true;if(take.recorder.state!=='inactive')take.recorder.stop();take.chunks=[];}}
  async finish(duration){
    const take=this.take;if(!take)return null;this.take=null;
    let timer;
    try{
      if(take.recorder.state!=='inactive')take.recorder.stop();
      await Promise.race([take.stopped,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('Narration did not finish in time.')),4000);})]);
      if(take.cancelled)throw Error('Narration take was cancelled.');if(take.error)throw Error(take.error);
      const bytes=await new Blob(take.chunks,{type:take.recorder.mimeType}).arrayBuffer();
      const context=new OfflineAudioContext(1,AUDIO_RATE,AUDIO_RATE),decoded=await context.decodeAudioData(bytes);
      if(decoded.duration>180.5)throw Error('Narration is too long.');
      const samples=new Float32Array(decoded.length);
      for(let c=0;c<decoded.numberOfChannels;c++){const channel=decoded.getChannelData(c);for(let i=0;i<samples.length;i++)samples[i]+=channel[i]/decoded.numberOfChannels;}
      return validateNarration(encodeNarration(samples),duration);
    }finally{clearTimeout(timer);take.chunks=[];this.report(this.ready?'Microphone ready for the next step.':'Microphone off.');}
  }
}

export class NarrationPlayback{
  constructor({onError=()=>{}}={}){this.onError=onError;this.context=null;this.node=null;this.key=null;this.buffer=null;this.enabled=true;this.blockedReported=false;}
  unlock(){
    try{this.context??=new AudioContext();void this.context.resume().catch(e=>this.onError(e.message));}
    catch(e){this.onError(`Narration playback unavailable: ${e.message}`);}
  }
  stop(){if(this.node){if(this.instructionPlaying){this.instructionOffset=Math.min(this.buffer.duration,this.offset+Math.max(0,this.context.currentTime-this.startedAt));this.instructionPlaying=false;}try{this.node.stop();}catch{}this.node.disconnect();this.node=null;}}
  instructionPending(player){
    if(!this.enabled||this.preferOriginal||!player?.step?.instruction_voice||!this.context||this.context.state!=='running')return false;
    return this.instructionPlayer!==player||this.instructionKey!==player.step.instruction_voice||this.instructionRevision!==(player.playbackRevision||0)||!this.instructionDone;
  }
  syncInstruction(player,allowed){
    if(!this.context){return;}
    const voice=player.step.instruction_voice;
    if(this.instructionPlayer!==player||this.instructionKey!==voice||this.instructionRevision!==(player.playbackRevision||0)){
      this.stop();this.instructionPlayer=player;this.instructionKey=voice;this.instructionRevision=player.playbackRevision||0;this.instructionOffset=0;this.instructionDone=false;this.instructionPlaying=false;this.key=null;
      const samples=decodeNarration(voice);this.buffer=this.context?.createBuffer(1,samples.length,AUDIO_RATE);this.buffer?.copyToChannel(samples,0);
    }
    if(!allowed||!this.enabled||player.audioPaused||(player.paused&&player.time<player.step.duration_ms)){this.stop();return;}
    if(!this.context||this.context.state!=='running'||!this.buffer)return;
    // A stalled headset audio clock must never hold the learner indefinitely.
    if(this.node&&this.instructionPlaying&&performance.now()>this.instructionDeadline){this.stop();this.instructionDone=true;this.onError('Instruction audio interrupted. Read the written instruction or replay.');}
    if(this.instructionDone||this.node)return;
    if(this.instructionOffset>=this.buffer.duration){this.instructionDone=true;return;}
    const node=this.context.createBufferSource();node.buffer=this.buffer;node.connect(this.context.destination);
    this.node=node;this.instructionPlaying=true;this.offset=this.instructionOffset;this.startedAt=this.context.currentTime;
    this.instructionDeadline=performance.now()+(this.buffer.duration-this.offset)*1000+2500;
    node.onended=()=>{if(this.node===node){node.disconnect();this.node=null;this.instructionPlaying=false;this.instructionDone=true;}};node.start(0,this.offset);
  }
  sync(player,allowed=true){
    if(player?.step?.instruction_voice&&!this.preferOriginal){this.syncInstruction(player,allowed);return;}
    this.instructionPlayer=null;this.instructionKey=null;
    const voice=player?.step?.narration;
    if(!allowed||!this.enabled||!voice||player.paused){this.stop();return;}
    if(!this.context||this.context.state!=='running'){
      if(!this.blockedReported){this.blockedReported=true;this.onError('Tap Enable sound or a playback control to hear narration.');}return;
    }
    this.blockedReported=false;
    if(this.key!==voice){
      this.stop();this.key=voice;const samples=decodeNarration(voice);
      this.buffer=this.context.createBuffer(1,samples.length,AUDIO_RATE);this.buffer.copyToChannel(samples,0);
    }
    const wanted=player.time/1000;if(wanted>=this.buffer.duration){this.stop();return;}
    const actual=this.node?this.offset+(this.context.currentTime-this.startedAt)*this.rate:Infinity;
    if(this.node&&Math.abs(actual-wanted)<.15&&this.rate===player.rate)return;
    this.stop();const node=this.context.createBufferSource();node.buffer=this.buffer;node.playbackRate.value=player.rate;
    node.connect(this.context.destination);this.node=node;this.offset=wanted;this.startedAt=this.context.currentTime;this.rate=player.rate;
    node.onended=()=>{if(this.node===node){node.disconnect();this.node=null;}};node.start(0,wanted);
  }
}
