// Real MediaRecorder/WebAudio with a synthetic tone; no physical microphone or paid provider.
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'@playwright/test');
const assert=require('node:assert/strict');
(async()=>{
  const browser=await chromium.launch({channel:process.env.TRAIL_BROWSER_CHANNEL||undefined,headless:true,args:['--enable-unsafe-swiftshader','--autoplay-policy=no-user-gesture-required','--mute-audio']});
  try{
    const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
    await page.route('**/api/**',async route=>{
      assert.equal(route.request().method(),'GET','Narration must never upload audio or invoke a paid provider');
      await route.fulfill({contentType:'application/json',body:JSON.stringify({enabled:false,automatic:{enabled:false},capture:{source:'quest'}})});
    });
    await page.addInitScript(()=>{
      window.microphoneDenied=true;
      Object.defineProperty(navigator.mediaDevices,'getUserMedia',{value:async constraints=>{
        if(!constraints.audio)throw Error('Only the synthetic microphone is allowed in this test');
        if(window.microphoneDenied)throw new DOMException('Synthetic denial','NotAllowedError');
        const context=new AudioContext(),tone=context.createOscillator(),destination=context.createMediaStreamDestination();
        tone.frequency.value=440;tone.connect(destination);tone.start();await context.resume();
        destination.stream.getTracks().forEach(t=>t.addEventListener('ended',()=>context.close()));
        return destination.stream;
      }});
    });
    await page.goto(`${process.env.TRAIL_TEST_ORIGIN||'http://127.0.0.1:4321'}/tutorial`);await page.locator('#browser-tools').evaluate(e=>e.open=true);await page.locator('#device-settings').evaluate(e=>e.open=true);
    await page.locator('#microphone-enable').click();await page.waitForFunction(()=>document.querySelector('#microphone-status').textContent.includes('unavailable'));
    await page.evaluate(()=>window.microphoneDenied=false);await page.locator('#microphone-enable').click();
    await page.waitForFunction(()=>document.querySelector('#microphone-status').textContent.includes('ready'));
    await page.locator('#microphone-disable').click();
    const result=await page.evaluate(async()=>{
      const {NarrationRecorder,NarrationPlayback}=await import('/narration.mjs');
      const {TutorialGuide}=await import('/tutorial-guide.mjs');
      const {JOINTS}=await import('/motion-core.mjs');const THREE=await import('/vendor/three.module.js');
      const {validateTutorial}=await import('/tutorial-core.mjs');
      const fail=s=>{throw Error(s);},wait=ms=>new Promise(r=>setTimeout(r,ms));
      const narrator=new NarrationRecorder();await narrator.enable();
      const playback=new NarrationPlayback();playback.unlock();await playback.context.resume();
      const g=new TutorialGuide({speak:()=>{},exit:()=>{},snapshot:()=>{},narrator,audioPlayer:playback});
      g.attach(new THREE.Scene());g.activeSession=true;g.start=[0,1,-.5];g.end=[.4,1,-.5];g.setWorkspace();
      g.tutorial.setup='Synthetic audio/motion test; no physical task was demonstrated.';g.tutorial.source='synthetic-fixture';
      const session={visibilityState:'visible',inputSources:['left','right'].map(side=>({handedness:side,hand:new Map(JOINTS.map((name,i)=>[name,{side,i}]))}))};
      const frame={getJointPose:({side,i})=>({transform:{position:{x:(side==='left'?.05:.3)+i*.001,y:1,z:-.5},orientation:{x:0,y:0,z:0,w:1}},radius:.006})};
      const tick=()=>g.tick(frame,session,{},performance.now());
      tick();g.action('primary');g.pending.until=performance.now();tick();
      for(let i=0;i<32;i++){await wait(40);tick();}
      g.action('replay');const active=g.recordElapsed;
      for(let i=0;i<25;i++){await wait(40);tick();}
      if(g.recordElapsed!==active)fail('Pause was included in motion');
      g.action('replay');for(let i=0;i<32;i++){await wait(40);tick();}
      g.action('primary');if(g.mode!=='saving')fail('Audio was not awaited');await g.saveTask;await g.saveQueue;
      const step=g.tutorial.steps[0];if(!step?.narration)fail('Narration missing: '+step?.narration_issue);
      if(Math.abs(step.narration.duration_ms-step.duration_ms)>500)fail('Pause included in audio');
      g.action('replay');g.player.step.guide_hands='both';g.action('primary');g.action('cue');await g.saveTask;await g.saveQueue;
      if(!g.tutorial.completion)fail('Reviewed narrated tutorial did not finish');
      g.action('clear');tick();if(!playback.node)fail('Narration did not start with ghost');
      g.action('replay');tick();if(playback.node)fail('Narration continued while ghost paused');
      g.action('replay');tick();if(!playback.node)fail('Narration did not resume');
      g.action('cue');tick();if(playback.rate!==.5)fail('Audio speed did not follow ghost');
      g.hide();if(playback.node)fail('Audio continued while hidden');
      const data=validateTutorial(JSON.parse(JSON.stringify(g.exportData())));window.narratedExport=data;
      g.endSession();if(narrator.ready)fail('Microphone left active after exit');
      const restored=new TutorialGuide({speak:()=>{},exit:()=>{}});await restored.restore();
      if(!restored.tutorial.steps[0].narration||!restored.tutorial.completion)fail('Narrated finished draft did not restore');
      let resolveLate;const fake={take:true,finish:()=>new Promise(r=>resolveLate=r),cancel:()=>{},disable:()=>{}};
      const late=new TutorialGuide({speak:()=>{},exit:()=>{},narrator:fake});late.activeSession=true;late.workspace={span:.4};late.mode='capture';late.frames=step.frames;
      late.action('primary');late.endSession();resolveLate(step.narration);await late.saveTask;
      if(late.tutorial.steps.length)fail('Audio response saved after session exit');
      const disconnected=new NarrationRecorder();await disconnected.enable();disconnected.begin();await wait(150);
      disconnected.stream.getAudioTracks()[0].dispatchEvent(new Event('ended'));
      let microphoneFailure;try{await disconnected.finish(150);}catch(e){microphoneFailure=e.message;}
      if(!microphoneFailure?.includes('disconnected'))fail('Microphone loss was accepted as valid narration');disconnected.disable();
      const repair=new TutorialGuide({speak:()=>{},exit:()=>{}});repair.tutorial=data;repair.tutorial.completion=null;repair.tutorial.steps[0].narration_issue='Microphone disconnected';
      repair.workspace={span:.4};repair.mode='review-step';const {TutorialPlayer}=await import('/tutorial-core.mjs');repair.player=new TutorialPlayer(repair.tutorial.steps);
      repair.action('primary');if(!repair.problem.includes('Narration failed'))fail('Broken audio was approved');
      // Do not write the independent repair fixture into the real draft.
      repair.persist=()=>Promise.resolve();repair.action('removeCue');
      if(repair.player.step.narration||repair.player.step.narration_issue||repair.player.step.reviewed)fail('Explicit text-only recovery failed');
      // Consecutive continuous segments share the live microphone while earlier audio finalizes.
      const fluidNarrator=new NarrationRecorder();await fluidNarrator.enable();
      const fluid=new TutorialGuide({speak:()=>{},exit:()=>{},narrator:fluidNarrator,writeTutorial:async()=>{}});fluid.activeSession=true;fluid.workspace={span:.4};fluid.mode='capture';fluid.fluidCapture=true;fluid.tutorial.setup='Continuous synthetic microphone test';
      fluidNarrator.begin();await wait(2700);fluid.frames=structuredClone(step.frames);fluid.sealFluidSegment();
      if(!fluidNarrator.take||fluid.mode!=='capture')fail('Next narration did not start immediately');
      await wait(2700);fluid.frames=structuredClone(step.frames);fluid.sealFluidSegment(true);await Promise.all([...fluid.segmentJobs]);
      if(fluid.tutorial.steps.length!==2||fluid.tutorial.steps.some(s=>!s.narration||s.narration_issue))fail('Continuous segment audio was lost or rejected');
      validateTutorial(fluid.exportData());fluidNarrator.disable();
      await playback.context.close();
      return {motion_ms:step.duration_ms,audio_ms:step.narration.duration_ms,pause_excluded:true,late_response_rejected:true};
    });
    await page.reload();await page.locator('#browser-tools').evaluate(e=>e.open=true);await page.locator('[data-route=review]').click();await page.waitForFunction(()=>document.querySelector('#narration-summary').textContent.includes('Recorded narration'));
    assert.match(await page.locator('#authoring-status').innerText(),/^FINISHED/);
    await page.locator('#remove-narration').click();await page.waitForFunction(()=>document.querySelector('#narration-summary').textContent.includes('No recorded narration'));
    assert.match(await page.locator('#authoring-status').innerText(),/^DRAFT/);
    assert.equal(await page.locator('#reviewed').isChecked(),false);
    assert.deepEqual(errors,[]);console.log('PASS narrated authoring lifecycle',result);
  }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});
