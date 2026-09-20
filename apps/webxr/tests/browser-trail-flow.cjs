const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'@playwright/test');
const assert=require('node:assert/strict');
(async()=>{const browser=await chromium.launch({channel:process.env.TRAIL_BROWSER_CHANNEL||undefined,headless:true,args:['--enable-unsafe-swiftshader','--mute-audio']});try{
 const context=await browser.newContext({viewport:{width:1280,height:1100}}),page=await context.newPage(),errors=[];
 page.on('pageerror',e=>errors.push(e.message));await context.route('**/api/**',async r=>{assert.equal(r.request().method(),'GET');await r.fulfill({contentType:'application/json',body:'{"automatic":{"enabled":false}}'});});
 await page.goto(`${process.env.TRAIL_TEST_ORIGIN||'http://127.0.0.1:4321'}/tutorial`);await page.locator('#browser-tools').evaluate(e=>e.open=true);await page.getByRole('button',{name:'Create tutorial',exact:true}).click();
 await page.locator('#ready-create').click();await page.waitForFunction(()=>document.querySelector('#setup-status').textContent.includes('Setup saved'));
 await page.locator('#ready-create').click();await page.waitForFunction(()=>document.querySelector('#setup-status').textContent.includes('Setup saved'));
 const result=await page.evaluate(async()=>{
  const THREE=await import('/vendor/three.module.js'),{TutorialGuide,tutorialButton}=await import('/tutorial-guide.mjs');
  const {syntheticTutorial}=await import('/tutorial-review.mjs'),{finishTutorial}=await import('/tutorial-core.mjs');
  const {toWorld}=await import('/motion-core.mjs'),{saveTutorial,loadTutorial,listTutorials,draftVersion}=await import('/tutorial-store.mjs');
  const fail=m=>{throw Error(m);};const original=syntheticTutorial();original.title='Recorded movement test';original.steps.forEach(s=>{s.guide_hands='both';s.reviewed=true;});const demo=finishTutorial(original);
  await saveTutorial(demo,draftVersion(await loadTutorial()));
  const g=new TutorialGuide({speak:()=>{},exit:()=>{}});g.persist=()=>Promise.resolve();g.tutorial=structuredClone(demo);g.attach(new THREE.Scene());g.begin('follow');g.followStyle='guided';
  const coachSteps=[];let asks=0,attempts=0,stops=0;
  g.coach={active:true,mode:'text',caption:'Follow the current movement.',captionAgeMs:0,onStep:step=>coachSteps.push(step.id),onAttempt:()=>attempts++,ask:()=>asks++,stop:()=>stops++};
  let t=1000,data={};Object.defineProperty(performance,'now',{configurable:true,value:()=>t});g.sample=()=>data[g.hand];
  const hand=p=>Array.from({length:25},()=>({p:[...p],q:[0,0,0,1],radius:.007}));
  const session={visibilityState:'visible'},tick=(dt=40)=>{t+=dt;g.tick({},session,{},t);};
  const mark=p=>{data.right=hand(p);g.action('primary');t=g.pending.until-380;for(let i=0;i<105;i++)tick(20);};
  g.action('setup-ready');mark([1,1,-.3]);mark([1.75,1,-.3]);
  if(g.mode!=='placement'||Math.abs(g.workspace.span-.75)>.001)fail('New spacing rejected: '+g.problem);
  const frames=JSON.stringify(g.tutorial.steps[0].frames),p=demo.steps[0].frames[0].right[0].p;
  const world=toWorld(p,g.workspace);if(Math.abs(world[0]-(1+p[0]))>.0001)fail('Motion scaled by calibration spacing');
  g.action('adjust-placement');g.action('shift-left');g.action('rotate-placement');g.action('placement-back');
  if(JSON.stringify(g.tutorial.steps[0].frames)!==frames||g.space.scale.x!==1)fail('Placement mutated/scaled the recording');
  g.action('placement-ready');if(g.mode!=='learn'||g.player.time!==0||g.practice.phase!=='preview')fail('Follow did not begin with demonstration');
  if(coachSteps.at(-1)!==g.player.step.id)fail('Coach did not receive the previewed step');
  const {tutorialView}=await import('/tutorial-ui.mjs');
  if(!tutorialView(g).buttons.some(b=>b.id==='coach-ask'))fail('Practice lost the coach control');
  g.action('coach-ask');if(asks!==1||g.player.index!==0||g.practice.phase!=='preview')fail('Asking the coach changed local progression');
  const near=(frame,offset=0)=>Object.fromEntries(['left','right'].map(side=>[side,frame[side]?.map(j=>j?{...j,p:toWorld([j.p[0]+offset,j.p[1],j.p[2]],g.workspace)}:null)]));
  data=near(g.followEngine.target,1);for(let i=0;i<30;i++)tick();if(g.followEngine.started)fail('Far hands started guidance');
  g.action('primary');if(g.player.index!==0)fail('Unreached movement confirmed');
  while(g.practice.phase==='preview')tick();data=near(g.followEngine.target);for(let i=0;i<18;i++)tick();if(!g.followEngine.started)fail('Start hold failed');
  g.action('coach-ask'); // Clear the earlier rejected-confirmation message through a real action.
  if(!tutorialView(g).detail.startsWith('Coach:'))fail('Fresh coach caption missing during practice');
  g.coach.captionAgeMs=12000;if(tutorialView(g).detail.startsWith('Coach:'))fail('Expired coach caption hid practice guidance');g.coach.captionAgeMs=0;
  const gate=g.followEngine.index;data={};for(let i=0;i<20;i++)tick();if(g.followEngine.index!==gate||g.followEngine.state!=='tracking')fail('Missing hands advanced');
  if(tutorialView(g).detail.startsWith('Coach:'))fail('Coach caption hid tracking recovery');
  g.hide();session.visibilityState='visible';data=near(g.followEngine.target);tick();if(g.followEngine.index!==gate)fail('Visibility loss lost current gate');g.action('replay');
  for(let i=0;i<40;i++)tick();if(g.followEngine.index!==gate)fail('Unobserved movement during tracking loss advanced a gate');
  // Repeat the approach with fresh tracking; a hidden jump is not movement evidence.
  data=near(g.followEngine.gates[gate-1]);for(let i=0;i<20;i++)tick();
  for(let i=0;i<500&&!g.followEngine.done;i++){data=near(g.followEngine.target);tick();}
  if(!g.followEngine.done||g.player.index!==0)fail('Checkpoint or progression authority failed');
  const hud=document.createElement('canvas');hud.width=1080;hud.height=560;g.draw(hud.getContext('2d'),t,'');window.trailNewHud=hud.toDataURL();
  if(g.uiButtons.some(b=>b.id==='primary'))fail('Checkpoint still requires a button');
  for(let i=0;i<40&&g.player.index===0;i++)tick();
  if(g.player.index!==1||g.practice.phase!=='preview'||g.player.confirmations.length)fail('Automatic next step must preview without claiming physical confirmation');
  if(coachSteps.at(-1)!==g.player.step.id)fail('Automatic transition left the coach on the previous step');
  const beforeRepeat=attempts;g.action('restart-follow');
  if(attempts!==beforeRepeat+1||g.practice.phase!=='preview'||coachSteps.at(-1)!==g.player.step.id)fail('Repeat lost coach attempt or local preview');
  g.action('watch-demo');tick();if(!g.watchOnly||g.player.time===0)fail('Watch mode did not replay');g.action('primary');if(g.player.index!==1)fail('Watching completed task');
  g.action('try-follow');if(g.watchOnly||g.followEngine.started)fail('Return to guided mode skipped start');
  for(let i=0;i<600&&g.mode==='learn';i++){data=near(g.followEngine.target);tick();}
  if(g.mode!=='finished'||!g.movementOnly||g.player.confirmations.length)fail('Final movement must finish hands-free without physical confirmation');
  if(g.exportDiagnostics().events.filter(e=>e.event==='movement_step_completed').length!==2)fail('Movement-only completions disappeared from exported diagnostics');
  g.endSession();
  if(stops!==1)fail('Ending guidance did not stop the coach');
  // New contextual authoring, including pause and safe replacement discard.
  const a=new TutorialGuide({speak:()=>{},exit:()=>{}});a.attach(new THREE.Scene());a.persist=()=>Promise.resolve();a.begin('home');a.sample=()=>data[a.hand];
  const atick=(dt=40)=>{t+=dt;a.tick({},session,{},t);};
  a.action('create');a.action('create-continue');a.stepByStep=false;a.action('toggle-fluid');a.action('change-save-position'); // Exercise legacy manual review mode.
if(a.mode!=='save-home')fail('Create must begin with save-position setup');
  a.action('set-save-position');t=a.pending.until;data={left:hand([0,1,.3]),right:hand([.4,1,.3])};for(let i=0;i<25;i++)atick();a.action('setup-ready');
  const amark=p=>{data.right=hand(p);a.action('primary');t=a.pending.until-380;for(let i=0;i<105;i++)atick(20);};
  amark([0,1,0]);amark([.5,1,0]);a.action('placement-ready');
  if(a.mode!=='author'||!a.tutorial.save_position)fail('Create placement did not store save position');a.cleanSave=false; // Manual finish path remains available.
  a.action('primary');t=a.pending.until;
  for(let i=0;i<60;i++){data={left:hand([.05+i*.003,1,0]),right:hand([.3,1,0])};atick();}
  a.action('replay');const elapsed=a.recordElapsed;atick(2000);if(a.recordElapsed!==elapsed)fail('New author pause included time');
  a.action('primary');if(a.mode!=='review-step'||a.tutorial.steps.length!==1)fail('New capture did not open review: '+a.problem);
  const saved=a.tutorial.steps[0];a.action('hand');t=a.pending.until;atick();a.action('discard-confirm');a.action('discard-take');
  if(a.tutorial.steps[0]!==saved)fail('New replacement discard erased original');
  a.action('hand');for(let i=0;i<3;i++)a.action('guide-hands');a.action('primary');await a.saveTask;if(a.mode!=='saved'||!a.tutorial.completion)fail('Approve did not finish and save: '+a.problem);
  a.followStyle='guided';a.action('start-follow');if(a.mode!=='setup-follow'||a.workspace)fail('Follow skipped intentional placement');a.action('setup-ready');amark([0,1,0]);amark([.5,1,0]);a.action('placement-ready');if(a.mode!=='learn'||a.followEngine.started)fail('Created tutorial did not start with waiting ghost');
  a.endSession();
  const blank=syntheticTutorial();blank.title='Other saved recording';await saveTutorial(blank,draftVersion(await loadTutorial()));
  const library=await listTutorials();if(!library.some(t=>t.id===demo.id)||!library.some(t=>t.id===blank.id))fail('Creating a new project lost an existing one');
  return {newSpacing:.75,originalScale:true,orderedFollow:true,trackingRecovery:true,libraryCount:library.length};
 });
 require('node:fs').writeFileSync('/tmp/trail-new-hud.png',Buffer.from((await page.evaluate(()=>window.trailNewHud)).split(',')[1],'base64'));
 await page.reload();await page.locator('#browser-tools').evaluate(e=>e.open=true);await page.locator('[data-route=library]').first().click();await page.waitForFunction(()=>document.querySelectorAll('.library-item').length===2);
 await page.screenshot({path:'/tmp/trail-library-new.png',fullPage:true});await page.locator('.library-item').filter({hasText:'Recorded movement test'}).getByRole('button',{name:'Open tutorial'}).click();await page.locator('#selected-follow').click();await page.waitForFunction(()=>document.querySelector('#launch-title').textContent==='Follow inside AR');
 await page.locator('[data-route=home]').click();await page.screenshot({path:'/tmp/trail-home-new.png',fullPage:true});
 await page.setViewportSize({width:375,height:950});await page.screenshot({path:'/tmp/trail-home-mobile.png',fullPage:true});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
 // Upgrade the actual old IndexedDB shape in a fresh browser profile.
 const migrationContext=await browser.newContext(),migration=await migrationContext.newPage();
 await migrationContext.route('**/api/**',r=>r.fulfill({contentType:'application/json',body:'{}'}));
 await migration.goto(`${process.env.TRAIL_TEST_ORIGIN||'http://127.0.0.1:4321'}/not-a-page`);
 const oldId=await migration.evaluate(async()=>{
  const {syntheticTutorial}=await import('/tutorial-review.mjs');const old=syntheticTutorial();old.title='Existing device recording';
  await new Promise((resolve,reject)=>{const r=indexedDB.open('trail-tutorials',1);r.onupgradeneeded=()=>r.result.createObjectStore('drafts');r.onerror=()=>reject(r.error);r.onsuccess=()=>{const db=r.result,tx=db.transaction('drafts','readwrite');tx.objectStore('drafts').put(old,'current');tx.oncomplete=()=>{db.close();resolve();};tx.onerror=()=>reject(tx.error);};});return old.id;
 });
 await migration.goto(`${process.env.TRAIL_TEST_ORIGIN||'http://127.0.0.1:4321'}/tutorial`);await migration.locator('#browser-tools').evaluate(e=>e.open=true);await migration.locator('[data-route=library]').first().click();await migration.getByText('Existing device recording',{exact:true}).waitFor();
 assert.equal(await migration.evaluate(async()=>{const m=await import('/tutorial-store.mjs');return(await m.loadTutorial()).id;}),oldId);
 await migrationContext.close();
 assert.deepEqual(errors,[]);console.log('PASS new Trail workflow', {...result,authoring:true,oldLibraryMigration:true});
 // Render output captured before reload is returned via the evaluation in a separate lightweight check elsewhere.
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exit(1);});
