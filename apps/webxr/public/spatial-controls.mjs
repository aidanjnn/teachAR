import * as THREE from '/vendor/three.module.js';
import {THEMES} from './tutorial-design.mjs';
import {palm} from './tutorial-assist.mjs';
// Standard WebXR selectstart/selectend + Three raycasting, as in Three's drag samples.
// Dragging presentation never changes the calibrated motion coordinate frame.
export class SpatialControls {
 constructor(scene,panel,guide){
  Object.assign(this,{scene,panel,guide});this.drag=null;this.suppressed=new WeakSet();this.ray=new THREE.Raycaster();
  this.handle=this.makeLabel('Pinch + move',.28,.042);this.handle.position.set(0,.307,0);panel.add(this.handle);
  this.canvas=document.createElement('canvas');this.canvas.width=768;this.canvas.height=256;this.ctx=this.canvas.getContext('2d');
  this.texture=new THREE.CanvasTexture(this.canvas);this.texture.colorSpace=THREE.SRGBColorSpace;
  this.timer=new THREE.Mesh(new THREE.PlaneGeometry(.38,.127),new THREE.MeshBasicMaterial({map:this.texture,transparent:true,depthTest:false,depthWrite:false,toneMapped:false}));this.timer.rotation.x=-Math.PI/2;this.timer.visible=false;scene.add(this.timer);this.timer.renderOrder=12;
  this.rings=['left','right'].map(()=>{const m=new THREE.Mesh(new THREE.RingGeometry(.065,.070,64),new THREE.MeshBasicMaterial({color:0x8debd4,transparent:true,opacity:.85,side:THREE.DoubleSide,depthTest:false,depthWrite:false}));m.visible=false;scene.add(m);return m;});
 }
 makeLabel(text,w,h){const c=document.createElement('canvas');c.width=560;c.height=84;const x=c.getContext('2d');x.fillStyle='#252722';x.beginPath();x.roundRect(0,0,560,84,30);x.fill();x.fillStyle='#e8e9df';x.font='30px system-ui';x.textAlign='center';x.fillText(text,280,53);const t=new THREE.CanvasTexture(c);return new THREE.Mesh(new THREE.PlaneGeometry(w,h),new THREE.MeshBasicMaterial({map:t,transparent:true,depthTest:false,depthWrite:false}));}
 rayFrom(pose){this.ray.set(new THREE.Vector3().copy(pose.transform.position),new THREE.Vector3(0,0,-1).applyQuaternion(new THREE.Quaternion().copy(pose.transform.orientation)));}
 start(source,pose){
  if(this.drag)return false;this.suppressed.delete(source);this.scene.updateMatrixWorld(true);this.rayFrom(pose);
  const hit=this.ray.intersectObjects([this.handle,...(this.timer.visible?[this.timer]:[])],false)[0];if(!hit)return false;
  const object=hit.object===this.handle?this.panel:this.timer;
  this.drag={source,object,distance:hit.distance,offset:object.position.clone().sub(hit.point)};this.suppressed.add(source);this.guide.onManipulation?.();return true;
 }
 move(source,pose){if(this.drag?.source!==source)return;this.rayFrom(pose);this.drag.object.position.copy(this.ray.ray.at(this.drag.distance,new THREE.Vector3())).add(this.drag.offset);if(this.drag.object===this.timer)this.timerMoved=true;}
 end(source){if(this.drag?.source===source)this.drag=null;}
 cancel(){if(this.drag)this.suppressed.add(this.drag.source);this.drag=null;}
 reset(){this.cancel();this.workspace=null;this.timerMoved=false;this.timer.visible=false;this.rings.forEach(r=>r.visible=false);}
 tick(time,viewer){
  const g=this.guide,w=g.workspace;
  if(!w||['home','library','loading-library'].includes(g.mode)){this.timer.visible=false;this.rings.forEach(r=>r.visible=false);return;}
  if(this.workspace!==w){this.workspace=w;this.timerMoved=false;}
  if(!this.timerMoved){this.timer.position.copy(g.space.localToWorld(new THREE.Vector3(w.span/2,.008,.28)));this.timer.quaternion.copy(g.space.quaternion).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1,0,0),-Math.PI/2));}
  this.timer.visible=true;
  const progress=g.mode==='capture'&&g.fluidCapture?g.segmenter.progress:0;
  this.rings.forEach((r,i)=>{const p=palm(g.currentHands?.[i?'right':'left']);r.visible=!!p&&progress>0&&g.segmenter.sides?.includes(i?'right':'left');if(r.visible){r.position.copy(g.space.localToWorld(new THREE.Vector3(...p)));r.quaternion.copy(viewer.transform.orientation);r.geometry.setDrawRange(0,Math.max(3,Math.floor(progress*64)*6));}});
  if(time-(this.lastDraw||-Infinity)<50)return;this.lastDraw=time;
  const event=g.feedback?.visible(performance.now()),p=THEMES[g.appearance?.theme]||THEMES.charcoal,c=this.ctx;
  c.clearRect(0,0,768,256);c.fillStyle=p.surface;c.beginPath();c.roundRect(0,0,768,256,36);c.fill();c.fillStyle=p.muted;c.font='24px system-ui';c.fillText('TRAIL · PINCH TO MOVE',32,42);
  const title=event?.text|| (g.pending?`${Math.max(0,Math.ceil((g.pending.until-performance.now())/1000))} seconds`:g.mode==='capture'?`${(g.recordElapsed/1000).toFixed(1)}s · Step ${g.tutorial.steps.length+1}`:g.mode==='capture-paused'?'Recording paused':g.practice?.phase==='transition'?'Next step starting…':g.practice?.phase==='preview'?'Watch the next movement':g.mode==='learn'?'Your turn':'Workspace ready');
  c.fillStyle=event?.kind==='saved'?p.success:p.ink;c.font='500 36px system-ui';g.text(c,title,32,102,700,42,2);
  c.fillStyle=p.muted;c.font='25px system-ui';c.fillText(progress>0?'Hold still to save…':g.mode==='capture'&&g.fluidCapture?'Move, then hold. Each step saves automatically.':g.savedMessage||'',32,199,700);
  if(progress>0){c.fillStyle=p.success;c.fillRect(32,226,704*progress,6);}this.texture.needsUpdate=true;
 }
}
