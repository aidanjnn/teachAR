// Synthetic two-hand stream; exercises real rendering/storage. No hardware claims or paid requests.
const {chromium}=require(process.env.PLAYWRIGHT_MODULE || '@playwright/test');
const assert=require('node:assert/strict');
(async()=>{
  const browser=await chromium.launch({channel:process.env.TRAIL_BROWSER_CHANNEL||undefined,headless:true,args:['--enable-unsafe-swiftshader','--mute-audio']});
  try {
    const page=await browser.newPage({viewport:{width:1200,height:950}}),errors=[];
    page.on('pageerror',e=>errors.push(e.message));
    await page.route('**/api/**',async route=>{
      assert.equal(route.request().method(),'GET','Tutorial preview must not send images or invoke paid APIs');
      await route.fulfill({contentType:'application/json',body:JSON.stringify({enabled:true,calls:0,automatic:{enabled:false},capture:{source:'quest'}})});
    });
    await page.goto(`${process.env.TRAIL_TEST_ORIGIN||'http://127.0.0.1:4321'}/tutorial`);await page.locator('#browser-tools').evaluate(e=>e.open=true);
    await page.waitForFunction(()=>document.querySelector('#hud-preview').getAttribute('aria-label').includes('Your workspace'));
    const result=await page.evaluate(async()=>{
      const THREE=await import('/vendor/three.module.js');
      const {TutorialGuide}=await import('/tutorial-guide.mjs');
      const {JOINTS}=await import('/motion-core.mjs');
      const fail=message=>{throw Error(message);};
      let t=1000,photoResolve;Object.defineProperty(performance,'now',{configurable:true,value:()=>t});
      const g=new TutorialGuide({speak:()=>{},exit:()=>{},snapshot:()=>new Promise(r=>photoResolve=r)});
      g.tutorial.setup='Place the cloth flat between the two marked tabletop points.';
      const scene=new THREE.Scene();g.attach(scene);g.begin();
      const camera=new THREE.PerspectiveCamera(65,1.5,.01,10);camera.position.set(.2,1.5,.4);camera.lookAt(.2,1,-.5);
      const renderer=new THREE.WebGLRenderer({antialias:true,preserveDrawingBuffer:true});renderer.setSize(1000,700);renderer.setClearColor('#18302b');
      renderer.domElement.id='tutorial-synthetic';document.body.prepend(renderer.domElement);
      let data={};
      const hand=p=>JOINTS.map((_,i)=>({p:i===9?p:[p[0]+(i%5)*.015,p[1]+.07,p[2]-Math.floor(i/5)*.02],q:[0,0,0,1]}));
      const session={visibilityState:'visible',inputSources:['left','right'].map(side=>({handedness:side,hand:new Map(JOINTS.map((n,i)=>[n,{side,i}]))}))};
      const frame={getJointPose:({side,i})=>{const j=data[side]?.[i];return j?{transform:{position:{x:j.p[0],y:j.p[1],z:j.p[2]},orientation:{x:0,y:0,z:0,w:1}},radius:.007}:null;}};
      const tick=(dt=40)=>{t+=dt;g.tick(frame,session,{},t);};
      const mark=p=>{data.right=hand(p);g.action('primary');t=g.pending.until-360;for(let i=0;i<20;i++)tick(20);};
      mark([0,1,-.5]);mark([.4,1,-.5]);if(g.mode!=='author')fail('Calibration failed '+g.problem);
      function record(){
        data.left=hand([.05,1,-.5]);data.right=hand([.3,1,-.5]);g.action('primary');t=g.pending.until;tick();
        for(let i=0;i<50;i++){data.left=hand([.05+Math.sin(i/49*Math.PI)*.15,1,-.5]);tick();}
      }
      record();g.action('replay');const elapsed=g.recordElapsed,count=g.frames.length;tick(5000);
      if(g.mode!=='capture-paused'||g.frames.length!==count||g.recordElapsed!==elapsed)fail('Pause recorded time');
      g.action('replay');tick();if(g.recordElapsed-elapsed>100)fail('Resume included pause gap');
      g.action('primary');if(g.tutorial.steps.length!==1)fail('Step not saved '+g.problem);
      record();g.action('primary');await g.saveQueue;
      const oldLast=g.tutorial.steps[1];g.action('replay');g.action('hand');t=g.pending.until;tick();g.action('hand');
      if(g.tutorial.steps[1]!==oldLast||g.tutorial.steps.length!==2)fail('Discarding a replacement erased the saved step');
      if(g.tutorial.steps.length!==2)fail('Second step missing');
      g.action('verify');t=g.pending.until;tick();
      if(!photoResolve)fail('Reference countdown did not capture');
      const photoCanvas=document.createElement('canvas');photoCanvas.width=32;photoCanvas.height=24;
      photoResolve({image:photoCanvas.toDataURL('image/jpeg'),captured_at:new Date().toISOString(),verification:'reference only'});
      await Promise.resolve();await g.saveQueue;
      if(!g.tutorial.steps[1].reference)fail('Reference not attached');
      g.action('clear');if(g.mode==='learn')fail('Unreviewed tutorial started learning');
      g.action('hand');g.action('cue');
      data.right=hand([.02,1,-.6]);t=g.pending.until-360;for(let i=0;i<20;i++)tick(20);
      if(g.pending?.kind!=='cue-second')fail('First fold-line point not captured');
      data.right=hand([.38,1,-.6]);t=g.pending.until-360;for(let i=0;i<20;i++)tick(20);
      if(g.tutorial.steps[0].cues?.length!==1)fail('Expert fold line not saved');
      tick();if(!g.foldLine.visible)fail('Fold line not rendered in workspace');
      g.tutorial.steps.forEach(s=>s.guide_hands='both');g.action('primary');g.action('primary');await g.saveQueue;
      g.action('cue');await g.saveTask;await g.saveQueue;if(!g.tutorial.completion)fail('Could not finish reviewed tutorial');
      // A late camera operation must not mutate the tutorial after resetting its spatial frame.
      g.action('verify');t=g.pending.until;tick();const prior=g.tutorial.steps[1].reference;
      g.action('clear');photoResolve({image:photoCanvas.toDataURL('image/jpeg'),captured_at:new Date().toISOString()});await Promise.resolve();
      if(g.tutorial.steps[1].reference!==prior)fail('Late reference accepted after changing mode');
      tick();if(!g.ghost.visible||!g.leftGhost.ghost.visible)fail('Both ghosts must be visible');
      g.action('cue');if(g.player.rate!==.5)fail('Learner slow replay control failed');
      g.action('cue');g.action('cue');if(g.player.rate!==1)fail('Learner speed cycle failed');
      renderer.render(scene,camera);window.tutorialRender=renderer.domElement.toDataURL();
      for(let i=0;i<100;i++)tick();if(g.player.index!==0||g.mode!=='learn')fail('Replay auto-advanced');
      g.action('verify');tick();g.action('replay');const playbackTime=g.player.time;tick(100);
      if(g.player.time!==playbackTime)fail('Paused replay moved');
      g.action('primary');if(g.player.index!==1)fail('Manual next failed');
      g.action('hand');if(g.player.index!==0)fail('Previous failed');
      g.action('primary');g.action('primary');if(g.mode!=='finished')fail('Manual completion failed');
      const hud=document.querySelector('#hud-preview');g.draw(hud.getContext('2d'),t,'');
      window.tutorialHud=hud.toDataURL();
      const beforeHide=g.events.length;for(let i=0;i<100;i++)g.hide();
      if(g.events.length-beforeHide>2)fail('Hidden XR frames flooded diagnostics');
      const diagnostics=g.exportDiagnostics(),encoded=JSON.stringify(diagnostics);
      if(diagnostics.events.filter(e=>e.event==='step_self_confirmed').length!==3)fail('Self-confirmations not recorded');
      if(diagnostics.events.filter(e=>e.event==='record_saved').length!==2)fail('Saved recordings missing from diagnostics');
      if(encoded.includes('data:image')||encoded.includes('"frames"')||encoded.includes('"points"'))fail('Raw media/poses leaked into diagnostics');
      if(diagnostics.physical_verification!=='not implemented')fail('Diagnostics overstated verification');
      g.endSession();if(g.workspace||g.player)fail('Old spatial frame survived exit');
      if(g.exportData().steps.length!==2)fail('Saved tutorial lost on exit');
      const restored=new TutorialGuide({speak:()=>{},exit:()=>{},snapshot:()=>{}});await restored.restore();
      if(restored.tutorial.steps.length!==2||restored.workspace)fail('Persistence or recalibration requirement failed');
      return {steps:restored.tutorial.steps.length,bothGhosts:true,noAutomaticAdvancement:true,localPersistence:true};
    });
    const fs=require('node:fs');
    for(const [key,path] of [['tutorialRender','/tmp/trail-tutorial-ghosts.png'],['tutorialHud','/tmp/trail-tutorial-hud.png']]){
      const data=await page.evaluate(key=>window[key],key);fs.writeFileSync(path,Buffer.from(data.split(',')[1],'base64'));
    }
    await page.reload();await page.locator('#browser-tools').evaluate(e=>e.open=true);
    await page.waitForFunction(()=>document.querySelector('#tutorial-instructions').value==='Step 1\nStep 2');
    assert.deepEqual(errors,[]);
    console.log('PASS tutorial browser workflow',result);
  } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});
