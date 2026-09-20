const {chromium}=require('@playwright/test');const assert=require('node:assert/strict');
(async()=>{const browser=await chromium.launch({headless:true,args:['--enable-unsafe-swiftshader','--mute-audio']});try{
 const page=await browser.newPage({viewport:{width:1280,height:900}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error'&&/Shader Error|VALIDATE_STATUS|WebGLProgram/.test(m.text()))errors.push(m.text());});
 await page.route('**/api/**',r=>r.fulfill({contentType:'application/json',body:'{}'}));
 await page.goto(`${process.env.TRAIL_TEST_ORIGIN}/tutorial`);await page.locator('#browser-tools').waitFor();
 assert.equal(await page.locator('#browser-tools').getAttribute('open'),null);assert.equal(await page.locator('#create-tutorial').isVisible(),false);assert.equal(await page.locator('#microphone-enable').isVisible(),false);
 await page.screenshot({path:'/tmp/trail-entry-desktop.png'});await page.setViewportSize({width:375,height:850});await page.screenshot({path:'/tmp/trail-entry-mobile.png'});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 const result=await page.evaluate(async()=>{
  const THREE=await import('/vendor/three.module.js'),{HandGuide}=await import('/hand-guide.mjs'),{TutorialGuide}=await import('/tutorial-guide.mjs');
  const scene=new THREE.Scene(),ghosts=[];
  for(const side of ['left','right']){const g=new HandGuide({speak:()=>{},exit:()=>{},verify:()=>{}});g.attach(scene);g.enableHologram(false,side);await g.skinHand.loaded;if(!g.skinHand.ready)throw Error(g.skinHand.error);ghosts.push(g);}
  const poses=ghosts.map((g,i)=>g.skinHand.bones.map(b=>({p:b.position.toArray(),q:b.quaternion.toArray(),radius:.006})));
  const snapshot=JSON.stringify(poses);ghosts.forEach((g,i)=>{g.space.rotation.y=Math.PI/2;g.space.position.x=i?.14:-.14;g.drawHand(poses[i],0x7cdadd);});
  if(ghosts.some(g=>g.dots.some(d=>d.visible)||g.boneMeshes.some(d=>d.visible)||g.bones.visible))throw Error('Visible joint scaffolding');
  if(JSON.stringify(poses)!==snapshot)throw Error('Renderer mutated tracking data');
  const camera=new THREE.PerspectiveCamera(42,1.5,.01,10);camera.position.set(0,.03,.56);camera.lookAt(0,-.035,0);
  const renderer=new THREE.WebGLRenderer({antialias:true,preserveDrawingBuffer:true});renderer.setSize(1000,667);renderer.setClearColor('#242522');renderer.render(scene,camera);window.handImage=renderer.domElement.toDataURL();
  const broken=structuredClone(poses[0]);broken[8]=null;ghosts[0].drawHand(broken,0x7cdadd);if(ghosts[0].ghost.visible)throw Error('Partial tracking left believable hand');
  let done,cancelled=0;const guide=new TutorialGuide({speak:()=>{},exit:()=>{},media:{enable:()=>new Promise(r=>done=r),cancel:()=>cancelled++}});guide.persist=()=>Promise.resolve();guide.begin('home');guide.action('create');if(guide.mode!=='media-setup')throw Error('Create skipped immersive preparation');guide.action('media-enable');if(guide.mode!=='media-wait')throw Error('Missing permission feedback');done({camera:false,microphone:true,errors:['Camera denied']});await guide.mediaTask;if(guide.mode!=='save-home'||!guide.captureCapabilities.microphone)throw Error('Denial blocked hands');
  guide.action('create');guide.action('media-enable');const old=guide.mediaTask;guide.action('media-skip');done({camera:true,microphone:true,errors:[]});await old;if(guide.mode!=='save-home'||guide.captureCapabilities.camera||!cancelled)throw Error('Late setup overrode hands-only choice');
  guide.action('setup-ready');if(!guide.tutorial.setup)throw Error('Immersive setup still needs desktop text');
  renderer.dispose();return {skinnedHands:true,jointsHidden:true,trackingPreserved:true,partialTrackingHidden:true,immersivePreparation:true,deniedPermissionFallback:true,lateSetupRejected:true};
 });
 require('node:fs').writeFileSync('/tmp/trail-skinned-hands.png',Buffer.from((await page.evaluate(()=>window.handImage)).split(',')[1],'base64'));
 const entry=await browser.newPage();
 await entry.addInitScript(()=>{
  window.xrRequests=[];window.mediaRequests=0;
  Object.defineProperty(navigator,'xr',{value:{isSessionSupported:async()=>true,requestSession:(...args)=>{window.xrRequests.push(args);return Promise.reject(new Error('Synthetic XR entry boundary'));}}});
  navigator.mediaDevices.getUserMedia=async()=>{window.mediaRequests++;throw Error('Unexpected capture prompt');};
 });
 await entry.route('**/api/**',r=>r.fulfill({contentType:'application/json',body:'{}'}));
 await entry.goto(`${process.env.TRAIL_TEST_ORIGIN}/tutorial`);
 await entry.waitForFunction(()=>!document.getElementById('enter').disabled);
 await entry.locator('#enter').click();
 await entry.waitForFunction(()=>window.xrRequests.length===1);
 assert.deepEqual(await entry.evaluate(()=>window.xrRequests[0]),['immersive-ar',{requiredFeatures:['hand-tracking']}]);
 assert.equal(await entry.evaluate(()=>window.mediaRequests),0);
 await entry.close();
 assert.deepEqual(errors,[]);console.log('PASS immersive entry and hand surfaces',result);
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exit(1);});
