import {distance,finite3} from './motion-core.mjs';
import {palm} from './tutorial-assist.mjs';
const median=values=>{const a=[...values].sort((a,b)=>a-b);return a[Math.floor(a.length/2)];};
// Robust hold in XR meters. Time with missing tracking never counts toward a mark.
export class LandmarkHold {
 constructor(){this.reset();}
 reset(){this.points=[];this.last=null;this.progress=0;}
 update(point,time){
  if(!finite3(point)||!Number.isFinite(time)||(this.last!==null&&(time<=this.last||time-this.last>200))){this.reset();return null;}
  this.last=time;
  if(this.points.length&&distance(point,this.points[0].p)>.025){this.points=[];this.progress=0;}
  this.points.push({p:[...point],t:time});
  this.progress=Math.min(1,(time-this.points[0].t)/1500);
  if(this.progress<1||this.points.length<12)return null;
  const center=[0,1,2].map(i=>median(this.points.map(s=>s.p[i]))),inliers=this.points.filter(s=>distance(s.p,center)<.015);
  if(inliers.length<this.points.length*.8){this.reset();return null;}
  return [0,1,2].map(i=>median(inliers.map(s=>s.p[i])));
 }
}
// Compare both palms against the SAME recorded frame, independent of playback time.
// This is coarse path proximity, never task completion or grip verification.
const pathCache=new WeakMap();
export function nearestPracticePose(step,hands,radius=.12){
 const sides=step.guide_hands==='left'?['left']:step.guide_hands==='right'?['right']:['left','right'];
 const live=sides.map(s=>palm(hands?.[s]));if(live.some(p=>!p))return {state:'unknown',target:null};
 let path=pathCache.get(step.frames);if(!path){path=step.frames.map(f=>({f,left:palm(f.left),right:palm(f.right)}));pathCache.set(step.frames,path);}
 let best=Infinity,target=null;
 for(const item of path){const f=item.f,points=sides.map(s=>item[s]);if(points.some(p=>!p))continue;const error=Math.max(...points.map((p,i)=>distance(p,live[i])));if(error<best){best=error;target=f;}}
 return {state:!target?'unknown':best<=radius?'inside':'outside',error_m:best,target};
}
export function validateLandmarks(value){
 if(!value||!Array.isArray(value.landmarks)||value.landmarks.length!==2||typeof value.note!=='string'||value.note.length>300||!['suggested','uncertain'].includes(value.status))throw Error('Invalid landmark suggestions.');
 return {status:value.status,note:value.note,landmarks:value.landmarks.map(p=>{
  if(typeof p.label!=='string'||!p.label.trim()||p.label.length>100||!Array.isArray(p.uv)||p.uv.length!==2||!p.uv.every(n=>Number.isFinite(n)&&n>=0&&n<=1))throw Error('Invalid landmark point.');
  return {label:p.label,uv:[...p.uv]};
 })};
}
