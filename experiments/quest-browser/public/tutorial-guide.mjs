import * as THREE from '/vendor/three.module.js';
import {HandGuide} from '/hand-guide.mjs';
import {tracked, distance, toLocal} from '/motion-core.mjs';
import {newTutorial, prepareStep, TutorialPlayer, MAX_FRAMES, MAX_STEPS, MAX_TOTAL_FRAMES, MAX_FILE_BYTES, validateTutorial, validateReference, learningReadiness, validateCues,finishTutorial,trimStep} from '/tutorial-core.mjs';
import {PalmAlignment,CaptureEndpoint,SavePositionCapture} from '/tutorial-assist.mjs';
import {TutorialFollower,guidanceReadiness} from '/tutorial-follow.mjs';
import {drawTutorialUI} from '/tutorial-ui.mjs';
import {preferences,applyAppearance,THEMES} from '/tutorial-design.mjs';
import {TutorialFeedback} from '/tutorial-feedback.mjs';
import {saveTutorial, loadTutorial, draftVersion, listTutorials, findTutorial} from '/tutorial-store.mjs';

export const TUTORIAL_BUTTONS=[
  ...['primary','replay','clear','cue'].map((id,i)=>({id,x:24+i*262,y:396,w:246,h:68})),
  ...['hand','verify','removeCue','exit'].map((id,i)=>({id,x:24+i*262,y:480,w:246,h:58}))
];
export function tutorialButton(u,v,buttons=TUTORIAL_BUTTONS){const x=u*1080,y=(1-v)*560;return buttons.find(b=>x>=b.x&&x<=b.x+b.w&&y>=b.y&&y<=b.y+b.h)?.id||null;}
export class TutorialGuide extends HandGuide {
  log(event,extra={}){super.log(event,{tutorial_id:this.tutorial?.id??null,revision:this.tutorial?.revision??null,...extra});}
  constructor(options) {
    super(options);
    this.snapshot = options.snapshot;this.writeTutorial=options.writeTutorial||saveTutorial;
    this.narrator=options.narrator;this.audioPlayer=options.audioPlayer;this.saveTask=Promise.resolve();
    this.tutorial = newTutorial();this.alignmentEnabled=true;this.cleanSave=false;this.alignment=new PalmAlignment();this.endpoint=new CaptureEndpoint();this.savePositionCapture=new SavePositionCapture();
    this.saveQueue = Promise.resolve();this.appearance=preferences();this.feedback=new TutorialFeedback();this.onFeedback=options.onFeedback;applyAppearance(this.appearance);
    this.savedMessage = 'No steps saved yet.';this.saveStatus='idle';this.activeSession=false;this.loading=true;this.saveGeneration=0;this.persistedVersion=null;
  }
  async restore() {
    try {
      const draft = await loadTutorial();this.persistedVersion=draftVersion(draft);
      if (draft) {
        this.tutorial=validateTutorial(draft);
        this.savedMessage=`${this.tutorial.steps.length} steps restored on this device. Re-mark the workspace.`;
      }
    } catch (e) { this.savedMessage = `Draft could not be loaded: ${e.message}`; } finally {this.loading=false;this.onChange?.();}
  }
  persist(tutorial=this.tutorial) {
    const snapshot=structuredClone(tutorial), generation=++this.saveGeneration, epoch=this.epoch;
    this.saveStatus='saving';this.savedMessage='Saving on this device…';
    this.saveQueue=this.saveQueue.catch(()=>{}).then(()=>{
      if(new TextEncoder().encode(JSON.stringify(snapshot)).byteLength>MAX_FILE_BYTES)throw Error('Tutorial exceeds the 48 MB storage limit.');
      return this.writeTutorial(snapshot,this.persistedVersion).then(()=>{this.persistedVersion=draftVersion(snapshot);});
    });
    this.saveQueue.then(()=>{if(generation===this.saveGeneration){this.saveStatus='saved';if(snapshot.steps.length&&epoch===this.epoch)this.notify('saved','Saved on this device');this.savedMessage=`${snapshot.steps.length} steps saved on this device.`;this.onChange?.();}},
      e=>{if(generation===this.saveGeneration){this.saveStatus='failed';this.savedMessage=e.name==='DraftConflict'?e.message:'Local save failed. Retry saving, or exit AR and export before closing.';if(epoch===this.epoch)this.notify('error',this.savedMessage);this.onChange?.();}});
    this.onChange?.();return this.saveQueue;
  }
  notify(kind,text){const event=this.feedback?.emit(kind,text,performance.now());if(event)this.onFeedback?.(event);}
  changed(){this.tutorial.revision++;this.tutorial.completion=null;this.epoch++;return this.persist();}
  async finishAuthoring(){
    const draft=this.tutorial,revision=draft.revision,returnMode=this.mode,generation=this.takeGeneration;
    try{
      const finished=finishTutorial(draft);
      this.epoch++;this.mode='saving-tutorial';this.audioPlayer?.stop();
      await this.persist(finished);
      // Keep the durable result after an exit, but never change a new session's UI.
      if(this.tutorial!==draft||this.tutorial.revision!==revision)return;
      this.tutorial=finished;
      if(this.takeGeneration===generation){
        this.mode=this.ux?'saved':'author';this.player=null;this.problem='';
        if(this.photoPanel)this.photoPanel.visible=false;
        this.note='Tutorial saved on this device. Reset the task and start learning.';this.speak(this.note);
      }
      this.onChange?.();
    }catch(e){
      if(this.takeGeneration===generation){this.mode=returnMode;this.problem=this.saveStatus==='failed'?this.savedMessage:e.message;this.onChange?.();}
    }
  }
  commitStep(step,index){
    if(this.takeNarrationIssue&&!step.narration_issue)step.narration_issue=this.takeNarrationIssue;
    if(index===this.tutorial.steps.length)this.tutorial.steps.push(step);else this.tutorial.steps[index]=step;
    this.replaceIndex=null;this.tutorial.calibration_span_m=this.workspace.span;
    this.mode='author';this.frames=[];
    this.changed().then(()=>this.log('record_saved',{step_id:step.id,duration_ms:step.duration_ms,quality:step.quality}),()=>{});
    if(this.ux){this.player=new TutorialPlayer(this.tutorial.steps);this.player.index=index;this.mode='review-step';this.showStep();}
    this.note=step.narration_issue?'Motion kept for review; narration failed. Re-record or remove narration during review.':'Recording kept for review. Choose required hands and inspect the ghost before approving.';this.speak(this.note);
  }
  async finishNarratedStep(step,index,cutoff=null){
    const generation=this.takeGeneration;this.mode='saving';
    try{step.narration=await this.narrator.finish(step.duration_ms);}
    catch(e){step.narration_issue=e.message.slice(0,240);}
    if(generation!==this.takeGeneration||!this.activeSession)return;
    if(cutoff!==null)step=trimStep(step,0,cutoff);
    this.commitStep(step,index);
  }
  async replaceTutorial(data){
    if(this.activeSession)throw Error('Exit AR before replacing or editing the tutorial.');
    const next=validateTutorial(data);
    // Persist first: a storage failure must leave the current tutorial intact.
    await this.saveQueue.catch(()=>{});
    if(new TextEncoder().encode(JSON.stringify(next)).byteLength>MAX_FILE_BYTES)throw Error('Tutorial exceeds the 48 MB limit.');
    await this.writeTutorial(next,this.persistedVersion);this.persistedVersion=draftVersion(next);
    if(next.id!==this.tutorial.id)this.events=[];
    this.reset();this.tutorial=next;this.saveStatus='saved';this.notify('saved','Saved on this device');this.savedMessage=`${next.steps.length} steps saved on this device.`;this.onChange?.();
  }

  attach(scene) {
    super.attach(scene);
    if (this.leftGhost) return;
    this.leftGhost = new HandGuide({speak:()=>{}, verify:()=>{}, exit:()=>{}});
    this.leftGhost.attach(scene);this.enableHologram();this.leftGhost.enableHologram();
    this.liveHands={};this.zones={};
    for(const side of ['left','right']){
      const live=new HandGuide({speak:()=>{},verify:()=>{},exit:()=>{}});live.attach(scene);live.enableHologram(true);this.liveHands[side]=live;
      const zone=new THREE.Group();zone.visible=false;this.space.add(zone);this.zones[side]=zone;
      const mat=new THREE.MeshBasicMaterial({color:0xffd47d,transparent:true,opacity:.45,side:THREE.DoubleSide,depthTest:false,depthWrite:false});
      for(let axis=0;axis<3;axis++){const ring=new THREE.Mesh(new THREE.RingGeometry(.118,.12,48),mat);if(axis===0)ring.rotation.x=Math.PI/2;if(axis===1)ring.rotation.y=Math.PI/2;zone.add(ring);}
    }
    this.nextPath=new THREE.LineSegments(new THREE.BufferGeometry(),new THREE.LineDashedMaterial({color:0x7cdadd,transparent:true,opacity:.6,dashSize:.012,gapSize:.009,depthTest:false,depthWrite:false}));this.nextPath.visible=false;this.space.add(this.nextPath);
    this.photoCanvas = document.createElement('canvas'); this.photoCanvas.width = 640; this.photoCanvas.height = 480;
    this.photoTexture = new THREE.CanvasTexture(this.photoCanvas); this.photoTexture.colorSpace = THREE.SRGBColorSpace;
    this.photoPanel = new THREE.Mesh(new THREE.PlaneGeometry(.40,.30), new THREE.MeshBasicMaterial({map:this.photoTexture, side:THREE.DoubleSide}));
    this.photoPanel.rotation.x = -Math.PI/2;
    this.photoPanel.position.set(.2,.025,.25); this.photoPanel.visible = false;
    this.space.add(this.photoPanel);
    this.foldLine=new THREE.Group();this.foldLine.visible=false;this.space.add(this.foldLine);
    const lineMaterial=new THREE.MeshBasicMaterial({color:0xffd47d,depthTest:false});
    this.foldSegment=new THREE.Mesh(new THREE.CylinderGeometry(.004,.004,1,8),lineMaterial);this.foldLine.add(this.foldSegment);
    this.foldEnds=[0,1].map(()=>{const mesh=new THREE.Mesh(new THREE.SphereGeometry(.012,12,8),lineMaterial);this.foldLine.add(mesh);return mesh;});
    this.markers.forEach(m => m.children.filter(c=>c.isSprite).forEach(c=>c.visible=false));
  }
  reset() {
    this.takeGeneration=(this.takeGeneration||0)+1;this.narrator?.cancel();this.audioPlayer?.stop();
    this.saveHomeWorld=null;this.saveReturn=null;this.savePositionCapture?.reset();
    this.takeNarrationIssue=null;this.alignment?.reset();this.endpoint?.reset();this.alignmentResult=null;this.hideAssistance();
    super.reset();
    this.feedback?.clear();this.feedbackState=null;this.followEngine=null;this.watchOnly=false;this.gatePaused=false;this.wasHidden=false;
    this.epoch = (this.epoch || 0) + 1; this.player = null; this.replaceIndex=null;this.photoTarget=null;this.photoEpoch=(this.photoEpoch||0)+1;
    if (this.leftGhost) this.leftGhost.ghost.visible = false;
    if (this.photoPanel) this.photoPanel.visible = false;
    if(this.foldLine)this.foldLine.visible=false;if(this.nextPath)this.nextPath.visible=false;
  }
  hideAssistance(){
    for(const h of Object.values(this.liveHands||{}))h.ghost.visible=false;
    for(const z of Object.values(this.zones||{}))z.visible=false;
  }
  begin(intent='legacy') { this.ux=intent!=='legacy';this.intent=intent==='follow'?'follow':'create';this.activeSession=true;this.reset();if(this.ux)this.mode=intent==='home'?'home':intent==='follow'?'setup-follow':this.tutorial.save_position?'setup-new':'save-home';if(this.ux&&intent==='create'&&this.tutorial.save_position)this.cleanSave=true;this.log('tutorial_session_start',{tutorial_id:this.tutorial.id,revision:this.tutorial.revision,source:this.tutorial.source}); this.note=this.mode==='save-home'?'Choose a save position once for this tutorial.':this.mode==='home'?'Choose Create tutorial or Follow tutorial.':'Review the starting setup, then place the workspace.'; this.speak(this.note); }
  countdown(kind) {
    this.pending = {kind, until:performance.now()+4000, samples:[]};
    this.note = `Hold your right index fingertip at the ${kind==='start'?'new origin':'heading point to its right'}. Point separation does not resize the tutorial.`;
    this.speak(this.note);
  }
  setWorkspace() {
    super.setWorkspace();
    this.leftGhost.space.position.copy(this.space.position); this.leftGhost.space.quaternion.copy(this.space.quaternion);
    for(const h of Object.values(this.liveHands||{})){h.space.position.copy(this.space.position);h.space.quaternion.copy(this.space.quaternion);}
    // Origin + heading only. Point separation is not a scale parameter.
    this.mode=this.ux?'placement':'author';this.note='Workspace placed at original size. Inspect the first pose before continuing.';
  }
  syncPlacement(){
    this.space.position.fromArray(this.workspace.origin);
    const basis=new THREE.Matrix4().makeBasis(new THREE.Vector3(...this.workspace.x),new THREE.Vector3(...this.workspace.y),new THREE.Vector3(...this.workspace.z));
    this.space.quaternion.setFromRotationMatrix(basis);this.inverseBasis=this.space.quaternion.clone().invert();
    for(const h of [this.leftGhost,...Object.values(this.liveHands||{})]){h.space.position.copy(this.space.position);h.space.quaternion.copy(this.space.quaternion);}
    this.markers.forEach(m=>m.visible=false);this.epoch++;
  }
  startLearning(){
    const readiness=learningReadiness(this.tutorial);if(!readiness.ready){this.problem=readiness.message;return;}
    this.player=new TutorialPlayer(this.tutorial.steps);this.mode='learn';this.watchOnly=false;this.gatePaused=false;this.epoch++;this.showStep();
  }
  async openLibrary(){
    this.mode='loading-library';const epoch=++this.epoch;
    try{await this.saveQueue;const library=await listTutorials();if(this.epoch!==epoch||!this.activeSession)return;this.library=library.filter(t=>t.steps.length).map(validateTutorial);this.libraryIndex=0;this.mode='library';}
    catch(e){if(this.epoch===epoch){this.mode='home';this.problem=e.message;}}
  }
  async openSelected(){
    const id=this.library?.[this.libraryIndex]?.id;if(!id)return;
    const epoch=++this.epoch;this.mode='loading-library';
    try{const next=validateTutorial(await findTutorial(id));if(this.epoch!==epoch||!this.activeSession)return;
      await this.saveQueue;await this.writeTutorial(next,this.persistedVersion);this.persistedVersion=draftVersion(next);
      if(this.epoch!==epoch||!this.activeSession)return;
      this.reset();this.tutorial=next;this.saveStatus='saved';this.savedMessage=`${next.steps.length} steps saved on this device.`;this.intent=next.completion?'follow':'create';this.mode=next.completion?'setup-follow':next.save_position?'setup-new':'save-home';this.cleanSave=!!next.save_position;this.onChange?.();
    }catch(e){if(this.epoch===epoch){this.mode='home';this.problem=e.message;}}
  }
  handleUX(id){
    if(id==='settings'){
      if(this.pending)return true;
      if(this.mode==='capture'){this.mode='capture-paused';this.narrator?.pause();this.endpoint.interrupt();}
      this.settingsReturn=this.mode;this.gatePaused=true;this.followEngine?.pause();if(this.player)this.player.paused=true;this.audioPlayer?.stop();this.mode='settings';return true;
    }
    if(id==='settings-back'){this.mode=this.settingsReturn||'home';return true;}
    if(id==='theme'||id==='sound'){
      if(id==='theme')this.appearance.theme=this.appearance.theme==='light'?'charcoal':'light';else this.appearance.sound=!this.appearance.sound;
      applyAppearance(this.appearance);this.onChange?.();return true;
    }
    if(id==='keep-add'&&this.mode==='review-step'){
      if(this.player.step.narration_issue){this.problem='Repair narration or use text before keeping this step.';return true;}
      const ready=guidanceReadiness(this.player.step);if(!ready.ready){this.problem=ready.message;return true;}
      this.player.step.reviewed=true;this.changed();this.player=null;this.photoPanel.visible=false;this.mode='author';return true;
    }
    if(id==='review-pause'&&this.mode==='review-step'){this.player.paused=!this.player.paused;return true;}
    if(id==='trim-open'){this.player.paused=true;this.audioPlayer?.stop();this.trimRange=[0,this.player.step.duration_ms];this.mode='trim';return true;}
    if(id.startsWith('trim-')&&this.mode==='trim'){
      const range=this.trimRange,duration=this.player.step.duration_ms;
      if(id==='trim-cancel'){this.mode='review-step';this.player.replay();return true;}
      if(id==='trim-apply'){
        try{const index=this.player.index;this.tutorial.steps[index]=trimStep(this.player.step,...range);this.changed();this.player=new TutorialPlayer(this.tutorial.steps);this.player.index=index;this.mode='review-step';this.showStep();}catch(e){this.problem=e.message;}return true;
      }
      if(id==='trim-start-less')range[0]=Math.max(0,range[0]-250);
      if(id==='trim-start-more')range[0]=Math.min(range[1]-1000,range[0]+250);
      if(id==='trim-end-less')range[1]=Math.max(range[0]+1000,range[1]-250);
      if(id==='trim-end-more')range[1]=Math.min(duration,range[1]+250);
      this.player.time=id.includes('start')?range[0]:range[1];return true;
    }
    if(id==='panel-place'){this.onRepositionPanel?.();return true;}
    if(id==='retry-save'){if(this.saveStatus==='failed')this.persist();return true;}
    if(id==='home'){
      this.narrator?.cancel();this.audioPlayer?.stop();this.reset();this.mode='home';return true;
    }
    if(this.mode==='loading-library')return true;
    if(id==='create'){
      this.reset();this.instructions=[];this.tutorial=newTutorial(`Tutorial ${new Date().toLocaleDateString()}`);this.intent='create';this.mode='save-home';this.cleanSave=true;this.persist();return true;
    }
    if(id==='library'){void this.openLibrary();return true;}
    if(id==='edit-current'){this.reset();this.intent='create';this.mode=this.tutorial.save_position?'setup-new':'save-home';this.cleanSave=true;return true;}
    if(this.mode==='library'){
      if(id==='open-tutorial')void this.openSelected();
      if(id==='library-next')this.libraryIndex=(this.libraryIndex+1)%this.library.length;
      if(id==='library-prev')this.libraryIndex=(this.libraryIndex+this.library.length-1)%this.library.length;
      return true;
    }
    if(id==='setup-ready'){
      if(!this.tutorial.setup.trim()){this.tutorial.setup='Arrange the task relative to the recorded first hand pose. Use any saved reference photo to match the starting layout.';this.changed();}
      this.mode='start';return true;
    }
    if(id==='redo-placement'||id==='move-tutorial'){
      const home=this.saveHomeWorld;this.intent=id==='move-tutorial'?'follow':this.intent;this.reset();this.saveHomeWorld=home;this.mode='start';return true;
    }
    if(id==='adjust-placement'){this.mode='adjust-placement';return true;}
    if(id==='placement-back'){this.mode='placement';return true;}
    if(id.startsWith('shift-')||id==='rotate-placement'){
      const w=this.workspace;if(!w)return true;
      const offsets={'shift-left':[-.05,0],'shift-right':[.05,0],'shift-away':[0,-.05],'shift-near':[0,.05]};
      if(offsets[id]){const [x,z]=offsets[id];w.origin=w.origin.map((v,i)=>v+x*w.x[i]+z*w.z[i]);}
      else {const q=new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),Math.PI/18);w.x=new THREE.Vector3(...w.x).applyQuaternion(q).toArray();w.z=new THREE.Vector3(...w.z).applyQuaternion(q).toArray();}
      this.syncPlacement();return true;
    }
    if(id==='placement-ready'){
      if(this.intent==='follow')this.startLearning();else {
        if(this.saveHomeWorld){this.storeSavePosition(this.saveHomeWorld.map(p=>toLocal(p,this.workspace)));this.saveHomeWorld=null;}
        this.mode=this.tutorial.save_position?'author':'save-home';
      }return true;
    }
    if(id==='set-save-position'){
      this.savePositionCapture.reset();this.pending={kind:'save-position',until:performance.now()+3000};this.note='Put both hands in a comfortable resting spot away from the action. Hold still after the countdown.';return true;
    }
    if(id==='change-save-position'){this.saveReturn='author-options';this.savePositionCapture.reset();this.mode='save-home';return true;}
    if(id==='cancel-save-position'){this.pending=null;this.savePositionCapture.reset();this.mode=this.workspace?'author-options':'setup-new';return true;}
    if(id==='author-options'){this.mode='author-options';return true;}
    if(id==='toggle-clean'){if(!this.tutorial.save_position){this.mode='save-home';return true;}this.cleanSave=!this.cleanSave;return true;}
    if(id==='capture-reference'){this.mode='author';this.action('verify');return true;}
    if(id==='author-back'){this.mode='author';return true;}
    if(id==='review-options'){this.mode='review-options';this.player.paused=true;return true;}
    if(id==='review-back'){this.mode='review-step';return true;}
    if(['review-step','review-options'].includes(this.mode)&&id==='guide-hands'){
      const options=['left','right','both'],step=this.player.step;step.guide_hands=options[(options.indexOf(step.guide_hands)+1)%3];step.reviewed=false;this.changed();return true;
    }
    if(this.mode==='review-options'&&['verify','cue','removeCue'].includes(id)){this.mode='review-step';return false;}
    if(id==='discard-confirm'){this.endpoint.interrupt();this.discardReturn=this.mode;this.mode='confirm-discard';this.narrator?.pause();return true;}
    if(id==='keep-take'){this.mode='capture-paused';return true;}
    if(id==='discard-take'){this.mode='capture-paused';this.action('hand');return true;}
    if(id==='start-follow'){this.intent='follow';this.startLearning();return true;}
    if(id==='learn-options'){this.gatePaused=true;this.followEngine?.pause();this.audioPlayer?.stop();this.mode='learn-options';return true;}
    if(id==='watch-demo'&&this.mode==='learn-options'){this.mode='learn';this.watchOnly=true;this.player.replay();return true;}
    if(id==='learn-back'){this.mode='learn';this.gatePaused=false;this.followEngine?.pause();return true;}
    if(id==='restart-follow'){this.mode='learn';this.watchOnly=false;this.gatePaused=false;this.showStep();return true;}
    if(this.mode==='learn-options'&&['hand','removeCue'].includes(id)){this.mode='learn';return false;}
    if(this.mode==='learn'){
      if(id==='watch-demo'){this.watchOnly=true;this.player.replay();this.audioPlayer?.stop();return true;}
      if(id==='try-follow'){this.watchOnly=false;this.gatePaused=false;this.showStep();return true;}
      if(id==='replay'&&!this.watchOnly){this.gatePaused=!this.gatePaused;this.followEngine?.pause();return true;}
      if(id==='primary'&&(!this.followEngine?.done||this.watchOnly)){this.problem='Reach the movement checkpoint before confirming. Watching a replay does not complete it.';return true;}
    }
    return false;
  }

  hide() {
    this.hideAssistance();this.followEngine?.pause();this.alignment?.reset();this.endpoint?.interrupt();this.savePositionCapture?.reset();this.alignmentResult=null;
    if(this.wasHidden)return;
    this.log('tutorial_interrupted',{mode:this.mode,step_id:this.player?.step?.id||null});
    this.epoch++;this.photoEpoch=(this.photoEpoch||0)+1;this.photoTarget=null;this.currentHands=null;this.wasHidden=true;
    if (this.mode==='capture'){this.mode='capture-paused';this.narrator?.pause();}
    this.audioPlayer?.stop();
    if (this.player) this.player.paused=true;
    if (['record','photo','cue-first','cue-second','save-position'].includes(this.pending?.kind)) this.pending=null;
    super.hide();
    if(this.foldLine)this.foldLine.visible=false;if(this.nextPath)this.nextPath.visible=false;
    if (this.leftGhost) this.leftGhost.ghost.visible=false;
    if (this.photoPanel) this.photoPanel.visible=false;
  }
  endSession() { this.hide();this.log('tutorial_session_end'); this.reset();this.narrator?.disable();this.activeSession=false;this.onChange?.(); }
  exportData() { return {...this.tutorial, events:this.events}; }
  exportDiagnostics(){
    const allowed=['tutorial_session_start','tutorial_session_end','tutorial_interrupted','record_start','record_pause','record_resume','record_tracking','record_saved','record_rejected','step_reviewed','fold_line_saved','photo_saved','photo_rejected','learning_start','step_self_confirmed','playback_interrupted','playback_rate'];
    return {schema:'trail.tutorial.diagnostics.v1',tutorial_id:this.tutorial.id,revision:this.tutorial.revision,
      source:this.tutorial.source,clock:'browser performance.now milliseconds',physical_verification:'not implemented',
      steps:this.tutorial.steps.map(s=>({id:s.id,duration_ms:s.duration_ms,quality:s.quality,reviewed:s.reviewed,has_reference:!!s.reference,has_fold_line:!!s.cues?.length,has_narration:!!s.narration,narration_issue:s.narration_issue||null})),
      events:this.events.filter(e=>allowed.includes(e.event))};
  }
  async capturePhoto() {
    const epoch=this.epoch, step=this.photoTarget||this.tutorial.steps.at(-1);this.photoTarget=null;
    try {
      const reference=validateReference(await this.snapshot());
      if(epoch!==this.epoch||!this.tutorial.steps.includes(step)||!this.activeSession)return;
      step.reference=reference;step.reviewed=false;this.changed(); this.note='Reference photo saved for this step. No AI check was run.';
      this.log('photo_saved',{step_id:step.id,request_age_ms:reference.capture?.request_age_ms??null});
    } catch(e) { if(epoch===this.epoch){this.problem=e.message;this.log('photo_rejected',{reason:e.message});} }
  }
  action(id) {
    this.problem='';
    if(id==='exit'){
      if(this.ux&&(['capture','capture-paused','confirm-exit','confirm-discard'].includes(this.mode)||this.mode==='settings'&&['capture','capture-paused'].includes(this.settingsReturn))){this.narrator?.pause();this.endpoint.interrupt();this.mode='confirm-exit';return;}
      this.exit();return;
    }
    if(id==='exit-discard'&&this.mode==='confirm-exit'){this.narrator?.cancel();this.frames=[];this.exit();return;}
    if(['saving','saving-tutorial'].includes(this.mode)){this.problem='Saving locally. Please wait.';return;}
    if(this.ux&&this.handleUX(id))return;
    if(!this.workspace) {
      if(id==='primary'&&!this.pending) this.countdown(this.mode==='end'?'end':'start');
      return;
    }
    if(this.pending){this.problem='Wait for the countdown.';return;}
    if(id==='cue'&&this.mode==='review-step'){
      this.player.paused=true;this.cueFirst=null;this.pending={kind:'cue-first',until:performance.now()+4000,samples:[]};
      this.note='Hold your right index fingertip on the FIRST end of the guide line. Four seconds.';this.speak(this.note);return;
    }
    if(id==='removeCue'&&this.mode==='review-step'){
      if(this.player.step.narration_issue){this.player.step.narration=null;this.player.step.narration_issue=null;this.player.step.reviewed=false;this.changed();this.note='Failed narration removed. Review the written instruction before approving.';return;}
      this.player.step.cues=[];this.player.step.reviewed=false;this.changed();this.foldLine.visible=false;this.note='Guide line removed. Review the step again.';return;
    }
    if(id==='clear') {
      if(this.mode==='review-step'){this.mode='author';this.player=null;this.photoPanel.visible=false;this.epoch++;return;}
      if(['capture','capture-paused'].includes(this.mode)){this.problem='Save this step before switching modes.';return;}
      if(this.mode==='learn'||this.mode==='finished'){this.mode='author';this.player=null;this.photoPanel.visible=false;return;}
      const readiness=learningReadiness(this.tutorial);if(!readiness.ready){this.problem=readiness.message;return;}
      this.player=new TutorialPlayer(this.tutorial.steps);this.mode='learn';this.watchOnly=false;this.gatePaused=false;this.epoch++;this.log('learning_start',{revision:this.tutorial.revision});this.showStep();return;
    }
    if(this.mode==='author') {
      if(id==='removeCue'){this.cleanSave=!this.cleanSave;this.note=this.cleanSave?'Clean save on: hold the end pose for one second, then return both hands to their starting positions for one second.':'Clean save off. Save step keeps the full take.';this.speak(this.note);return;}
      if(id==='cue'){this.saveTask=this.finishAuthoring();return;}
      if(id==='primary') {
        if(this.tutorial.steps.length>=MAX_STEPS&&this.replaceIndex==null){this.problem='Twelve-step limit reached. Download this tutorial.';return;}
        this.pending={kind:'record',until:performance.now()+3000};
        this.note='Recording both hands in 3 seconds. Get ready at the task.';this.speak(this.note);
      }
      if(id==='verify'&&this.tutorial.steps.length){this.photoTarget=this.tutorial.steps.at(-1);this.pending={kind:'photo',until:performance.now()+3000};this.note='Photo in 3 seconds. Clear your hands and look at the finished result.';this.speak(this.note);}
      if(id==='hand'&&this.tutorial.steps.length){this.player=new TutorialPlayer(this.tutorial.steps);this.mode='review-step';this.showStep();return;}
      if(id==='replay'&&this.tutorial.steps.length){this.player=new TutorialPlayer(this.tutorial.steps);this.player.index=this.tutorial.steps.length-1;this.mode='review-step';this.showStep();}
      return;
    }
    if(this.mode==='review-step') {
      if(id==='primary'){
        if(this.player.step.narration_issue){this.problem='Narration failed. Re-record this step or choose Use text instruction.';return;}
        const ready=guidanceReadiness(this.player.step);
        if(!ready.ready){this.problem=ready.message;return;}
        this.player.step.reviewed=true;this.log('step_reviewed',{step_id:this.player.step.id});this.changed();
        if(this.player.index<this.tutorial.steps.length-1){this.player.index++;this.player.replay();this.showStep();}
        else if(this.ux)this.saveTask=this.finishAuthoring();
        else {this.mode='author';this.player=null;this.photoPanel.visible=false;this.note='Recordings reviewed. Finish the tutorial to save it for learning.';}
      }
      else if(id==='replay')this.player.replay();
      else if(id==='verify'){this.photoTarget=this.player.step;this.player.paused=true;this.pending={kind:'photo',until:performance.now()+3000};this.note='Photo in 3 seconds. Clear your hands and look at the result.';this.speak(this.note);}
      else if(id==='hand'){this.replaceIndex=this.player.index;this.mode='author';this.player=null;this.photoPanel.visible=false;this.action('primary');}
      return;
    }
    if(this.mode==='capture'||this.mode==='capture-paused') {
      if(id==='hand'){this.takeGeneration++;this.narrator?.cancel();this.frames=[];this.replaceIndex=null;this.mode='author';this.note='Unfinished take discarded. Saved steps are unchanged.';return;}
      if(id==='replay') {
        if(this.mode==='capture'){this.endpoint.interrupt();this.mode='capture-paused';this.narrator?.pause();this.log('record_pause',{reason:'user'});this.notify('pause','Recording paused');this.note='Paused. Return both tracked wrists to their recorded positions before resuming.';return;}
        const last=this.frames.at(-1);
        for(const side of ['left','right']) if(tracked(last?.[side]) &&
          (!tracked(this.currentHands?.[side]) || distance(last[side][0].p,this.currentHands[side][0].p)>.12)) {
          this.problem='Return tracked hands near their paused ghosts before resuming (12 cm).';return;
        }
        this.lastRecordTick=this.lastTick;this.mode='capture';this.narrator?.resume();this.log('record_resume');this.notify('record','Recording resumed');
      }
      if(id==='primary'||id==='removeCue') {
        try {
          const index=this.replaceIndex??this.tutorial.steps.length;
          const step=prepareStep(this.frames,this.tutorial.steps[index]?.instruction || this.instructions?.[index] || `Step ${index+1}`);
          const rawCutoff=this.cleanSave&&id!=='removeCue'?this.endpoint.cutoff(this.recordElapsed):null;
          if(this.cleanSave&&id!=='removeCue'&&rawCutoff===null)throw Error('Hold the finished pose away from the save zone for one second, or choose Save full take');
          const cutoff=rawCutoff===null?null:rawCutoff-this.frames[0].t;
          const trimmed=cutoff===null?step:trimStep(step,0,cutoff);
          const total=this.tutorial.steps.reduce((n,s,i)=>n+(i===this.replaceIndex?0:s.frames.length),trimmed.frames.length);
          if(total>MAX_TOTAL_FRAMES)throw Error('Tutorial is full. Save/export it and start a new tutorial.');
          if(this.narrator?.take)this.saveTask=this.finishNarratedStep(step,index,cutoff);else this.commitStep(trimmed,index);
        } catch(e) {this.mode='capture-paused';this.narrator?.pause();this.log('record_rejected',{reason:e.message});this.problem=e.message+' Resume recording to collect more motion.';}
      }
      return;
    }
    if(this.mode==='learn') {
      if(id==='removeCue'){this.alignmentEnabled=!this.alignmentEnabled;this.alignment.reset();this.alignmentResult=null;this.hideAssistance();return;}
      if(id==='cue'){const rates=[.5,.75,1];this.player.setRate(rates[(rates.indexOf(this.player.rate)+1)%rates.length]);this.log('playback_rate',{rate:this.player.rate});if(!this.player.step.narration)this.speak(`Ghost speed ${this.player.rate} times.`);}
      if(id==='primary') {
        this.log('step_self_confirmed',{step_id:this.player.step.id,kind:'learner-self-confirmed'});
        const done=this.player.confirm();
        if(done){this.mode='finished';this.note='All steps self-confirmed. Task correctness has not been automatically checked.';this.speak(this.note);}
        else this.showStep();
      }
      if(id==='replay'){this.player.paused=!this.player.paused;}
      if(id==='hand'){this.watchOnly=false;this.gatePaused=false;this.player.previous();this.showStep();}
      if(id==='verify')this.player.replay();
    }
  }
  showStep(preserve=false) {
    this.nextPathKey=null;
    this.alignment.reset();this.alignmentResult=null;
    const step=this.player.step;
    if(this.ux&&this.mode==='learn'&&!preserve){this.followEngine=new TutorialFollower(step);this.player.time=0;this.player.paused=true;}
    this.note=step.instruction || `Step ${this.player.index+1}`;if(!step.narration)this.speak(this.note);else globalThis.speechSynthesis?.cancel();
    this.photoPanel.visible=false;
    const epoch=this.photoEpoch=(this.photoEpoch||0)+1;
    if(step.reference?.image) {
      const img=new Image();img.onload=()=>{
        if(epoch!==this.photoEpoch||this.player?.step!==step||!['learn','review-step'].includes(this.mode))return;
        const c=this.photoCanvas.getContext('2d');c.fillStyle='#10231f';c.fillRect(0,0,640,480);
        const scale=Math.min(640/img.width,480/img.height),w=img.width*scale,h=img.height*scale;
        c.drawImage(img,(640-w)/2,(480-h)/2,w,h);this.photoTexture.needsUpdate=true;this.photoPanel.visible=true;
      };img.src=step.reference.image;
    }
  }
  storeSavePosition(points){
    this.tutorial.save_position={space:'workspace',left:[...points[0]],right:[...points[1]]};
    this.cleanSave=true;this.changed();this.onChange?.();this.note='Save position set for this tutorial. Return here after each action.';
  }
  tickSavePosition(frame,session,reference,time){
    this.hideAssistance();this.ghost.visible=false;this.leftGhost.ghost.visible=false;
    if(session.visibilityState!=='visible'){this.hide();return;}
    const hands={};for(const side of ['left','right']){this.hand=side;const joints=this.sample(frame,session,reference);hands[side]=this.workspace?this.localJoints(joints):joints;}this.hand='right';
    if(!this.pending)return;
    if(performance.now()<this.pending.until)return;
    this.note='Hold both palms still for one second. This spot will save every recording.';
    const points=this.savePositionCapture.update(hands,time);if(!points)return;
    this.pending=null;this.problem=null;
    if(this.workspace){this.storeSavePosition(points);this.mode=this.saveReturn||'author';this.saveReturn=null;}
    else {this.saveHomeWorld=points;this.cleanSave=true;this.mode='setup-new';this.note='Save position chosen. Now place the workspace so it can be stored with your tutorial.';}
    this.speak(this.note);
  }
  tick(frame,session,reference,time) {
    if(this.mode==='save-home'){this.tickSavePosition(frame,session,reference,time);return;}

    if(!this.workspace){
      if(this.ux&&!['start','end'].includes(this.mode)){this.hideAssistance();this.ghost.visible=false;this.leftGhost.ghost.visible=false;return;}
      if(session.visibilityState!=='visible'){this.hide();return;}
      this.lastTick=time;this.hand='right';this.joints=this.sample(frame,session,reference);
      const now=performance.now();
      if(this.pending&&now>this.pending.until-400){
        if(this.joints?.[9]?.p)this.pending.samples.push([...this.joints[9].p]);else this.pending.samples=[];
      }
      if(this.pending&&now>=this.pending.until){
        const {kind,samples}=this.pending;this.pending=null;
        const tip=samples.length>=8?samples[0].map((_,i)=>samples.reduce((sum,p)=>sum+p[i],0)/samples.length):null;
        if(!tip||samples.some(p=>distance(p,tip)>.025)){this.problem='Hold the right index fingertip still and visible, then mark again.';return;}
        try {
          if(kind==='start'){this.start=tip;this.mode='end';this.markers[0].position.fromArray(tip);this.markers[0].visible=true;this.speak('Left point marked. Mark the heading point.');}
          else {this.end=tip;this.setWorkspace();this.markers[1].position.fromArray(tip);this.markers[1].visible=true;this.speak('Workspace ready. Record a step or start learning your saved tutorial.');}
        } catch(e){this.problem=e.message;}
      }
      return;
    }
    const elapsed=time-(this.lastTick??time);
    if(!Number.isFinite(time)||elapsed<0)return;
    const dt=Math.min(100,Math.max(0,elapsed));this.lastTick=time;
    if(elapsed>250&&this.player&&!this.player.paused){this.player.paused=true;this.log('playback_interrupted',{gap_ms:elapsed});}
    if(session.visibilityState!=='visible'){this.hide();return;}
    if(this.wasHidden){this.wasHidden=false;if(this.player&&['learn','review-step'].includes(this.mode))this.showStep(true);}
    this.currentHands={};
    for(const side of ['left','right']){this.hand=side;this.currentHands[side]=this.localJoints(this.sample(frame,session,reference));}
    this.hand='right';this.joints=this.currentHands.right;
    const now=performance.now();
    if(this.pending?.kind.startsWith('cue-')){
      if(now>this.pending.until-400){const p=this.currentHands.right?.[9]?.p;if(p)this.pending.samples.push([...p]);else this.pending.samples=[];}
      if(now>=this.pending.until){
        const {kind,samples}=this.pending;this.pending=null;
        const point=samples.length>=8?samples[0].map((_,i)=>samples.reduce((sum,p)=>sum+p[i],0)/samples.length):null;
        if(!point||samples.some(p=>distance(p,point)>.025)){this.problem='Hold the right fingertip still and visible on the table. Mark the line again.';return;}
        if(kind==='cue-first'){
          this.cueFirst=point;this.pending={kind:'cue-second',until:now+4000,samples:[]};
          this.note='Now hold your right index fingertip on the OTHER end of the guide line. Four seconds.';this.speak(this.note);
        }else{
          try{this.player.step.cues=validateCues([{kind:'fold-line',source:'expert-marked',points:[this.cueFirst,point]}]);
            this.player.step.reviewed=false;this.changed();this.note='Expert guide line saved. Review and approve this step.';this.speak(this.note);
            this.log('fold_line_saved',{step_id:this.player.step.id});
          }catch(e){this.problem=e.message;}
        }
      }
    }
    if(this.pending&&!this.pending.kind.startsWith('cue-')&&now>=this.pending.until){
      const kind=this.pending.kind;this.pending=null;
      if(kind==='record'){
        if(!tracked(this.currentHands.left)&&!tracked(this.currentHands.right)){this.problem='No hands tracked. Show your hands and start again.';return;}
        this.endpoint.reset(this.tutorial.save_position?['left','right'].map(side=>this.tutorial.save_position[side]):null);this.mode='capture';this.frames=[];this.recordElapsed=0;this.lastRecordTick=time;this.lastSample=-Infinity;
        this.lastTrackingState=null;this.log('record_start');this.notify('record','Recording started');globalThis.speechSynthesis?.cancel();
        this.takeNarrationIssue=null;
        try{if(!this.narrator?.begin())this.speak('Recording started.');}catch(e){this.takeNarrationIssue=e.message.slice(0,240);this.problem=`Narration could not start: ${e.message}`;this.mode='capture-paused';}
      }
      if(kind==='photo')void this.capturePhoto();
    }
    if(this.mode==='capture') {
      const tracking={left:tracked(this.currentHands.left),right:tracked(this.currentHands.right)},trackingKey=JSON.stringify(tracking);
      if(trackingKey!==this.lastTrackingState){this.lastTrackingState=trackingKey;this.log('record_tracking',{...tracking,active_time_ms:this.recordElapsed});}
      if(time-this.lastRecordTick>250){this.endpoint.interrupt();this.mode='capture-paused';this.narrator?.invalidate('Motion updates stalled; narration alignment is unknown.');this.log('record_pause',{reason:'tracking-update-gap',gap_ms:time-this.lastRecordTick});this.note='Tracking update interrupted. Recording paused; resume when ready.';}
      else {
        this.recordElapsed+=Math.max(0,time-this.lastRecordTick);
        if(this.recordElapsed-this.lastSample>=33){this.frames.push({t:this.recordElapsed,...this.currentHands});this.lastSample=this.recordElapsed;
          if(this.cleanSave&&this.endpoint.update(this.currentHands,this.recordElapsed)!==null)this.action('primary');}
        if(this.mode==='capture'&&(this.frames.length>=MAX_FRAMES||this.recordElapsed>=180000)){this.mode='capture-paused';this.narrator?.pause();this.note='Three-minute limit. Save this step.';}
      }
      this.lastRecordTick=time;
    }
    this.hideAssistance();
    this.ghost.visible=false;this.leftGhost.ghost.visible=false;this.live.visible=false;this.path.visible=false;this.arrow.visible=false;
    let sample=null;
    if(this.mode==='capture-paused')sample=this.frames.at(-1);
    if(this.ux&&this.mode==='learn'&&!this.watchOnly){
      if(!this.gatePaused)this.followEngine.update(this.currentHands,time);
      if(this.followEngine.done&&this.problem?.startsWith('Reach the movement checkpoint'))this.problem=null;
      sample=this.followEngine.target;this.player.time=sample?.t||0;this.player.paused=true;
    }else if(['learn','review-step','review-options','trim'].includes(this.mode)&&this.player)sample=this.player.tick(dt);
    if(['placement','adjust-placement'].includes(this.mode))sample=this.tutorial.steps[0]?.frames[0];
    this.nextPath.visible=false;
    if(this.ux&&this.mode==='learn'&&!this.watchOnly&&!this.gatePaused&&!this.pending&&this.followEngine&&!['tracking','reference-gap'].includes(this.followEngine.state)&&!this.followEngine?.done){
      const follower=this.followEngine,next=follower.gates[follower.index+1],points=[];
      for(const side of follower.hands){const a=follower.target?.[side]?.[0]?.p,b=next?.[side]?.[0]?.p;if(a&&b)points.push(new THREE.Vector3(...a),new THREE.Vector3(...b));}
      const key=`${this.player.step.id}:${follower.index}`;
      if(this.nextPathKey!==key){this.nextPath.geometry.dispose();this.nextPath.geometry=new THREE.BufferGeometry().setFromPoints(points);this.nextPath.computeLineDistances();this.nextPathKey=key;}
      this.nextPath.visible=points.length>0;
    }
    const savedFlash=this.feedback.visible(now)?.kind==='saved';
    const ghostColor=savedFlash?0xa5dbb5:0x7cdadd;
    if(sample&&!this.pending){this.drawHand(sample.right,ghostColor);this.leftGhost.drawHand(sample.left,ghostColor);}
    if(this.ux&&this.mode==='learn'){
      const state=this.gatePaused?'paused':this.followEngine?.state;
      if(state!==this.feedbackState){if(state==='checkpoint')this.notify('checkpoint','Movement reached');if(state==='tracking')this.notify('tracking','Show your hands');this.feedbackState=state;}
    }
    if(savedFlash&&this.mode!=='learn')for(const side of ['left','right'])this.liveHands[side].drawHand(this.currentHands[side],0xa5dbb5);

    const saveHome=this.tutorial.save_position?['left','right'].map(side=>this.tutorial.save_position[side]):this.endpoint.home;
    if(['author','capture','capture-paused','saved'].includes(this.mode)&&this.cleanSave&&saveHome){
      ['left','right'].forEach((side,i)=>{const zone=this.zones[side];zone.visible=true;zone.position.fromArray(saveHome[i]);zone.scale.setScalar(2/3);zone.children[0].material.color.setHex(0xc4d8df);});
    }
    if(this.mode==='learn'&&this.alignmentEnabled&&!this.pending){
      const guided=this.ux&&!this.watchOnly;
      this.alignment.radius=guided?this.followEngine.radius:.12;this.alignment.hysteresis=guided?0:.03;this.alignment.holdMs=guided?0:300;
      this.alignmentResult=this.alignment.update(this.currentHands,sample,time);
      for(const side of ['left','right']){
        const result=this.alignmentResult[side],color=result.state==='inside'?0x55ffaa:result.state==='unknown'?0xd4dde4:0xffca75;
        this.liveHands[side].drawHand(this.currentHands[side],color);
        const zone=this.zones[side];zone.scale.setScalar(this.alignment.radius/.12);zone.visible=!!result.target;
        if(zone.visible){zone.position.fromArray(result.target);zone.children[0].material.color.setHex(color);}
      }
    }else {this.alignment.reset();this.alignmentResult=null;}
    this.audioPlayer?.sync(this.player,['learn','review-step'].includes(this.mode)&&!this.pending&&(!this.ux||this.mode!=='learn'||this.watchOnly));
    this.foldLine.visible=false;
    const cue=this.player?.step?.cues?.[0];
    if(cue&&['learn','review-step'].includes(this.mode)&&!this.pending){
      const [a,b]=cue.points.map(p=>new THREE.Vector3(...p)),delta=b.clone().sub(a);
      this.foldEnds[0].position.copy(a);this.foldEnds[1].position.copy(b);
      this.foldSegment.position.copy(a).add(b).multiplyScalar(.5);this.foldSegment.scale.y=delta.length();
      this.foldSegment.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),delta.normalize());this.foldLine.visible=true;
    }
    if(!['learn','review-step'].includes(this.mode))this.photoPanel.visible=false;
  }
  draw(ctx,time,hover) {
    if(this.ux)return drawTutorialUI(this,ctx,hover);
    const labels={cue:this.mode==='author'?'Finish tutorial':'—',removeCue:this.mode==='author'?`Clean save ${this.cleanSave?'ON':'OFF'}`:'—',primary:'Start step · 3s',replay:'Review last step',clear:'Start learning',hand:'Review all steps',verify:'Save photo · 3s',exit:'Exit AR'};
    let title='Record a tutorial step',text=this.note;
    if(!this.workspace){title=this.mode==='end'?'Mark RIGHT table point':'Mark LEFT table point';text='Use the same two table points for expert and learner, 20–120 cm apart. Keep the task in the same starting layout.';labels.primary='Mark point · 4s';labels.replay=labels.clear=labels.verify=labels.hand='—';}
    if(this.mode==='capture'||this.mode==='capture-paused'){
      title=this.mode==='capture'?'Recording BOTH hands':'Recording paused';labels.primary=this.cleanSave?'Save at last hold':'Save step';labels.removeCue=this.cleanSave?'Save full take':'—';labels.replay=this.mode==='capture'?'Pause recording':'Resume recording';labels.hand='Discard this take';
      text=this.cleanSave?`${(this.recordElapsed/1000).toFixed(1)}s · ${this.endpoint.candidate!==null?'Endpoint held. Return both hands to their starting positions for 1 second to save.':'Perform the action, then hold BOTH hands still at the endpoint for 1 second. Return to start to save.'}`:`${(this.recordElapsed/1000).toFixed(1)} seconds recorded. Finish this action, then Save step. Missing hands remain missing in playback.`;
    }
    if(this.mode==='review-step'){title=`Review step ${this.player.index+1}/${this.tutorial.steps.length}`;labels.primary='Approve / next';labels.replay='Replay step';labels.hand='Re-record step';labels.verify='Save photo · 3s';labels.clear='Back to authoring';labels.cue='Mark guide line';labels.removeCue=this.player.step.narration_issue?'Use text instruction':'Clear guide line';text=this.player.step.narration_issue?'Narration failed. Re-record or choose Use text instruction, then review.':'Review the motion, narration and tracking gaps. This replay does not score the learner.';}
    if(this.mode==='learn'){
      title=`Step ${this.player.index+1} of ${this.tutorial.steps.length}`;
      labels.primary='I finished · next';labels.replay=this.player.paused?'Resume ghost':'Pause ghost';labels.hand='Previous step';labels.verify='Replay from start';labels.clear='Back to authoring';
      labels.cue=`Speed ${this.player.rate}×`;labels.removeCue=`Palm zones ${this.alignmentEnabled?'ON':'OFF'}`;
      text=`${this.player.step.instruction}. Watch, pause, and repeat at your own pace. Next means you confirmed the step; it is not an AI verdict.`;
    }
    if(this.mode==='finished'){title='Tutorial self-confirmed';labels.clear='Back to authoring';labels.primary=labels.replay=labels.verify=labels.hand='—';}
    if(['saving','saving-tutorial'].includes(this.mode)){title='Saving locally…';text='Keep this page open until storage finishes.';for(const key of Object.keys(labels))if(key!=='exit')labels[key]='—';}
    if(this.pending){title=`${this.pending.kind==='photo'?'PHOTO':this.pending.kind==='record'?'RECORD':this.pending.kind.startsWith('cue-')?'FOLD LINE':'MARK'} IN ${Math.ceil((this.pending.until-performance.now())/1000)}s`;text=this.note;}
    if(this.problem)text=this.problem;
    ctx.clearRect(0,0,1080,560);ctx.fillStyle='#10231f';ctx.fillRect(0,0,1080,560);
    ctx.fillStyle='#9cf0d3';ctx.font='600 23px system-ui';ctx.fillText(this.tutorial.source==='synthetic-fixture'?'TRAIL · SYNTHETIC DEMO · NOT A HUMAN RECORDING':'TRAIL · TWO-HAND TUTORIAL · LOCAL / NO AI CHECKS',26,39);
    ctx.font='700 43px system-ui';ctx.fillText(title,26,99);ctx.fillStyle='#fff';ctx.font='28px system-ui';this.text(ctx,text,26,147,1020,36,4);
    ctx.fillStyle='#b5ccc4';ctx.font='22px system-ui';ctx.fillText(this.savedMessage,26,305);
    const quality=this.player?.step?.quality;
    const alignmentText=this.mode==='learn'&&this.alignmentEnabled?(this.alignmentResult?.matched?'Palms in green zones · position only; task unverified':`Palm zones: L ${this.alignmentResult?.left.state||'unknown'} / R ${this.alignmentResult?.right.state||'unknown'} · pause ghost to line up`):null;
    ctx.fillText(alignmentText || (quality?`Recorded tracking coverage: left ${Math.round(quality.left_tracked_fraction*100)}% · right ${Math.round(quality.right_tracked_fraction*100)}%`:
      `Live tracking: left ${tracked(this.currentHands?.left)?'visible':'missing'} · right ${tracked(this.currentHands?.right)?'visible':'missing'}`),26,341);
    ctx.font='20px system-ui';ctx.fillText(this.narrator?.take?`${this.mode==='capture'?'MIC RECORDING':'MIC PAUSED'} · audio stays local · task correctness unverified`:this.player?.step?.narration?'Recorded narration · browser timing is approximate · task correctness unverified':'Ghost = demonstration. Task correctness is unverified. Camera photo is optional.',26,374);
    for(const b of TUTORIAL_BUTTONS){ctx.fillStyle=hover===b.id?'#8edbc2':'#294d43';ctx.fillRect(b.x,b.y,b.w,b.h);ctx.fillStyle=hover===b.id?'#10231f':'#fff';ctx.textAlign='center';ctx.font='600 22px system-ui';ctx.fillText(labels[b.id],b.x+b.w/2,b.y+b.h/2+9);}
    ctx.textAlign='left';return `${title}. ${text}`;
  }
}
