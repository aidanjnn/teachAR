const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'@playwright/test');
const assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({channel:process.env.TRAIL_BROWSER_CHANNEL||undefined,headless:true,args:['--enable-unsafe-swiftshader']});
 try{
  const context=await browser.newContext({viewport:{width:1280,height:1000}}),page=await context.newPage(),errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  // A broken optional telemetry endpoint must not prevent the actual tutor bootstrap.
  await context.route('**/api/telemetry/config',route=>route.abort());
  await context.route('**/api/ai/status',route=>route.fulfill({contentType:'application/json',body:'{"automatic":{"enabled":false}}'}));
  await page.goto(`${process.env.TRAIL_TEST_ORIGIN||'http://127.0.0.1:4321'}/tutorial`);
  await page.waitForFunction(()=>document.querySelector('#hud-preview').getAttribute('aria-label').includes('What would you like to do?'));
  await page.locator('#developer-tools > summary').click();
  const hud=page.locator('#hud-preview'),bounds=await hud.boundingBox();
  // The first real preview control is Create, drawn from tutorialView's hit layout.
  await hud.click({position:{x:50*bounds.width/1080,y:370*bounds.height/560}});
  await page.waitForFunction(()=>document.querySelector('#notice').textContent.includes('This is a preview'));
  const observed=await page.evaluate(async()=>{
   const {telemetry}=await import('/telemetry.mjs');
   return telemetry.snapshot().events.filter(event=>event.type==='interaction').map(event=>event.data);
  });
  const rejection=observed.findLast(event=>event.stage==='rejected'&&event.reason==='preview_only');
  assert(rejection,'actual DOM preview click must expose its rejection');
  const chain=observed.filter(event=>event.interaction_id===rejection.interaction_id);
  assert.deepEqual(chain.map(event=>event.stage),['targeted','activated','hit_test','rejected']);
  assert.equal(chain[0].control,'create');assert.equal(chain[0].source,'desktop');
  assert(!chain.some(event=>event.stage==='dispatched'||event.stage==='feedback_rendered'));
  assert.equal(await page.evaluate(async()=>{const {telemetry}=await import('/telemetry.mjs');return telemetry.snapshot().status;}),'local');
  assert.deepEqual(errors,[]);
  console.log('PASS actual preview interaction observation and failed optional-config isolation (desktop only)');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exit(1);});
