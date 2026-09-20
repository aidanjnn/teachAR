import {validateLandmarks} from './workspace-assist.mjs';
// Portable, bounded tutorial data. No XR, rendering, provider or storage dependency.
import {JOINTS, tracked} from './motion-core.mjs';
import {validateNarration,trimNarration} from './narration-core.mjs';
import {validateInstructionVoice} from './instruction-voice.mjs';
import {guidanceReadiness,MAX_SAMPLE_GAP_MS} from './tutorial-follow.mjs';
export {MAX_SAMPLE_GAP_MS} from './tutorial-follow.mjs';
export const MAX_FRAMES=5400, MAX_STEPS=12, MAX_TOTAL_FRAMES=12000;
export const MAX_FILE_BYTES=48*1024*1024, MAX_PHOTO_CHARS=700000;
export const SCHEMA='trail.tutorial.prototype.v3';
const uid=()=>globalThis.crypto.randomUUID();
const finite=(v,min,max)=>typeof v==='number'&&Number.isFinite(v)&&v>=min&&v<=max;
const record=v=>v&&typeof v==='object'&&!Array.isArray(v);
const boundedText=(s,n,label)=>{if(typeof s!=='string'||s.length>n)throw Error(`${label} must be text of at most ${n} characters.`);return s;};
const id=(s,fallback)=>{if(s===undefined)return fallback();if(typeof s==='string'&&/^[a-zA-Z0-9_-]{1,100}$/.test(s))return s;throw Error('Invalid tutorial or step ID.');};
function cleanHand(joints){
  if(joints===null)return null;
  if(!Array.isArray(joints)||joints.length!==25)throw Error('Expected 25 named joints per hand.');
  return joints.map(j=>{
    if(j===null)return null;
    if(!record(j)||!Array.isArray(j.p)||j.p.length!==3||!j.p.every(v=>finite(v,-10,10))||
      !Array.isArray(j.q)||j.q.length!==4||!j.q.every(v=>finite(v,-1.001,1.001))||Math.abs(Math.hypot(...j.q)-1)>.001)
      throw Error('Invalid joint pose: bounded metre positions and unit quaternions are required.');
    if(j.radius!==undefined&&!finite(j.radius,.0001,.1))throw Error('Invalid joint radius.');
    return {p:[...j.p],q:[...j.q],...(j.radius===undefined?{}:{radius:j.radius})};
  });
}
export function prepareStep(frames,instruction='',title=''){
  if(!Array.isArray(frames)||frames.length<20||frames.length>MAX_FRAMES)throw Error('Record at least one second, and no more than three minutes per step.');
  let last=-Infinity;
  const normalized=frames.map(f=>{
    if(!record(f)||!finite(f.t,0,1e9)||f.t<=last)throw Error('Step timestamps must increase.');
    last=f.t;
    return {t:f.t-frames[0].t,left:cleanHand(f.left),right:cleanHand(f.right)};
  });
  const duration_ms=normalized.at(-1).t;
  if(duration_ms<1000||duration_ms>180000)throw Error('Record between one second and three minutes of the action.');
  const coverage=side=>normalized.filter(f=>tracked(f[side])).length/normalized.length;
  const gap=side=>{
    let last=0,max=0;
    for(const f of normalized)if(tracked(f[side])){max=Math.max(max,f.t-last);last=f.t;}
    return Math.max(max,duration_ms-last);
  };
  const quality={left_tracked_fraction:coverage('left'),right_tracked_fraction:coverage('right'),left_max_gap_ms:gap('left'),right_max_gap_ms:gap('right')};
  if(Math.max(quality.left_tracked_fraction,quality.right_tracked_fraction)<.8)throw Error('Neither hand was tracked reliably. Re-record this step.');
  return {id:uid(),title:boundedText(title,60,'Step title'),instruction:boundedText(instruction,240,'Instruction'),duration_ms,frames:normalized,quality,
    reference:null,narration:null,narration_issue:null,cues:[],reviewed:false,verification:{kind:'manual',status:'unverified'}};
}
export function newTutorial(title='Untitled tutorial'){
  return {schema:SCHEMA,id:uid(),revision:0,title:boundedText(title,120,'Title'),units:'meters',joint_names:[...JOINTS],
    alignment:'origin + heading placement; recorded metre scale preserved',calibration_span_m:null,steps:[],source:'live-capture',setup:'',completion:null,save_position:null};
}
export function jpegDimensions(dataURL){
  const bytes=atob(dataURL.split(',')[1]);
  if(bytes.charCodeAt(0)!==255||bytes.charCodeAt(1)!==216)throw Error('Reference is not JPEG data.');
  let offset=2;
  while(offset+4<=bytes.length){
    if(bytes.charCodeAt(offset++)!==255)throw Error('Invalid JPEG segment.');
    while(bytes.charCodeAt(offset)===255)offset++;
    const marker=bytes.charCodeAt(offset++);
    if(marker===217||marker===218)break;
    const length=(bytes.charCodeAt(offset)<<8)|bytes.charCodeAt(offset+1);
    if(length<2||offset+length>bytes.length)throw Error('Truncated JPEG segment.');
    if([192,193,194].includes(marker)){
      if(length<8)throw Error('Invalid JPEG dimensions.');
      const height=(bytes.charCodeAt(offset+3)<<8)|bytes.charCodeAt(offset+4),width=(bytes.charCodeAt(offset+5)<<8)|bytes.charCodeAt(offset+6);
      if(!width||!height||width>1280||height>1280)throw Error('Reference exceeds 1280 × 1280 pixels.');
      return {width,height};
    }
    offset+=length;
  }
  throw Error('Reference has no supported JPEG frame header.');
}
export function validateReference(value){
  if(value===null||value===undefined)return null;
  if(!record(value)||typeof value.image!=='string'||value.image.length>MAX_PHOTO_CHARS||
    !/^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/.test(value.image))throw Error('Reference must be a bounded embedded JPEG, never a URL.');
  // JPEG signature, not merely a user-supplied MIME declaration. Decoding is additionally checked by the viewer.
  jpegDimensions(value.image);
  if(typeof value.captured_at!=='string'||value.captured_at.length>40||!Number.isFinite(Date.parse(value.captured_at)))throw Error('Reference capture time is invalid.');
  const capture=value.capture;
  if(capture!==undefined&&(!record(capture)||capture.clock!=='browser-video'||!finite(capture.media_time_s,0,1e9)||!finite(capture.request_age_ms,0,2500)))throw Error('Invalid reference capture metadata.');
  return {image:value.image,captured_at:value.captured_at,source:'local-camera',verification:'reference only; not checked',...(capture?{capture:{...capture}}:{})};
}
export function validateCues(cues=[]){
  if(!Array.isArray(cues)||cues.length>1)throw Error('At most one guide line per recording is supported.');
  return cues.map(c=>{
    if(!record(c)||c.kind!=='fold-line'||c.source!=='expert-marked'||!Array.isArray(c.points)||c.points.length!==2||
      c.points.some(p=>!Array.isArray(p)||p.length!==3||!p.every(v=>finite(v,-2,2))))throw Error('Invalid expert guide line.');
    const [a,b]=c.points,length=Math.hypot(...a.map((v,i)=>v-b[i]));
    if(length<.05||length>1.2||Math.abs(a[1]-b[1])>.05)throw Error('Fold line must be 5–120 cm long on the same tabletop surface.');
    return {kind:'fold-line',source:'expert-marked',points:c.points.map(p=>[...p])};
  });
}
export function validateSavePosition(value){
  if(value==null)return null;
  if(!record(value)||value.space!=='workspace'||!['left','right'].every(side=>Array.isArray(value[side])&&value[side].length===3&&value[side].every(v=>finite(v,-10,10))))throw Error('Invalid tutorial save position.');
  return {space:'workspace',left:[...value.left],right:[...value.right]};
}
export function validateTutorial(input){
  if(!record(input)||!['trail.tutorial.prototype.v1','trail.tutorial.prototype.v2',SCHEMA].includes(input.schema))throw Error('Unsupported tutorial format. Import a TeachAR tutorial JSON export.');
  if(input.units!=='meters'||!Array.isArray(input.joint_names)||input.joint_names.length!==25||input.joint_names.some((n,i)=>n!==JOINTS[i]))throw Error('Tutorial units or joint ordering are incompatible.');
  if(!Array.isArray(input.steps)||input.steps.length>MAX_STEPS)throw Error('Tutorial must contain at most twelve steps.');
  if(input.steps.length&& !finite(input.calibration_span_m,.2,1.2))throw Error('A recorded tutorial needs valid workspace spacing.');
  let total=0;const ids=new Set();
  const steps=input.steps.map(s=>{
    if(!record(s))throw Error('Invalid tutorial step.');
    total+=s.frames?.length||0;if(total>MAX_TOTAL_FRAMES)throw Error('Tutorial exceeds total motion sample limit.');
    const step=prepareStep(s.frames,s.instruction,s.title??'');
    step.id=id(s.id,uid);if(ids.has(step.id))throw Error('Duplicate step IDs.');ids.add(step.id);
    // Derived duration/quality and verification claims are never trusted on import.
    if(s.guide_hands!==undefined&&!['recorded','left','right','both'].includes(s.guide_hands))throw Error('Invalid guiding hands.');
    step.guide_hands=!s.guide_hands||s.guide_hands==='recorded'?'both':s.guide_hands;
    step.reference=validateReference(s.reference);step.cues=validateCues(s.cues);step.reviewed=s.reviewed===true&&input.schema!=='trail.tutorial.prototype.v1'&&step.guide_hands!=='recorded';
    if(s.acceptance!=null&&!['hold','finish'].includes(s.acceptance))throw Error('Invalid step acceptance.');step.acceptance=s.acceptance||null;
    step.narration=validateNarration(s.narration,step.duration_ms);step.narration_issue=s.narration_issue?boundedText(s.narration_issue,240,'Narration issue'):null;
    step.instruction_voice=validateInstructionVoice(s.instruction_voice,step.instruction);
    return step;
  });
  const result={...newTutorial(input.title),id:id(input.id,uid),revision:Number.isSafeInteger(input.revision)&&input.revision>=0?input.revision:0,
    calibration_span_m:input.calibration_span_m??null,save_position:validateSavePosition(input.save_position),steps,source:input.source==='synthetic-fixture'?'synthetic-fixture':'live-capture',setup:boundedText(input.setup??'',2000,'Starting layout')};
  if(input.workspace_reference){const reference=validateReference(input.workspace_reference);result.workspace_reference={...reference,...validateLandmarks(input.workspace_reference)};}
  const completed=input.completion;
  if(input.schema===SCHEMA&&record(completed)&&completed.revision===result.revision&&typeof completed.finished_at==='string'&&completed.finished_at.length<=40&&Number.isFinite(Date.parse(completed.finished_at))&&authoringReadiness(result).ready)
    result.completion={revision:result.revision,finished_at:completed.finished_at,kind:steps.some(s=>!s.reviewed)?'expert-accepted; physical result unverified':'expert-reviewed; physical result unverified'};
  return result;
}
export function parseTutorialJSON(text){
  if(typeof text!=='string'||new TextEncoder().encode(text).byteLength>MAX_FILE_BYTES)throw Error('Tutorial file exceeds the 48 MB limit.');
  return validateTutorial(JSON.parse(text));
}
export function trimStep(step,startMs,endMs){
  if(!finite(startMs,0,step.duration_ms)||!finite(endMs,0,step.duration_ms)||endMs<=startMs)throw Error('Choose a valid trim range.');
  const result=prepareStep(step.frames.filter(f=>f.t>=startMs&&f.t<=endMs),step.instruction,step.title||'');
  // A changed endpoint invalidates its photo; every trim invalidates review.
  const first=step.frames.find(f=>f.t>=startMs),last=step.frames.findLast(f=>f.t<=endMs);
  const narration=trimNarration(step.narration,first.t,last.t);
  return {...result,id:step.id,guide_hands:step.guide_hands||'recorded',narration:validateNarration(narration,result.duration_ms),narration_issue:step.narration_issue||null,cues:validateCues(step.cues),reference:endMs===step.duration_ms?step.reference:null};
}
export function authoringReadiness(tutorial){
  if(!tutorial.steps.length)return {ready:false,message:'Record or import at least one step.'};
  if(!tutorial.setup?.trim())return {ready:false,message:'Describe the starting layout before finishing this tutorial.'};
  const invalid=tutorial.steps.findIndex(s=>!s.instruction.trim()||s.narration_issue);
  if(invalid>=0)return {ready:false,message:`Repair the instruction or narration for step ${invalid+1}.`};
  for(const [i,step] of tutorial.steps.entries()){
    const guidance=guidanceReadiness(step);
    if(!guidance.ready)return {ready:false,message:`Step ${i+1}: ${guidance.message}`};
  }
  const index=tutorial.steps.findIndex(s=>!s.reviewed&&!['hold','finish'].includes(s.acceptance));
  return index>=0?{ready:false,message:`Review step ${index+1} before finishing.`}:{ready:true,message:'All steps accepted. Finish tutorial to make it ready for learning.'};
}
export function finishTutorial(input){
  const next=validateTutorial(input),ready=authoringReadiness(next);if(!ready.ready)throw Error(ready.message);
  next.revision++;next.completion={revision:next.revision,finished_at:new Date().toISOString(),kind:next.steps.some(s=>!s.reviewed)?'expert-accepted; physical result unverified':'expert-reviewed; physical result unverified'};return next;
}
export function learningReadiness(tutorial){
  const ready=authoringReadiness(tutorial);if(!ready.ready)return ready;
  return tutorial.completion?.revision===tutorial.revision?{ready:true,message:'Finished tutorial ready. Physical correctness remains unverified.'}:{ready:false,message:'All steps accepted. Choose Finish tutorial before learning.'};
}
// Playback is illustrative. It never judges movement or automatically completes a step.
export class TutorialPlayer{
  constructor(steps){this.steps=steps;this.index=0;this.time=0;this.paused=false;this.confirmations=[];this.finished=false;this.rate=1;}
  setRate(rate){if(![.5,.75,1].includes(rate))throw Error('Choose 0.5, 0.75 or 1× playback.');this.rate=rate;}
  get step(){return this.steps[this.index];}
  tick(dt){
    if(!this.step)return null;
    if(!this.paused&&Number.isFinite(dt))this.time=Math.min(this.step.duration_ms,this.time+Math.max(0,Math.min(100,dt))*this.rate);
    if(this.time>=this.step.duration_ms)this.paused=true;
    const sample=this.step.frames.findLast(f=>f.t<=this.time)||this.step.frames[0];
    return this.time-sample.t>MAX_SAMPLE_GAP_MS?{t:this.time,left:null,right:null}:sample;
  }
  replay(){this.time=0;this.paused=false;this.audioPaused=false;this.finished=false;this.playbackRevision=(this.playbackRevision||0)+1;}
  previous(){this.index=Math.max(0,this.index-1);this.replay();}
  confirm(){
    if(!this.step||this.finished)return this.finished;
    this.confirmations.push({step:this.index,step_id:this.step.id,kind:'learner-self-confirmed'});
    if(this.index===this.steps.length-1){this.finished=true;return true;}
    this.index++;this.replay();return false;
  }
}
