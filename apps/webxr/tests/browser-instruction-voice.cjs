const {chromium}=require('@playwright/test');const assert=require('node:assert/strict');
(async()=>{const browser=await chromium.launch({headless:true,args:['--enable-unsafe-swiftshader','--autoplay-policy=no-user-gesture-required']});try{
 const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.route('**/api/**',r=>r.fulfill({contentType:'application/json',body:'{}'}));await page.goto(`${process.env.TRAIL_TEST_ORIGIN}/tutorial`);
 const result=await page.evaluate(async()=>{
  const THREE=await import('/vendor/three.module.js'),{TutorialGuide}=await import('/tutorial-guide.mjs'),{syntheticTutorial}=await import('/tutorial-review.mjs'),{TutorialPlayer,validateTutorial,trimStep}=await import('/tutorial-core.mjs'),{NarrationPlayback}=await import('/narration.mjs'),{encodeNarration}=await import('/narration-core.mjs'),{polishStep,generateInstructionVoice}=await import('/instruction-voice.mjs'),{tutorialView}=await import('/tutorial-ui.mjs');
  const fail=m=>{throw Error(m);},sleep=ms=>new Promise(r=>setTimeout(r,ms)),wait=async fn=>{for(let i=0;i<200&&!fn();i++)await sleep(20);if(!fn())fail('Timed out');};
  const g=new TutorialGuide({speak:()=>{},exit:()=>{},audioPlayer:new NarrationPlayback()});g.attach(new THREE.Scene());g.begin('home');g.tutorial=syntheticTutorial();g.tutorial.steps.forEach(s=>s.guide_hands='both');g.player=new TutorialPlayer(g.tutorial.steps);g.mode='review-step';
  const original=encodeNarration(new Float32Array(48000));g.player.step.narration=original;
  const tts=encodeNarration(Float32Array.from({length:64000},(_,i)=>Math.sin(i*.1)*.02));let drafts=0,generations=0,writes=0;
  g.writeTutorial=async data=>{writes++;window.persistedPolish=structuredClone(data);};
  const fetchImpl=async(url,init)=>{
   if(url==='/api/voice/polish'){drafts++;return {ok:true,json:async()=>({title:'Fold in half',instruction:'Bring the left corner to the right corner. Crease the fold.',needsReview:false,transcript:'Um bring the left corner to the right and crease, save it now.'})};}
   if(url==='/api/voice/instruction-audio'){generations++;if(!JSON.parse(init.body).approved)fail('Missing approval');const raw=atob(tts.audio.split(',')[1]);return {ok:true,arrayBuffer:async()=>Uint8Array.from(raw,c=>c.charCodeAt(0)).buffer};}fail('Unexpected request');
  };
  g.instructionServices={polishStep:(s,o)=>polishStep(s,{...o,fetchImpl}),generateInstructionVoice:(text,o)=>generateInstructionVoice(text,{...o,fetchImpl})};
  g.action('polish-open');if(drafts)fail('Opening screen spent credits');g.action('polish-draft');await wait(()=>!g.polishBusy);if(!g.polishDraft||g.player.step.instruction_voice||generations)fail('Draft changed original or generated before approval');
  const canvas=document.createElement('canvas');canvas.width=1080;canvas.height=560;g.draw(canvas.getContext('2d'),performance.now(),'');window.polishImage=canvas.toDataURL();
  g.action('polish-approve');await wait(()=>!g.polishBusy);if(g.mode!=='review-step'||!g.player.step.instruction_voice||writes!==1)fail(g.problem||'Voice was not saved');
  const saved=validateTutorial(window.persistedPolish);if(saved.steps[0].narration.audio!==original.audio||saved.steps[0].instruction_voice.duration_ms!==4000||saved.steps[0].reviewed)fail('Original, duration or review lost');
  g.audioPlayer.unlock();await sleep(50);g.player.setRate(.5);g.audioPlayer.sync(g.player);if(!g.audioPlayer.node||g.audioPlayer.node.playbackRate.value!==1)fail('Voice pitch/speed tied to ghost');
  g.player.time=g.player.step.duration_ms;g.player.paused=true;g.audioPlayer.sync(g.player);if(!g.audioPlayer.node)fail('Short motion cut off speech');
  g.action('review-pause');g.audioPlayer.sync(g.player);if(g.audioPlayer.node)fail('Explicit pause at motion ending failed');
  g.player.replay();g.audioPlayer.sync(g.player);await sleep(30);g.audioPlayer.sync(g.player,false);if(g.audioPlayer.node)fail('Leaving preview did not stop audio');if(generations!==1)fail('Replay spent credits');
  // Repeat/voice replay reset the speech take through showStep, not just player.replay.
  const before=g.player.playbackRevision;g.mode='learn';g.showStep();if(g.player.playbackRevision<=before)fail('Guided repeat did not reset speech');g.mode='review-step';
  // Navigation cancels a late draft; an obsolete result cannot appear on Home.
  let resolve;g.instructionServices.polishStep=()=>new Promise(r=>resolve=r);g.action('polish-open');g.action('polish-draft');g.action('home');resolve({title:'late',instruction:'late'});await sleep(30);if(g.mode!=='home'||g.polishBusy)fail('Late draft changed screen');
  if(trimStep(saved.steps[0],0,2000).instruction_voice)fail('Trim retained old instruction audio');
  // Real storage failure leaves the step recoverable and never reports a successful voice save.
  g.player=new TutorialPlayer(g.tutorial.steps);g.mode='review-step';g.action('polish-open');g.polishDraft={title:'Edited',instruction:'Fold in half.'};g.writeTutorial=async()=>{throw Error('quota');};g.action('polish-approve');await wait(()=>!g.polishBusy);if(g.mode!=='polish'||g.saveStatus!=='failed')fail('Storage failure was hidden');
  g.endSession();await g.audioPlayer.context.close();return {draftReviewGenerate:true,originalRetained:true,portableAudio:true,normalSpeed:true,explicitPause:true,noReplayCalls:true,staleReplyRejected:true,saveFailureVisible:true};
 });
 require('node:fs').writeFileSync('/tmp/trail-polish-ar.png',Buffer.from((await page.evaluate(()=>window.polishImage)).split(',')[1],'base64'));assert.deepEqual(errors,[]);console.log('PASS polished instruction voice (synthetic audio, mocked providers)',result);
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exit(1);});
