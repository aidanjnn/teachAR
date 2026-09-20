// Review findings exercised against real IndexedDB and synthetic hands only.
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'@playwright/test');
const assert=require('node:assert/strict');
(async()=>{
  const browser=await chromium.launch({channel:process.env.TRAIL_BROWSER_CHANNEL||undefined,headless:true,args:['--enable-unsafe-swiftshader']});
  try{
    const page=await browser.newPage(),errors=[];
    page.on('pageerror',e=>errors.push(e.message));
    await page.route('**/api/**',async route=>{
      assert.equal(route.request().method(),'GET');
      await route.fulfill({contentType:'application/json',body:'{"automatic":{"enabled":false}}'});
    });
    await page.goto(`${process.env.TRAIL_TEST_ORIGIN||'http://127.0.0.1:4321'}/tutorial`);
    const result=await page.evaluate(async()=>{
      const THREE=await import('/vendor/three.module.js');
      const {TutorialGuide,tutorialButton}=await import('/tutorial-guide.mjs');
      const {TutorialPlayer,finishTutorial}=await import('/tutorial-core.mjs');
      const {syntheticTutorial}=await import('/tutorial-review.mjs');
      const {tutorialView}=await import('/tutorial-ui.mjs');
      const {loadTutorial,saveTutorial,draftVersion}=await import('/tutorial-store.mjs');
      const check=(condition,message)=>{if(!condition)throw Error(message);};
      const spoken=[];
      async function reviewing(){
        const g=new TutorialGuide({speak:message=>spoken.push(message),exit:()=>{}});
        await g.restore();g.attach(new THREE.Scene());g.begin('create');
        g.tutorial=syntheticTutorial();g.tutorial.steps=g.tutorial.steps.slice(0,1);
        g.tutorial.steps[0].guide_hands='both';g.start=[0,0,0];g.end=[.4,0,0];g.setWorkspace();
        g.mode='review-step';g.player=new TutorialPlayer(g.tutorial.steps);
        await g.persist();return g;
      }

      const g=await reviewing(),before=await loadTutorial();
      const transaction=IDBDatabase.prototype.transaction;
      try{
        IDBDatabase.prototype.transaction=function(stores,mode,...rest){
          if(mode==='readwrite')throw new DOMException('Synthetic quota exhaustion','QuotaExceededError');
          return transaction.call(this,stores,mode,...rest);
        };
        g.action('primary');await g.saveTask;
        check(g.mode==='review-step','Failed approval must keep the recording available for review');
        check(!g.tutorial.completion,'Failed write enabled Follow');
        const failed=tutorialView(g);
        check(failed.text.includes('Local save failed'),'Storage failure hidden from the headset');
        check(failed.buttons.some(b=>b.id==='retry-save'),'No headset retry control');
        const canvas=document.createElement('canvas');canvas.width=1080;canvas.height=560;
        g.draw(canvas.getContext('2d'),performance.now(),'');
        const retry=g.uiButtons.find(b=>b.id==='retry-save');
        check(retry.y+retry.h<=canvas.height,'Retry control rendered outside the headset panel');
        check(tutorialButton((retry.x+5)/1080,1-(retry.y+5)/560,g.uiButtons)==='retry-save','Retry hit target differs from its visible control');
        window.saveFailurePreview=canvas.toDataURL();
        check(!spoken.some(s=>s.includes('Tutorial saved')),'Spoke save success before a durable write');
        check(JSON.stringify(await loadTutorial())===JSON.stringify(before),'Failed write changed the stored draft');
      }finally{IDBDatabase.prototype.transaction=transaction;}

      g.action('retry-save');await g.saveQueue;
      check(g.saveStatus==='saved'&&!g.tutorial.completion,'Retry should save the draft, without inventing completion');
      let release;g.saveQueue=new Promise(resolve=>release=resolve);
      g.action('primary');
      check(g.mode==='saving-tutorial'&&!g.tutorial.completion,'Finalization did not wait for storage');
      check(!tutorialView(g).text.includes('Saved on this device'),'Pending write claimed success');
      g.action('start-follow');check(g.mode==='saving-tutorial','Follow bypassed a pending save');
      g.hide();release();await g.saveTask;
      check(g.mode==='saved'&&g.tutorial.completion,'Successful write did not finish after a focus interruption');
      check((await loadTutorial()).completion?.revision===g.tutorial.revision,'Success preceded the persisted completion');
      g.endSession();

      const conflict=await reviewing(),newer=await loadTutorial();
      const expected=draftVersion(newer);newer.revision++;newer.title='Newer tab edit';await saveTutorial(newer,expected);
      conflict.action('primary');await conflict.saveTask;
      check(conflict.mode==='review-step'&&!conflict.tutorial.completion,'A stale tab claimed save success');
      check(tutorialView(conflict).text.includes('Another tab'),'Conflict recovery instruction hidden');
      check((await loadTutorial()).title==='Newer tab edit','Stale tab overwrote newer data');conflict.endSession();

      const late=await reviewing();let releaseLate;late.saveQueue=new Promise(resolve=>releaseLate=resolve);
      late.action('primary');late.endSession();late.begin('home');releaseLate();await late.saveTask;
      check(late.mode==='home','Late save replaced a new session screen');
      check(!!(await loadTutorial()).completion,'Exiting discarded an already-requested durable save');late.endSession();

      const invalid=await reviewing(),step=invalid.player.step;
      step.guide_hands='recorded';step.frames[10].left=null;
      invalid.action('primary');check(!step.reviewed&&invalid.problem.includes('Choose required hands'),'Automatic hand selection was approved');
      check(invalid.mode==='choose-hands','Legacy hand choice should open visible options');invalid.action('hands-left');invalid.action('primary');
      check(!step.reviewed&&invalid.problem.includes('Required left hand is missing'),'Tracking gap was approved');
      check(invalid.mode==='review-step'&&!invalid.tutorial.completion,'Unfollowable recording escaped review');await invalid.saveQueue;invalid.endSession();

      // Persist an old completion without going through the new parser, as an
      // existing browser library would contain it. The library must call it a draft.
      const old=syntheticTutorial();old.title='Legacy automatic hand choice';
      old.steps.forEach(s=>{s.guide_hands='both';s.reviewed=true;});
      const legacy=finishTutorial(old);legacy.steps.forEach(s=>s.guide_hands='recorded');legacy.steps[0].frames[10].left=null;
      await saveTutorial(legacy,draftVersion(await loadTutorial()));
      return {quotaFailure:true,retry:true,pendingSave:true,conflict:true,lateSave:true,requiredHandReview:true};
    });
    require('node:fs').writeFileSync('/tmp/trail-pr17-save-failure.png',Buffer.from((await page.evaluate(()=>window.saveFailurePreview)).split(',')[1],'base64'));
    await page.reload();await page.locator('#browser-tools').evaluate(e=>e.open=true);await page.locator('[data-route=library]').first().click();
    const legacy=page.locator('.library-item').filter({hasText:'Legacy automatic hand choice'});
    await legacy.getByRole('button',{name:'Open tutorial'}).click();await page.locator('#selected-edit').click();
    await page.locator('#guide-hands').selectOption('both');await page.locator('#reviewed').check();
    await page.locator('#save-step-edits').click();
    await page.waitForFunction(()=>document.querySelector('#review-status').textContent.includes('Required left hand is missing'));
    assert.match(await page.locator('#authoring-status').innerText(),/^DRAFT/);
    assert.deepEqual(errors,[]);console.log('PASS review regressions',result);
  }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});
