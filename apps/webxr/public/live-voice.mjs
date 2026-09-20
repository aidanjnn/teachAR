import {createTutorCoach} from './tutorial-coach.mjs';
import {voiceContext,voiceIntentContext,applyVoiceCommand} from './voice-actions.mjs';
import {COMMAND_PHRASES,TranscriptCommandMatcher} from './local-commands.mjs';
// An exact command repeated within this window is the transcript stuttering, not a second request.
const LOCAL_REPEAT_MS=1500;
// The model also hears the command and may still delegate it; for this long a matching tool call is confirmed, never applied twice.
const TOOL_ECHO_MS=8000;
// The transcript can also arrive after the tool already acted; a matching phrase this soon after a tool action is the same request.
const TOOL_LAG_MS=4000;
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
  // The last action applied, from either path, with the utterance that carried it when the transcript did.
  this.recent=null;
  this.coach=createTutorCoach({runtime,audioSink,getUserMedia:measuredMedia,continuous:true,tell,
   actionContext:()=>voiceContext(guide),onAction:(action,expected)=>{
    if(!this.active||!this.visible())return {ok:false,message:'The view changed or that action is unavailable. Please ask again.'};
    // The headset already applied this exact command from the transcript: confirm it, never apply it twice.
    if(this.recent&&this.recent.action===action&&this.recent.source==='local'&&Date.now()-this.recent.at<TOOL_ECHO_MS)return {ok:this.recent.result.ok,message:this.recent.result.message};
    if(expected!==voiceContext(guide)||!voiceIntentContext(guide).allowed.includes(action))return {ok:false,message:'The view changed or that action is unavailable. Please ask again.'};
    return this.execute(action,'tool',null);
   }});
  // Exact spoken controls act straight from the live transcript, in the time it takes to transcribe them.
  this.matcher=new TranscriptCommandMatcher({allowed:()=>voiceIntentContext(guide).allowed,onCommand:(action,utterance)=>this.applyLocal(action,utterance),
   // A new learner utterance that is not the same command ends the echo window, so a genuine second request is not mistaken for a repeat.
   onUtterance:text=>{if(this.recent&&!(COMMAND_PHRASES[this.recent.action]||[]).includes(text))this.recent=null;}});
  this.coach.onCaption(entry=>{if(entry.source)return;if(entry.role==='learner')this.matcher.push(entry.delta);else this.matcher.flush();});
  this.coach.onState(s=>{this.state=s.mode==='listening'?'listening':s.mode;this.active=['connecting','live','listening'].includes(s.mode);if(s.error)this.message=s.error;if(['idle','text'].includes(s.mode)){clearInterval(this.meterTimer);void this.meterContext?.close().catch(()=>{});this.meterContext=null;}});

 }
 execute(action,source,utterance){
  const at=Date.now();
  if(action==='stop'){setTimeout(()=>this.stop(),300);const result={ok:true,message:'Voice off.'};this.recent={action,at,result,source,utterance};return result;}
  const result=applyVoiceCommand(this.guide,action,{saveCutoff:this.guide.segmenter?.cutoff(this.guide.recordElapsed)});this.message=result.message;this.guide.notify(result.ok?'open':'error',result.message);
  this.recent={action,at,result,source,utterance};return result;
 }
 applyLocal(action,utterance){
  if(!this.active||!this.visible()||!voiceIntentContext(this.guide).allowed.includes(action))return null;
  const now=Date.now(),recent=this.recent;
  if(recent&&recent.action===action&&((recent.source==='local'&&now-recent.at<LOCAL_REPEAT_MS)||(recent.source==='tool'&&now-recent.at<TOOL_LAG_MS)))return null;
  // Guide actions run inside the transcript event; a throw here must not take the live session down with it.
  try{return this.execute(action,'local',utterance);}
  catch(e){this.message=`Could not apply ${action}: ${e?.message||e}`;this.guide.notify?.('error',this.message);return {ok:false,message:this.message};}
 }
 context(){const g=this.guide,mode=['voice','voice-help'].includes(g.mode)?g.voiceReturn:g.mode;const authoring=!g.tutorial.completion||['home','library','loading-library','create-intro','saved','author','capture','capture-paused','step-ready'].includes(mode);return {authoring,key:[g.tutorial.id,authoring?'controls':g.tutorial.revision].join('|')};}
 observe(){if(this.requested&&this.visible()&&this.state!=='connecting'&&this.context().key!==this.contextKey)return this.start();}
 async start(){
  this.stop();this.requested=true;const generation=++this.generation,g=this.guide,spec=this.context();this.contextKey=spec.key;
  this.active=true;this.state='connecting';this.message='Connecting live voice…';
  // Recording controls need no invented task instructions. Publish a bounded generic
  // app-control guide while authoring; never add it to the user's local library.
  this.authoring=spec.authoring;
  const tutorial=this.authoring?{id:'trail-app-controls-v1',revision:0,title:'Trail recording controls',setup:'Only explain app and recording controls. A task has not been opened for live coaching; do not invent task instructions.',steps:[{id:'recording-controls',title:'Record a demonstration',instruction:'Save ends a step. Record starts another step. Finish saves the tutorial. Pause and resume control the current recording.'}]}:g.tutorial;
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
 stop(message='Voice off'){this.requested=false;this.generation++;this.matcher?.reset();this.recent=null;clearTimeout(this.timer);clearInterval(this.meterTimer);void this.meterContext?.close().catch(()=>{});this.meterContext=null;this.coach.stop();this.active=false;this.state='off';this.busy=false;this.inputLevel=0;this.message=message;}
}
