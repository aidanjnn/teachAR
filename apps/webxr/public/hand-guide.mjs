import * as THREE from '/vendor/three.module.js';
import {HolographicHand} from './holographic-hand.mjs';
import {JOINTS,BONE_PAIRS,workspace,toLocal,toWorld,tracked,distance,prepareRecording,PathFollower} from '/motion-core.mjs';
export const HAND_BUTTONS=[
  {id:'primary',x:24,y:396,w:336,h:68},{id:'replay',x:372,y:396,w:336,h:68},{id:'clear',x:720,y:396,w:336,h:68},
  {id:'hand',x:24,y:480,w:336,h:58},{id:'verify',x:372,y:480,w:336,h:58},{id:'exit',x:720,y:480,w:336,h:58}];
export function handButton(u,v){const x=u*1080,y=(1-v)*560;return HAND_BUTTONS.find(b=>x>=b.x&&x<=b.x+b.w&&y>=b.y&&y<=b.y+b.h)?.id||null;}
export class HandGuide {
  constructor({speak,verify,exit}){
    this.speak=speak;this.verify=verify;this.exit=exit;this.hand='right';this.events=[];this.attempt=0;this.archive=null;this.reset();
  }
  log(event,extra={}){this.events.push({t:performance.now(),event,...extra});if(this.events.length>500)this.events.shift();}
  reset(){
    this.attempt++;this.mode='start';this.start=null;this.end=null;this.workspace=null;this.recording=null;this.frames=[];
    this.pending=null;this.joints=null;this.follower=null;this.result=null;this.paused=false;this.verification=null;this.note='Use your other hand to point and pinch the buttons.';this.problem='';
    this.ghost?.visible && (this.ghost.visible=false);if(this.path)this.path.visible=false;
    this.markers?.forEach(m=>m.visible=false);if(this.arrow)this.arrow.visible=false;
    this.log('reset');
  }
  attach(scene){
    if(this.root){scene.add(this.root);return;}
    this.root=new THREE.Group();scene.add(this.root);
    this.space=new THREE.Group();this.root.add(this.space);
    this.ghost=new THREE.Group();this.space.add(this.ghost);
    const material=new THREE.MeshBasicMaterial({color:0x8debd4,transparent:true,opacity:.8,depthTest:false});
    this.dots=JOINTS.map(()=>{const mesh=new THREE.Mesh(new THREE.SphereGeometry(.007,8,6),material);this.ghost.add(mesh);return mesh;});
    const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.BufferAttribute(new Float32Array(BONE_PAIRS.length*6),3));
    this.boneMeshes=BONE_PAIRS.map(()=>{const mesh=new THREE.Mesh(new THREE.CylinderGeometry(.004,.004,1,6),material);this.ghost.add(mesh);return mesh;});
    this.bones=new THREE.LineSegments(geometry,new THREE.LineBasicMaterial({color:0x8debd4,depthTest:false}));this.ghost.add(this.bones);this.ghost.visible=false;
    this.path=new THREE.Line(new THREE.BufferGeometry(),new THREE.LineBasicMaterial({color:0x64bca8,transparent:true,opacity:.55}));this.space.add(this.path);this.path.visible=false;
    this.arrow=new THREE.ArrowHelper(new THREE.Vector3(1,0,0),new THREE.Vector3(),.1,0xffa799,.04,.025);this.space.add(this.arrow);this.arrow.visible=false;
    this.live=new THREE.Mesh(new THREE.SphereGeometry(.009,10,8),new THREE.MeshBasicMaterial({color:0xffffff}));this.space.add(this.live);this.live.visible=false;
    this.markers=['START','END'].map((text,i)=>{
      const group=new THREE.Group();
      const ring=new THREE.Mesh(new THREE.RingGeometry(.045,.055,40),new THREE.MeshBasicMaterial({color:i?0xffd47d:0x8debd4,side:THREE.DoubleSide}));ring.rotation.x=-Math.PI/2;group.add(ring);
      const canvas=document.createElement('canvas');canvas.width=256;canvas.height=80;
      const c=canvas.getContext('2d');c.fillStyle='#10231f';c.fillRect(0,0,256,80);c.fillStyle='#ffffff';c.font='bold 40px system-ui';c.textAlign='center';c.fillText(text,128,55);
      const map=new THREE.CanvasTexture(canvas);map.colorSpace=THREE.SRGBColorSpace;
      const label=new THREE.Sprite(new THREE.SpriteMaterial({map,depthTest:false}));label.scale.set(.16,.05,1);label.position.y=.09;group.add(label);
      group.visible=false;this.root.add(group);return group;
    });
  }
  begin(){this.reset();this.speak(`Hand guidance. Put down the controllers. Mark the fox start using your ${this.hand} index fingertip.`);}
  hide(){this.pause();this.joints=null;this.ghost && (this.ghost.visible=false);if(this.arrow)this.arrow.visible=false;}
  pause(){
    if(this.mode==='recording'){this.mode='record-paused';this.note='Recording paused. Return your wrist to the ghost, then Resume.';}
    if(this.pending){this.mode=this.workspace?'ready':this.start?'end':'start';this.frames=[];this.pending=null;this.note='Interrupted. Repeat the countdown or recording.';}
    this.paused=true;this.follower?.pause();this.log('pause');
  }
  endSession(){this.hide();this.log('session_end');if(this.recording)this.archive=this.exportData();this.reset();}
  exportData(){return this.recording?{...this.recording,events:this.events,verification:this.verification}:this.archive;}
  countdown(kind){this.problem='';this.pending={kind,until:performance.now()+4000,samples:[]};this.paused=false;this.note='Get into position. The action starts in four seconds.';this.speak(kind==='start'||kind==='end'?`Hold your ${this.hand} index fingertip at the ${kind} spot on the table. Four seconds.`:kind==='record'?'Recording in four seconds. Put your hand at the fox start.':'Following in four seconds. Reset the fox and match the first ghost hand.');}
  action(id){
    this.problem='';
    if(id==='exit'){this.exit();return;}
    if(id==='clear'){this.reset();this.speak('Workspace cleared. Mark start and end again.');return;}
    if(id==='hand'){if(this.mode==='start'&&!this.pending){this.hand=this.hand==='right'?'left':'right';this.speak(`Using your ${this.hand} hand.`);}else this.problem='Clear workspace before changing the recorded hand.';return;}
    if(this.pending){this.problem='Wait for the countdown, or clear workspace to cancel.';return;}
    if(id==='verify'){
      if(this.mode!=='complete'){this.problem='Finish following the hand path before the optional image check.';return;}
      this.verify();return;
    }
    if(id==='replay'){
      if(this.mode==='recording'){this.mode='record-paused';this.note='Paused. Return to the ghost wrist before resuming, or Finish recording.';this.log('record_pause');return;}
      if(this.mode==='record-paused'){
        const local=this.localJoints(this.joints),last=this.frames.findLast(f=>tracked(f.joints));
        if(!tracked(local)||(last&&distance(local[0].p,last.joints[0].p)>.06)){this.problem='Return your wrist to the paused ghost (within 6 cm), then Resume recording.';return;}
        this.mode='recording';this.lastRecordTick=this.lastTick;this.paused=false;this.log('record_resume');return;
      }
      if(this.mode==='follow'){this.paused=!this.paused;this.follower.pause();this.note=this.paused?'Paused. Select Resume to continue.':'Follow the ghost at your own pace.';return;}
      if(this.mode==='preview'){this.paused=!this.paused;this.note=this.paused?'Ghost replay paused.':'Ghost replay running.';return;}
      if(this.recording){this.mode='preview';this.previewTime=0;this.paused=false;this.note='Watch the recorded hand. Reset the fox, then choose Follow.';this.log('preview');}return;
    }
    if(id==='primary'){
      if(this.mode==='start'||this.mode==='end')this.countdown(this.mode);
      else if(this.mode==='ready')this.startRecording(this.lastTick);
      else if(this.mode==='recording'||this.mode==='record-paused')this.finishRecording();
      else if(this.recording)this.countdown('follow');
    }
  }
  sample(frame,session,reference){
    const source=Array.from(session.inputSources).find(s=>s.handedness===this.hand&&s.hand);
    if(!source)return null;
    return JOINTS.map(name=>{
      const space=source.hand.get(name);if(!space)return null;
      const pose=frame.getJointPose(space,reference);if(!pose)return null;
      const p=pose.transform.position,q=pose.transform.orientation;
      return {p:[p.x,p.y,p.z],q:[q.x,q.y,q.z,q.w],radius:pose.radius||.007};
    });
  }
  localJoints(joints){
    if(!joints||!this.workspace)return null;
    return joints.map(j=>{
      if(!j)return null;
      const q=new THREE.Quaternion(...j.q).premultiply(this.inverseBasis);
      return {...j,p:toLocal(j.p,this.workspace),q:q.toArray()};
    });
  }
  setWorkspace(){
    this.workspace=workspace(this.start,this.end);
    const w=this.workspace,basis=new THREE.Matrix4().makeBasis(new THREE.Vector3(...w.x),new THREE.Vector3(...w.y),new THREE.Vector3(...w.z));
    this.space.position.fromArray(w.origin);this.space.quaternion.setFromRotationMatrix(basis);this.inverseBasis=this.space.quaternion.clone().invert();
    this.mode='ready';this.note='Choose Start recording, move to END, then choose Finish recording. Pause whenever you need.';this.log('workspace_set',{workspace:w});
  }
  startRecording(time){
    if(!tracked(this.localJoints(this.joints))||!Number.isFinite(time)){this.problem='Show the selected hand before starting recording.';return;}
    this.frames=[];this.recordElapsed=0;this.lastRecordTick=time;this.lastSample=-Infinity;this.mode='recording';this.paused=false;
    this.speak('Recording started. Pause or finish whenever you want.');this.log('record_start');
  }
  finishRecording(){
    try{
      this.recording=prepareRecording(this.frames,this.workspace,this.hand);this.mode='review';this.archive=this.exportData();
      this.path.geometry.dispose();this.path.geometry=new THREE.BufferGeometry().setFromPoints(this.recording.checkpoints.map(f=>new THREE.Vector3(...f.joints[0].p)));this.path.visible=true;
      this.note=`Saved ${this.frames.length} samples. Reset the fox to START, then Follow.`;
      this.speak('Recording saved. Reset the fox to start. Choose Watch ghost or Follow.');this.log('recording_saved',{samples:this.frames.length,quality:this.recording.quality});
    }catch(e){this.mode='ready';this.note=e.message;this.speak(e.message);this.log('recording_rejected',{reason:e.message});}
  }
  tick(frame,session,reference,time){
    const now=performance.now(),dt=Math.min(100,Math.max(0,time-(this.lastTick??time)));this.lastTick=time;
    if(session.visibilityState!=='visible'){this.hide();return;}
    this.joints=this.sample(frame,session,reference);const local=this.localJoints(this.joints);
    if(this.pending && ['start','end'].includes(this.pending.kind) && now>this.pending.until-400){
      if(this.joints?.[9]?.p)this.pending.samples.push([...this.joints[9].p]);else this.pending.samples=[];
    }
    this.live.visible=tracked(local);if(this.live.visible)this.live.position.fromArray(local[0].p);
    if(this.pending && now>=this.pending.until){
      const {kind,samples}=this.pending;this.pending=null;
      if(kind==='start'||kind==='end'){
        const tip=samples.length>=8?samples[0].map((_,i)=>samples.reduce((sum,p)=>sum+p[i],0)/samples.length):null;
        if(!tip||samples.some(p=>distance(p,tip)>.025)){this.problem=`Hold your ${this.hand} index fingertip still and visible at the point. Then try Mark again.`;this.speak(this.problem);return;}
        try{
          if(kind==='start'){this.start=[...tip];this.mode='end';this.markers[0].position.fromArray(tip);this.markers[0].visible=true;this.note='Now mark END at B, 25–50 cm away.';}
          else{this.end=[...tip];this.setWorkspace();this.markers[1].position.fromArray(tip);this.markers[1].visible=true;}
          this.speak(kind==='start'?'Start marked. Mark the end at B.':'Workspace ready. Choose Record.');
        }catch(e){this.problem=e.message;this.speak(e.message);}return;
      }
      if(kind==='record'){
        if(!tracked(local)){this.note='Cannot see the recording hand. Open your hand and retry Record.';return;}
        this.startRecording(time);
      }else if(kind==='follow'){
        this.attempt++;this.verification=null;this.follower=new PathFollower(this.recording);this.mode='follow';this.paused=false;this.result=null;this.previousState=null;
        this.speak('Match the first ghost wrist, then follow at your own pace.');this.log('follow_start',{attempt:this.attempt});
      }
    }
    if(this.mode==='recording'){
      this.recordElapsed+=Math.max(0,time-this.lastRecordTick);this.lastRecordTick=time;
      if(this.recordElapsed-this.lastSample>=33){this.frames.push({t:this.recordElapsed,joints:local});this.lastSample=this.recordElapsed;}
      this.note=`${(this.recordElapsed/1000).toFixed(1)} seconds recorded. Pause to take a break; Finish recording when the transfer is done.`;
      if(this.frames.length>=18000){this.mode='record-paused';this.note='Recording buffer full. Choose Finish recording to save.';}
    }
    this.arrow.visible=false;this.ghost.visible=false;
    if(this.mode==='record-paused'){
      this.drawHand(this.frames.findLast(f=>tracked(f.joints))?.joints,0xffd47d);
    } else if(this.mode==='preview' && this.recording){
      if(!this.paused)this.previewTime+=dt;
      const duration=this.recording.frames.at(-1).t;const at=this.previewTime%duration;
      const sample=this.recording.frames.find(f=>f.t>=at);
      this.drawHand(sample?.joints,0x8debd4);
    } else if((this.mode==='follow'||this.mode==='complete') && this.follower){
      if(this.mode==='follow'&&!this.paused){
        this.result=this.follower.update(local,time);
        if(this.result.state!==this.previousState){
          this.log('guidance',{state:this.result.state,error_m:this.result.error,index:this.follower.index});
          if(now-(this.lastSpoken||0)>1800 && ['off','lost'].includes(this.result.state)){this.speak(this.result.state==='lost'?'Tracking lost. Show your hand.':'Move back toward the ghost hand.');this.lastSpoken=now;}
          this.previousState=this.result.state;
        }
        if(this.result.done){this.mode='complete';this.note='Hand path finished. Object placement is not yet verified.';this.speak('Hand path finished. You can check the final placement with the paid image button.');this.log('motion_complete',{deviation_observed:this.follower.warned,recovery_observed:this.follower.recovered});}
      }
      const color=this.result?.state==='off'?0xff8d89:this.result?.state==='near'?0xffd47d:0x8debd4;
      this.drawHand(this.recording.checkpoints[this.follower.index].joints,color);
      if(this.mode==='follow'&&!this.paused&&tracked(local)){
        const p=new THREE.Vector3(...local[0].p),target=new THREE.Vector3(...this.recording.checkpoints[this.follower.index].joints[0].p),v=target.sub(p),length=v.length();
        if(length>.045){this.arrow.visible=true;this.arrow.position.copy(p);this.arrow.setDirection(v.normalize());this.arrow.setLength(length,Math.min(.04,length*.3),.02);this.arrow.setColor(color);}
      }
    } else if(this.mode==='review')this.drawHand(this.recording.checkpoints[0].joints,0x8debd4);
  }
  enableHologram(live=false,side='right'){
    if(this.skinHand)return;
    this.skinHand=new HolographicHand(this.ghost,side,live);
  }
  drawHand(joints,color){
    if(this.skinHand?.ready){
      this.dots.forEach(m=>m.visible=false);this.boneMeshes.forEach(m=>m.visible=false);this.bones.visible=false;
      this.ghost.visible=this.skinHand.draw(joints,color);return;
    }
    // Loading or failed assets retain the measured joint visualization.
    if(this.skinHand)this.skinHand.root.visible=false;
    if(!tracked(joints)){this.ghost.visible=false;return;}
    if(this.palmMesh){
      const ids=[0,1,6,11,16,21],valid=ids.every(i=>joints[i]);
      this.palmMesh.visible=this.palmEdge.visible=valid;
      if(valid){
        const a=this.palmMesh.geometry.attributes.position,b=this.palmEdge.geometry.attributes.position;
        ids.forEach((id,i)=>{a.setXYZ(i,...joints[id].p);b.setXYZ(i,...joints[id].p);});b.setXYZ(6,...joints[0].p);
        a.needsUpdate=b.needsUpdate=true;this.palmMesh.geometry.computeBoundingSphere();this.palmEdge.geometry.computeBoundingSphere();
        this.palmMesh.material.color.setHex(color);this.palmEdge.material.color.setHex(color);
      }
    }
    this.ghost.visible=true;this.bones.visible=true;this.dots[0].material.color.setHex(color);this.bones.material.color.setHex(color);
    this.dots.forEach((dot,i)=>{dot.visible=!!joints[i];if(dot.visible)dot.position.fromArray(joints[i].p);});
    this.boneMeshes.forEach((mesh,i)=>{if(this.palmMesh)mesh.material.color.setHex(color);const [a,b]=BONE_PAIRS[i];mesh.visible=!!joints[a]&&!!joints[b];if(!mesh.visible)return;const pa=new THREE.Vector3(...joints[a].p),pb=new THREE.Vector3(...joints[b].p),delta=pb.clone().sub(pa);mesh.position.copy(pa.add(pb).multiplyScalar(.5));mesh.scale.y=delta.length();mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),delta.normalize());});
    const positions=this.bones.geometry.attributes.position;let n=0;
    for(const [a,b] of BONE_PAIRS){if(!joints[a]||!joints[b])continue;positions.setXYZ(n++,...joints[a].p);positions.setXYZ(n++,...joints[b].p);}
    this.bones.geometry.setDrawRange(0,n);positions.needsUpdate=true;this.bones.geometry.computeBoundingSphere();
  }
  acceptVerification(answer,attempt){
    if(attempt!==this.attempt||this.mode!=='complete')return;
    this.verification={verdict:answer.verdict,message:answer.message,at:performance.now(),age_ms:answer.age_ms,frame_id:answer.frame_id};
    this.log('placement_check',this.verification);this.speak(`Image check: ${answer.message}`);
  }
  draw(ctx,time,hover,network){
    const tracking=tracked(this.joints),state=this.result?.state;
    let title=({start:'Mark the fox START',end:'Mark END at B',ready:'Ready to record',recording:'Recording your hand','record-paused':'Recording paused',review:'Recording saved',preview:'Ghost replay',follow:'Follow the ghost wrist',complete:'Hand path finished'})[this.mode];
    let text=this.note;
    let color='#9cf0d3';
    if(this.mode==='start'||this.mode==='end')text=`Select Mark, then hold your ${this.hand} INDEX FINGERTIP at the ${this.mode==='start'?'fox start spot':'destination B'} on the table. Four-second countdown.`;
    if(this.mode==='follow'){
      if(this.paused){title='Guidance paused';text='Choose Resume to continue.';color='#ffe094';}
      else if(!tracking||state==='lost'){title='Tracking lost';text=`Show your ${this.hand} hand. Progress is paused; missing tracking is not an error in your movement.`;color='#ffe094';}
      else if(state==='off'){title='Move toward the ghost';text='Your wrist left the current path segment. Follow the arrow back; progress is held.';color='#ff9e95';}
      else {text=this.follower.started?'Follow the ghost at your own pace. Move sideways to test the warning, then return.':'Match the ghost wrist and hold still for half a second to begin.';if(state==='near')color='#ffe094';}
    }
    if(this.mode==='complete'&&this.verification){
      const age=this.verification.age_ms+performance.now()-this.verification.at;
      text=age>12000?'Previous image check expired. Use Check image again for current placement.':`Image: ${this.verification.message}`;
      color=age>12000||this.verification.verdict==='unknown'?'#ffe094':this.verification.verdict==='fail'?'#ff9e95':'#9cf0d3';
    }
    if(this.problem){text=this.problem;color='#ffe094';}
    if(this.pending){title=`${this.pending.kind.toUpperCase()} IN ${Math.max(0,Math.ceil((this.pending.until-performance.now())/1000))}s`;text=this.note;}
    ctx.clearRect(0,0,1080,560);ctx.fillStyle='#10231f';ctx.fillRect(0,0,1080,560);ctx.fillStyle=color;ctx.fillRect(0,0,12,560);
    ctx.textAlign='left';ctx.font='600 23px system-ui';ctx.fillStyle='#b5ccc4';ctx.fillText(`TeachAR · LOCAL HAND GUIDANCE · ${this.hand.toUpperCase()} HAND ${tracking?'TRACKED':'NOT TRACKED'}`,26,39);
    ctx.font='700 46px system-ui';ctx.fillStyle=color;ctx.fillText(title,26,99);
    ctx.font='29px system-ui';ctx.fillStyle='#f3fff9';this.text(ctx,text,26,147,1020,37,4);
    ctx.font='23px system-ui';ctx.fillStyle='#b5ccc4';
    const progress=this.follower?`${Math.round(this.follower.progress*100)}% · wrist error ${Number.isFinite(this.result?.error)?Math.round(this.result.error*100)+' cm':'—'}`:'Start → end · hand recording stays local';
    ctx.fillText(progress,26,304);
    const evidence=this.follower?`Sideways warning: ${this.follower.warned?'seen':'not yet'} · recovery: ${this.follower.recovered?'seen':'not yet'}`:'Put down controllers for recording. Use the OTHER hand to select buttons.';
    ctx.font='22px system-ui';ctx.fillText(evidence,26,340);
    ctx.font='20px system-ui';ctx.fillText(network,26,372);
    const labels={primary:this.pending?'Get ready…':({start:'Mark START · 4s',end:'Mark END · 4s',ready:'Start recording',recording:'Finish recording','record-paused':'Finish recording'})[this.mode]||'Follow / restart · 4s',
      replay:this.mode==='recording'?'Pause recording':this.mode==='record-paused'?'Resume recording':this.mode==='follow'||this.mode==='preview'?(this.paused?'Resume':'Pause'):'Watch ghost',clear:'Clear workspace',hand:`Use ${this.hand==='right'?'LEFT':'RIGHT'} hand`,verify:'Check image · paid',exit:'Exit AR'};
    for(const b of HAND_BUTTONS){const disabled=(b.id==='verify'&&this.mode!=='complete')||(b.id==='replay'&&!this.recording&&!['recording','record-paused'].includes(this.mode))||(b.id==='hand'&&this.mode!=='start');ctx.globalAlpha=disabled?.4:1;ctx.fillStyle=hover===b.id?'#8edbc2':'#294d43';ctx.fillRect(b.x,b.y,b.w,b.h);ctx.fillStyle=hover===b.id?'#10231f':'#fff';ctx.textAlign='center';ctx.font='600 25px system-ui';ctx.fillText(labels[b.id],b.x+b.w/2,b.y+b.h/2+9);}
    ctx.globalAlpha=1;ctx.textAlign='left';return `${title}. ${text}`;
  }
  text(ctx,text,x,y,width,height,max){let line='',row=0;for(const word of text.split(/\s+/)){if(ctx.measureText(line+word).width>width&&line){ctx.fillText(line,x,y+row++*height);line='';if(row>=max)return;}line+=word+' ';}if(row<max)ctx.fillText(line,x,y+row*height);}
}
