import * as THREE from '/vendor/three.module.js';
import {THEMES} from './tutorial-design.mjs';
import {palm} from './tutorial-assist.mjs';
const MIN_SCALE=.65,MAX_SCALE=1.6;
// Presentation transforms only: never transform the calibrated tutorial space.
// Explicit grips avoid interpreting an ordinary button pinch as a rotation.
export class SpatialControls {
 constructor(scene,panel,guide){
  Object.assign(this,{scene,panel,guide});this.drag=null;this.suppressed=new WeakSet();this.ray=new THREE.Raycaster();this.controls=[];this.panelScale=1;
  this.handle=this.addControl(panel,'move','Pinch + move',0,.307,.24);
  this.addControl(panel,'rotate','Rotate',-.265,.307,.22);
  this.addControl(panel,'resize','Resize',.265,.307,.22);
  this.addControl(panel,'face','Face me',0,-.315,.20);
  this.canvas=document.createElement('canvas');this.canvas.width=768;this.canvas.height=256;this.ctx=this.canvas.getContext('2d');
  this.texture=new THREE.CanvasTexture(this.canvas);this.texture.colorSpace=THREE.SRGBColorSpace;
  this.timer=new THREE.Mesh(new THREE.PlaneGeometry(.38,.127),new THREE.MeshBasicMaterial({map:this.texture,transparent:true,depthTest:false,depthWrite:false,toneMapped:false}));this.timer.rotation.x=-Math.PI/2;this.timer.visible=false;scene.add(this.timer);this.timer.renderOrder=12;
  this.addControl(this.timer,'rotate','Rotate',-.14,.095,.125);
  this.addControl(this.timer,'face','Face me',0,.095,.125);
  this.addControl(this.timer,'resize','Resize',.14,.095,.125);
  this.rings=['left','right'].map(()=>{const m=new THREE.Mesh(new THREE.RingGeometry(.065,.070,64),new THREE.MeshBasicMaterial({color:0x8debd4,transparent:true,opacity:.85,side:THREE.DoubleSide,depthTest:false,depthWrite:false}));m.visible=false;scene.add(m);return m;});
  this.paintControls();
 }
 addControl(object,mode,label,x,y,width){
  const canvas=document.createElement('canvas');canvas.width=440;canvas.height=88;
  const map=new THREE.CanvasTexture(canvas);map.colorSpace=THREE.SRGBColorSpace;
  // Recovery grips remain targetable even if the user turns the panel away.
  const mesh=new THREE.Mesh(new THREE.PlaneGeometry(width,.046),new THREE.MeshBasicMaterial({map,transparent:true,side:THREE.DoubleSide,depthTest:false,depthWrite:false,toneMapped:false}));
  mesh.position.set(x,y,.002);mesh.renderOrder=14;object.add(mesh);this.controls.push({mesh,object,mode,label,canvas});return mesh;
 }
 paintControls(){
  const theme=this.guide.appearance?.theme||'charcoal',active=this.drag?.control;
  if(this.paintedTheme===theme&&this.paintedActive===active)return;
  this.paintedTheme=theme;this.paintedActive=active;
  const p=THEMES[theme]||THEMES.charcoal;
  for(const control of this.controls){
   const c=control.canvas.getContext('2d'),selected=control===active;
   c.clearRect(0,0,440,88);c.fillStyle=selected?p.action:p.surface;c.strokeStyle=p.line;c.lineWidth=2;c.beginPath();c.roundRect(2,2,436,84,30);c.fill();c.stroke();
   c.fillStyle=selected?p.actionInk:p.ink;c.font='500 34px system-ui';c.textAlign='center';c.fillText(control.label,220,56);control.mesh.material.map.needsUpdate=true;
  }
 }
 rayFrom(pose){this.ray.set(new THREE.Vector3().copy(pose.transform.position),new THREE.Vector3(0,0,-1).applyQuaternion(new THREE.Quaternion().copy(pose.transform.orientation)));}
 start(source,pose){
  if(this.drag)return false;this.suppressed.delete(source);this.scene.updateMatrixWorld(true);this.rayFrom(pose);
  const controls=this.controls.filter(c=>c.object.visible),hit=this.ray.intersectObjects([...controls.map(c=>c.mesh),...(this.timer.visible?[this.timer]:[])],false)[0];if(!hit)return false;
  const control=controls.find(c=>c.mesh===hit.object),object=control?.object||this.timer,mode=control?.mode||'move';
  this.suppressed.add(source);this.guide.onManipulation?.();
  if(object===this.timer)this.timerMoved=true;
  const normal=new THREE.Vector3(0,0,1).applyQuaternion(object.quaternion),plane=new THREE.Plane().setFromNormalAndCoplanarPoint(normal,object.position);
  const resizePoint=this.ray.ray.intersectPlane(plane,new THREE.Vector3());
  this.drag={source,object,control,mode,distance:hit.distance,offset:object.position.clone().sub(hit.point),
   orientation:new THREE.Quaternion().copy(pose.transform.orientation),rotation:object.quaternion.clone(),
   plane,radius:resizePoint?.distanceTo(object.position)||0,scale:object.scale.x};
  this.paintControls();return true;
 }
 move(source,pose){
  const d=this.drag;if(d?.source!==source)return;
  if(!pose){this.cancel();return;}
  this.rayFrom(pose);
  if(d.mode==='face')return;
  if(d.mode==='rotate'){
   // Apply the incremental controller/hand-ray orientation from the grab pose;
   // no Euler wrap, no snap to the hand's absolute orientation, no moving pivot.
   d.object.quaternion.copy(pose.transform.orientation).multiply(d.orientation.clone().invert()).multiply(d.rotation).normalize();
  }else if(d.mode==='resize'){
   const point=this.ray.ray.intersectPlane(d.plane,new THREE.Vector3());
   if(point&&d.radius>.01){const scale=THREE.MathUtils.clamp(d.scale*point.distanceTo(d.object.position)/d.radius,MIN_SCALE,MAX_SCALE);d.object.scale.setScalar(scale);if(d.object===this.panel)this.panelScale=scale;}
  }else d.object.position.copy(this.ray.ray.at(d.distance,new THREE.Vector3())).add(d.offset);
 }
 face(object=this.panel){
  if(!this.viewer)return;
  // Stand the panel upright and turn it toward the viewer; the timer can tilt
  // upward for reading. Position and size do not change.
  const target=this.viewer.clone();if(object===this.panel)target.y=object.position.y;
  if(target.distanceToSquared(object.position)<.0001)return;
  object.up.set(0,1,0);object.lookAt(target);if(object===this.timer)this.timerMoved=true;
 }
 end(source){if(this.drag?.source===source){if(this.drag.mode==='face')this.face(this.drag.object);this.drag=null;this.paintControls();}}
 cancel(){if(this.drag)this.suppressed.add(this.drag.source);this.drag=null;this.paintControls();}
 applyPanelEntrance(scale){
  // Keep user size through screen transitions; freeze entrance motion on grab.
  if(!this.drag)this.panel.scale.setScalar(this.panelScale*scale);
 }
 resetPlacement(){this.cancel();this.panelScale=1;this.panel.scale.setScalar(1);this.timerMoved=false;this.timer.scale.setScalar(1);}
 reset(){this.resetPlacement();this.workspace=null;this.viewer=null;this.timer.visible=false;this.rings.forEach(r=>r.visible=false);}
 tick(time,viewer){
  this.viewer=new THREE.Vector3().copy(viewer.transform.position);this.paintControls();
  const g=this.guide,w=g.workspace;
  if(!w||['home','library','loading-library'].includes(g.mode)){if(this.drag?.object===this.timer)this.cancel();this.timer.visible=false;this.rings.forEach(r=>r.visible=false);return;}
  if(this.workspace!==w){if(this.drag?.object===this.timer)this.cancel();this.workspace=w;this.timerMoved=false;this.timer.scale.setScalar(1);}
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
