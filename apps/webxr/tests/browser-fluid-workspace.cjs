const {chromium}=require('@playwright/test');const assert=require('node:assert/strict');
(async()=>{const browser=await chromium.launch({headless:true,args:['--enable-unsafe-swiftshader','--mute-audio']});try{
 const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.route('**/api/**',r=>r.fulfill({contentType:'application/json',body:'{}'}));await page.goto(`${process.env.TRAIL_TEST_ORIGIN}/tutorial`);
 const result=await page.evaluate(async()=>{
  const THREE=await import('/vendor/three.module.js'),{TutorialGuide}=await import('/tutorial-guide.mjs'),{SpatialControls}=await import('/spatial-controls.mjs'),{validateTutorial,learningReadiness}=await import('/tutorial-core.mjs');
  const fail=m=>{throw Error(m);},hand=p=>Array.from({length:25},()=>({p:[...p],q:[0,0,0,1]}));
  const pair=x=>({left:hand([x,1,0]),right:hand([x+.4,1,0])});let t=1000,data=pair(0);Object.defineProperty(performance,'now',{configurable:true,value:()=>t});
  const scene=new THREE.Scene(),g=new TutorialGuide({speak:()=>{},exit:()=>{}});await g.restore();g.attach(scene);await Promise.all([g.skinHand.loaded,g.leftGhost.skinHand.loaded]);g.sample=()=>data[g.hand];g.begin('home');g.action('create');if(!g.fluidCapture||g.mode!=='create-intro')fail('Default is not fluid in AR');
  g.action('create-continue');g.saveHomeWorld=[[0,1,0],[.4,1,0]];g.action('setup-ready');g.start=[0,1,0];g.end=[.5,1,0];g.setWorkspace();g.action('placement-ready');if(g.mode!=='author')fail('Fluid capture unnecessarily requires a return-save position');
  const session={visibilityState:'visible'},tick=(n=1)=>{for(let i=0;i<n;i++){t+=40;g.tick({},session,{},t);}};
  g.action('primary');t=g.pending.until;tick();tick(35);if(g.tutorial.steps.length)fail('Idle start saved a segment');
  for(let i=1;i<=30;i++){data=pair(.2*i/30);tick();}tick(60);await Promise.all([...g.segmentJobs]);await g.saveQueue;
  if(g.mode!=='step-ready'||g.tutorial.steps.length!==1||g.tutorial.steps[0].reviewed||g.tutorial.steps[0].acceptance!=='hold')fail('First hold did not continue capture with honest acceptance');
  tick(70);if(g.tutorial.steps.length!==1)fail('Resting hands repeatedly saved');
  data=pair(0);tick(20);if(!g.pending)fail('No next-step countdown at rest');t=g.pending.until;tick();for(let i=1;i<=30;i++){data=pair(.4*i/30);tick();}tick(60);await Promise.all([...g.segmentJobs]);await g.saveQueue;
  if(g.tutorial.steps.length!==2||g.mode!=='step-ready')fail('Second segment not saved continuously');
  g.action('finish-tutorial');await g.saveTask;const exported=validateTutorial(g.exportData());if(!learningReadiness(exported).ready||g.mode!=='saved'||exported.steps.length!==2)fail('Finish did not produce ready tutorial without another idle step');
  if(!exported.completion.kind.includes('accepted'))fail('Continuous capture misrepresented as replay reviewed');
  const panel=new THREE.Mesh(new THREE.PlaneGeometry(1.08,.56),new THREE.MeshBasicMaterial());scene.add(panel);const spatial=new SpatialControls(scene,panel,g),source={};
  const pose=(x,y,z)=>({transform:{position:{x,y,z},orientation:{x:0,y:0,z:0,w:1}}});
  const workspace=JSON.stringify(g.workspace);if(!spatial.start(source,pose(0,.307,1)))fail('Handle not ray draggable');spatial.move(source,pose(.3,.4,1));spatial.end(source);if(panel.position.x<.29||JSON.stringify(g.workspace)!==workspace)fail('Panel drag moved tutorial or failed');
  spatial.tick(t,pose(0,1,1));if(!spatial.timer.visible)fail('Workspace timer missing');
  // A top-down ray can move the timer independently without moving the workspace.
  const timerSource={},q=spatial.timer.quaternion.clone(),p=spatial.timer.position.clone();
  const above={transform:{position:{x:p.x,y:p.y,z:p.z+1},orientation:q}};
  if(!spatial.start(timerSource,above))fail('Timer not draggable');above.transform.position.x+=.1;spatial.move(timerSource,above);spatial.end(timerSource);if(!spatial.timerMoved||JSON.stringify(g.workspace)!==workspace)fail('Timer drag altered calibration');
  g.action('home');if(g.mode!=='home')fail('Global home failed');await g.openLibrary();g.libraryQuery='tutorial';if(!g.libraryItems().length)fail('Saved tutorial absent from search');g.libraryQuery='no such tutorial';if(g.libraryItems().length)fail('Search did not filter');g.libraryQuery='';
  const c=document.createElement('canvas');c.width=1080;c.height=560;g.draw(c.getContext('2d'),t,'');window.libraryImage=c.toDataURL();
  g.mode='capture';g.action('home');if(g.mode!=='confirm-home')fail('Home discarded live take');g.action('keep-take');if(g.mode!=='capture-paused')fail('Home cancel resumed unsafe capture');
  g.endSession();g.nextEntry='follow';g.begin('home');if(g.mode!=='home')fail('Entry resumed prior instructions');
  // A denied write must never leave recording running or announce durable success.
  const events=[],bad=new TutorialGuide({speak:()=>{},exit:()=>{},onFeedback:e=>events.push(e),writeTutorial:async()=>{throw Error('Disk full');}});bad.attach(new THREE.Scene());bad.begin('home');bad.fluidCapture=true;bad.start=[0,1,0];bad.end=[.5,1,0];bad.setWorkspace();bad.mode='capture';bad.frames=exported.steps[0].frames;bad.tutorial.setup='Task setup';bad.sealFluidSegment();await Promise.all([...bad.segmentJobs]);
  if(bad.mode!=='capture-paused'||events.some(e=>e.kind==='saved'))fail('Failed save continued or emitted success');
  let rejectWrite;const late=new TutorialGuide({speak:()=>{},exit:()=>{},writeTutorial:()=>new Promise((_,reject)=>rejectWrite=reject)});late.attach(new THREE.Scene());late.begin('home');late.start=[0,1,0];late.end=[.5,1,0];late.setWorkspace();late.mode='capture';late.frames=exported.steps[0].frames;late.sealFluidSegment();while(!rejectWrite)await new Promise(r=>setTimeout(r,0));late.reset();late.mode='home';rejectWrite(Error('Late write failure'));await Promise.all([...late.segmentJobs]);if(late.mode!=='home')fail('Old save failure overwrote Home');
  const replacement=new TutorialGuide({speak:()=>{},exit:()=>{},writeTutorial:async()=>{}});replacement.attach(new THREE.Scene());replacement.begin('home');replacement.tutorial=validateTutorial(exported);replacement.start=[0,1,0];replacement.end=[.5,1,0];replacement.setWorkspace();replacement.mode='author';replacement.fluidCapture=true;replacement.action('hand');replacement.action('hand');if(replacement.fluidCapture||replacement.replaceIndex!==0||!replacement.pending)fail('Replacement would append continuous segments');
  // Required-hand gaps stay drafts even when an author accepts an endpoint.
  const gap=new TutorialGuide({speak:()=>{},exit:()=>{},writeTutorial:async()=>{}});gap.attach(new THREE.Scene());gap.begin('home');gap.start=[0,1,0];gap.end=[.5,1,0];gap.setWorkspace();gap.mode='capture';gap.frames=structuredClone(exported.steps[0].frames);gap.frames[8].left=null;gap.tutorial.setup='Task setup';gap.sealFluidSegment();await Promise.all([...gap.segmentJobs]);
  if(gap.tutorial.steps[0].acceptance||learningReadiness(gap.tutorial).ready)fail('Hidden required hand silently accepted');
  // Home during durable finalization waits, then opens Home instead of replay.
  let commit;const finishing=new TutorialGuide({speak:()=>{},exit:()=>{},writeTutorial:()=>new Promise(r=>commit=r)});finishing.attach(new THREE.Scene());finishing.begin('home');finishing.tutorial=validateTutorial(exported);finishing.mode='author';const done=finishing.finishAuthoring();while(!commit)await new Promise(r=>setTimeout(r,0));finishing.action('home');if(finishing.mode!=='saving-tutorial')fail('Home interrupted finalization');commit();await done;if(finishing.mode!=='home')fail('Deferred Home did not survive final save');
  // Permission UI can blur XR without cancelling the requested media setup.
  let resolveMedia;const media=new TutorialGuide({speak:()=>{},exit:()=>{},media:{enable:()=>new Promise(r=>resolveMedia=r),cancel:()=>{}}});media.attach(new THREE.Scene());media.persist=()=>Promise.resolve();media.begin('home');media.action('create');media.action('create-continue');media.action('media-enable');media.hide();resolveMedia({camera:true,microphone:true,errors:[]});await media.mediaTask;if(media.mode!=='save-home')fail('System permission blur stranded setup');
  return {continuousSegments:2,noIdleDuplicates:true,acceptedNotReviewed:true,readyLibrary:true,panelAndTimerDrag:true,workspaceUnchanged:true,homeRecovery:true};
 });
 require('node:fs').writeFileSync('/tmp/trail-fluid-library.png',Buffer.from((await page.evaluate(()=>window.libraryImage)).split(',')[1],'base64'));assert.deepEqual(errors,[]);console.log('PASS fluid workspace',result);
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exit(1);});
