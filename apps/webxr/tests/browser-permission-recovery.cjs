// Synthetic focus loss during a browser permission prompt; no real media request.
const {chromium}=require('@playwright/test');
const assert=require('node:assert/strict');
(async()=>{const browser=await chromium.launch({headless:true,args:['--enable-unsafe-swiftshader','--mute-audio']});try{
 const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/api/**',r=>r.fulfill({contentType:'application/json',body:'{}'}));
 await page.goto(`${process.env.TRAIL_TEST_ORIGIN}/tutorial`);
 await page.evaluate(async()=>{
  const {TutorialGuide}=await import('/tutorial-guide.mjs');
  let finish,cancelled=0;
  const guide=new TutorialGuide({speak:()=>{},exit:()=>{},media:{enable:()=>new Promise(r=>finish=r),cancel:()=>cancelled++}});
  guide.persist=()=>Promise.resolve();guide.begin('home');guide.action('create');guide.action('media-enable');
  guide.hide(); // XR becomes visible-blurred while the browser owns the permission prompt.
  finish({camera:true,microphone:true,errors:[]});await guide.mediaTask;
  if(guide.mode!=='setup-new'||guide.mediaPending||!guide.captureCapabilities?.microphone)throw Error('Permission result was lost after focus interruption');
  guide.action('create');guide.action('media-enable');guide.action('settings');
  if(guide.mode!=='media-wait')throw Error('Settings stranded an in-flight permission request');
  guide.action('media-skip');finish({camera:true,microphone:true,errors:[]});await guide.mediaTask;
  if(guide.mode!=='setup-new'||guide.captureCapabilities.microphone||!cancelled)throw Error('Late permission result overrode hands-only');
  guide.action('create');guide.action('media-enable');guide.endSession();guide.begin('home');
  finish({camera:true,microphone:true,errors:[]});await guide.mediaTask;
  if(guide.mode!=='home'||guide.mediaPending)throw Error('Old permission result changed a new session');
 });
 assert.deepEqual(errors,[]);console.log('PASS permission focus recovery, settings guard, hands-only and session cancellation');
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exit(1);});
