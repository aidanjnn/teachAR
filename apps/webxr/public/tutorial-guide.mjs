import {LandmarkHold,nearestPracticePose,validateLandmarks} from './workspace-assist.mjs';
import * as THREE from '/vendor/three.module.js';
import {HandGuide} from '/hand-guide.mjs';
import {tracked, distance, toLocal} from '/motion-core.mjs';
import {newTutorial, prepareStep, TutorialPlayer, MAX_FRAMES, MAX_STEPS, MAX_TOTAL_FRAMES, MAX_FILE_BYTES, validateTutorial, validateReference, learningReadiness, validateCues,finishTutorial,trimStep} from '/tutorial-core.mjs';
import {palm,PalmAlignment,CaptureEndpoint,SavePositionCapture} from '/tutorial-assist.mjs';
import {HoldSegmenter,filterLibrary} from './fluid-capture.mjs';
import {TutorialPractice,guidanceReadiness} from '/tutorial-follow.mjs';
import {drawTutorialUI} from '/tutorial-ui.mjs';
import {preferences,applyAppearance,THEMES} from '/tutorial-design.mjs';
import {TutorialFeedback} from '/tutorial-feedback.mjs';
import {polishStep,generateInstructionVoice,polishTutorialInstructions} from './instruction-voice.mjs';
import {saveTutorial, loadTutorial, draftVersion, listTutorials, findTutorial, deleteTutorial} from '/tutorial-store.mjs';

export const TUTORIAL_BUTTONS=[
  ...['primary','replay','clear','cue'].map((id,i)=>({id,x:24+i*262,y:396,w:246,h:68})),
  ...['hand','verify','removeCue','exit'].map((id,i)=>({id,x:24+i*262,y:480,w:246,h:58}))
];
export function tutorialButton(u,v,buttons=TUTORIAL_BUTTONS){const x=u*1080,y=(1-v)*560;return buttons.find(b=>x>=b.x&&x<=b.x+b.w&&y>=b.y&&y<=b.y+b.h)?.id||null;}
export class TutorialGuide extends HandGuide {
  log(event,extra={}){super.log(event,{tutorial_id:this.tutorial?.id??null,revision:this.tutorial?.revision??null,...extra});}
  constructor(options) {
    super(options);
    this.followStyle='loop';this.landmarkHold=new LandmarkHold();
    this.stepByStep=false;this.captureHands='both';this.segmenter=new HoldSegmenter();this.segmentJobs=new Set();this.fluidCapture=false;this.libraryQuery='';this.libraryFilter='all';this.media=options.media;this.snapshot = options.snapshot;this.writeTutorial=options.writeTutorial||saveTutorial;
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
        this.savedMessage=`${this.tutorial.steps.length} steps available in Library.`;
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
    if(['saving-tutorial','polishing-tutorial'].includes(this.mode))return;
    const draft=this.tutorial,revision=draft.revision,returnMode=this.mode,generation=this.takeGeneration;
    try{
      const finished=finishTutorial(draft);
      this.epoch++;this.mode='saving-tutorial';this.audioPlayer?.stop();
      await this.persist(finished);
      // Keep the durable result after an exit, but never change a new session's UI.
      if(this.tutorial!==draft||this.tutorial.revision!==revision)return;
      this.tutorial=finished;
      this.autoPolishSummary='';
      if(this.takeGeneration===generation&&finished.steps.some(s=>s.narration&&!s.narration_issue&&!s.instruction_voice)){
        const controller=new AbortController();this.autoPolishController=controller;this.mode='polishing-tutorial';
        const result=await polishTutorialInstructions(finished,{signal:controller.signal,services:this.instructionServices,wait:this.instructionWait,onProgress:p=>{this.autoPolishProgress=p;this.onChange?.();}});
        if(controller.signal.aborted||this.takeGeneration!==generation||this.tutorial!==finished)return;
        this.autoPolishController=null;this.autoPolishProgress=null;
        this.autoPolishSummary=`${result.prepared} of ${result.total} instructions polished.${result.prepared<result.total?' Remaining steps use their original narration.':''}`;
        this.autoPolishIssues=result.issues;
        if(result.prepared){this.tutorial=validateTutorial(result.tutorial);await this.persist(this.tutorial);}
      }
      if(this.takeGeneration===generation){
        this.mode=this.homeAfterSave?'home':this.ux?'saved':'author';this.homeAfterSave=false;this.player=null;this.problem='';
        if(this.photoPanel)this.photoPanel.visible=false;
        this.note='Tutorial saved on this device. Reset the task and start learning.';this.speak(this.note);
      }
      this.onChange?.();
    }catch(e){
      if(this.takeGeneration===generation){this.autoPolishController=null;this.autoPolishProgress=null;this.mode=returnMode;if(returnMode==='review-step'){const index=this.player?.index||0;this.player=new TutorialPlayer(this.tutorial.steps);this.player.index=index;this.player.paused=true;}this.problem=this.saveStatus==='failed'?this.savedMessage:e.message;this.onChange?.();}
    }
  }
  commitStep(step,index){
    if(!step.guide_hands||step.guide_hands==='recorded')step.guide_hands=this.captureHands;
    if(this.takeNarrationIssue&&!step.narration_issue)step.narration_issue=this.takeNarrationIssue;
    if(index===this.tutorial.steps.length)this.tutorial.steps.push(step);else this.tutorial.steps[index]=step;
    this.replaceIndex=null;this.tutorial.calibration_span_m=this.workspace.span;
    this.mode='author';this.frames=[];
    this.changed().then(()=>this.log('record_saved',{step_id:step.id,duration_ms:step.duration_ms,quality:step.quality}),()=>{});
    if(this.homeAfterSave){this.homeAfterSave=false;this.mode='home';return;}
    if(this.ux){this.player=new TutorialPlayer(this.tutorial.steps);this.player.index=index;this.mode='review-step';this.showStep();}
    this.note=step.narration_issue?'Motion kept for review; narration failed. Re-record or remove narration during review.':'Recording kept. Check the selected hands and preview the movement before saving.';this.speak(this.note);
  }
  sealFluidSegment(final=false,acceptance=final?'finish':'hold',cutoff=null){
    if(this.segmentJobs.size>=3){this.mode='capture-paused';this.narrator?.pause();this.problem='Saving is catching up. Resume after the saved cue.';return false;}
    let step;
    try{
      step=prepareStep(this.frames,`Step ${this.tutorial.steps.length+1}`);
      if(this.tutorial.steps.length>=MAX_STEPS||this.tutorial.steps.reduce((n,s)=>n+s.frames.length,0)+step.frames.length>MAX_TOTAL_FRAMES)throw Error('Tutorial limit reached. Finish this tutorial.');
    }catch(e){this.mode='capture-paused';this.narrator?.pause();this.problem=e.message;return false;}
    const rawStep=step;const trimEnd=cutoff===null?null:Math.min(step.duration_ms,cutoff-this.frames[0].t);
    if(trimEnd!==null&&trimEnd>=1000&&trimEnd<step.duration_ms)step=trimStep(step,0,trimEnd);
    step.guide_hands=this.captureHands;const guidance=guidanceReadiness(step);step.acceptance=guidance.ready?acceptance:null;if(!guidance.ready)this.problem=guidance.message;this.tutorial.steps.push(step);this.tutorial.calibration_span_m=this.workspace.span;
    const generation=this.takeGeneration,tutorial=this.tutorial;
    const hasAudio=!!this.narrator?.take;
    if(this.takeNarrationIssue){step.narration_issue=this.takeNarrationIssue;step.acceptance=null;}
    if(hasAudio)step.narration_issue='Narration is still finishing. Review this step if capture was interrupted.';
    const saveFailed=()=>{
      if(tutorial!==this.tutorial)return;
      // Accepted media can fail after another take starts in the same tutorial.
      const recording=['capture','capture-paused'].includes(this.mode)||this.pending?.kind==='record';
      if(generation!==this.takeGeneration&&!recording)return;
      if(this.pending?.kind==='record')this.pending=null;
      if(this.mode==='capture')this.mode='capture-paused';
      this.narrator?.pause();this.segmenter.interrupt();
      this.problem='Step is in memory but was not saved. Retry or export before leaving.';
    };
    const initialSave=this.changed().then(()=>true,()=>{saveFailed();return false;});
    const audio=hasAudio?this.narrator.finish(rawStep.duration_ms):Promise.resolve(null);
    this.frames=[];this.recordElapsed=0;this.lastSample=-Infinity;this.lastRecordTick=this.lastTick;this.segmenter.reset(this.captureHands);
    this.takeNarrationIssue=null;
    if(this.stepByStep&&!final){this.mode='saving-step';this.returnSince=null;}
    if(!final&&!this.stepByStep){try{this.narrator?.begin();if(this.mode==='capture-paused')this.narrator?.pause();}catch(e){this.takeNarrationIssue=e.message.slice(0,240);this.problem=e.message;this.mode='capture-paused';}}
    const job=(async()=>{
      let narration=null,issue=hasAudio?null:step.narration_issue||null;
      try{narration=await audio;}catch(e){issue=e.message;}
      // Accepted segments outlive the next unfinished take and XR session.
      // A replaced tutorial/step must never receive a late result.
      if(tutorial!==this.tutorial||!tutorial.steps.includes(step))return;
      if(narration&&trimEnd!==null&&trimEnd>=1000&&trimEnd<rawStep.duration_ms)narration=trimStep({...rawStep,narration},0,trimEnd).narration;
      step.narration=narration;step.narration_issue=issue;if(issue)step.acceptance=null;
      try{await initialSave;if(tutorial!==this.tutorial||!tutorial.steps.includes(step))return;if(hasAudio)await this.changed();}catch{saveFailed();}
      if(this.stepByStep&&!final&&generation===this.takeGeneration&&this.activeSession&&this.mode==='saving-step'){this.mode=this.homeAfterSave?'home':'step-ready';this.homeAfterSave=false;this.note='Step saved. Return to the rest rings for the next recording.';this.onChange?.();}
    })();this.segmentJobs.add(job);job.finally(()=>this.segmentJobs.delete(job));return true;
  }
  saveCurrentStep(cutoff){
    if(!['capture','capture-paused'].includes(this.mode))return false;
    if(this.stepByStep){return this.sealFluidSegment(false,'finish',cutoff??this.segmenter.cutoff(this.recordElapsed)??this.endpoint.cutoff(this.recordElapsed));}
    if(this.fluidCapture)return this.sealFluidSegment(false,'finish',cutoff??this.segmenter.cutoff(this.recordElapsed));
    this.action('primary');return !this.problem;
  }
  tickNextStep(time){
    if(this.mode!=='step-ready'||this.saveStatus==='failed'||this.segmentJobs.size||this.placementLost||this.voice?.busy)return;
    const sides=this.captureHands==='both'?['left','right']:[this.captureHands];
    const near=this.tutorial.save_position&&sides.every(side=>{const p=palm(this.currentHands?.[side]);return p&&distance(p,this.tutorial.save_position[side])<.09;});
    if(!near||this.nextTick!=null&&(time-this.nextTick>200||time<=this.nextTick))this.returnSince=null;
    this.nextTick=time;if(!near)return;this.returnSince??=time;
    if(time-this.returnSince>=500){this.mode='author';this.returnSince=null;this.action('primary');}
  }
  finishFluid(){
    if(!['capture','capture-paused'].includes(this.mode))return;
    // A still tail after the last saved segment is not another step.
    if(this.segmenter.armed||!this.tutorial.steps.length){if(!this.sealFluidSegment(true))return;}
    else {this.frames=[];this.narrator?.cancel();}
    this.mode='saving';const generation=this.takeGeneration;
    this.saveTask=(async()=>{await Promise.all([...this.segmentJobs]);if(generation!==this.takeGeneration)return;if(this.saveStatus==='failed'){this.mode='author';return;}this.mode='author';await this.finishAuthoring();})();
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
    const revision=this.tutorial.revision;
    await Promise.all([...this.segmentJobs]);
    if(this.activeSession)throw Error('Exit AR before replacing or editing the tutorial.');
    if(data.id===this.tutorial.id&&revision!==this.tutorial.revision)throw Error('Narration finished while editing. Try this edit again.');
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
    this.leftGhost.attach(scene);this.enableHologram();this.leftGhost.enableHologram(false,'left');
    this.liveHands={};this.zones={};
    for(const side of ['left','right']){
      const live=new HandGuide({speak:()=>{},verify:()=>{},exit:()=>{}});live.attach(scene);live.enableHologram(true,side);this.liveHands[side]=live;
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
    this.cancelPolish();this.autoPolishController?.abort();this.autoPolishController=null;this.autoPolishProgress=null;
    this.landmarkLabels=null;this.placementSuggestion=null;this.landmarkHold?.reset();
    this.segmenter?.reset();this.returnSince=null;this.placementLost=false;this.homeAfterSave=false;
    if(this.mediaPending){this.media?.cancel();this.mediaPending=false;}
    this.takeGeneration=(this.takeGeneration||0)+1;this.narrator?.cancel();this.audioPlayer?.stop();
    this.saveHomeWorld=null;this.saveReturn=null;this.savePositionCapture?.reset();
    this.takeNarrationIssue=null;this.alignment?.reset();this.endpoint?.reset();this.alignmentResult=null;this.hideAssistance();
    super.reset();
    this.feedback?.clear();this.feedbackState=null;this.practice=null;this.followEngine=null;this.watchOnly=false;this.gatePaused=false;this.wasHidden=false;
    this.epoch = (this.epoch || 0) + 1; this.player = null; this.replaceIndex=null;this.photoTarget=null;this.photoEpoch=(this.photoEpoch||0)+1;
    if (this.leftGhost) this.leftGhost.ghost.visible = false;
    if (this.photoPanel) this.photoPanel.visible = false;
    if(this.foldLine)this.foldLine.visible=false;if(this.nextPath)this.nextPath.visible=false;
  }
  hideAssistance(){
    for(const h of Object.values(this.liveHands||{}))h.ghost.visible=false;
    for(const z of Object.values(this.zones||{}))z.visible=false;
  }
  trackingOriginChanged(){
    const mode=this.mode;
    if(this.hasUnfinishedTake()){this.narrator?.pause();this.mode='capture-paused';this.pending=null;this.placementLost=true;this.problem='Tracking space changed. Save this take or discard it, then place the workspace again.';this.hideAssistance();return;}
    if(['saving','saving-step','saving-tutorial','polishing-tutorial'].includes(mode)){this.homeAfterSave=true;return;}
    this.reset();this.mode=['home','library','loading-library','tutorial-detail','settings','voice','voice-help','create-intro'].includes(mode)?'home':'tutorial-detail';
    this.note=this.mode==='home'?'Choose Create or Library.':'Workspace moved. Choose Play or Edit to place this tutorial again.';
  }
  begin(intent='legacy') { this.ux=intent!=='legacy';this.intent=intent==='follow'?'follow':'create';this.activeSession=true;this.reset();if(this.ux)this.mode=intent==='home'?'home':intent==='follow'?'setup-follow':this.tutorial.save_position?'setup-new':'save-home';if(this.ux&&intent==='create'&&this.tutorial.save_position)this.cleanSave=true;this.log('tutorial_session_start',{tutorial_id:this.tutorial.id,revision:this.tutorial.revision,source:this.tutorial.source}); this.note=this.mode==='save-home'?'Choose a save position once for this tutorial.':this.mode==='home'?'Choose Create tutorial or Library.':'Review the starting setup, then place the workspace.'; this.speak(this.note); }
  countdown(kind) {
    this.landmarkHold.reset();
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
    this.player=new TutorialPlayer(this.tutorial.steps);this.mode='learn';this.watchOnly=this.followStyle!=='guided';this.gatePaused=false;this.epoch++;this.showStep();
  }
  async openLibrary(){
    this.mode='loading-library';this.epoch++;
    const generation=this.takeGeneration;
    try{await Promise.all([...this.segmentJobs]);await this.saveQueue;const library=await listTutorials();if(this.takeGeneration!==generation||this.mode!=='loading-library'||!this.activeSession)return;this.library=library.filter(t=>t.steps.length).map(validateTutorial);this.libraryQuery='';this.libraryFilter='all';this.libraryIndex=0;this.mode='library';}
    catch(e){if(this.takeGeneration===generation&&this.mode==='loading-library'){this.mode='home';this.problem=e.message;}}
  }
  libraryItems(){return filterLibrary(this.library,this.libraryQuery,this.libraryFilter);}
  async openSelected(){
    const id=this.libraryItems()[this.libraryIndex]?.id;if(!id)return;
    const epoch=++this.epoch;this.mode='loading-library';
    try{await Promise.all([...this.segmentJobs]);const next=validateTutorial(await findTutorial(id));if(this.epoch!==epoch||!this.activeSession)return;
      await this.saveQueue;await this.writeTutorial(next,this.persistedVersion);this.persistedVersion=draftVersion(next);
      if(this.epoch!==epoch||!this.activeSession)return;
      this.reset();this.tutorial=next;this.saveStatus='saved';this.savedMessage=`${next.steps.length} steps saved on this device.`;this.fluidCapture=!next.save_position;this.intent=next.completion?'follow':'create';this.mode='tutorial-detail';this.cleanSave=!!next.save_position;this.onChange?.();
    }catch(e){if(this.epoch===epoch){this.mode='home';this.problem=e.message;}}
  }
  async assistPlacement(){
    const mode=this.mode,tutorial=this.tutorial;let epoch=++this.epoch;this.mode='assisting-placement';this.problem='';
    try{
      await this.media?.camera?.();
      if(!this.activeSession||this.mode!=='assisting-placement'||this.tutorial!==tutorial)return;
      epoch=++this.epoch;
      const reference=validateReference(await this.snapshot());
      const saved=tutorial.workspace_reference;
      const response=await fetch('/api/workspace/landmarks',{method:'POST',credentials:'same-origin',headers:{'content-type':'application/json'},signal:AbortSignal.timeout(20000),body:JSON.stringify({consent:true,image:reference.image,...(saved?{reference:{image:saved.image,landmarks:saved.landmarks}}:{})})});
      const body=await response.json();if(!response.ok)throw Error(body.message||'Visual setup unavailable.');
      const result=validateLandmarks(body);
      if(this.epoch!==epoch||!this.activeSession||this.tutorial!==tutorial)return;
      this.placementSuggestion={...reference,...result};this.mode='landmark-preview';this.assistReturn=mode;
      const image=new Image();image.onload=()=>{if(this.epoch!==epoch||this.mode!=='landmark-preview')return;
        const c=this.photoCanvas.getContext('2d');c.drawImage(image,0,0,640,480);
        result.landmarks.forEach((p,i)=>{const x=p.uv[0]*640,y=p.uv[1]*480;c.fillStyle='#b5f0db';c.strokeStyle='#172321';c.lineWidth=4;c.beginPath();c.arc(x,y,17,0,Math.PI*2);c.fill();c.stroke();c.fillStyle='#172321';c.font='bold 20px sans-serif';c.textAlign='center';c.fillText(i?'B':'A',x,y+7);});
        this.photoTexture.needsUpdate=true;this.photoPanel.visible=true;this.onPlacementPreview?.();
      };image.src=reference.image;
    }catch(e){if(this.epoch===epoch){this.mode=mode;this.problem=e.message;}}
  }
  async acceptLandmarks(){
    if(!this.placementSuggestion||this.mode!=='landmark-preview')return;
    const tutorial=this.tutorial,generation=this.takeGeneration;
    this.landmarkLabels=this.placementSuggestion.landmarks.map(p=>p.label);
    if(this.intent==='create'&&!this.tutorial.workspace_reference){
      this.tutorial.workspace_reference=this.placementSuggestion;
      this.tutorial.setup=`Point A: ${this.landmarkLabels[0]}. Point B: ${this.landmarkLabels[1]}. Keep the material size and starting arrangement the same.`;
      await this.changed();
    }
    if(this.tutorial!==tutorial||this.takeGeneration!==generation||this.mode!=='landmark-preview')return;
    this.photoPanel.visible=false;this.mode=this.assistReturn||'setup-follow';this.action('setup-ready');
  }
  async renameTutorial(title){
    title=String(title||'').trim().slice(0,120);if(!title||this.renameBusy)return;this.renameBusy=true;
    const before=this.tutorial,next=structuredClone(before);next.title=title;next.revision++;
    if(next.completion)next.completion.revision=next.revision;
    try{await this.persist(next);if(this.tutorial===before){this.tutorial=next;this.problem='';this.onChange?.();}}
    catch(e){this.problem=e.message;}finally{this.renameBusy=false;}
  }
  async removeTutorial(){
    const target=structuredClone(this.tutorial),epoch=++this.epoch;this.mode='loading-library';
    try{await this.saveQueue;await deleteTutorial(target.id,target.revision);if(this.tutorial.id===target.id)this.persistedVersion=null;
      if(this.epoch!==epoch||this.tutorial.id!==target.id)return;
      this.reset();this.tutorial=newTutorial();await this.openLibrary();this.notify('saved','Tutorial deleted');}
    catch(e){if(this.epoch===epoch){this.mode='tutorial-detail';this.problem=e.message;}}
  }
  hasUnfinishedTake(){
    const modes=[this.mode],returns={'boundary-help':this.helpReturn,settings:this.settingsReturn,voice:this.voiceReturn,'voice-help':this.voiceReturn};
    for(let i=0;i<modes.length;i++){const next=returns[modes[i]];if(next&&!modes.includes(next))modes.push(next);}
    return !!this.frames.length||!!this.narrator?.take||modes.some(mode=>['capture','capture-paused','confirm-home','confirm-exit','confirm-discard'].includes(mode));
  }
  onManipulation(){
    if(this.pending){this.pending=null;this.savePositionCapture.reset();this.note='Countdown cancelled. Start again after moving the panel.';}
    this.endpoint.interrupt();this.segmenter.interrupt();
    if(this.mode==='capture'){this.mode='capture-paused';this.narrator?.pause();}
    if(this.mode==='learn'){this.gatePaused=true;this.practice?.pause();this.followEngine?.pause();}
    if(this.player)this.player.paused=true;this.audioPlayer?.stop();
  }
  cancelPolish(){this.polishController?.abort();this.polishController=null;this.polishBusy=false;}
  async prepareInstruction(approve){
    if(this.polishBusy||!this.player?.step||this.mode!=='polish')return;
    if(approve&&!this.polishDraft)return;
    const tutorial=this.tutorial,step=this.player.step,revision=tutorial.revision,epoch=this.epoch;
    const controller=new AbortController();this.polishController=controller;this.polishBusy=true;this.problem='';
    const current=()=>!controller.signal.aborted&&this.activeSession&&this.mode==='polish'&&this.tutorial===tutorial&&tutorial.revision===revision&&this.player?.step===step&&this.epoch===epoch;
    try{
      const services=this.instructionServices||{polishStep,generateInstructionVoice};
      const signal=AbortSignal.any([controller.signal,AbortSignal.timeout(approve?30000:100000)]);
      if(!approve){const draft=await services.polishStep(step,{signal});if(current())this.polishDraft=draft;}
      else {
        const draft={...this.polishDraft},voice=await services.generateInstructionVoice(draft.instruction,{signal});
        if(!current())return;
        step.title=draft.title;step.instruction=draft.instruction;step.instruction_voice=voice;step.reviewed=false;step.acceptance=null;
        await this.changed();
        // Durable-save success only. Navigation/exit may have happened during the write.
        if(!controller.signal.aborted&&this.mode==='polish'&&this.tutorial===tutorial&&this.player?.step===step){this.mode='review-step';this.player.replay();this.audioPlayer?.unlock();this.note='Instruction voice saved. Listen with the ghost, then approve this step.';}
      }
    }catch(e){if(!controller.signal.aborted&&this.mode==='polish')this.problem=e.message;}
    finally{if(this.polishController===controller){this.polishBusy=false;this.polishController=null;}this.onChange?.();}
  }
  handleUX(id){
    if(this.mode==='polish'&&!id.startsWith('polish-'))this.cancelPolish();
    if(id==='polish-open'){
      this.player.paused=true;this.audioPlayer?.stop();this.voice?.stop('Voice controls paused during instruction review.');this.coach?.stop();
      this.polishDraft=null;this.problem='';this.mode='polish';return true;
    }
    if(this.mode==='polish'){
      if(id==='polish-draft'){void this.prepareInstruction(false);return true;}
      if(id==='polish-written'){const s=this.player.step;this.polishDraft={title:s.title,instruction:s.instruction,transcript:'Written instruction',needsReview:false};return true;}
      if(id==='polish-approve'){void this.prepareInstruction(true);return true;}
      if(id==='polish-back'){this.cancelPolish();this.mode='review-step';this.player.replay();return true;}
      if(id==='polish-original'&&!this.polishBusy){this.player.step.instruction_voice=null;this.player.step.reviewed=false;this.player.step.acceptance=null;this.changed().catch(()=>{});this.mode='review-step';this.player.replay();return true;}
    }
    if(id==='voice-open'){
      if(this.pending||this.mediaPending||['voice','voice-help'].includes(this.mode))return true;
      if(this.mode==='capture'){this.action('replay');}
      if(this.mode==='learn'){this.gatePaused=true;this.practice?.pause();this.followEngine?.pause();this.audioPlayer?.stop();}
      this.voiceReturn=this.mode;this.mode='voice';return true;
    }
    if(id==='voice-help'){this.mode='voice-help';this.voiceHelpPage=0;return true;}
    if(id==='voice-help-next'){this.voiceHelpPage=((this.voiceHelpPage||0)+1)%3;return true;}
    if(id==='voice-settings'){this.mode='voice';return true;}
    if(id==='voice-back'){this.mode=this.voiceReturn||'home';return true;}
    if(id==='voice-enable'){this.coach?.stop();const back=this.voiceReturn||'home';this.voiceStartTask=this.voice?.start().then(()=>{if(this.activeSession&&this.mode==='voice'&&this.voice?.active){this.mode=back;this.onChange?.();}});return true;}
    if(id==='voice-stop'){this.voice?.stop();return true;}
    if(id==='voice-pair'){this.onVoicePair?.();return true;}
    if(id==='coach-start'){if(this.voice){void this.voice.start();return true;}
      if(this.narrator?.take){this.problem='Finish or save the recording before starting the coach.';return true;}
      const step=this.player?.step||this.tutorial.steps[0];if(!step){this.problem='Open a tutorial before starting the coach.';return true;}
      this.voice?.stop('Commands paused for coaching.');this.audioPlayer?.stop();globalThis.speechSynthesis?.cancel();
      void this.coach?.start(this.tutorial,step,this.epoch).catch(e=>{this.problem=e.message;});return true;
    }
    if(id==='coach-stop'){this.coach?.stop();return true;}

    if(id==='home'){
      if(['saving','saving-step','saving-tutorial','polishing-tutorial'].includes(this.mode)){this.homeAfterSave=true;return true;}
      if(this.hasUnfinishedTake()){
        this.mode='capture-paused';this.narrator?.pause();this.segmenter.interrupt();this.mode='confirm-home';return true;
      }
    }
    if(id==='home-discard'){this.narrator?.cancel();this.reset();this.mode='home';return true;}
    if(id==='home-save'){this.mode='capture-paused';this.homeAfterSave=true;this.action('primary');return true;}
    if(id==='boundary-help'){this.helpReturn=this.mode;this.mode='boundary-help';return true;}
    if(id==='help-back'){this.mode=this.helpReturn||'home';return true;}
    if(id==='assist-placement'){void this.assistPlacement();return true;}
    if(id==='landmarks-confirm'){void this.acceptLandmarks().catch(e=>{this.problem=e.message;});return true;}
    if(id==='landmarks-back'){this.epoch++;this.photoPanel.visible=false;this.mode=this.assistReturn||'setup-follow';return true;}
    if(id==='rename-tutorial'){this.onRenameTutorial?.();return true;}
    if(id==='delete-tutorial'){this.mode='confirm-delete';return true;}
    if(id==='delete-confirm'){void this.removeTutorial();return true;}
    if(id==='delete-cancel'){this.mode='tutorial-detail';return true;}
    if(id==='library-search'){this.onLibrarySearch?.();return true;}
    if(id==='library-clear'){this.libraryQuery='';this.libraryIndex=0;return true;}
    if(id==='library-filter'){this.libraryFilter=this.libraryFilter==='all'?'ready':this.libraryFilter==='ready'?'draft':'all';this.libraryIndex=0;return true;}
    if(id.startsWith('library-item-')){this.libraryIndex=Number(id.slice(13));void this.openSelected();return true;}
    if(id==='library-page-prev'||id==='library-page-next'){this.libraryIndex=Math.max(0,Math.min(Math.max(0,this.libraryItems().length-1),this.libraryIndex+(id.endsWith('next')?3:-3)));return true;}
    if(id==='capture-hands'&&this.mode==='author-options'){const choices=['both','left','right'];this.captureHands=choices[(choices.indexOf(this.captureHands)+1)%3];return true;}
    if(id==='toggle-fluid'){this.fluidCapture=!this.fluidCapture;this.cleanSave=!this.fluidCapture&&!!this.tutorial.save_position;return true;}
    if(id==='fluid-stop'){this.finishFluid();return true;}
    if(id==='finish-tutorial'){this.saveTask=this.finishAuthoring();return true;}
    if(id==='next-recording'){if(this.placementLost){this.reset();this.intent='create';this.mode='setup-new';}else{this.mode='author';this.action('primary');}return true;}

    if(id==='settings'){
      if(this.pending||this.mediaPending)return true;
      if(this.mode==='boundary-help'&&this.helpReturn==='settings'){this.mode='settings';return true;}
      if(this.mode==='capture'){this.mode='capture-paused';this.narrator?.pause();this.endpoint.interrupt();this.segmenter.interrupt();}
      this.settingsReturn=this.mode;this.gatePaused=true;this.followEngine?.pause();this.practice?.pause();if(this.player)this.player.paused=true;this.audioPlayer?.stop();this.mode='settings';return true;
    }
    if(id==='settings-back'){this.mode=this.settingsReturn||'home';return true;}
    if(id==='theme'||id==='sound'){
      if(id==='theme')this.appearance.theme=this.appearance.theme==='light'?'charcoal':'light';else this.appearance.sound=!this.appearance.sound;
      applyAppearance(this.appearance);this.onChange?.();return true;
    }
    if(id==='keep-add'&&['review-step','review-options'].includes(this.mode)){
      if(this.player.step.narration_issue){this.problem='Repair narration or use text before keeping this step.';return true;}
      const ready=guidanceReadiness(this.player.step);if(!ready.ready){this.problem=ready.message;return true;}
      this.player.step.reviewed=true;this.changed();this.player=null;this.photoPanel.visible=false;this.mode=this.workspace?'author':'setup-new';this.intent='create';return true;
    }
    if(id==='review-pause'&&this.mode==='review-step'){const playing=!!this.audioPlayer?.node||!this.player.paused;this.player.paused=playing;this.player.audioPaused=playing;return true;}
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
    if(id==='panels-reset'){this.onResetPanels?.();return true;}

    // Ask always reaches the coach; readiness is shown on the button label, and the runtime ignores a press it cannot honour.
    if(id==='coach-ask'){this.coach?.ask();return true;}
    if(id==='retry-save'){if(this.saveStatus==='failed')this.persist();return true;}
    if(id==='home'){
      this.narrator?.cancel();this.audioPlayer?.stop();this.reset();this.mode='home';return true;
    }
    if(this.mode==='loading-library')return true;
    if(id==='create'){
      if(this.segmentJobs.size){
        const generation=this.takeGeneration;this.mode='saving';
        this.saveTask=Promise.all([...this.segmentJobs]).then(()=>{
          if(generation!==this.takeGeneration)return;
          this.mode='home';
          if(this.saveStatus==='failed'){this.problem=this.savedMessage;return;}
          if(this.homeAfterSave){this.homeAfterSave=false;return;}
          this.action('create');
        });return true;
      }
      if(this.saveStatus==='failed'){this.problem=this.savedMessage;return true;}
      this.reset();this.instructions=[];this.tutorial=newTutorial(`Tutorial ${new Date().toLocaleDateString()}`);this.intent='create';this.stepByStep=true;this.captureHands='both';this.fluidCapture=true;this.mode='create-intro';this.cleanSave=false;this.persist();return true;
    }
    if(id==='create-continue'){this.mode=this.media?'media-setup':'save-home';return true;}
    if(id==='media-enable'&&this.mode==='media-setup'){
      this.mode='media-wait';this.mediaPending=true;const generation=this.takeGeneration;
      this.mediaTask=this.media.enable().then(result=>{
        if(generation!==this.takeGeneration||this.mode!=='media-wait'||!result)return;
        this.mediaPending=false;this.captureCapabilities=result;this.mode=this.stepByStep?'save-home':this.fluidCapture?'setup-new':'save-home';
        this.notify('record',result.errors.length?'Continue with available features':'Narration and photos ready');
        this.note=result.errors.length?'Some permissions were declined. Hand recording still works.':(this.fluidCapture?'Narration and photos are ready. Place your workspace.':'Narration and photos are ready. Set your save position.');
      }).catch(e=>{if(generation===this.takeGeneration&&this.mode==='media-wait'){this.mediaPending=false;this.mode=this.stepByStep?'save-home':this.fluidCapture?'setup-new':'save-home';this.problem=`Capture setup unavailable: ${e.message}. Hand recording still works.`;}});return true;
    }
    if(id==='media-skip'&&['media-setup','media-wait'].includes(this.mode)){
      this.media?.cancel();this.mediaPending=false;this.captureCapabilities={camera:false,microphone:false};this.mode=this.stepByStep?'save-home':this.fluidCapture?'setup-new':'save-home';return true;
    }
    if(id==='library'){void this.openLibrary();return true;}
    if(id==='edit-current'){this.reset();this.fluidCapture=!this.tutorial.save_position;this.cleanSave=!this.fluidCapture;this.intent='create';if(this.tutorial.steps.length){this.player=new TutorialPlayer(this.tutorial.steps);this.player.paused=true;this.mode='review-step';}else this.mode='setup-new';return true;}
    if(this.mode==='library'){
      if(id==='open-tutorial')void this.openSelected();
      if(id==='library-next')this.libraryIndex=(this.libraryIndex+1)%this.library.length;
      if(id==='library-prev')this.libraryIndex=(this.libraryIndex+this.library.length-1)%this.library.length;
      return true;
    }
    if(id==='setup-ready'){
      if(!this.tutorial.setup.trim()){this.tutorial.setup='Start with the same size materials and orientation. Point A is the near-left corner of the starting work area; point B is along its near edge to the right. Use these same physical landmarks when playing.';this.changed();}
      this.mode='start';return true;
    }
    if(id==='redo-placement'||id==='move-tutorial'){
      const home=this.saveHomeWorld;this.intent=id==='move-tutorial'?'follow':this.intent;this.reset();this.saveHomeWorld=home;this.mode='start';return true;
    }
    if(id==='adjust-placement'){this.mode='adjust-placement';return true;}
    if(id==='placement-back'){this.mode='placement';return true;}
    if(id.startsWith('shift-')||id==='rotate-placement'){
      const w=this.workspace;if(!w)return true;
      const offsets={'shift-left':[-.01,0],'shift-right':[.01,0],'shift-away':[0,-.01],'shift-near':[0,.01]};
      if(offsets[id]){const [x,z]=offsets[id];w.origin=w.origin.map((v,i)=>v+x*w.x[i]+z*w.z[i]);}
      else {const q=new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),Math.PI/90);w.x=new THREE.Vector3(...w.x).applyQuaternion(q).toArray();w.z=new THREE.Vector3(...w.z).applyQuaternion(q).toArray();}
      this.syncPlacement();return true;
    }
    if(id==='placement-ready'){
      if(this.intent==='follow')this.startLearning();else if(this.intent==='review'){this.mode='review-step';this.player=new TutorialPlayer(this.tutorial.steps);this.player.index=this.reviewIndex||0;this.showStep();}else {
        if(this.saveHomeWorld){this.storeSavePosition(this.saveHomeWorld.map(p=>toLocal(p,this.workspace)));this.saveHomeWorld=null;}
        this.mode=this.fluidCapture||this.tutorial.save_position||this.replaceIndex!=null?'author':'save-home';
      }return true;
    }
    if(id==='set-save-position'){
      this.savePositionCapture.reset();this.pending={kind:'save-position',until:performance.now()+3000};this.note='Put both hands in a comfortable resting spot away from the action. Hold still after the countdown.';return true;
    }
    if(id==='change-save-position'){this.saveReturn='author-options';this.savePositionCapture.reset();this.mode='save-home';return true;}
    if(id==='cancel-save-position'){this.pending=null;this.savePositionCapture.reset();this.mode=this.workspace?'author-options':'setup-new';return true;}
    if(id==='author-options'){this.mode='author-options';return true;}
    if(id==='toggle-clean'){this.fluidCapture=false;if(!this.tutorial.save_position){this.mode='save-home';return true;}this.cleanSave=!this.cleanSave;return true;}
    if(id==='capture-reference'){this.mode='author';this.action('verify');return true;}
    if(id==='author-back'){this.mode='author';return true;}
    if(id==='choose-hands'){this.handsReturn=this.mode;this.mode='choose-hands';if(this.player)this.player.paused=true;this.audioPlayer?.stop();return true;}
    if(['hands-left','hands-right','hands-both'].includes(id)&&this.mode==='choose-hands'){
      const side=id.slice(6);if(!['left','right','both'].includes(side))return true;
      if(this.handsReturn==='author-options'){this.captureHands=side;this.mode=this.handsReturn;}
      else {const step=this.player.step;step.guide_hands=side;step.reviewed=false;step.acceptance=null;this.changed().catch(()=>{});this.mode='review-step';}return true;
    }
    if(id==='hands-back'){this.mode=this.handsReturn||'review-step';return true;}
    if(id==='replay'&&this.mode==='review-step'&&!this.workspace){this.reviewIndex=this.player.index;this.intent='review';this.mode='start';return true;}
    if(id==='review-options'){this.mode='review-options';this.player.paused=true;return true;}
    if(id==='review-back'){this.mode='review-step';return true;}
    if(['review-step','review-options'].includes(this.mode)&&id==='guide-hands'){
      const options=['left','right','both'],step=this.player.step;step.guide_hands=options[(options.indexOf(step.guide_hands)+1)%3];step.reviewed=false;step.acceptance=null;this.changed();return true;
    }
    if(this.mode==='review-options'&&['verify','cue','removeCue','hand'].includes(id)){this.mode='review-step';return false;}
    if(id==='discard-confirm'){this.endpoint.interrupt();this.discardReturn=this.mode;this.mode='confirm-discard';this.narrator?.pause();return true;}
    if(id==='keep-take'){this.homeAfterSave=false;this.mode='capture-paused';return true;}
    if(id==='discard-take'){this.mode='capture-paused';this.action('hand');return true;}
    if(id==='toggle-practice'){this.followStyle=this.followStyle==='loop'?'guided':'loop';return true;}
    if(id==='watch-next'){this.gatePaused=false;this.epoch++;this.audioPlayer?.stop();if(this.player.index+1<this.tutorial.steps.length){this.player.index++;this.showStep();}else{this.mode='finished';this.movementOnly=false;this.watchFinished=true;}return true;}
    if(id==='start-follow'){const ready=learningReadiness(this.tutorial);if(!ready.ready){this.problem=ready.message;return true;}this.reset();this.intent='follow';this.mode='setup-follow';return true;}
    if(id==='learn-options'){this.gatePaused=true;this.followEngine?.pause();this.practice?.pause();this.audioPlayer?.stop();this.mode='learn-options';return true;}
    if(id==='watch-demo'&&this.mode==='learn-options'){this.mode='learn';this.watchOnly=true;this.coach?.onAttempt();this.player.replay();return true;}
    if(id==='learn-back'){this.mode='learn';this.gatePaused=false;this.followEngine?.pause();this.practice?.pause();return true;}
    if(id==='restart-follow'){this.mode='learn';this.watchOnly=this.followStyle!=='guided';this.gatePaused=false;this.coach?.onAttempt();this.showStep();return true;}
    if(this.mode==='learn-options'&&['hand','removeCue'].includes(id)){this.mode='learn';return false;}
    if(this.mode==='learn'){
      if(id==='watch-demo'){this.watchOnly=true;this.coach?.onAttempt();this.player.replay();this.audioPlayer?.stop();return true;}
      if(id==='try-follow'){this.watchOnly=false;this.gatePaused=false;this.coach?.onAttempt();this.showStep();this.practice.ready();this.player.paused=true;return true;}
      if(id==='replay'&&this.watchOnly&&this.followStyle==='loop'){this.gatePaused=!this.gatePaused;this.player.paused=this.gatePaused;if(this.gatePaused)this.audioPlayer?.stop();this.loopAt=null;return true;}
      if(id==='replay'&&!this.watchOnly){this.gatePaused=!this.gatePaused;this.followEngine?.pause();this.practice?.pause();return true;}
      if(id==='primary'&&(!this.followEngine?.done||this.watchOnly)){this.problem='Reach the movement checkpoint before confirming. Watching a replay does not complete it.';return true;}
    }
    return false;
  }

  hide() {
    this.landmarkHold?.reset();this.segmenter?.interrupt();this.hideAssistance();this.followEngine?.pause();this.practice?.pause();this.alignment?.reset();this.endpoint?.interrupt();this.savePositionCapture?.reset();this.alignmentResult=null;
    if(this.wasHidden)return;
    if(this.ux&&this.mode==='learn')this.gatePaused=true;
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
  endSession() { this.hide();this.log('tutorial_session_end'); this.reset();this.narrator?.disable();this.voice?.stop();this.coach?.stop();this.activeSession=false;this.onChange?.(); }
  exportData() { return {...this.tutorial, events:this.events}; }
  exportDiagnostics(){
    const allowed=['voice_command','tutorial_session_start','tutorial_session_end','tutorial_interrupted','record_start','record_pause','record_resume','record_tracking','record_saved','record_rejected','step_reviewed','fold_line_saved','photo_saved','photo_rejected','learning_start','movement_step_completed','step_self_confirmed','playback_interrupted','playback_rate'];
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
      step.reference=reference;step.reviewed=false;step.acceptance=null;this.changed(); this.note='Reference photo saved for this step. No AI check was run.';
      this.log('photo_saved',{step_id:step.id,request_age_ms:reference.capture?.request_age_ms??null});
    } catch(e) { if(epoch===this.epoch){this.problem=e.message;this.log('photo_rejected',{reason:e.message});} }
  }
  action(id) {
    this.problem='';
    if(id==='exit'){
      if(this.ux&&this.hasUnfinishedTake()){this.narrator?.pause();this.endpoint.interrupt();this.segmenter.interrupt();this.mode='confirm-exit';return;}
      this.exit();return;
    }
    if(id==='exit-discard'&&this.mode==='confirm-exit'){this.narrator?.cancel();this.frames=[];this.exit();return;}
    if(['saving','saving-step','saving-tutorial','polishing-tutorial'].includes(this.mode)){if(id==='home')this.homeAfterSave=true;else this.problem='Saving locally. Please wait.';return;}
    if(this.ux&&this.handleUX(id))return;
    if(!this.workspace&&!['review-step','review-options'].includes(this.mode)) {
      if(id==='primary'&&!this.pending) this.countdown(this.mode==='end'?'end':'start');
      return;
    }
    if(this.pending){this.problem='Wait for the countdown.';return;}
    if(id==='cue'&&this.mode==='review-step'){
      this.player.paused=true;this.cueFirst=null;this.pending={kind:'cue-first',until:performance.now()+4000,samples:[]};
      this.note='Hold your right index fingertip on the FIRST end of the guide line. Four seconds.';this.speak(this.note);return;
    }
    if(id==='removeCue'&&this.mode==='review-step'){
      if(this.player.step.narration_issue){this.player.step.narration=null;this.player.step.instruction_voice=null;this.player.step.narration_issue=null;this.player.step.reviewed=false;this.player.step.acceptance=null;this.changed();this.note='Failed narration removed. Review the written instruction before approving.';return;}
      this.player.step.cues=[];this.player.step.reviewed=false;this.player.step.acceptance=null;this.changed();this.foldLine.visible=false;this.note='Guide line removed. Review the step again.';return;
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
        this.pending={kind:'record',until:performance.now()+3000,waitForVoice:!!this.voice?.busy};
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
      else if(id==='hand'){this.stepByStep=false;this.fluidCapture=false;this.cleanSave=false;this.replaceIndex=this.player.index;this.mode=this.workspace?'author':'setup-new';this.intent='create';this.player=null;this.photoPanel.visible=false;if(this.workspace)this.action('primary');}
      return;
    }
    if(this.mode==='capture'||this.mode==='capture-paused') {
      if(id==='hand'){this.takeGeneration++;this.narrator?.cancel();this.frames=[];this.replaceIndex=null;this.mode='author';this.note='Unfinished take discarded. Saved steps are unchanged.';return;}
      if(id==='replay') {
        if(this.placementLost){this.problem='Save or discard this take, then place the workspace again.';return;}
        if(this.mode==='capture'){this.endpoint.interrupt();this.mode='capture-paused';this.segmenter.interrupt();this.narrator?.pause();this.log('record_pause',{reason:'user'});this.notify('pause','Recording paused');this.note='Paused. Return both tracked wrists to their recorded positions before resuming.';return;}
        const last=this.frames.at(-1);
        for(const side of ['left','right']) if(tracked(last?.[side]) &&
          (!tracked(this.currentHands?.[side]) || distance(last[side][0].p,this.currentHands[side][0].p)>.12)) {
          this.problem='Return tracked hands near their paused ghosts before resuming (12 cm).';return;
        }
        this.lastRecordTick=this.lastTick;this.mode='capture';this.segmenter.interrupt();this.narrator?.resume();this.log('record_resume');this.notify('record','Recording resumed');
      }
      if(this.stepByStep&&id==='primary'){this.saveCurrentStep();return;}
      if(this.fluidCapture&&(id==='primary'||id==='removeCue')){this.finishFluid();return;}
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
      if(id==='replay'){const playing=!!this.audioPlayer?.node||!this.player.paused;this.player.paused=playing;this.player.audioPaused=playing;}
      if(id==='hand'){this.watchOnly=this.followStyle!=='guided';this.gatePaused=false;this.player.previous();this.showStep();}
      if(id==='verify')this.player.replay();
    }
  }
  showStep(preserve=false) {
    this.watchFinished=false;this.nextPathKey=null;this.loopAt=null;this.loopSilent=false;this.loopMatch=null;
    this.alignment.reset();this.alignmentResult=null;
    const step=this.player.step;
    if(this.ux&&this.mode==='learn'&&!preserve){this.practice=this.watchOnly?null:new TutorialPractice(step);this.followEngine=this.practice?.follower||null;this.player.replay();this.player.setRate(.75);this.movementOnly=false;}
    // Forward local step changes without giving the coach progression authority.
    if(this.mode==='learn'&&!preserve&&!this.voice?.authoring)this.coach?.onStep(step,this.epoch);
    this.note=step.instruction || `Step ${this.player.index+1}`;if(!step.narration&&!step.instruction_voice)this.speak(this.ux&&this.mode==='learn'&&!preserve?`Watch step ${this.player.index+1}. ${this.note}`:this.note);else globalThis.speechSynthesis?.cancel();
    this.space.add(this.photoPanel);this.photoPanel.position.set(.2,.025,.25);this.photoPanel.rotation.set(-Math.PI/2,0,0);this.photoPanel.scale.setScalar(1);this.photoPanel.visible=false;
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
    this.cleanSave=!this.fluidCapture;this.changed();this.onChange?.();this.note='Save position set for this tutorial. Return here after each action.';
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
    else {this.saveHomeWorld=points;this.cleanSave=!this.fluidCapture;this.mode='setup-new';this.note='Save position chosen. Now place the workspace so it can be stored with your tutorial.';}
    this.speak(this.note);
  }
  tick(frame,session,reference,time) {
    if(this.mode==='save-home'){this.tickSavePosition(frame,session,reference,time);return;}

    if(!this.workspace){
      if(this.ux&&!['start','end'].includes(this.mode)){this.hideAssistance();this.ghost.visible=false;this.leftGhost.ghost.visible=false;return;}
      if(session.visibilityState!=='visible'){this.hide();return;}
      this.lastTick=time;this.hand='right';this.joints=this.sample(frame,session,reference);
      const now=performance.now();
      if(this.pending&&now>=this.pending.until){
        const tip=this.landmarkHold.update(this.joints?.[9]?.p,time);
        this.note=`Hold your fingertip still · ${Math.round(this.landmarkHold.progress*100)}%`;
        if(this.joints?.[9]?.p){const marker=this.markers[this.pending.kind==='start'?0:1];marker.position.fromArray(this.joints[9].p);marker.visible=true;}
        if(!tip)return;
        const {kind}=this.pending;this.pending=null;this.landmarkHold.reset();
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
    if(elapsed>250&&this.player&&!this.player.paused){this.player.paused=true;if(this.mode==='learn')this.gatePaused=true;this.log('playback_interrupted',{gap_ms:elapsed});}
    if(session.visibilityState!=='visible'){this.hide();return;}
    if(this.wasHidden){this.wasHidden=false;if(this.player&&['learn','review-step'].includes(this.mode))this.showStep(true);}
    this.currentHands={};
    for(const side of ['left','right']){this.hand=side;this.currentHands[side]=this.localJoints(this.sample(frame,session,reference));}
    this.hand='right';this.joints=this.currentHands.right;this.tickNextStep(time);
    const assetError=this.skinHand?.error||this.leftGhost.skinHand?.error;
    if(assetError){this.problem='Detailed hands unavailable; showing joint outlines. Exit AR and reload to retry.';if(this.mode==='learn')this.gatePaused=true;}
    const now=performance.now();
    if(this.pending?.kind==='record'&&this.pending.waitForVoice){this.pending.until=now+3000;if(!this.voice?.busy)this.pending.waitForVoice=false;}
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
            this.player.step.reviewed=false;this.player.step.acceptance=null;this.changed();this.note='Expert guide line saved. Review and approve this step.';this.speak(this.note);
            this.log('fold_line_saved',{step_id:this.player.step.id});
          }catch(e){this.problem=e.message;}
        }
      }
    }
    if(this.pending&&!this.pending.kind.startsWith('cue-')&&now>=this.pending.until){
      const kind=this.pending.kind;this.pending=null;
      if(kind==='record'){
        if(!tracked(this.currentHands.left)&&!tracked(this.currentHands.right)){this.problem='No hands tracked. Show your hands and start again.';return;}
        this.segmenter.reset(this.captureHands);this.endpoint.reset(this.tutorial.save_position?['left','right'].map(side=>this.tutorial.save_position[side]):null);this.mode='capture';this.frames=[];this.recordElapsed=0;this.lastRecordTick=time;this.lastSample=-Infinity;
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
          const held=this.segmenter.update(this.currentHands,this.recordElapsed);
          if(this.fluidCapture&&held)this.sealFluidSegment(false,'hold',this.segmenter.cutoff(this.recordElapsed));else if(this.cleanSave&&this.endpoint.update(this.currentHands,this.recordElapsed)!==null)this.action('primary');}
        if(this.mode==='capture'&&(this.frames.length>=MAX_FRAMES||this.recordElapsed>=180000)){this.mode='capture-paused';this.narrator?.pause();this.note='Three-minute limit. Save this step.';}
      }
      this.lastRecordTick=time;
    }
    this.hideAssistance();
    this.ghost.visible=false;this.leftGhost.ghost.visible=false;this.live.visible=false;this.path.visible=false;this.arrow.visible=false;
    let sample=null;
    if(this.mode==='capture-paused')sample=this.frames.at(-1);
    if(this.ux&&this.mode==='learn'&&!this.watchOnly){
      if(this.practice?.phase==='preview'){
        this.player.paused=!!this.gatePaused||!!this.voice?.busy;sample=this.player.tick(this.voice?.busy?0:dt);
        if(!this.gatePaused&&!this.voice?.busy){this.practice.update(this.currentHands,time,this.player.time>=this.player.step.duration_ms&&!this.audioPlayer?.instructionPending?.(this.player));if(this.practice.phase==='ready'){this.speak('Your turn. Bring your hands near the starting regions.');this.audioPlayer?.stop();}}
      }else{
        if(this.voice?.busy){this.practice?.pause();this.followEngine?.pause();}
        if(!this.gatePaused&&!this.voice?.busy)this.practice?.update(this.currentHands,time);
        sample=this.followEngine.target;this.player.time=sample?.t||0;this.player.paused=true;
        if(this.practice?.advance){
          this.log('movement_step_completed',{step_id:this.player.step.id,kind:'movement-only',physical_result:'unverified'});
          if(this.player.index+1<this.tutorial.steps.length){this.player.index++;this.speak('Next step. Watch the demonstration.');this.showStep();sample=this.player.step.frames[0];}
          else {this.mode='finished';this.movementOnly=true;this.note='Movements finished. Check the physical result.';this.speak(this.note);sample=null;}
        }
      }
      if(this.followEngine.done&&this.problem?.startsWith('Reach the movement checkpoint'))this.problem=null;
    }else if(this.mode==='learn'&&this.watchOnly&&this.followStyle==='loop'){
      if(!this.gatePaused&&!this.voice?.busy){
        if(this.player.time>=this.player.step.duration_ms){this.loopAt??=time;if(time-this.loopAt>=1200){this.player.replay();this.loopAt=null;this.loopSilent=true;}}
        sample=this.player.tick(dt);
        this.loopMatch=nearestPracticePose(this.player.step,this.currentHands);
      }else {sample=this.player.tick(0);this.loopAt=null;this.loopMatch=null;}
    }else if(['learn','review-step','review-options','trim'].includes(this.mode)&&this.player)sample=this.player.tick(this.voice?.busy?0:dt);
    if(['placement','adjust-placement'].includes(this.mode))sample=this.tutorial.steps[0]?.frames[0];
    this.nextPath.visible=false;
    if(this.ux&&this.mode==='learn'&&!this.watchOnly&&!this.gatePaused&&!this.pending&&this.practice?.phase!=='preview'&&this.followEngine&&!['tracking','reference-gap'].includes(this.followEngine.state)&&!this.followEngine?.done){
      const follower=this.followEngine,next=follower.gates[follower.index+1],points=[];
      for(const side of follower.hands){const a=follower.target?.[side]?.[0]?.p,b=next?.[side]?.[0]?.p;if(a&&b)points.push(new THREE.Vector3(...a),new THREE.Vector3(...b));}
      const key=`${this.player.step.id}:${follower.index}`;
      if(this.nextPathKey!==key){this.nextPath.geometry.dispose();this.nextPath.geometry=new THREE.BufferGeometry().setFromPoints(points);this.nextPath.computeLineDistances();this.nextPathKey=key;}
      this.nextPath.visible=points.length>0;
    }
    const savedFlash=this.feedback.visible(now)?.kind==='saved';
    const ghostColor=this.loopMatch?.state==='inside'?0xa5dbb5:savedFlash?0xa5dbb5:0x7cdadd;
    if(sample&&!this.pending){this.drawHand(sample.right,ghostColor);this.leftGhost.drawHand(sample.left,ghostColor);}
    if(this.ux&&this.mode==='learn'){
      const state=this.gatePaused?'paused':this.followEngine?.state;
      if(state!==this.feedbackState){if(state==='checkpoint')this.notify('checkpoint','Movement reached');if(state==='tracking')this.notify('tracking','Show your hands');this.feedbackState=state;}
    }
    if(this.mode==='learn'&&this.watchOnly&&this.followStyle==='loop'&&!this.gatePaused){for(const side of ['left','right'])this.liveHands[side].drawHand(this.currentHands[side],this.loopMatch?.state==='inside'?0xa5dbb5:0xc4d8df);}
    if(savedFlash&&this.mode!=='learn')for(const side of ['left','right'])this.liveHands[side].drawHand(this.currentHands[side],0xa5dbb5);

    const saveHome=this.tutorial.save_position?['left','right'].map(side=>this.tutorial.save_position[side]):this.endpoint.home;
    if(['author','capture','capture-paused','saved'].includes(this.mode)&&this.cleanSave&&saveHome){
      ['left','right'].forEach((side,i)=>{const zone=this.zones[side];zone.visible=true;zone.children.forEach(ring=>ring.visible=true);zone.position.fromArray(saveHome[i]);zone.scale.setScalar(2/3);zone.children[0].material.color.setHex(0xc4d8df);});
    }
    if(this.mode==='learn'&&!this.watchOnly&&this.alignmentEnabled&&!this.pending&&this.practice?.phase!=='preview'){
      const guided=this.ux&&!this.watchOnly;
      this.alignment.radius=guided?this.followEngine.radius:.12;this.alignment.hysteresis=guided?0:.03;this.alignment.holdMs=guided?0:300;
      this.alignmentResult=this.alignment.update(this.currentHands,sample,time);
      for(const side of ['left','right']){
        const result=this.alignmentResult[side],color=result.state==='inside'?0x55ffaa:result.state==='unknown'?0xd4dde4:0xffca75;
        this.liveHands[side].drawHand(this.currentHands[side],color);
        const zone=this.zones[side];zone.scale.setScalar(this.alignment.radius/.12);zone.visible=!!result.target&&(!guided||!this.followEngine.started);zone.children.forEach((ring,i)=>ring.visible=i===0);
        if(zone.visible){zone.position.fromArray(result.target);zone.children[0].material.color.setHex(color);}
      }
    }else {this.alignment.reset();this.alignmentResult=null;}
    this.audioPlayer?.sync(this.player,!this.loopSilent&&['learn','review-step'].includes(this.mode)&&!this.pending&&!this.voice?.busy&&(this.mode!=='learn'||!this.gatePaused)&&(!this.ux||this.mode!=='learn'||this.watchOnly||this.practice?.phase==='preview'));
    this.foldLine.visible=false;
    const cue=this.player?.step?.cues?.[0];
    if(cue&&['learn','review-step'].includes(this.mode)&&!this.pending){
      const [a,b]=cue.points.map(p=>new THREE.Vector3(...p)),delta=b.clone().sub(a);
      this.foldEnds[0].position.copy(a);this.foldEnds[1].position.copy(b);
      this.foldSegment.position.copy(a).add(b).multiplyScalar(.5);this.foldSegment.scale.y=delta.length();
      this.foldSegment.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),delta.normalize());this.foldLine.visible=true;
    }
    if(!['learn','review-step','landmark-preview'].includes(this.mode))this.photoPanel.visible=false;
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
    if(['saving','saving-step','saving-tutorial','polishing-tutorial'].includes(this.mode)){title='Saving locally…';text='Keep this page open until storage finishes.';for(const key of Object.keys(labels))if(key!=='exit')labels[key]='—';}
    if(this.pending){title=`${this.pending.kind==='photo'?'PHOTO':this.pending.kind==='record'?'RECORD':this.pending.kind.startsWith('cue-')?'FOLD LINE':'MARK'} IN ${Math.ceil((this.pending.until-performance.now())/1000)}s`;text=this.note;}
    if(this.problem)text=this.problem;
    ctx.clearRect(0,0,1080,560);ctx.fillStyle='#10231f';ctx.fillRect(0,0,1080,560);
    ctx.fillStyle='#9cf0d3';ctx.font='600 23px system-ui';ctx.fillText(this.tutorial.source==='synthetic-fixture'?'TeachAR · SYNTHETIC DEMO · NOT A HUMAN RECORDING':'TeachAR · TWO-HAND TUTORIAL · LOCAL / NO AI CHECKS',26,39);
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
