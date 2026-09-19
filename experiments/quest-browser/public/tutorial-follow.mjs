// Local, ordered palm-position guidance. No object recognition or physical-result verdict.
import {palm} from './tutorial-assist.mjs';
import {distance} from './motion-core.mjs';
export function requiredHands(step){
  const choice=step.guide_hands||'recorded';
  if(choice==='left'||choice==='right')return [choice];
  if(choice==='both')return ['left','right'];
  return ['left','right'].filter(side=>step.quality[side+'_tracked_fraction']>=.8);
}
export class TutorialFollower {
  constructor(step){
    this.step=step;this.hands=requiredHands(step);this.gates=[];this.invalid=false;
    let prior=null;
    for(const f of step.frames){
      if(!this.hands.length||this.hands.some(side=>!palm(f[side]))||(prior&&f.t-prior.t>200)){this.invalid=true;break;}
      const last=this.gates.at(-1);
      if(!last||this.hands.some(side=>distance(palm(f[side]),palm(last[side]))>=.09))this.gates.push(f);
      prior=f;
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
