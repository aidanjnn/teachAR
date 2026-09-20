const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'@playwright/test');
const assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({channel:process.env.TRAIL_BROWSER_CHANNEL||undefined,headless:true,args:['--enable-unsafe-swiftshader']});
 try{
  const context=await browser.newContext({viewport:{width:1280,height:1000}}),page=await context.newPage(),errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  // A broken optional telemetry endpoint must not prevent the actual tutor bootstrap.
  await context.route('**/api/telemetry/config',route=>route.abort());
  await context.route('**/api/ai/status',route=>route.fulfill({contentType:'application/json',body:'{"automatic":{"enabled":false}}'}));
  await page.goto(`${process.env.TRAIL_TEST_ORIGIN||'http://127.0.0.1:4321'}/tutorial`);
  await page.waitForFunction(()=>document.querySelector('#hud-preview').getAttribute('aria-label').includes('Your workspace'));
  await page.locator('#browser-tools > summary').click();
  await page.locator('#developer-tools > summary').click();
  const hud=page.locator('#hud-preview'),bounds=await hud.boundingBox();
  // The first real preview control is Create, drawn from tutorialView's hit layout.
  const create=await page.evaluate(async()=>{
   const {tutorialView,uiButtons}=await import('/tutorial-ui.mjs');
   return uiButtons(tutorialView({mode:'home',tutorial:{steps:[]}})).find(button=>button.id==='create');
  });
  await hud.click({position:{x:(create.x+create.w/2)*bounds.width/1080,y:(create.y+create.h/2)*bounds.height/560}});
  await page.waitForFunction(()=>document.querySelector('#notice').textContent.includes('This is a preview'));
  const observed=await page.evaluate(async()=>{
   const {telemetry}=await import('/telemetry.mjs');
   return telemetry.snapshot().events.filter(event=>event.type==='interaction').map(event=>event.data);
  });
  const rejection=observed.findLast(event=>event.stage==='rejected'&&event.reason==='preview_only');
  assert(rejection,'actual DOM preview click must expose its rejection');
  const chain=observed.filter(event=>event.interaction_id===rejection.interaction_id);
  assert.deepEqual(chain.map(event=>event.stage),['targeted','activated','hit_test','rejected']);
  assert.equal(chain[0].control,'create');assert.equal(chain[0].source,'desktop');
  assert(!chain.some(event=>event.stage==='dispatched'||event.stage==='feedback_rendered'));
  assert.equal(await page.evaluate(async()=>{const {telemetry}=await import('/telemetry.mjs');return telemetry.snapshot().status;}),'local');
  // Exercise the observation adapter against current guide actions, not an old mocked state machine.
  const current=await page.evaluate(async()=>{
   const THREE=await import('/vendor/three.module.js'),{TutorialGuide}=await import('/tutorial-guide.mjs');
   const {syntheticTutorial}=await import('/tutorial-review.mjs'),{finishTutorial}=await import('/tutorial-core.mjs');
   const {Telemetry}=await import('/telemetry.mjs'),{createRuntimeObserver}=await import('/telemetry-runtime.mjs');
   const guide=new TutorialGuide({speak:()=>{},exit:()=>{}});guide.attach(new THREE.Scene());
   const fixture=syntheticTutorial();fixture.steps.forEach(step=>{step.guide_hands='both';step.reviewed=true;});
   guide.tutorial=finishTutorial(fixture);guide.begin('home');guide.followStyle='guided';guide.startLearning();guide.currentHands=fixture.steps[0].frames[0];
   const events=new Telemetry(),observer=createRuntimeObserver({telemetry:events,guide});
   observer.observe({active:true,visible:true,freshFrame:true});
   const state=()=>events.snapshot().events.filter(e=>e.type==='guide_state').at(-1).data;
   const states=[state()];
   const dispatch=control=>{const id=observer.activate(control);observer.hitTest(id,true);observer.dispatch(id,()=>guide.action(control));states.push(state());};
   dispatch('settings');dispatch('settings-back');dispatch('replay');dispatch('learn-options');dispatch('watch-demo');dispatch('try-follow');
   const actions=events.snapshot().events.filter(e=>e.type==='guide_action').map(e=>e.data.action);
   observer.close();return {states,actions,actualPhase:guide.practice.phase};
  });
  assert.deepEqual(current.states.map(state=>state.phase),['demo_preview','user_paused','user_paused','demo_preview','user_paused','user_paused','ready']);
  assert(current.states.slice(0,6).every(state=>state.attempt_id===current.states[0].attempt_id));
  assert.notEqual(current.states.at(-1).attempt_id,current.states[0].attempt_id);
  assert.equal(current.actualPhase,'ready');
  assert.equal(current.actions.filter(action=>action==='help').length,1);
  assert(!current.actions.includes('confirm'));
  assert.deepEqual(errors,[]);
  console.log('PASS actual preview click, current guide practice actions, and failed optional-config isolation (synthetic desktop only)');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exit(1);});
