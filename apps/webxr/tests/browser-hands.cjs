// Synthetic WebXR joint stream. Exercises the real hand module and WebGL renderer.
// No claim of Quest hardware validation, and no provider requests.
const {chromium}=require(process.env.PLAYWRIGHT_MODULE || '@playwright/test');
const assert=require('node:assert/strict');
(async()=>{
  const browser=await chromium.launch({channel:process.env.TRAIL_BROWSER_CHANNEL||undefined,headless:true,args:['--enable-unsafe-swiftshader','--mute-audio']});
  const page=await browser.newPage({viewport:{width:1200,height:950}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/api/**',async route=>{
    assert.equal(route.request().method(),'GET','hand mode must not start paid requests');
    await route.fulfill({contentType:'application/json',body:JSON.stringify({enabled:true,ready:false,calls:0,max_calls:100,automatic:{enabled:false},capture:{revision:1,has_reference:true,source:'quest'}})});
  });
  await page.goto(`${process.env.TRAIL_TEST_ORIGIN||'http://127.0.0.1:4321'}/hands`);
  await page.waitForFunction(()=>document.querySelector('#hud-preview').getAttribute('aria-label').includes('Mark the fox'));
  const result=await page.evaluate(async()=>{
    const THREE=await import('/vendor/three.module.js');
    const {HandGuide}=await import('/hand-guide.mjs');
    const {JOINTS,toWorld}=await import('/motion-core.mjs');
    const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(65,1200/800,.01,10);
    camera.position.set(.2,1.4,.4);camera.lookAt(.2,1,-.55);
    const renderer=new THREE.WebGLRenderer({antialias:true,preserveDrawingBuffer:true});renderer.setSize(1200,800);renderer.setClearColor('#18302b');
    renderer.domElement.id='synthetic-render';document.body.prepend(renderer.domElement);
    const grid=new THREE.GridHelper(2,20,0x538776,0x35574d);grid.position.set(.2,.98,-.5);scene.add(grid);
    const g=new HandGuide({speak:()=>{},verify:()=>{},exit:()=>{}});g.attach(scene);g.begin();
    let t=1000,data=null;Object.defineProperty(performance,'now',{configurable:true,value:()=>t});
    const session={visibilityState:'visible',inputSources:[{handedness:'right',hand:new Map(JOINTS.map(n=>[n,n]))}]};
    const frame={getJointPose:n=>{const j=data?.[JOINTS.indexOf(n)];return j?{transform:{position:{x:j.p[0],y:j.p[1],z:j.p[2]},orientation:{x:0,y:0,z:0,w:1}},radius:.007}:null;}};
    const point=p=>JOINTS.map((_,i)=>({p:i===9?[...p]:[p[0]+((i%5)-2)*.01,p[1]+.08,p[2]+.06-(Math.floor(i/5))*.014],q:[0,0,0,1]}));
    const tick=(dt=20)=>{t+=dt;g.tick(frame,session,{},t);};
    function mark(kind,p){data=point(p);g.action('primary');t=g.pending.until-360;for(let i=0;i<20;i++)tick();if(g.mode===(kind==='start'?'start':'end'))throw Error(g.problem||'Mark failed');}
    mark('start',[0,1,-.6]);mark('end',[.4,1,-.6]);
    data=point([0,1,-.6]);tick();g.action('primary');
    for(let i=1;i<=300;i++){data=point([Math.min(.4,i/100*.4),1,-.6]);tick(40);}
    if(g.mode!=='recording')throw Error('Recording still auto-stops at ten seconds');
    const countBeforePause=g.frames.length,elapsedBeforePause=g.recordElapsed;
    g.action('replay');tick(5000);
    if(g.mode!=='record-paused'||g.frames.length!==countBeforePause||g.recordElapsed!==elapsedBeforePause)throw Error('Paused time/samples were recorded');
    data=point([0,1,-.6]);tick();g.action('replay');
    if(g.mode!=='record-paused')throw Error('Resume allowed an unrecorded jump');
    data=point([.4,1,-.6]);tick();g.action('replay');tick(40);
    if(g.mode!=='recording'||g.recordElapsed-elapsedBeforePause>100)throw Error('Resume included the paused gap');
    g.action('replay');g.action('primary');
    if(g.mode!=='review')throw Error('Manual finish while paused failed: '+g.note);
    const samples=g.recording.frames.length;
    g.action('replay');tick(40);if(!g.ghost.visible)throw Error('Replay ghost invisible');
    g.action('primary');t=g.pending.until;data=point([0,1,-.6]);tick();for(let i=0;i<35;i++)tick();
    if(!g.follower.started)throw Error('Follower did not start');
    const localToWorld=j=>j.map(x=>x?{...x,p:toWorld(x.p,g.workspace)}:null);
    data=localToWorld(g.recording.checkpoints[g.follower.index].joints).map(j=>({...j,p:[j.p[0],j.p[1],j.p[2]+.22]}));tick();
    if(g.result.state!=='off')throw Error('Sideways deviation not caught');
    const offIndex=g.follower.index;
    const hud=document.querySelector('#hud-preview');g.draw(hud.getContext('2d'),t,'','SYNTHETIC INPUT · NO API CALLS');
    renderer.render(scene,camera);window.syntheticWrong=renderer.domElement.toDataURL();window.syntheticHud=hud.toDataURL();
    data=null;tick();if(g.result.state!=='lost'||g.follower.index!==offIndex)throw Error('Tracking loss incorrectly advanced');
    data=localToWorld(g.recording.checkpoints[g.follower.index].joints);tick();
    if(!g.follower.recovered)throw Error('Return to path did not recover');
    g.action('replay');const pausedIndex=g.follower.index;for(let i=0;i<20;i++)tick();if(g.follower.index!==pausedIndex)throw Error('Paused follower advanced');g.action('replay');
    for(let i=0;i<2000&&g.mode!=='complete';i++){data=localToWorld(g.recording.checkpoints[g.follower.index].joints);tick();}
    if(g.mode!=='complete')throw Error('Sequential path did not finish');
    const answer={verdict:'pass',message:'Final arrangement matches',age_ms:2000,frame_id:20};
    g.acceptVerification(answer,g.attempt-1);if(g.verification)throw Error('Old attempt accepted');
    g.acceptVerification(answer,g.attempt);if(!g.verification)throw Error('Final image result not accepted');
    const exported=g.exportData();g.endSession();if(g.workspace||g.recording)throw Error('Workspace survived session end');
    if(!g.exportData())throw Error('Recording export lost after exit');
    return {samples,events:exported.events.length,warning:true,recovery:true,completed:true};
  });
  const fs=require('node:fs');
  for(const [key,path] of [['syntheticWrong','/tmp/trail-ghost-synthetic.png'],['syntheticHud','/tmp/trail-ghost-hud.png']]){
    const data=await page.evaluate(key=>window[key],key);fs.writeFileSync(path,Buffer.from(data.split(',')[1],'base64'));
  }
  assert.deepEqual(errors,[]);console.log('PASS synthetic capture → skeleton replay → deviation → loss → recovery → completion → separate verification → session invalidation',result);
  await browser.close();
})().catch(e=>{console.error(e);process.exit(1);});
