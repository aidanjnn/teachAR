const {chromium}=require('@playwright/test');
const assert=require('node:assert/strict');

(async()=>{
 const browser=await chromium.launch({headless:true,args:['--enable-unsafe-swiftshader','--mute-audio']});
 try{
  const page=await browser.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/api/**',r=>{
   const path=new URL(r.request().url()).pathname;
   const body=path.endsWith('/transcriptions')?{spans:[{text:'Move the block to the left.'}],source:'fixture'}:
    path.endsWith('/labels')?{labels:[{stepId:r.request().postDataJSON().segments[0].id,title:'Move the block',instruction:'Move the block to the left.',needsReview:true}],provenance:{labels:'model',model:'mock'}}:{};
   return r.fulfill({contentType:'application/json',body:JSON.stringify(body)});
  });
  await page.goto(`${process.env.TRAIL_TEST_ORIGIN}/tutorial`);
  const result=await page.evaluate(async()=>{
   const THREE=await import('/vendor/three.module.js');
   const {TutorialGuide}=await import('/tutorial-guide.mjs');
   const {SpatialControls}=await import('/spatial-controls.mjs');
   const {mountReview,syntheticTutorial}=await import('/tutorial-review.mjs');
   const {finishTutorial,authoringReadiness}=await import('/tutorial-core.mjs');
   const {AUDIO_RATE,encodeNarration}=await import('/narration-core.mjs');
   const failures=[],passed=[];
   const check=(ok,message)=>{if(!ok)throw Error(message);};
   const run=async(name,fn)=>{try{await fn();passed.push(name);}catch(e){failures.push(`${name}: ${e.message}`);}};
   const waitFor=async predicate=>{for(let i=0;i<500;i++){if(predicate())return;await new Promise(r=>setTimeout(r,10));}throw Error('Browser action did not finish');};
   const make=(options={})=>{
    const g=new TutorialGuide({speak:()=>{},exit:()=>{},writeTutorial:async()=>{},...options});
    g.attach(new THREE.Scene());g.begin('home');g.start=[0,1,0];g.end=[.5,1,0];g.setWorkspace();
    g.tutorial=syntheticTutorial();g.tutorial.steps.forEach(s=>{s.guide_hands='both';s.acceptance='hold';});
    g.mode='capture';g.fluidCapture=true;g.frames=structuredClone(g.tutorial.steps[0].frames);
    return g;
   };
   await run('Home protects a take from nested screens',async()=>{
    for(const actions of [['discard-confirm'],['exit'],['home','settings'],['settings','boundary-help'],['settings','boundary-help','settings']]){
     const g=make();for(const id of actions)g.action(id);g.action('home');
     check(g.mode==='confirm-home'&&g.frames.length>0,`${actions.join(' -> ')} bypassed confirmation`);
    }
   });
   await run('Exit protects a take from nested screens',async()=>{
    let exits=0;const g=make({exit:()=>exits++});g.action('settings');g.action('boundary-help');g.action('exit');
    check(!exits&&g.mode==='confirm-exit'&&g.frames.length>0,'Boundary help discarded the take');
   });
   await run('accepted segment narration survives discarding the next take',async()=>{
    let resolveAudio;const writes=[];
    const narrator={take:{},finish(){this.take=null;return new Promise(r=>resolveAudio=r);},begin(){this.take={};},cancel(){this.take=null;},pause(){}};
    const g=make({narrator,writeTutorial:async data=>writes.push(structuredClone(data))});narrator.take={};
    g.tutorial.steps=[];g.sealFluidSegment();await g.saveQueue;
    check(!!writes.at(-1).steps[0].narration_issue,'Test must first persist pending audio');
    g.action('home');g.action('home-discard');
    resolveAudio(encodeNarration(new Float32Array(AUDIO_RATE*3)));
    await Promise.all([...g.segmentJobs]);await g.saveQueue;
    check(!!writes.at(-1).steps[0].narration&&!writes.at(-1).steps[0].narration_issue,'Completed audio never reached storage');
    check(g.mode==='home','Late narration changed the Home screen');
   });
   await run('storage failure pauses capture before delayed narration finishes',async()=>{
    let resolveAudio;
    const narrator={take:{},finish(){this.take=null;return new Promise(r=>resolveAudio=r);},begin(){this.take={};},cancel(){this.take=null;},pause(){}};
    const g=make({narrator,writeTutorial:async()=>{throw Error('Disk full');}});narrator.take={};
    g.tutorial.steps=[];g.sealFluidSegment();await g.saveQueue.catch(()=>{});await new Promise(r=>setTimeout(r,0));
    const paused=g.mode==='capture-paused';resolveAudio(null);await Promise.all([...g.segmentJobs]);
    check(paused,'Capture kept running after the motion write failed');
   });
   for(const target of ['capture','countdown','home'])await run(`late audio save failure protects ${target} after resetting the take`,async()=>{
    let resolveAudio,writes=0,pauses=0;
    const narrator={take:{},finish(){this.take=null;return new Promise(r=>resolveAudio=r);},begin(){this.take={};},cancel(){this.take=null;},pause(){pauses++;}};
    const g=make({narrator,writeTutorial:async()=>{if(++writes>1)throw Error('Disk full');}});narrator.take={};
    const sample=structuredClone(g.frames[0]);g.tutorial.steps=[];const tutorial=g.tutorial;g.sealFluidSegment();await g.saveQueue;
    g.action('home');g.action('home-discard');
    const originalNow=performance.now;let time=originalNow.call(performance);
    Object.defineProperty(performance,'now',{configurable:true,value:()=>time});
    try{
     if(target!=='home'){
      g.action('edit-current');g.action('setup-ready');g.start=[0,1,0];g.end=[.5,1,0];g.setWorkspace();g.action('placement-ready');
      g.sample=()=>sample[g.hand];g.action('primary');check(g.pending?.kind==='record','Resumed recording countdown did not start');
      if(target==='capture'){time=g.pending.until+1;g.tick({},{visibilityState:'visible'},{},time);check(g.mode==='capture','Recording did not resume');}
     }
     const previousProblem=g.problem,pauseCount=pauses,frames=g.frames.length;
     g.segmenter.progress=.5;
     resolveAudio(encodeNarration(new Float32Array(AUDIO_RATE*3)));await Promise.all([...g.segmentJobs]);
     check(g.tutorial===tutorial&&g.saveStatus==='failed'&&g.tutorial.steps[0].narration,'Failed final audio was not retained for retry/export');
     if(target==='home')check(g.mode==='home'&&g.problem===previousProblem&&pauses===pauseCount,'Late failure changed the inactive Home screen');
     else{
      check(g.mode===(target==='capture'?'capture-paused':'author')&&!g.pending,'Failed save left resumed capture or countdown active');
      check(pauses>pauseCount&&g.segmenter.progress===0&&g.problem.includes('Retry or export'),'Failed save did not pause narration, clear hold dwell and show recovery');
      time+=4000;g.tick({},{visibilityState:'visible'},{},time);
      check(g.frames.length===frames,'Capture added frames after storage failure');
     }
    }finally{Object.defineProperty(performance,'now',{configurable:true,value:originalNow});}
   });
   await run('narration startup failure remains a repairable draft',async()=>{
    const g=make();g.tutorial.steps=[];g.takeNarrationIssue='Microphone failed to start';g.sealFluidSegment(true);
    await Promise.all([...g.segmentJobs]);
    check(g.tutorial.steps[0].narration_issue==='Microphone failed to start'&&!g.tutorial.steps[0].acceptance,'Failed narration silently became hands-only acceptance');
   });
   await run('new tutorials wait for accepted narration to be stored',async()=>{
    let resolveAudio;const writes=[];
    const narrator={take:{},finish(){this.take=null;return new Promise(r=>resolveAudio=r);},begin(){this.take={};},cancel(){this.take=null;},pause(){}};
    const g=make({narrator,writeTutorial:async data=>writes.push(structuredClone(data))});narrator.take={};
    g.tutorial.steps=[];const oldId=g.tutorial.id;g.sealFluidSegment();await g.saveQueue;
    g.action('home');g.action('home-discard');g.action('create');
    check(g.mode==='saving'&&g.tutorial.id===oldId,'New tutorial replaced pending narration');
    resolveAudio(encodeNarration(new Float32Array(AUDIO_RATE*3)));await g.saveTask;await g.saveQueue;
    check(g.tutorial.id!==oldId&&g.mode==='setup-new','Create did not continue after finalization');
    check(writes.filter(t=>t.id===oldId).at(-1).steps[0].narration,'Earlier tutorial lost finalized narration');
   });
   await run('XR exit keeps accepted media without changing the next session',async()=>{
    let resolveAudio;const writes=[];
    const narrator={take:{},finish(){this.take=null;return new Promise(r=>resolveAudio=r);},begin(){this.take={};},cancel(){this.take=null;},pause(){},disable(){this.cancel();}};
    const g=make({narrator,writeTutorial:async data=>writes.push(structuredClone(data))});narrator.take={};
    g.tutorial.steps=[];g.sealFluidSegment();await g.saveQueue;g.endSession();g.begin('home');
    resolveAudio(encodeNarration(new Float32Array(AUDIO_RATE*3)));await Promise.all([...g.segmentJobs]);await g.saveQueue;
    check(g.mode==='home'&&writes.at(-1).steps[0].narration,'Session exit lost accepted audio or late work changed UI');
   });
   await run('failed final audio storage cannot be replaced by a new tutorial',async()=>{
    let resolveAudio,writes=0;
    const narrator={take:{},finish(){this.take=null;return new Promise(r=>resolveAudio=r);},begin(){this.take={};},cancel(){this.take=null;},pause(){}};
    const g=make({narrator,writeTutorial:async()=>{if(++writes>1)throw Error('Disk full');}});narrator.take={};
    g.tutorial.steps=[];const oldId=g.tutorial.id;g.sealFluidSegment();await g.saveQueue;
    g.action('home');g.action('home-discard');g.action('create');
    resolveAudio(encodeNarration(new Float32Array(AUDIO_RATE*3)));await g.saveTask;
    check(g.mode==='home'&&g.tutorial.id===oldId&&g.saveStatus==='failed'&&g.problem,'Failed final media was abandoned');
    g.action('create');check(g.tutorial.id===oldId,'Create discarded unsaved media on retry');
   });
   await run('desktop replacement cannot overwrite concurrently finalized narration',async()=>{
    let resolveAudio;
    const narrator={take:{},finish(){this.take=null;return new Promise(r=>resolveAudio=r);},begin(){this.take={};},cancel(){this.take=null;},pause(){},disable(){this.cancel();}};
    const g=make({narrator});narrator.take={};g.tutorial.steps=[];g.sealFluidSegment();await g.saveQueue;g.endSession();
    const draft=structuredClone(g.tutorial);draft.title='Concurrent edit';draft.revision++;
    const replacement=g.replaceTutorial(draft).then(()=>false,()=>true);
    resolveAudio(encodeNarration(new Float32Array(AUDIO_RATE*3)));
    check(await replacement,'Stale desktop draft overwrote finalized media');
    check(g.tutorial.steps[0].narration&&!g.tutorial.steps[0].narration_issue,'Completed media was not retained');
   });
   await run('library waits for accepted media and shows its durable result',async()=>{
    const {saveTutorial}=await import('/tutorial-store.mjs');let resolveAudio;
    const narrator={take:{},finish(){this.take=null;return new Promise(r=>resolveAudio=r);},begin(){this.take={};},cancel(){this.take=null;},pause(){}};
    const g=make({narrator,writeTutorial:data=>saveTutorial(data)});narrator.take={};g.tutorial.steps=[];g.sealFluidSegment();await g.saveQueue;
    g.action('home');g.action('home-discard');const opening=g.openLibrary();
    resolveAudio(encodeNarration(new Float32Array(AUDIO_RATE*3)));await opening;
    check(g.mode==='library'&&g.library.find(t=>t.id===g.tutorial.id)?.steps[0].narration,'Library opened an incomplete accepted step');
   });
   await run('dragging cancels a pending capture countdown',async()=>{
    const g=make();g.mode='author';g.frames=[];g.action('primary');check(!!g.pending,'Test must start the countdown');
    const scene=new THREE.Scene(),panel=new THREE.Mesh(new THREE.PlaneGeometry(1.08,.56),new THREE.MeshBasicMaterial());scene.add(panel);
    const spatial=new SpatialControls(scene,panel,g),source={},pose={transform:{position:{x:0,y:.307,z:1},orientation:{x:0,y:0,z:0,w:1}}};
    const workspace=JSON.stringify(g.workspace);check(spatial.start(source,pose),'Drag handle missed');
    check(!g.pending&&g.mode==='author'&&!g.frames.length,'Dragging left capture armed');
    check(JSON.stringify(g.workspace)===workspace,'Dragging changed calibration');
    spatial.end(source);g.mode='capture';g.segmenter.progress=.5;spatial.start(source,pose);
    check(g.mode==='capture-paused'&&g.segmenter.progress===0,'Dragging did not pause recording and hold');
   });
   await run('finished idle tails do not prompt as unfinished takes',async()=>{
    const g=make();g.action('fluid-stop');await g.saveTask;g.action('home');
    check(g.mode==='home'&&!g.hasUnfinishedTake(),'Discarded idle tail kept Home behind an unfinished-take prompt');
   });
   await run('desktop edits invalidate hold acceptance',async()=>{
    const g=make();g.endSession();g.tutorial=finishTutorial(g.tutorial);
    mountReview(g,{isActive:()=>false,tell:()=>{}});
    const input=document.getElementById('step-instruction');input.value='Changed task instruction';input.dispatchEvent(new Event('input'));
    document.getElementById('save-step-edits').click();
    await new Promise(r=>setTimeout(r,20));
    check(!g.tutorial.steps[0].acceptance&&!authoringReadiness(g.tutorial).ready,'Edited instruction retained author acceptance');
   });
   await run('desktop hand edits invalidate finish acceptance',async()=>{
    const g=make();g.endSession();g.tutorial.steps.forEach(s=>s.acceptance='finish');g.tutorial=finishTutorial(g.tutorial);
    mountReview(g,{isActive:()=>false,tell:()=>{}});
    check(document.getElementById('authoring-status').textContent.includes('expert-accepted'),'Unreviewed capture claimed expert review');
    const input=document.getElementById('guide-hands');input.value='right';input.dispatchEvent(new Event('change'));
    document.getElementById('save-step-edits').click();await new Promise(r=>setTimeout(r,20));
    check(!g.tutorial.steps[0].acceptance&&!authoringReadiness(g.tutorial).ready,'Changed required hands retained author acceptance');
   });
   for(const acceptance of ['hold','finish'])await run(`narrated instruction drafts invalidate ${acceptance} acceptance`,async()=>{
    const g=make();g.endSession();g.tutorial.steps=g.tutorial.steps.slice(0,1);
    const step=g.tutorial.steps[0];step.acceptance=acceptance;step.narration=encodeNarration(new Float32Array(AUDIO_RATE*3));
    g.tutorial=finishTutorial(g.tutorial);mountReview(g,{isActive:()=>false,tell:()=>{}});
    document.getElementById('draft-from-narration').click();
    await waitFor(()=>document.querySelector('#narration-proposals button')?.textContent==='Apply to this step');
    check(document.getElementById('narration-proposals').textContent.includes('flagged for review'),'Test draft must require review');
    document.querySelector('#narration-proposals button').click();
    await waitFor(()=>document.querySelector('#narration-proposals button')?.textContent==='Applied');
    const edited=g.tutorial.steps[0];
    check(edited.instruction==='Move the block to the left.'&&!edited.reviewed&&!edited.acceptance,'Applied draft retained obsolete capture acceptance');
    check(!g.tutorial.completion&&!authoringReadiness(g.tutorial).ready,'Changed draft became ready without review');
    let blocked=false;try{finishTutorial(g.tutorial);}catch{blocked=true;}check(blocked,'Finish accepted the unreviewed instruction');
    document.getElementById('reviewed').checked=true;document.getElementById('save-step-edits').click();
    await waitFor(()=>g.tutorial.steps[0].reviewed);
    check(!!finishTutorial(g.tutorial).completion,'Explicit review could not finish the repaired tutorial');
   });
   return {passed,failures};
  });
  assert.deepEqual(errors,[]);assert.deepEqual(result.failures,[]);console.log('PASS fluid recovery',result.passed);
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});
