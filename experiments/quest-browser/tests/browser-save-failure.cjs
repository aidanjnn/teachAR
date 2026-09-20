const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'@playwright/test');
const assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({channel:process.env.TRAIL_BROWSER_CHANNEL||undefined,headless:true,args:['--enable-unsafe-swiftshader']});
 try{
  const page=await browser.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/api/**',r=>r.fulfill({contentType:'application/json',body:'{}'}));
  await page.goto(`${process.env.TRAIL_TEST_ORIGIN||'http://127.0.0.1:4321'}/tutorial`);
  await page.evaluate(async()=>{
   const {TutorialGuide}=await import('/tutorial-guide.mjs');
   const {syntheticTutorial}=await import('/tutorial-review.mjs');
   const {TutorialPlayer}=await import('/tutorial-core.mjs');
   const {tutorialView}=await import('/tutorial-ui.mjs');
   const {loadTutorial,saveTutorial,draftVersion}=await import('/tutorial-store.mjs');
   const check=(value,message)=>{if(!value)throw Error(message);};
   const g=new TutorialGuide({speak:()=>{},exit:()=>{}});
   g.tutorial=syntheticTutorial();g.tutorial.steps=g.tutorial.steps.slice(0,1);
   g.player=new TutorialPlayer(g.tutorial.steps);g.mode='review-step';g.ux=true;g.activeSession=true;
   g.workspace={};g.photoPanel={visible:true};
   g.persistedVersion=draftVersion(await loadTutorial());
   const baseline=JSON.stringify(await loadTutorial()),originalOpen=indexedDB.open;
   // The real action, persistence queue and view run; only storage failure is injected.
   indexedDB.open=function(){
    const request={error:new DOMException('Storage is full','QuotaExceededError')};
    queueMicrotask(()=>request.onerror?.());return request;
   };
   try{
    g.action('primary');
    check(g.mode==='saving-tutorial','Approval must wait for persistence');
    check(!tutorialView(g).text.includes('Saved on this device'),'No success before durable save');
    await g.finishTask;
    check(g.mode==='save-failed','Failed write must remain recoverable');
    const view=tutorialView(g);
    check(view.title==='Tutorial has not been saved'&&view.detail.includes('export'),'Failure and export recovery visible in headset');
    check(view.buttons.some(b=>b.id==='retry-save'),'Retry is offered');
    g.action('start-follow');check(g.mode==='save-failed','Failed save cannot enter saved/follow flow');
    check(g.exportData().steps.length===1,'Unsaved work remains exportable');
   }finally{indexedDB.open=originalOpen;}
   check(JSON.stringify(await loadTutorial())===baseline,'Failed save changed no durable draft');
   g.action('retry-save');await g.finishTask;
   check(g.mode==='saved'&&tutorialView(g).text.includes('Saved on this device'),'Successful retry announces durable save');
   const durable=await loadTutorial();
   check(durable.id===g.tutorial.id&&durable.completion,'Retry really stored the reviewed tutorial');
   // An actual competing IndexedDB write must not be overwritten or presented as success.
   const competing=structuredClone(durable);competing.title='Other tab';competing.revision++;competing.completion=null;
   await saveTutorial(competing,draftVersion(durable));
   await g.finishAuthoring();
   check(g.mode==='save-failed'&&tutorialView(g).detail.includes('Another tab'),'Conflict is visible instead of false success');
   check((await loadTutorial()).title==='Other tab','Conflict preserves the other tab');
  });
  assert.deepEqual(errors,[]);
  console.log('PASS AR approval persistence: pending, quota failure, retry, durable save and competing-tab conflict.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});
