// Synthetic WebXR poses. Exercises the real recorder/store; no paid provider or hardware.
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'@playwright/test');
const assert=require('node:assert/strict');
(async()=>{const browser=await chromium.launch({channel:process.env.TRAIL_BROWSER_CHANNEL||undefined,headless:true,args:['--enable-unsafe-swiftshader','--mute-audio']});try{
 const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/api/**',async r=>{assert.equal(r.request().method(),'GET');await r.fulfill({contentType:'application/json',body:'{}'});});
 await page.goto(`${process.env.TRAIL_TEST_ORIGIN||'http://127.0.0.1:4321'}/tutorial`);await page.locator('#browser-tools').evaluate(e=>e.open=true);
 const result=await page.evaluate(async()=>{
  const THREE=await import('/vendor/three.module.js'),{TutorialGuide}=await import('/tutorial-guide.mjs');
  const {validateTutorial}=await import('/tutorial-core.mjs'),{palm}=await import('/tutorial-assist.mjs'),{toWorld}=await import('/motion-core.mjs');
  const fail=m=>{throw Error(m);};const hand=p=>Array.from({length:25},()=>({p:[...p],q:[0,0,0,1]}));
  const pair=(x,z)=>({left:hand([x,1,z]),right:hand([x+.4,1,z])});
  let t=1000,data=pair(0,.3);Object.defineProperty(performance,'now',{configurable:true,value:()=>t});
  const g=new TutorialGuide({speak:()=>{},exit:()=>{}});await g.restore();g.attach(new THREE.Scene());g.sample=()=>data[g.hand];g.begin('home');g.action('create');g.action('create-continue');g.stepByStep=false;g.action('toggle-fluid');g.action('change-save-position'); // Exercise legacy manual review mode.

  const session={visibilityState:'visible'},tick=(n=1)=>{for(let i=0;i<n;i++){t+=40;g.tick({},session,{},t);}};
  if(g.mode!=='save-home')fail('Create did not ask for save position first');
  const setupHud=document.createElement('canvas');setupHud.width=1080;setupHud.height=560;g.draw(setupHud.getContext('2d'),t,'');window.saveSetupHud=setupHud.toDataURL();
  g.action('set-save-position');t=g.pending.until;tick(8);data.left=null;tick();data=pair(0,.3);tick(8);
  if(g.mode!=='save-home')fail('Missing hands did not clear position-capture hold');tick(20);
  if(g.mode!=='setup-new'||!g.saveHomeWorld)fail('Stable save position not captured');
  const hud=document.createElement('canvas');hud.width=1080;hud.height=560;
  g.action('setup-ready');
  const mark=p=>{data.right=hand(p);g.action('primary');t=g.pending.until-380;tick(11);};
  mark([0,1,0]);mark([.5,1,0]);g.action('placement-ready');
  const home=JSON.stringify(g.tutorial.save_position);if(g.mode!=='author'||!g.cleanSave||!g.tutorial.save_position)fail('Save zone not persisted after placement');
  if(Math.abs(g.tutorial.save_position.left[2]-.3)>.001)fail('Save position not workspace relative');
  for(let take=0;take<2;take++){
   // Different action starts must share the same chosen save zone.
   data=pair(take*.15,-.2);g.action('primary');t=g.pending.until;tick(15);
   if(JSON.stringify(g.endpoint.home)!==JSON.stringify([g.tutorial.save_position.left,g.tutorial.save_position.right]))fail('Take overwrote save zone');
   data=pair(take*.15+.2,-.2);tick(35);const end=g.endpoint.candidate;if(end===null)fail('Ending hold not recognized');
   // Return to this take's starting pose is not a save gesture.
   data=pair(take*.15,-.2);tick(5);if(g.mode!=='capture')fail('Take-start incorrectly triggered save');
   for(let i=1;i<=12;i++){data=pair(take*.15*(1-i/12),-.2+.5*i/12);tick();}
   data=pair(0,.3);tick(24);await g.saveQueue;
   if(g.mode!=='review-step'||g.tutorial.steps.length!==take+1)fail('Return to persistent save zone did not save: '+g.problem);
   const saved=g.tutorial.steps[take];if(saved.frames.at(-1).left[0].p[2]>-.19)fail('Return movement leaked into ghost');
   if(saved.duration_ms>end+40)fail('Saved past the final action hold');
   if(JSON.stringify(g.tutorial.save_position)!==home)fail('Save position changed after take');
   for(let i=0;i<3;i++)g.action('guide-hands');g.action('primary');await g.saveTask;await g.saveQueue;if(g.mode!=='saved')fail('Approve did not finish tutorial');
   if(take===0)g.action('author-back');
  }
  g.draw(hud.getContext('2d'),t,'');window.savePositionHud=hud.toDataURL();
  const exported=validateTutorial(g.exportData());if(JSON.stringify(exported.save_position)!==home)fail('Export dropped save position');
  g.endSession();const restored=new TutorialGuide({speak:()=>{},exit:()=>{}});await restored.restore();restored.attach(new THREE.Scene());restored.begin('create');
  if(restored.mode!=='setup-new'||JSON.stringify(restored.tutorial.save_position)!==home)fail('Reload made author choose save position again');
  restored.start=[1,1,2];restored.end=[1,1,2.8];restored.setWorkspace();restored.action('placement-ready');
  const moved=toWorld(restored.tutorial.save_position.left,restored.workspace);if(Math.hypot(...moved.map((v,i)=>v-[0,1,.3][i]))<.5)fail('Save rings stayed at old physical workspace');
  restored.action('author-options');restored.action('change-save-position');restored.action('cancel-save-position');
  if(JSON.stringify(restored.tutorial.save_position)!==home)fail('Cancel changed configured save position');
  restored.endSession();return {takes:2,sharedSavePosition:true,returnTrimmed:true,missingTrackingRejected:true,persistedAfterReload:true,relocatedWithWorkspace:true};
 });
 require('node:fs').writeFileSync('/tmp/trail-save-position-hud.png',Buffer.from((await page.evaluate(()=>window.savePositionHud)).split(',')[1],'base64'));
 require('node:fs').writeFileSync('/tmp/trail-save-setup-hud.png',Buffer.from((await page.evaluate(()=>window.saveSetupHud)).split(',')[1],'base64'));
 assert.deepEqual(errors,[]);console.log('PASS persistent tutorial save position',result);
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exit(1);});
