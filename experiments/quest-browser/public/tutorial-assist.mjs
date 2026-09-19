// Local geometric guidance only: neither cloth state nor grasp correctness is measured.
import {distance,finite3} from './motion-core.mjs';
export function palm(joints){
  const points=[0,6,11,16,21].map(i=>joints?.[i]?.p);
  return points.every(finite3)?[0,1,2].map(axis=>points.reduce((s,p)=>s+p[axis],0)/points.length):null;
}
export class PalmAlignment {
  constructor(radius=.12){this.radius=radius;this.hysteresis=.03;this.holdMs=300;this.reset();}
  reset(){this.last=null;this.sides={};}
  update(live,target,time){
    if(!Number.isFinite(time)) {this.reset();return {left:{state:'unknown'},right:{state:'unknown'},matched:false};}
    if(this.last!==null&&(time-this.last>200||time<this.last))this.reset();
    this.last=time;const result={};
    for(const side of ['left','right']){
      const a=palm(live?.[side]),b=palm(target?.[side]);
      if(!a||!b){delete this.sides[side];result[side]={state:'unknown',target:b};continue;}
      const d=distance(a,b),old=this.sides[side];
      const inside=d<=this.radius+(old?.state==='inside'?this.hysteresis:0);
      const since=inside?(old?.since??time):null;
      const state=!inside?'outside':time-since>=this.holdMs?'inside':'settling';
      this.sides[side]={state,since};result[side]={state,error_m:d,target:b};
    }
    return {...result,matched:result.left.state==='inside'&&result.right.state==='inside'};
  }
}
// Deliberate gesture: action -> endpoint hold -> return to the configured save zone.
// Unsuitable for actions whose normal movement already follows that pattern.
export class CaptureEndpoint {
  constructor(){this.reset();}
  reset(home=null){this.home=home?.map(p=>[...p])||null;this.armed=false;this.last=null;this.interrupt();}
  interrupt(){this.still=null;this.candidate=null;this.returnSince=null;}
  update(hands,time){
    const points=['left','right'].map(side=>palm(hands?.[side]));
    if(!points.every(Boolean)||!Number.isFinite(time)){this.interrupt();this.last=time;return null;}
    if(this.last!==null&&(time-this.last>200||time<this.last))this.interrupt();
    this.last=time;
    if(!this.home){this.home=points;return null;}
    const homeDistance=Math.max(...points.map((p,i)=>distance(p,this.home[i])));
    if(homeDistance>.15)this.armed=true;
    if(!this.armed)return null;
    const atHome=homeDistance<.08;
    if(!atHome&&homeDistance>.10){
      if(!this.still||points.some((p,i)=>distance(p,this.still.points[i])>.02))this.still={points,since:time};
      if(time-this.still.since>=800&&time>=1200)this.candidate=time;
    }else this.still=null;
    if(this.candidate!==null&&time-this.candidate>6000)this.candidate=null;
    if(atHome&&this.candidate!==null){
      this.returnSince??=time;
      if(time-this.returnSince>=800)return this.candidate;
    }else this.returnSince=null;
    return null;
  }
  cutoff(time){return this.candidate!==null&&time-this.candidate<=6000?this.candidate:null;}
}

// Stable two-palm capture. No countdown elapsed time or hidden samples count as a hold.
export class SavePositionCapture {
  constructor(){this.reset();}
  reset(){this.anchor=null;this.since=null;this.last=null;}
  update(hands,time){
    const points=['left','right'].map(side=>palm(hands?.[side]));
    if(!Number.isFinite(time)||!points.every(Boolean)||(this.last!==null&&(time<=this.last||time-this.last>200))){this.reset();return null;}
    this.last=time;
    if(!this.anchor||points.some((p,i)=>distance(p,this.anchor[i])>.025)){this.anchor=points;this.since=time;}
    return time-this.since>=800?this.anchor.map(p=>[...p]):null;
  }
}
