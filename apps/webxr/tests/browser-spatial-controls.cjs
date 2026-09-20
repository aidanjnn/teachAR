const {chromium}=require('@playwright/test');
const assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({headless:true,args:['--enable-unsafe-swiftshader','--mute-audio']});
 try{
  const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/api/**',r=>r.fulfill({contentType:'application/json',body:'{}'}));
  await page.goto(`${process.env.TRAIL_TEST_ORIGIN}/tutorial`);
  const result=await page.evaluate(async()=>{
   const T=await import('/vendor/three.module.js'),{SpatialControls}=await import('/spatial-controls.mjs'),{TutorialGuide}=await import('/tutorial-guide.mjs');
   const check=(ok,message)=>{if(!ok)throw Error(message);},near=(a,b)=>Math.abs(a-b)<1e-5;
   const scene=new T.Scene(),g=new TutorialGuide({speak:()=>{},exit:()=>{}});g.attach(scene);g.begin('home');
   const panel=new T.Mesh(new T.PlaneGeometry(1.08,.56),new T.MeshBasicMaterial());scene.add(panel);
   const spatial=new SpatialControls(scene,panel,g),source={},other={};
   const pose=(p,q=new T.Quaternion())=>({transform:{position:p,orientation:q}}),viewer=pose(new T.Vector3(0,1,2));spatial.tick(0,viewer);
   const grip=(object,mode)=>spatial.controls.find(c=>c.object===object&&c.mode===mode).mesh;
   const aim=(mesh)=>{scene.updateMatrixWorld(true);const point=mesh.getWorldPosition(new T.Vector3()),q=mesh.getWorldQuaternion(new T.Quaternion());return pose(point.add(new T.Vector3(0,0,1).applyQuaternion(q)),q);};
   // Run the actual app's hit function: child grip UVs must never select panel buttons.
   const sourceText=await (await fetch('/ar.js')).text(),hitFunction=sourceText.match(/function hitFromPose\(pose\) \{[\s\S]*?\n\}/)[0];
   const hit=new Function('THREE','panel','spatial','guide','tutorialButton',`const raycaster=new THREE.Raycaster(),direction=new THREE.Vector3(0,0,-1),tutorialMode=true,handsMode=false;${hitFunction};return hitFromPose;`)(T,panel,spatial,g,()=> 'button');
   for(const mode of ['move','rotate','resize','face']){const target=aim(grip(panel,mode));check(spatial.pick(target)?.object===grip(panel,mode),'Grip preview disagrees with grab');check(hit(target)===null,'Grip selected an unrelated menu button');}
   check(hit(aim(panel))==='button','Panel center no longer selects menu');
   // From an already rotated panel, rotate relative to the grab without translation
   // or an initial snap; yaw crossing pi uses quaternion composition.
   panel.position.set(.1,.2,-.3);panel.rotation.set(.2,3.05,.1);let ray=aim(grip(panel,'rotate'));
   const before=panel.quaternion.clone(),position=panel.position.clone();
   check(spatial.start(source,ray),'Could not target rotated grip');spatial.move(source,ray);
   check(panel.quaternion.angleTo(before)<1e-6,'Rotation snapped on grab');
   const turn=new T.Quaternion().setFromAxisAngle(new T.Vector3(0,1,0),.4);
   ray=pose(ray.transform.position,turn.clone().multiply(ray.transform.orientation));spatial.move(source,ray);
   check(panel.quaternion.angleTo(turn.clone().multiply(before))<1e-6,'Rotation did not follow relative orientation');check(panel.position.equals(position),'Rotation changed pivot');
   check(!spatial.start(other,ray),'Second source stole active grip');spatial.move(other,pose(new T.Vector3(9,9,9)));check(panel.position.equals(position),'Other source moved panel');
   spatial.end(source);check(spatial.suppressed.has(source),'Release could click a task button');
   // Face me is reachable from behind and acts on release, keeping position/size.
   let face=grip(panel,'face');scene.updateMatrixWorld(true);const back=face.getWorldPosition(new T.Vector3()).add(new T.Vector3(0,0,-1).applyQuaternion(panel.quaternion));
   const backQ=panel.quaternion.clone().multiply(new T.Quaternion().setFromAxisAngle(new T.Vector3(0,1,0),Math.PI));
   check(spatial.start(source,pose(back,backQ)),'Back-facing recovery grip inaccessible');spatial.end(source);
   const expected=viewer.transform.position.clone().sub(position);expected.y=0;expected.normalize();
   check(new T.Vector3(0,0,1).applyQuaternion(panel.quaternion).distanceTo(expected)<1e-5,'Face me did not straighten toward viewer');check(panel.position.equals(position),'Face me moved panel');
   // Resize in the grip's initial plane, with hard usability bounds, independent
   // of the entrance animation. Motion/workspace coordinates remain unchanged.
   panel.position.set(0,0,0);panel.quaternion.identity();panel.scale.setScalar(1);spatial.panelScale=1;
   ray=aim(grip(panel,'resize'));check(spatial.start(source,ray),'Resize grip missed');spatial.move(source,pose(new T.Vector3(ray.transform.position.x*1.3,ray.transform.position.y*1.3,1)));
   check(near(panel.scale.x,1.3),'Resize did not follow pointer');spatial.applyPanelEntrance(.98);check(near(panel.scale.x,1.3),'Entrance fought resize');
   spatial.move(source,pose(new T.Vector3(10,10,1)));check(near(panel.scale.x,1.6),'Resize upper bound missing');
   spatial.move(source,pose(new T.Vector3(.001,.001,1)));check(near(panel.scale.x,.65),'Resize lower bound missing');spatial.end(source);spatial.applyPanelEntrance(1);check(near(panel.scale.x,.65),'Screen change lost chosen size');
   // Tracking loss drops manipulation and ignores a late pose until a new pinch.
   ray=aim(grip(panel,'move'));check(spatial.start(source,ray),'Move grip missed');spatial.move(source,null);spatial.move(source,pose(new T.Vector3(9,9,9)));check(!spatial.drag&&panel.position.length()===0,'Tracking loss jumped the panel');
   // Independent timer rotation/size persists until Reset or workspace change.
   g.start=[0,1,0];g.end=[.5,1,0];g.setWorkspace();g.mode='author';spatial.tick(50,viewer);
   scene.updateMatrixWorld(true);const workspace=JSON.stringify(g.workspace),matrix=g.space.matrixWorld.toArray().join();
   ray=aim(grip(spatial.timer,'rotate'));check(spatial.start(source,ray),'Timer rotation missed');spatial.move(source,pose(ray.transform.position,turn.clone().multiply(ray.transform.orientation)));spatial.end(source);
   const timerRotation=spatial.timer.quaternion.clone();spatial.tick(100,viewer);check(spatial.timer.quaternion.angleTo(timerRotation)<1e-6,'Timer rotation overwritten');
   ray=aim(grip(spatial.timer,'resize'));check(spatial.start(source,ray),'Timer resize missed');
   const p=spatial.timer.position.clone(),point=grip(spatial.timer,'resize').getWorldPosition(new T.Vector3()).sub(p).multiplyScalar(1.25).add(p),normal=new T.Vector3(0,0,1).applyQuaternion(spatial.timer.quaternion);
   spatial.move(source,pose(point.add(normal),spatial.timer.quaternion.clone()));spatial.end(source);check(near(spatial.timer.scale.x,1.25),'Timer did not resize');
   check(JSON.stringify(g.workspace)===workspace&&g.space.matrixWorld.toArray().join()===matrix,'UI controls changed workspace');
   let resets=0;g.onResetPanels=()=>{resets++;spatial.resetPlacement();};g.action('settings');g.action('panels-reset');spatial.tick(150,viewer);
   check(resets===1&&near(panel.scale.x,1)&&near(spatial.timer.scale.x,1)&&!spatial.timerMoved,'Reset not wired to guide');
   // Grabbing every kind of grip pauses capture and clears hold evidence.
   for(const mode of ['move','rotate','resize','face']){g.mode='capture';g.segmenter.progress=.6;ray=aim(grip(panel,mode));check(spatial.start(source,ray),`${mode} missed`);check(g.mode==='capture-paused'&&g.segmenter.progress===0,`${mode} did not pause recording`);spatial.cancel();}
   // Render the actual 3D handles and settings, not a substitute mock.
   g.mode='settings';const canvas=document.createElement('canvas');canvas.width=1080;canvas.height=560;g.draw(canvas.getContext('2d'),200,'');
   const panelTexture=new T.CanvasTexture(canvas);panelTexture.colorSpace=T.SRGBColorSpace;panel.material=new T.MeshBasicMaterial({map:panelTexture,transparent:true,toneMapped:false});panel.position.set(0,0,0);panel.quaternion.identity();spatial.resetPlacement();spatial.timer.visible=false;
   const renderer=new T.WebGLRenderer({alpha:false,antialias:true});renderer.setSize(1200,760);renderer.setClearColor('#171915');document.body.append(renderer.domElement);renderer.domElement.style.cssText='position:fixed;inset:0;z-index:99999';
   const camera=new T.PerspectiveCamera(42,1200/760,.01,10);camera.position.set(0,0,1.25);renderer.render(scene,camera);
   window.spatialPreview={renderer,scene,camera};
   return {relativeRotation:true,recoveryFromBehind:true,boundedResize:true,releaseSuppression:true,trackingLoss:true,timerIndependent:true,workspaceUnchanged:true,capturePaused:true};
  });
  await page.setViewportSize({width:1200,height:760});await page.screenshot({path:'/tmp/trail-spatial-controls.png'});
  await page.setViewportSize({width:375,height:700});await page.evaluate(()=>{const {renderer,camera,scene}=window.spatialPreview;renderer.setSize(375,700);camera.aspect=375/700;camera.position.z=3.6;camera.updateProjectionMatrix();renderer.render(scene,camera);});await page.screenshot({path:'/tmp/trail-spatial-controls-mobile.png'});
  assert.deepEqual(errors,[]);console.log('PASS spatial controls',result);
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});
