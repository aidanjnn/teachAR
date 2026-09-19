// Browser integration tests use synthetic camera + mocked server observations.
// They never contact OpenAI and do not establish Quest hardware validation.
const {chromium}=require(process.env.PLAYWRIGHT_MODULE || '@playwright/test');
const assert=require('node:assert/strict');
(async()=>{
  const browser=await chromium.launch({channel:process.env.TRAIL_BROWSER_CHANNEL || undefined,headless:true,args:['--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream','--enable-unsafe-swiftshader']});
  const context=await browser.newContext({permissions:['camera'],viewport:{width:1200,height:1000},userAgent:'OculusBrowser/40.1 TestFixture'});
  const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
  let frame=10, automatic=false, latest=null, calls=0, disconnected=false;
  const posts=[];
  await page.addInitScript(()=>{
    // Capture speech as test evidence without using the host's audio output.
    window.spoken=[];
    Object.defineProperty(window,'speechSynthesis',{configurable:true,value:{
      cancel(){},speak(utterance){window.spoken.push(utterance.text);}
    }});
    window.drawn=[];
    const draw=CanvasRenderingContext2D.prototype.fillText;
    CanvasRenderingContext2D.prototype.fillText=function(text,...args){window.drawn.push(text);window.drawn=window.drawn.slice(-150);return draw.call(this,text,...args);};
    // The error path exercises real WebGL initialization but no XR hardware.
    Object.defineProperty(navigator,'xr',{value:{isSessionSupported:async()=>true,requestSession:async()=>{throw new Error('TEST: immersive session denied');}}});
  });
  await page.route('**/api/**',async route=>{
    const path=new URL(route.request().url()).pathname;
    if(disconnected){await route.abort();return;}
    let result={};
    if(path==='/api/ai/status')result={enabled:true,ready:true,token:'fixture',calls,max_calls:100,budget_usd:2,reserved_usd:calls*.02,
      capture:{revision:7,frame_id:frame,source:'quest',has_reference:true,age_ms:100},
      automatic:{enabled:automatic,busy:false,countdown_seconds:7},latest};
    else if(path==='/api/frame')result={frame_id:++frame};
    else if(path==='/api/ai/auto'){automatic=route.request().postDataJSON().enabled;posts.push({path,enabled:automatic});result={enabled:automatic};}
    else if(path==='/api/ai/check'){calls++;posts.push({path});result={};}
    else throw new Error('Unexpected test request '+path);
    await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(result)});
  });
  await page.goto(`${process.env.TRAIL_TEST_ORIGIN||'http://127.0.0.1:4321'}/ar`);
  await page.getByRole('button',{name:'Enable camera',exact:true}).click();
  await page.waitForFunction(()=>document.querySelector('#camera-status').textContent.includes('Camera connected'));
  await page.waitForFunction(()=>!document.querySelector('#enter').disabled);
  const clickHUD=async x=>{await page.locator('#hud-preview').scrollIntoViewIfNeeded();const rect=await page.locator('#hud-preview').boundingBox();await page.mouse.click(rect.x+x*rect.width/1080,rect.y+450*rect.height/560);};
  const text=async s=>page.waitForFunction(s=>window.drawn.some(x=>x.includes(s)),s);
  const observation=(verdict,values)=>({verdict,message:verdict==='pass'?'Goose at A, fox at B, square at C. Arrangement matches this snapshot.':'Place fox at B (currently square). Place square at C (currently fox).',
    frame_id:++frame,revision:7,age_ms:2000,slots:['A','B','C'].map((slot,i)=>({slot,observed:values[i]}))});
  await clickHUD(550);await text('NEXT CHECK');assert.equal(automatic,true);
  latest=observation('pass',['goose','fox','square']);await text('2/3');
  latest=observation('fail',['goose','square','fox']);await text('Wrong placement');await text('3/3');
  await page.locator('#hud-preview').screenshot({path:'/tmp/trail-ar-wrong.png'});
  latest=observation('pass',['goose','fox','square']);await text('Test sequence observed');
  await page.waitForTimeout(1200);assert.equal(automatic,false,'completion pauses paid checks');
  assert(await page.evaluate(()=>window.spoken.some(text=>text.includes('Test sequence observed'))),'completion cue is emitted through the silent speech stub');
  await page.locator('#hud-preview').screenshot({path:'/tmp/trail-ar-restored.png'});
  assert.equal(calls,0,'status polling must not create provider requests');
  await page.getByRole('button',{name:'Enter AR',exact:false}).click();await text('Could not start AR');
  assert.equal(automatic,false,'failed immersive entry leaves auto checks off');
  await page.evaluate(()=>window.drawn=[]);disconnected=true;
  await text('Connection lost');
  assert.deepEqual(errors,[]);
  console.log('PASS: camera upload, headset controls, swap/restore sequence, completion pause, connection loss, XR failure recovery; all provider observations mocked.');
  await browser.close();
})().catch(e=>{console.error(e);process.exit(1);});
