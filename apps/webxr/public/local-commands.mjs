// Exact spoken controls act locally from the live transcript: no model turn, no tool call, no backend hop.
// Only the phrases below count, only when the current screen allows the action, and only the headset decides.
// Anything phrased differently stays with the delegated trail_action path, so nothing here is a requirement.
export const COMMAND_PHRASES=Object.freeze({
 save:['save','save it','save it now','save now','save step','save the step','save this step','save that'],
 previous:['back','go back','previous','previous step','go to the previous step','one step back'],
 next:['next','next step','go to the next step','go forward','move on'],
 pause:['pause','pause it','pause recording','pause the recording','pause guidance'],
 resume:['resume','resume recording','continue','carry on','keep going','unpause'],
 replay:['replay','replay it','show me again','show that again','again','one more time',"i didn't get that",'i did not get that','i missed that'],
 finish:['finish','finish tutorial','finish the tutorial','finish recording','done recording',"i'm done recording",'i am done recording'],
 record:['record','start recording','start the recording','begin recording','new step'],
 home:['home','go home','back home','back to home'],
 help:['help','what can i say','voice help'],
 stop:['stop listening','stop voice','voice off','turn voice off'],
});
export const QUIET_MS=600,MAX_UTTERANCE_CHARS=80;
const LEADERS=/^(?:(?:hey|ok|okay|so|um|uh|please|trail|coach|can you|could you|would you|let's|lets)\s+)+/;
const TRAILERS=/(?:\s+(?:please|now|thanks|thank you|coach|trail))+$/;

/** Lowercase, punctuation-free, without polite or filler edges: "Okay coach, go back please!" becomes "go back". */
export function normalizeUtterance(text){
 let t=String(text||'').toLowerCase().replace(/[’`´]/g,"'").replace(/[^a-z0-9' ]+/g,' ').replace(/\s+/g,' ').trim();
 for(let i=0;i<3;i++){const next=t.replace(LEADERS,'').replace(TRAILERS,'').trim();if(next===t)break;t=next;}
 return t;
}
/** The action for an exact command phrase that the current screen allows, or null. A question that merely contains a command word never matches. */
export function matchCommand(text,allowed=[]){
 const utterance=normalizeUtterance(text);
 if(!utterance||utterance.length>MAX_UTTERANCE_CHARS)return null;
 for(const action of allowed){const phrases=COMMAND_PHRASES[action];if(phrases&&phrases.includes(utterance))return {action,utterance};}
 return null;
}

/**
 * Buffers learner transcript deltas into one utterance and evaluates it when the sentence ends or the learner pauses.
 * Deltas from the coach, a stop or a screen change reset the buffer. The caller decides what `allowed` means right now.
 */
export class TranscriptCommandMatcher{
 constructor({allowed=()=>[],onCommand=()=>{},quietMs=QUIET_MS,schedule=(fn,ms)=>setTimeout(fn,ms),cancel=id=>clearTimeout(id)}={}){
  Object.assign(this,{allowed,onCommand,quietMs,schedule,cancel});this.buffer='';this.timer=null;
 }
 push(delta){
  const text=String(delta||'');if(!text)return;
  this.buffer+=text;
  if(this.buffer.length>MAX_UTTERANCE_CHARS*3){this.reset();return;}
  this.cancel(this.timer);
  if(/[.!?]\s*$/.test(this.buffer))this.evaluate();
  else this.timer=this.schedule(()=>{this.timer=null;this.evaluate();},this.quietMs);
 }
 evaluate(){
  const text=this.buffer;this.buffer='';this.cancel(this.timer);this.timer=null;
  const match=matchCommand(text,this.allowed());
  if(match)this.onCommand(match.action,match.utterance);
  return match;
 }
 reset(){this.buffer='';this.cancel(this.timer);this.timer=null;}
}
