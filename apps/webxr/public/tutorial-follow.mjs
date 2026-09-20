// Local, ordered palm-position guidance. No object recognition or physical-result verdict.
import {palm} from './tutorial-assist.mjs';
import {distance,segmentDistance} from './motion-core.mjs';
export const MAX_SAMPLE_GAP_MS=200;
// Fraction of each recorded gate displacement that must be observed live.
// This is a prototype tuning value, not measured headset accuracy.
const MIN_GATE_MOVEMENT_FRACTION=.6;
export function requiredHands(step){
  const choice=step.guide_hands;
  if(choice==='left'||choice==='right')return [choice];
  if(choice==='both')return ['left','right'];
  // Missing/legacy automatic selection requires author review. Coverage must
  // never remove the hand performing the demonstrated movement.
  return [];
}
export function guidanceReadiness(step){
  const hands=requiredHands(step);
  if(!hands.length)return {ready:false,message:'Choose required hands (Left, Right or Both), then review this step.'};
  if(!step.frames?.length)return {ready:false,message:'Re-record this step: no motion samples are available.'};
  let prior=null;
  for(const frame of step.frames){
    if(!Number.isFinite(frame.t)||(prior!==null&&(frame.t<=prior||frame.t-prior>MAX_SAMPLE_GAP_MS)))
      return {ready:false,message:`Recording timing gap near ${(frame.t/1000).toFixed(2)} s. Trim the gap or re-record this step.`};
    for(const side of hands)if(!palm(frame[side]))
      return {ready:false,message:`Required ${side} hand is missing at ${(frame.t/1000).toFixed(2)} s. Trim the gap or re-record with that hand visible.`};
    prior=frame.t;
  }
  return {ready:true,message:'Required hands have continuous recorded palm tracking.'};
}
export class TutorialFollower {
  constructor(step,options={}){
    this.relaxed=!!options.relaxed;
    this.step=step;this.hands=requiredHands(step);this.gates=[];this.invalid=!guidanceReadiness(step).ready;
    for(const f of this.invalid?[]:step.frames){
      const last=this.gates.at(-1);
      if(!last||this.hands.some(side=>distance(palm(f[side]),palm(last[side]))>=(this.relaxed?.18:.09)))this.gates.push(f);
    }
    if(!this.invalid&&this.gates.at(-1)!==step.frames.at(-1))this.gates.push(step.frames.at(-1));
    // Coarse distance sampling must retain short turns and closed excursions.
    // Refine only segments whose omitted palms leave the straight gate path.
    this.extents={};
    if(this.relaxed&&!this.invalid){
      const indices=new Map(step.frames.map((f,i)=>[f,i]));
      const kept=new Set(this.gates.map(f=>indices.get(f))),ranges=[];
      const initial=[...kept];for(let i=1;i<initial.length;i++)ranges.push([initial[i-1],initial[i]]);
      while(ranges.length){
        const [a,b]=ranges.pop();let peak=-1,error=.04;
        for(let i=a+1;i<b;i++)for(const side of this.hands){
          const deviation=segmentDistance(palm(step.frames[i][side]),palm(step.frames[a][side]),palm(step.frames[b][side]));
          if(deviation>error){peak=i;error=deviation;}
        }
        if(peak>=0){kept.add(peak);ranges.push([a,peak],[peak,b]);}
      }
      this.gates=[...kept].sort((a,b)=>a-b).map(i=>step.frames[i]);
      for(const side of this.hands)this.extents[side]=Math.max(...step.frames.map(f=>distance(palm(f[side]),palm(step.frames[0][side]))));
    }
    this.startPalms=null;this.excursion={};
    this.index=0;this.dwell=0;this.last=null;this.started=false;this.done=false;this.state='waiting';
    this.lastPalms=null;this.movement={};
  }
  clearEvidence(){this.dwell=0;this.lastPalms=null;this.movement={};}
  pause(){this.clearEvidence();this.last=null;if(!this.done)this.state='waiting';}
  get radius(){return this.relaxed?(this.started?.14:.18):(this.started?.10:.12);}
  get target(){return this.gates[this.index]||this.step.frames[0];}
  update(hands,time){
    if(!Number.isFinite(time)||(this.last!==null&&time<=this.last)){this.clearEvidence();this.state='tracking';return this.state;}
    const gap=this.last===null?0:time-this.last;this.last=time;
    if(gap>MAX_SAMPLE_GAP_MS)this.clearEvidence();
    const dt=gap>MAX_SAMPLE_GAP_MS?0:Math.min(100,gap);
    if(this.invalid){this.state='reference-gap';return this.state;}
    if(this.hands.some(side=>!palm(hands?.[side]))){this.clearEvidence();this.state='tracking';return this.state;}
    if(this.done){this.state='checkpoint';return this.state;}
    const radius=this.radius,points=Object.fromEntries(this.hands.map(side=>[side,palm(hands[side])]));
    let moved=true;
    if(this.started&&this.index>0)for(const side of this.hands){
      const previous=palm(this.gates[this.index-1][side]),target=palm(this.target[side]);
      const delta=target.map((v,i)=>v-previous[i]),length2=delta.reduce((sum,v)=>sum+v*v,0);
      // Static required hands still need proximity, but no invented movement.
      if(length2<=1e-12)continue;
      if(this.lastPalms){
        const progress=delta.reduce((sum,v,i)=>sum+v*(points[side][i]-this.lastPalms[side][i]),0)/length2;
        // Net directional excursion, not path length: small back-and-forth
        // jitter cannot accumulate credit. A retreat allows a fresh approach.
        this.movement[side]=Math.max(0,(this.movement[side]||0)+progress);
      }
      if((this.movement[side]||0)<MIN_GATE_MOVEMENT_FRACTION)moved=false;
    }
    this.lastPalms=points;
    let near=moved&&this.hands.every(side=>{
      const live=palm(hands[side]),target=palm(this.target[side]);
      if(distance(live,target)>radius)return false;
      // Broad regions must not let a stationary hand skip forward through overlapping gates.
      if(this.relaxed&&this.started&&this.index>0){
        const previous=palm(this.gates[this.index-1][side]);
        const delta=target.map((v,i)=>v-previous[i]),length2=delta.reduce((n,v)=>n+v*v,0);
        if(length2>.0004&&delta.reduce((n,v,i)=>n+v*(live[i]-previous[i]),0)/length2<.6)return false;
      }
      return true;
    });
    const final=this.index===this.gates.length-1;
    if(this.relaxed&&this.startPalms){
      for(const side of this.hands){
        this.excursion[side]=Math.max(this.excursion[side]||0,distance(palm(hands[side]),this.startPalms[side]));
        const extent=this.extents[side];
        if(final&&extent>=.04&&this.excursion[side]<Math.min(.06,extent*.4))near=false;
      }
    }
    this.dwell=near?this.dwell+dt:0;
    this.state=!this.started?'waiting':near?'following':'waiting';
    if(this.dwell>=(!this.started?600:final?(this.relaxed?650:500):this.relaxed?80:220)){
      if(!this.started)this.startPalms=Object.fromEntries(this.hands.map(side=>[side,[...palm(hands[side])]]));
      this.dwell=0;this.movement={};this.started=true;
      if(final){this.done=true;this.state='checkpoint';}else {this.index++;this.state='following';}
    }
    return this.state;
  }
}

// Movement-only orchestration. No physical-result confirmation is generated here.
export class TutorialPractice {
  constructor(step){this.follower=new TutorialFollower(step,{relaxed:true});this.phase='preview';this.elapsed=0;this.last=null;this.advance=false;}
  pause(){this.last=null;this.follower.pause();}
  ready(){this.phase='ready';this.elapsed=0;this.last=null;}
  update(hands,time,previewFinished=false){
    const gap=this.last===null?0:time-this.last;this.last=time;
    const dt=Number.isFinite(gap)&&gap>0&&gap<=200?Math.min(gap,100):0;
    if(this.phase==='preview'){if(previewFinished)this.ready();return;}
    if(this.phase==='transition'){
      if(!dt||this.follower.hands.some(side=>!palm(hands?.[side]))){this.elapsed=0;return;}
      this.elapsed+=dt;if(this.elapsed>=1200){this.advance=true;this.phase='complete';}return;
    }
    if(this.phase==='complete')return;
    this.follower.update(hands,time);
    if(this.follower.started)this.phase='practice';
    if(this.follower.done){this.phase='transition';this.elapsed=0;}
  }
}
