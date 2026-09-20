// Synthetic asset delays/failures must not erase recorded or live hand motion.
const {chromium}=require('@playwright/test');
const assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({headless:true,args:['--enable-unsafe-swiftshader','--mute-audio']});
 try{
  const page=await browser.newPage();
  let release;
  const loading=new Promise(resolve=>release=resolve);
  await page.route('**/assets/hands/*.glb',async route=>{await loading;await route.continue();});
  await page.goto(`${process.env.TRAIL_TEST_ORIGIN}/tutorial`);
  const pending=await page.evaluate(async()=>{
   const THREE=await import('/vendor/three.module.js'),{HandGuide}=await import('/hand-guide.mjs');
   const g=new HandGuide({speak:()=>{},exit:()=>{},verify:()=>{}});g.attach(new THREE.Scene());g.enableHologram();
   const joints=Array.from({length:25},(_,i)=>({p:[i*.01,0,0],q:[0,0,0,1]}));
   g.drawHand(joints,0x7cdadd);window.loadingHand={g,joints};
   return {visible:g.ghost.visible,joints:g.dots.some(d=>d.visible),bones:g.boneMeshes.some(b=>b.visible),ready:g.skinHand.ready};
  });
  assert.deepEqual(pending,{visible:true,joints:true,bones:true,ready:false},'pending skin must retain a visible hand');
  release();
  const loaded=await page.evaluate(async()=>{
   const {g,joints}=window.loadingHand;await g.skinHand.loaded;g.drawHand(joints,0x7cdadd);
   return {visible:g.ghost.visible,skin:g.skinHand.root.visible,joints:g.dots.some(d=>d.visible),bones:g.boneMeshes.some(b=>b.visible)||g.bones.visible};
  });
  assert.deepEqual(loaded,{visible:true,skin:true,joints:false,bones:false},'ready skin must replace every fallback primitive');
  await page.close();

  const failed=await browser.newPage();
  await failed.route('**/assets/hands/*.glb',route=>route.fulfill({status:503,body:'Synthetic hand asset failure'}));
  await failed.goto(`${process.env.TRAIL_TEST_ORIGIN}/tutorial`);
  await failed.evaluate(async()=>{
   const THREE=await import('/vendor/three.module.js'),{HandGuide}=await import('/hand-guide.mjs');
   for(const side of ['left','right']){
    const g=new HandGuide({speak:()=>{},exit:()=>{},verify:()=>{}});g.attach(new THREE.Scene());g.enableHologram(false,side);await g.skinHand.loaded;
    if(!g.skinHand.error)throw Error('Asset failure was not exercised');
    const joints=Array.from({length:25},(_,i)=>({p:[i*.01,0,0],q:[0,0,0,1]}));
    g.drawHand(joints,0x7cdadd);
    if(!g.ghost.visible||!g.dots.some(d=>d.visible)||!g.boneMeshes.some(b=>b.visible))throw Error(`${side} failed skin erased the fallback`);
    joints.forEach(j=>j.p[0]+=.2);g.drawHand(joints,0x7cdadd);
    if(g.dots[0].position.x!==.2)throw Error('Fallback froze instead of following new poses');
    joints[8]=null;g.drawHand(joints,0x7cdadd);
    if(g.dots[8].visible)throw Error('Fallback invented a missing joint');
    g.drawHand(null,0x7cdadd);if(g.ghost.visible)throw Error('Fallback remained visible after tracking loss');
   }
  });
  console.log('PASS delayed/failed hand assets retain fresh fallback poses, switch to skin, and hide missing tracking');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});
