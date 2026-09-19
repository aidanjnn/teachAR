// Meter-based, timestamped motion logic. No browser, rendering, or API dependency.
export const JOINTS=['wrist','thumb-metacarpal','thumb-phalanx-proximal','thumb-phalanx-distal','thumb-tip',
  ...['index','middle','ring','pinky'].flatMap(f=>[`${f}-finger-metacarpal`,`${f}-finger-phalanx-proximal`,`${f}-finger-phalanx-intermediate`,`${f}-finger-phalanx-distal`,`${f}-finger-tip`])];
export const BONE_PAIRS=[[0,1],[1,2],[2,3],[3,4],...[5,10,15,20].flatMap(i=>[[0,i],[i,i+1],[i+1,i+2],[i+2,i+3],[i+3,i+4]])];
export const finite3=p=>Array.isArray(p)&&p.length===3&&p.every(Number.isFinite);
export const distance=(a,b)=>Math.hypot(...a.map((x,i)=>x-b[i]));
export function workspace(start,end) {
  if(!finite3(start)||!finite3(end))throw Error('Both workspace points must be tracked.');
  const dx=end[0]-start[0],dz=end[2]-start[2],span=Math.hypot(dx,dz);
  if(span<.20||span>1.2)throw Error('Mark points 20–120 cm apart on the same table.');
  if(Math.abs(end[1]-start[1])>.12)throw Error('Start and end should be on the same table surface.');
  return {origin:[...start],x:[dx/span,0,dz/span],y:[0,1,0],z:[-dz/span,0,dx/span],span};
}
export function toLocal(p,w){const d=p.map((v,i)=>v-w.origin[i]);return [w.x,w.y,w.z].map(axis=>axis.reduce((n,v,i)=>n+v*d[i],0));}
export function toWorld(p,w){return w.origin.map((v,i)=>v+w.x[i]*p[0]+w.y[i]*p[1]+w.z[i]*p[2]);}
export function tracked(joints){return !!joints && [0,5,10].every(i=>finite3(joints[i]?.p));}
export function segmentDistance(p,a,b){
  const v=b.map((x,i)=>x-a[i]),length=v.reduce((s,x)=>s+x*x,0);
  const t=length?Math.max(0,Math.min(1,v.reduce((s,x,i)=>s+x*(p[i]-a[i]),0)/length)):0;
  return distance(p,a.map((x,i)=>x+t*v[i]));
}
export function prepareRecording(frames,w,hand){
  if(!Array.isArray(frames)||frames.length<20)throw Error('Record at least one second of hand motion.');
  let previous=-Infinity;
  for(const f of frames){if(!Number.isFinite(f.t)||f.t<=previous)throw Error('Recording timestamps must increase.');previous=f.t;}
  const good=frames.filter(f=>tracked(f.joints));
  let maxGap=0,last=frames[0].t;
  for(const f of good){maxGap=Math.max(maxGap,f.t-last);last=f.t;}
  maxGap=Math.max(maxGap,frames.at(-1).t-last);
  if(good.length/frames.length<.8||maxGap>400)throw Error('Too much tracking loss. Retry with an open hand or less occlusion.');
  if(good.at(-1).t-good[0].t<1000)throw Error('Make the demonstration at least one second long.');
  if(distance(good[0].joints[0].p,good.at(-1).joints[0].p)<.15)throw Error('Move from start to end; do not bring your hand back before recording stops.');
  // Wrist height differs from the table contact point. Check horizontal endpoints.
  const first=good[0].joints[0].p,lastPoint=good.at(-1).joints[0].p;
  if(Math.hypot(first[0],first[2])>.22||Math.hypot(lastPoint[0]-w.span,lastPoint[2])>.22)
    throw Error('Begin near START and finish near END. Keep your hand at the end until recording stops.');
  const checkpoints=[good[0]];
  for(const f of good.slice(1))if(distance(f.joints[0].p,checkpoints.at(-1).joints[0].p)>=.03)checkpoints.push(f);
  if(distance(checkpoints.at(-1).joints[0].p,good.at(-1).joints[0].p)>.005)checkpoints.push(good.at(-1));
  if(checkpoints.length<4)throw Error('Demonstrate a longer transfer.');
  return {schema_version:1,units:'meters',clock:'XR milliseconds from record start',joint_names:JOINTS,
    hand,workspace:w,frames,checkpoints,quality:{tracked_fraction:good.length/frames.length,max_gap_ms:maxGap},
    verification:'wrist path only; finger joints are replayed, not scored'};
}
export class PathFollower {
  constructor(recording){this.recording=recording;this.index=0;this.dwell=0;this.previous=null;this.started=false;this.done=false;this.warned=false;this.recovered=false;}
  pause(){this.dwell=0;this.previous=null;}
  update(joints,t){
    if(this.previous!=null&&t<=this.previous)return {state:'lost',progress:this.progress};
    const gap=this.previous==null?Infinity:t-this.previous;
    const dt=gap>200?0:Math.max(0,Math.min(100,gap));
    if(this.previous!=null && (t<=this.previous || t-this.previous>200))this.dwell=0;
    this.previous=t;
    if(!tracked(joints)){this.dwell=0;return {state:'lost',progress:this.progress};}
    const points=this.recording.checkpoints, wrist=joints[0].p;
    const target=points[this.index].joints[0].p;
    const error=this.started?segmentDistance(wrist,points[Math.max(0,this.index-1)].joints[0].p,target):distance(wrist,target);
    const near=distance(wrist,target)<=.045;
    if(!near)this.dwell=0;else this.dwell+=dt;
    const final=this.index===points.length-1;
    const required=!this.started||final?500:80;
    if(!this.done && this.dwell>=required){
      this.dwell=0;this.started=true;
      if(final)this.done=true;else this.index++;
    }
    const state=this.done?'complete':error>.10?'off':error>.06?'near':'on';
    if(state==='off'&&this.started)this.warned=true;
    if(state==='on'&&this.warned)this.recovered=true;
    return {state,error,target:points[this.index].joints[0].p,progress:this.progress,started:this.started,done:this.done};
  }
  get progress(){return this.done?1:this.index/this.recording.checkpoints.length;}
}
