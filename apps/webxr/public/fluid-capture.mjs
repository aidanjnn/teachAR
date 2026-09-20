import {palm} from './tutorial-assist.mjs';
import {distance} from './motion-core.mjs';
// A deliberate still hold accepts a segment, never a physical-result verdict.
export class HoldSegmenter {
 constructor(){this.reset();}
 reset(required=null){this.sides=required==='both'?['left','right']:required?[required]:null;this.origin=null;this.anchor=null;this.since=null;this.last=null;this.armed=false;this.progress=0;this.elapsed=0;}
 interrupt(){this.anchor=null;this.since=null;this.progress=0;this.last=null;}
 update(hands,time){
  if(!Number.isFinite(time))return false;
  if(!this.sides)this.sides=['left','right'].filter(s=>palm(hands?.[s]));
  if(!this.sides.length){this.sides=null;return false;}
  const points=this.sides.map(s=>palm(hands?.[s]));
  if(points.some(p=>!p)){this.interrupt();return false;}
  const gap=this.last===null?0:time-this.last;
  if(gap<0||gap>200)this.interrupt();
  this.last=time;this.origin??=points;this.elapsed+=gap>=0&&gap<=200?gap:0;
  if(points.some((p,i)=>distance(p,this.origin[i])>.08))this.armed=true;
  if(!this.armed||this.elapsed<1200)return false;
  if(!this.anchor||points.some((p,i)=>distance(p,this.anchor[i])>.02)){this.anchor=points;this.since=time;this.progress=0;}
  this.progress=Math.min(1,(time-this.since)/1400);
  return this.progress===1;
 }
}
export function filterLibrary(items,query='',filter='all'){
 const needle=query.trim().toLocaleLowerCase();return (items||[]).filter(t=>(filter==='all'||(filter==='ready'?!!t.completion:!t.completion))&&`${t.title} ${t.setup||''}`.toLocaleLowerCase().includes(needle));
}
