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
  constructor(step,options={}){
    this.relaxed=!!options.relaxed;
    this.step=step;this.hands=requiredHands(step);this.gates=[];this.invalid=false;
    let prior=null;
    for(const f of step.frames){
      if(!this.hands.length||this.hands.some(side=>!palm(f[side]))||(prior&&f.t-prior.t>200)){this.invalid=true;break;}
      const last=this.gates.at(-1);
      if(!last||this.hands.some(side=>distance(palm(f[side]),palm(last[side]))>=(this.relaxed?.18:.09)))this.gates.push(f);
      prior=f;
    }
    if(!this.invalid&&this.gates.at(-1)!==step.frames.at(-1))this.gates.push(step.frames.at(-1));
    this.startPalms=null;this.excursion={};
    this.index=0;this.dwell=0;this.last=null;this.started=false;this.done=false;this.state='waiting';
  }
  pause(){this.dwell=0;this.last=null;if(!this.done)this.state='waiting';}
  get radius(){return this.relaxed?(this.started?.14:.18):(this.started?.10:.12);}
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
    let near=this.hands.every(side=>{
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
        const extent=Math.max(...this.gates.map(g=>distance(palm(g[side]),palm(this.gates[0][side]))));
        if(final&&extent>=.04&&this.excursion[side]<Math.min(.06,extent*.4))near=false;
      }
    }
    this.dwell=near?this.dwell+dt:0;
    this.state=!this.started?'waiting':near?'following':'waiting';
    if(this.dwell>=(!this.started?600:final?(this.relaxed?650:500):this.relaxed?80:220)){
      if(!this.started)this.startPalms=Object.fromEntries(this.hands.map(side=>[side,[...palm(hands[side])]]));
      this.dwell=0;this.started=true;
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
