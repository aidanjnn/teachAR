// Local, ordered palm-position guidance. No object recognition or physical-result verdict.
import {palm} from './tutorial-assist.mjs';
import {distance} from './motion-core.mjs';
export const MAX_SAMPLE_GAP_MS=200;
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
  constructor(step){
    this.step=step;this.hands=requiredHands(step);this.gates=[];this.invalid=!guidanceReadiness(step).ready;
    for(const f of this.invalid?[]:step.frames){
      const last=this.gates.at(-1);
      if(!last||this.hands.some(side=>distance(palm(f[side]),palm(last[side]))>=.09))this.gates.push(f);
    }
    if(!this.invalid&&this.gates.at(-1)!==step.frames.at(-1))this.gates.push(step.frames.at(-1));
    this.index=0;this.dwell=0;this.last=null;this.started=false;this.done=false;this.state='waiting';
  }
  pause(){this.dwell=0;this.last=null;if(!this.done)this.state='waiting';}
  get radius(){return this.started?.10:.12;}
  get target(){return this.gates[this.index]||this.step.frames[0];}
  update(hands,time){
    if(!Number.isFinite(time)||(this.last!==null&&time<=this.last)){this.dwell=0;this.state='tracking';return this.state;}
    const gap=this.last===null?0:time-this.last;this.last=time;
    if(gap>200)this.dwell=0;
    const dt=gap>200?0:Math.min(100,gap);
    if(this.invalid){this.state='reference-gap';return this.state;}
    if(this.hands.some(side=>!palm(hands?.[side]))){this.dwell=0;this.state='tracking';return this.state;}
    if(this.done){this.state='checkpoint';return this.state;}
    const radius=this.radius;
    const near=this.hands.every(side=>distance(palm(hands[side]),palm(this.target[side]))<=radius);
    this.dwell=near?this.dwell+dt:0;
    this.state=!this.started?'waiting':near?'following':'waiting';
    const final=this.index===this.gates.length-1;
    if(this.dwell>=(!this.started?600:final?500:220)){
      this.dwell=0;this.started=true;
      if(final){this.done=true;this.state='checkpoint';}else {this.index++;this.state='following';}
    }
    return this.state;
  }
}
