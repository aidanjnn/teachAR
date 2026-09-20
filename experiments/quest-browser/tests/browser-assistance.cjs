// Synthetic poses/audio only. No headset, camera, microphone or paid-model validation.
const {chromium}=require(process.env.PLAYWRIGHT_MODULE || '@playwright/test');
const assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({channel:process.env.TRAIL_BROWSER_CHANNEL||undefined,headless:true,args:['--enable-unsafe-swiftshader','--mute-audio']});
 try{
  const page=await browser.newPage({viewport:{width:1280,height:950}}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/api/**',async r=>{assert.equal(r.request().method(),'GET');await r.fulfill({contentType:'application/json',body:'{"automatic":{"enabled":false}}'});});
  await page.goto(`${process.env.TRAIL_TEST_ORIGIN||'http://127.0.0.1:4321'}/tutorial`);
  await page.waitForFunction(()=>document.querySelector('#hud-preview').getAttribute('aria-label').includes('Your workspace'));
  const result=await page.evaluate(async()=>{
   const THREE=await import('/vendor/three.module.js'),{TutorialGuide}=await import('/tutorial-guide.mjs');
   const {syntheticTutorial}=await import('/tutorial-review.mjs'),{TutorialPlayer}=await import('/tutorial-core.mjs');
   const {encodeNarration}=await import('/narration-core.mjs');
   const fail=m=>{throw Error(m);};
   const demo=syntheticTutorial(),base=demo.steps[0].frames[0];
   const move=(offset=0)=>Object.fromEntries(['left','right'].map(side=>[side,base[side].map(j=>j?{...j,p:[j.p[0]+offset,j.p[1],j.p[2]]}:null)]));
   let data=move(),time=1000;Object.defineProperty(performance,'now',{configurable:true,value:()=>time});
   const g=new TutorialGuide({speak:()=>{},exit:()=>{}}),scene=new THREE.Scene();g.attach(scene);g.begin();
   g.persist=()=>Promise.resolve();g.start=[0,0,0];g.end=[.4,0,0];g.setWorkspace();g.sample=()=>data[g.hand];g.localJoints=j=>j;
   const session={visibilityState:'visible'},tick=(dt=40)=>{time+=dt;g.tick({},session,{},time);};
   g.cleanSave=true;g.action('primary');time=g.pending.until;tick();
   for(let i=0;i<10;i++)tick();
   if(!g.zones.left.visible||g.zones.left.scale.x!==2/3)fail('Return-to-start cues missing');
   data=move(.25);for(let i=0;i<32;i++)tick();
   const endpoint=g.endpoint.candidate;if(endpoint===null)fail('No stable endpoint');
   for(let i=1;i<=10;i++){data=move(.25*(1-i/10));tick();}
   for(let i=0;i<24;i++)tick();
   if(g.mode!=='author'||g.tutorial.steps.length!==1)fail('Gesture did not save '+g.problem);
   const saved=g.tutorial.steps[0];if(Math.abs(saved.duration_ms-endpoint)>40)fail('Returned hands included in saved motion');
   if(saved.frames.at(-1).left[0].p[0]<base.left[0].p[0]+.23)fail('Final pose is the returned hand');
   g.tutorial=demo;g.player=new TutorialPlayer(demo.steps);g.player.paused=true;g.mode='learn';data=move();
   for(let i=0;i<12;i++)tick();
   if(!g.alignmentResult.matched||!g.liveHands.left.ghost.visible||!g.palmMesh.visible)fail('Holograms/palm comparison unavailable');
   if(g.player.index!==0||g.player.time!==0)fail('Alignment advanced the lesson');
   data=move(.3);tick();if(g.alignmentResult.matched||g.alignmentResult.left.state!=='outside')fail('Departure did not clear green');
   data=move();for(let i=0;i<12;i++)tick();if(!g.alignmentResult.matched)fail('Recovery did not turn green');
   data.left=null;tick();if(g.alignmentResult.matched||g.liveHands.left.ghost.visible)fail('Lost tracking still looked matched');
   data=move();for(let i=0;i<12;i++)tick();
   const camera=new THREE.PerspectiveCamera(48,1.5,.01,10);camera.position.set(.25,.8,.7);camera.lookAt(.25,.07,0);
   const renderer=new THREE.WebGLRenderer({antialias:true,preserveDrawingBuffer:true});renderer.setSize(1100,734);renderer.setClearColor('#102b2b');
   scene.add(new THREE.GridHelper(1.4,14,0x547c71,0x264e47));renderer.render(scene,camera);window.assistImage=renderer.domElement.toDataURL();
   const hud=document.createElement('canvas');hud.width=1080;hud.height=560;g.draw(hud.getContext('2d'),time,null);window.assistHud=hud.toDataURL();
   g.hide();if(g.liveHands.right.ghost.visible||g.zones.left.visible||g.alignmentResult)fail('Hidden session retained assistance');
   // Actual save path finishes the full narration before trimming audio and pose frames together.
   g.activeSession=true;g.takeGeneration++;g.narrator={finish:async duration=>encodeNarration(new Float32Array(Math.round(duration*16)))};
   const raw=structuredClone(demo.steps[0]);await g.finishNarratedStep(raw,0,1600);
   const clipped=g.tutorial.steps[0];if(Math.abs(clipped.duration_ms-clipped.narration.duration_ms)>1||clipped.duration_ms>1600)fail('Voice/motion trim differs');
   // A response after exiting cannot commit a partial or old recording.
   let finish;g.narrator={finish:()=>new Promise(r=>finish=r)};const before=g.tutorial.steps[0];
   const pending=g.finishNarratedStep(structuredClone(demo.steps[1]),0,1600);g.activeSession=false;finish(null);await pending;
   if(g.tutorial.steps[0]!==before)fail('Late save replaced tutorial after exit');
   return {cleanSave:true,hologram:true,liveGreenRecovery:true,missingTrackingNeutral:true,narrationTrim:true};
  });
  const fs=require('node:fs');for(const [key,path]of[['assistImage','/tmp/trail-assistance.png'],['assistHud','/tmp/trail-assistance-hud.png']])fs.writeFileSync(path,Buffer.from((await page.evaluate(k=>window[k],key)).split(',')[1],'base64'));
  await page.screenshot({path:'/tmp/trail-tutorial-workshop.png',fullPage:false});
  assert.deepEqual(errors,[]);console.log('PASS assistance browser workflow',result);
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});
