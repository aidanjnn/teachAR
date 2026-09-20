import {createTutorCoach} from './tutorial-coach.mjs';
import {voiceContext,voiceIntentContext,applyVoiceCommand} from './voice-actions.mjs';
// One persistent WebRTC microphone. Buttons and gesture capture never depend on it.
export class LiveVoiceControls {
 constructor(guide,{audioSink,getUserMedia,tell=()=>{},visible=()=>true,runtime}={}){
  Object.assign(this,{guide,tell,visible});this.live=true;this.active=false;this.state='off';this.message='Voice off';this.inputLevel=0;this.busy=false;this.generation=0;
  const measuredMedia=async constraints=>{
   const generation=this.generation,stream=await (getUserMedia||((c)=>navigator.mediaDevices.getUserMedia(c)))(constraints);
   if(generation!==this.generation||!globalThis.AudioContext)return stream;
   const context=new AudioContext();this.meterContext=context;await context.resume();
   if(generation!==this.generation||this.meterContext!==context){void context.close().catch(()=>{});return stream;}
   const analyser=context.createAnalyser();analyser.fftSize=256;const source=context.createMediaStreamSource(stream);source.connect(analyser);const data=new Float32Array(analyser.fftSize);
   this.meterTimer=setInterval(()=>{analyser.getFloatTimeDomainData(data);this.inputLevel=this.active&&this.visible()?Math.sqrt(data.reduce((n,v)=>n+v*v,0)/data.length):0;},80);return stream;
  };
  this.coach=createTutorCoach({runtime,audioSink,getUserMedia:measuredMedia,continuous:true,tell,
   actionContext:()=>voiceContext(guide),onAction:(action,expected)=>{
    if(!this.active||!this.visible()||expected!==voiceContext(guide)||!voiceIntentContext(guide).allowed.includes(action))return {ok:false,message:'The view changed or that action is unavailable. Please ask again.'};
    if(action==='stop'){setTimeout(()=>this.stop(),300);return {ok:true,message:'Voice off.'};}
    const result=applyVoiceCommand(guide,action,{saveCutoff:guide.segmenter?.cutoff(guide.recordElapsed)});this.message=result.message;guide.notify(result.ok?'open':'error',result.message);return result;
   }});
  this.coach.onState(s=>{this.state=s.mode==='listening'?'listening':s.mode;this.active=['connecting','live','listening'].includes(s.mode);if(s.error)this.message=s.error;if(['idle','text'].includes(s.mode)){clearInterval(this.meterTimer);void this.meterContext?.close().catch(()=>{});this.meterContext=null;}});

 }
 context(){const g=this.guide,mode=['voice','voice-help'].includes(g.mode)?g.voiceReturn:g.mode;const authoring=!g.tutorial.completion||['home','library','loading-library','create-intro','saved','author','capture','capture-paused','step-ready'].includes(mode);return {authoring,key:[g.tutorial.id,authoring?'controls':g.tutorial.revision].join('|')};}
 observe(){if(this.requested&&this.visible()&&this.state!=='connecting'&&this.context().key!==this.contextKey)return this.start();}
 async start(){
  this.stop();this.requested=true;const generation=++this.generation,g=this.guide,spec=this.context();this.contextKey=spec.key;
  this.active=true;this.state='connecting';this.message='Connecting live voice…';
  // Recording controls need no invented task instructions. Publish a bounded generic
  // app-control guide while authoring; never add it to the user's local library.
  this.authoring=spec.authoring;
  const tutorial=this.authoring?{id:'trail-app-controls-v1',revision:0,title:'TeachAR recording controls',setup:'Only explain app and recording controls. A task has not been opened for live coaching; do not invent task instructions.',steps:[{id:'recording-controls',title:'Record a demonstration',instruction:'Save ends a step. Record starts another step. Finish saves the tutorial. Pause and resume control the current recording.'}]}:g.tutorial;
  try{const result=await this.coach.start(tutorial,this.authoring?tutorial.steps[0]:g.player?.step||tutorial.steps[0],g.epoch);
   if(generation!==this.generation)return;
   if(!['live','listening'].includes(result.mode)){this.active=false;this.state='off';this.message=result.error||'Live voice unavailable. Buttons and gestures still work.';}else this.message='Live voice ready';
   this.timer=setTimeout(()=>this.stop('Voice session ended. Enable again to continue.'),600000);
  }catch(e){if(generation===this.generation)this.stop(e.message);}
 }
 muteFor(ms){
  // Local announcements already use cues while live voice is active. Hidden tabs
  // stop the stream altogether rather than silently leaving a microphone open.
  if(!this.visible())this.stop('Voice paused while the experience is hidden.');
 }
 stop(message='Voice off'){this.requested=false;this.generation++;clearTimeout(this.timer);clearInterval(this.meterTimer);void this.meterContext?.close().catch(()=>{});this.meterContext=null;this.coach.stop();this.active=false;this.state='off';this.busy=false;this.inputLevel=0;this.message=message;}
}
