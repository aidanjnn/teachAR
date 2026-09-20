// Coach smoke: mocked server, fake microphone. Proves the tutor publishes a coach guide, asks with that guide id,
// and follows step changes through the adapter. No provider call, no hardware claim.
const {chromium}=require(process.env.PLAYWRIGHT_MODULE || '@playwright/test');
const assert=require('node:assert/strict');
(async()=>{
  const browser=await chromium.launch({channel:process.env.TRAIL_BROWSER_CHANNEL||undefined,headless:true,
    args:['--enable-unsafe-swiftshader','--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream','--autoplay-policy=no-user-gesture-required']});
  try {
    const page=await browser.newPage({viewport:{width:1200,height:950}}),errors=[],coachBodies=[];let publishes=0;
    page.on('pageerror',e=>errors.push(e.message));
    const guideId='22222222-2222-4222-8222-222222222222';
    await page.route('**/api/**',async route=>{
      const request=route.request(),url=new URL(request.url()),method=request.method();
      const json=(status,body)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify(body)});
      if(url.pathname==='/api/session'&&method==='POST')return json(200,{role:'author',sessionId:'33333333-3333-4333-8333-333333333333',client:'browser',expiresAt:Date.now()+3600000});
      if(url.pathname==='/api/coach-guides'&&method==='POST'){
        const body=request.postDataJSON();publishes++;
        assert.equal(body.schemaVersion,1);assert.equal(body.steps.length,2);assert.ok(body.steps.every(s=>s.title&&s.instruction),'published steps carry title and instruction');
        return json(200,{id:guideId,revision:1});
      }
      if(/^\/api\/coach-guides\/[^/]+\/query$/.test(url.pathname)&&method==='POST')return json(200,{id:guideId,revision:1});
      if(url.pathname==='/api/live/sessions'&&method==='POST')return json(503,{error:'live_unavailable',message:'mock server'});
      if(url.pathname==='/api/coach'&&method==='POST'){
        const body=request.postDataJSON();coachBodies.push(body);const c=body.context;
        return json(200,{schemaVersion:1,requestId:body.requestId,runId:c.runId,tutorialId:c.tutorialId,tutorialRevision:c.tutorialRevision,
          stepId:c.currentStepId,stepRevision:c.stepRevision,attemptId:c.attemptId,answer:'Answer for '+c.currentStepId,grounded:true,source:'fallback',model:null});
      }
      if(method==='GET')return json(200,{enabled:true,calls:0,automatic:{enabled:false},capture:{source:'quest'}});
      throw Error(`Unexpected request ${method} ${url.pathname}`);
    });
    const origin=process.env.TRAIL_TEST_ORIGIN||'http://127.0.0.1:4321';
    await page.goto(`${origin}/tutorial`);
    await page.waitForFunction(()=>document.querySelector('#coach-mode')?.textContent==='idle'&&document.querySelector('#tutorial-title'));
    const stepIds=await page.evaluate(async()=>{
      const {newTutorial,prepareStep,finishTutorial}=await import('/tutorial-core.mjs');
      const {saveTutorial,loadTutorial,draftVersion}=await import('/tutorial-store.mjs');
      const hand=x=>Array.from({length:25},()=>({p:[x,0,0],q:[0,0,0,1]}));
      const frames=()=>Array.from({length:40},(_,i)=>({t:i*40,left:hand(.1+i*.002),right:hand(.3)}));
      const tutorial=newTutorial('Coach smoke');tutorial.setup='Two blocks on the mat.';tutorial.calibration_span_m=.4;
      tutorial.steps.push(prepareStep(frames(),'Slide the base to the centre.','Slide the base'));
      tutorial.steps.push(prepareStep(frames(),'Drop the support into the base.',''));
      tutorial.steps.forEach(s=>{s.guide_hands='both';s.reviewed=true;});
      const finished=finishTutorial(tutorial);
      const existing=await loadTutorial().catch(()=>null);
      await saveTutorial(finished,existing?draftVersion(existing):undefined);
      return finished.steps.map(s=>s.id);
    });
    await page.reload();await page.locator('#browser-tools > summary').click();
    await page.waitForFunction(()=>document.querySelector('#tutorial-title').value==='Coach smoke');
    await page.evaluate(async()=>{const {loadTutorial}=await import('/tutorial-store.mjs');const t=await loadTutorial();await window.trailCoach.start(t,t.steps[0],0);});
    await page.waitForFunction(()=>document.querySelector('#coach-mode').textContent==='text',null,{timeout:20000});
    assert.equal(publishes,1,'the tutorial was published as a coach guide once');
    await page.fill('#coach-question','what now');await page.click('#coach-ask-text');
    await page.waitForFunction(id=>document.querySelector('#coach-log').textContent.includes('Answer for '+id),stepIds[0]);
    assert.equal(coachBodies.at(-1).context.tutorialId,guideId,'questions carry the published guide id, not the browser tutorial id');
    assert.equal(coachBodies.at(-1).context.currentStepId,stepIds[0]);
    assert.equal(coachBodies.at(-1).context.steps[1].title,'Drop the support into the base.'.slice(0,60),'empty titles are filled from the instruction');
    await page.evaluate(id=>window.trailCoach.onStep({id},5),stepIds[1]);
    await page.fill('#coach-question','and now');await page.click('#coach-ask-text');
    await page.waitForFunction(id=>document.querySelector('#coach-log').textContent.includes('Answer for '+id),stepIds[1]);
    assert.equal(coachBodies.at(-1).context.currentStepId,stepIds[1]);
    assert.equal(coachBodies.at(-1).context.stepRevision,5,'the tutor epoch travels as the step revision');
    const stored=await page.evaluate(()=>JSON.parse(localStorage.getItem('trail-coach-guides')));
    assert.equal(Object.values(stored)[0].id,guideId);
    await page.evaluate(async()=>{const {loadTutorial}=await import('/tutorial-store.mjs');const t=await loadTutorial();await window.trailCoach.start(t,t.steps[0],0);});
    await page.waitForFunction(()=>document.querySelector('#coach-mode').textContent==='text',null,{timeout:20000});
    assert.equal(publishes,1,'restarting at the same revision does not republish');
    await page.click('#coach-stop');
    await page.waitForFunction(()=>document.querySelector('#coach-mode').textContent==='idle');
    assert.ok(!JSON.stringify(coachBodies).includes('OPENAI'),'no provider material in requests');
    assert.deepEqual(errors,[]);
    console.log('browser-coach: text coach grounded on a published guide; step context follows the tutor.');
  } finally { await browser.close(); }
})().catch(error=>{console.error(error);process.exit(1);});
