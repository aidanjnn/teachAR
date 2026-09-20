// Exact spoken controls act locally from the live transcript: no model turn, no tool call, no backend hop.
// Only the phrases below count, only when the current screen allows the action, and only the headset decides.
// Anything phrased differently, or anything this module declines, still reaches the delegated trail_action path.
// Single ordinary words ("again", "back", "next") are not phrases here: a one-word reply to the coach must never act.
export const COMMAND_PHRASES=Object.freeze({
 save:['save it','save step','save the step','save this step','save that','save the recording'],
 previous:['go back','previous step','go to the previous step','one step back','step back'],
 next:['next step','go to the next step','go forward','move on'],
 pause:['pause','pause it','pause recording','pause the recording','pause guidance'],
 resume:['resume','resume recording','carry on','keep going','unpause'],
 replay:['replay','replay it','show me again','show that again','one more time',"i didn't get that",'i did not get that','i missed that'],
 finish:['finish tutorial','finish the tutorial','finish recording','done recording',"i'm done recording",'i am done recording'],
 record:['start recording','start the recording','begin recording','new step'],
 home:['go home','back home','back to home'],
 help:['help','voice help','what can i say'],
 stop:['stop listening','stop voice','voice off','turn voice off'],
});
/** Pause after the last word before an utterance is judged; a sentence mark judges it at once. */
export const QUIET_MS=600;
/** A fragment arriving this soon after an unmatched fragment belongs to the same sentence and is judged with it. */
export const TURN_GAP_MS=2000;
export const MAX_UTTERANCE_CHARS=80;
// "now", "please" and the like are stripped, so "save it now" is matched as "save it".
const LEADERS=/^(?:(?:hey|ok|okay|so|um|uh|please|trail|coach|can you|could you|would you|let's|lets)\s+)+/;
const TRAILERS=/(?:\s+(?:please|now|thanks|thank you|coach|trail))+$/;

/** Lowercase, punctuation-free, without polite or filler edges: "Okay coach, go back please!" becomes "go back". */
export function normalizeUtterance(text){
 let t=String(text||'').toLowerCase().replace(/[’`´]/g,"'").replace(/[^a-z0-9' ]+/g,' ').replace(/\s+/g,' ').trim();
 for(let i=0;i<3;i++){const next=t.replace(LEADERS,'').replace(TRAILERS,'').trim();if(next===t)break;t=next;}
 return t;
}
/** The action for an exact command phrase that the current screen allows, or null. A question never matches, even a one-word one. */
export function matchCommand(text,allowed=[]){
 const raw=String(text||'');
 if(/\?\s*$/.test(raw))return null;
 const utterance=normalizeUtterance(raw);
 if(!utterance||utterance.length>MAX_UTTERANCE_CHARS)return null;
 for(const action of allowed){const phrases=COMMAND_PHRASES[action];if(phrases&&phrases.includes(utterance))return {action,utterance};}
 return null;
}

/**
 * Buffers learner transcript deltas into one utterance and judges it when the sentence ends or the learner pauses.
 * Fragments are not turns: a fragment that follows an unmatched one within the turn gap is judged together with it,
 * so the tail of a split question cannot act on its own. A speaker change flushes the buffer instead of dropping it,
 * a very long turn stays quiet until the learner pauses, and the allowed list is read at evaluation time.
 */
export class TranscriptCommandMatcher{
 constructor({allowed=()=>[],onCommand=()=>{},onUtterance=()=>{},quietMs=QUIET_MS,turnGapMs=TURN_GAP_MS,now=()=>Date.now(),schedule=(fn,ms)=>setTimeout(fn,ms),cancel=id=>clearTimeout(id)}={}){
  Object.assign(this,{allowed,onCommand,onUtterance,quietMs,turnGapMs,now,schedule,cancel});
  this.buffer='';this.timer=null;this.suppressed=false;this.previous=null;
 }
 push(delta){
  const text=String(delta||'');if(!text)return;
  this.cancel(this.timer);this.timer=null;
  this.buffer+=text;
  if(this.buffer.length>MAX_UTTERANCE_CHARS*3){this.buffer='';this.suppressed=true;}
  if(!this.suppressed&&/[.!?]\s*$/.test(this.buffer))this.evaluate();
  else this.timer=this.schedule(()=>{this.timer=null;this.evaluate();},this.quietMs);
 }
 /** The other speaker started: judge what the learner had said instead of losing it. */
 flush(){if(this.buffer||this.timer)this.evaluate();}
 evaluate(){
  const text=this.buffer,now=this.now();
  this.buffer='';this.cancel(this.timer);this.timer=null;
  if(this.suppressed){this.suppressed=false;this.previous={text:'',at:now};return null;}
  if(!normalizeUtterance(text)){return null;}
  // Only an unmatched fragment that was left open (no sentence mark) continues into the next one; a finished question does not.
  const continues=!!(this.previous&&this.previous.text&&this.previous.open&&now-this.previous.at<this.turnGapMs);
  const candidate=continues?`${this.previous.text} ${text}`:text;
  this.onUtterance(normalizeUtterance(candidate));
  const match=matchCommand(candidate,this.allowed());
  this.previous={text:match?'':candidate,open:!/[.!?]\s*$/.test(candidate),at:now};
  if(match)this.onCommand(match.action,match.utterance);
  return match;
 }
 reset(){this.buffer='';this.cancel(this.timer);this.timer=null;this.suppressed=false;this.previous=null;}
}
