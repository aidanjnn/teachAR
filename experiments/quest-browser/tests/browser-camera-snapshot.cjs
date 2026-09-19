// Real browser video callbacks, synthetic canvas camera. No hardware or paid requests.
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'@playwright/test');
const assert=require('node:assert/strict');
(async()=>{
  const browser=await chromium.launch({channel:process.env.TRAIL_BROWSER_CHANNEL||undefined,headless:true,args:['--enable-unsafe-swiftshader']});
  try{
    const page=await browser.newPage(),errors=[];
    page.on('pageerror',e=>errors.push(e.message));
    await page.route('**/api/**',async route=>{
      assert.equal(route.request().method(),'GET','Tutorial camera must not upload images or invoke paid APIs');
      await route.fulfill({contentType:'application/json',body:JSON.stringify({enabled:false,calls:0,automatic:{enabled:false},capture:{source:'quest'}})});
    });
    await page.addInitScript(()=>{
      Object.defineProperty(navigator.mediaDevices,'getUserMedia',{value:async()=>{
        const canvas=document.createElement('canvas');canvas.width=320;canvas.height=240;
        const ctx=canvas.getContext('2d'),stream=canvas.captureStream(0),track=stream.getVideoTracks()[0];let count=0;
        const feed=setInterval(()=>{ctx.fillStyle=++count%2?'#112233':'#554433';ctx.fillRect(0,0,320,240);track.requestFrame();},80);
        window.syntheticCamera={track,stopFeed:()=>clearInterval(feed)};return stream;
      }});
      Object.defineProperty(navigator.mediaDevices,'enumerateDevices',{value:async()=>[]});
    });
    await page.goto(`${process.env.TRAIL_TEST_ORIGIN||'http://127.0.0.1:4321'}/tutorial`);await page.locator('#device-settings').evaluate(e=>e.open=true);await page.locator('#camera-start').click();
    await page.waitForFunction(()=>document.querySelector('#camera-status').textContent.includes('No frames uploaded'));
    const result=await page.evaluate(async()=>{
      const {nextVideoSnapshot}=await import('/camera-snapshot.mjs');
      const {validateReference}=await import('/tutorial-core.mjs');
      const video=document.querySelector('#video'),baseline=video.currentTime;let draws=0;
      const options={video,valid:()=>syntheticCamera.track.readyState==='live',draw:()=>{
        draws++;const canvas=document.createElement('canvas');canvas.width=320;canvas.height=240;
        canvas.getContext('2d').drawImage(video,0,0);return {image:canvas.toDataURL('image/jpeg'),captured_at:new Date().toISOString()};
      }};
      const fresh=validateReference(await nextVideoSnapshot(options));
      if(fresh.capture.media_time_s<=baseline)throw Error('Cached frame saved');
      syntheticCamera.stopFeed();await new Promise(r=>setTimeout(r,150));
      let rejection;try{await nextVideoSnapshot({...options,timeoutMs:200});}catch(e){rejection=e.message;}
      if(!rejection?.includes('fresh frame')||draws!==1)throw Error('Stalled camera was accepted');
      syntheticCamera.track.stop();
      let stopped;try{await nextVideoSnapshot(options);}catch(e){stopped=e.message;}
      if(!stopped||draws!==1)throw Error('Stopped camera was accepted');
      return {fresh_frame:true,draws,stalled_rejected:true,stopped_rejected:true};
    });
    assert.deepEqual(errors,[]);console.log('PASS browser video snapshot',result);
  }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});
