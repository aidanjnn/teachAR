import test from 'node:test';
import assert from 'node:assert/strict';
import {createSceneCoach,DEFAULT_QUESTION,STALE_MESSAGE} from '../public/scene-coach.mjs';

// A minimal JPEG data URL: the module only strips the prefix; the server decodes and bounds the bytes.
const JPEG='data:image/jpeg;base64,'+Buffer.alloc(96,9).toString('base64');
function harness({ok=true,status=200,body=null,coachActive=true,camera=true,delay=0}={}){
  const announced=[],told=[],spoken=[],requests=[];
  const guide={epoch:3,tutorial:{id:'t1'},player:{step:{id:'s1',reference:{image:JPEG}}},mode:'learn'};
  const coach={get active(){return coachActive;},identity:{runId:'r',attemptId:'a'},contextFor:(step,epoch)=>({tutorialId:'g1',tutorialRevision:1,runId:'r',attemptId:'a',title:'T',steps:[{id:'s1',title:'A',instruction:'Do A.'}],currentStepId:step.id,stepRevision:epoch}),announce:(text,source)=>announced.push([text,source])};
  const fetchImpl=async(url,init)=>{requests.push({url,body:JSON.parse(init.body)});if(delay)await new Promise(r=>setTimeout(r,delay));return {ok,status,json:async()=>body||{schemaVersion:1,transcript:'Turn the sheet so the marked corner is nearest you.',audio:null,provenance:'model',stepId:'s1',epoch:3}};};
  const scene=createSceneCoach({guide,coach,snapshot:async()=>({image:JPEG,capture:{request_age_ms:120.6}}),hasCamera:()=>camera,fetchImpl,tell:m=>told.push(m),speakFallback:m=>spoken.push(m),audioContextFactory:()=>{throw Error('no audio in node');}});
  return {scene,guide,coach,announced,told,spoken,requests,setCoachActive:v=>{coachActive=v;}};
}

test('sends the fresh frame, the reference photo and the grounded context, then captions and speaks the answer',async()=>{
  const h=harness();
  const result=await h.scene.look();
  assert.equal(result.transcript,'Turn the sheet so the marked corner is nearest you.');
  assert.equal(h.requests.length,1);
  const body=h.requests[0].body;
  assert.equal(h.requests[0].url,'/api/scene-coach');
  assert.equal(body.schemaVersion,1);assert.equal(body.question,DEFAULT_QUESTION);assert.equal(body.source,'workspace-webcam');
  assert.equal(body.captureAgeMs,121);assert.equal(body.epoch,3);
  assert.deepEqual(body.context,{tutorialId:'g1',tutorialRevision:1,runId:'r',attemptId:'a',title:'T',steps:[{id:'s1',title:'A',instruction:'Do A.'}],currentStepId:'s1',stepRevision:3});
  assert.equal(body.image.mimeType,'image/jpeg');assert.equal(body.reference.dataBase64,body.image.dataBase64,'the step reference travels as base64 without its data URL prefix');
  assert.deepEqual(h.announced,[['Turn the sheet so the marked corner is nearest you.','scene']]);
  assert.deepEqual(h.spoken,['Turn the sheet so the marked corner is nearest you.'],'no audio from the server means the tutor voice reads the advice');
  assert.equal(h.scene.busy,false);assert.equal(h.scene.message,'Turn the sheet so the marked corner is nearest you.');
});

test('refuses without a started coach or a camera, and says which is missing',async()=>{
  const noCoach=harness({coachActive:false});
  assert.equal(await noCoach.scene.look(),null);assert.equal(noCoach.requests.length,0);
  assert.match(noCoach.told[0],/Start the coach first/);assert.equal(noCoach.scene.available,false);
  const noCamera=harness({camera:false});
  assert.equal(await noCamera.scene.look(),null);assert.match(noCamera.told[0],/Enable the camera first/);
});

test('drops an answer that arrives after the step or epoch changed, and surfaces server refusals',async()=>{
  const late=harness({delay:20});
  const pending=late.scene.look('Is this right?');
  late.guide.epoch++;
  assert.equal(await pending,null);
  assert.equal(late.announced.length,0);assert.equal(late.spoken.length,0);assert.equal(late.scene.message,STALE_MESSAGE);
  const refused=harness({ok:false,status:503,body:{error:'scene_unavailable',message:'Scene coaching is not configured on this server.'}});
  assert.equal(await refused.scene.look(),null);
  assert.equal(refused.told.at(-1),'Scene coaching is not configured on this server.');assert.equal(refused.scene.busy,false);
});

test('a Repeat, a restarted coach or a stopped coach before the answer arrives drops it',async()=>{
  const same=harness({delay:20});
  await same.scene.look();
  assert.equal(same.announced.length,1,'sanity: an unchanged identity announces the answer');
  const attempt=harness({delay:20});
  const pendingAttempt=attempt.scene.look();
  await new Promise(r=>setTimeout(r,2));
  attempt.coach.identity={runId:'r',attemptId:'b'};
  assert.equal(await pendingAttempt,null);
  assert.equal(attempt.announced.length,0,'Repeat starts a new attempt, so the old answer is stale');assert.equal(attempt.spoken.length,0);
  const restarted=harness({delay:20});
  const pendingRestart=restarted.scene.look();
  await new Promise(r=>setTimeout(r,2));
  restarted.coach.identity={runId:'r2',attemptId:'a'};
  assert.equal(await pendingRestart,null);assert.equal(restarted.announced.length,0,'a restarted coach makes the old answer stale');
  const stopped=harness({delay:20});
  const pendingStop=stopped.scene.look();
  await new Promise(r=>setTimeout(r,2));
  stopped.setCoachActive(false);
  assert.equal(await pendingStop,null);assert.equal(stopped.announced.length,0,'a stopped coach makes the old answer stale');
});

test('the tutor voice fallback counts as speaking until it finishes, and the request timer never aborts a newer look',async()=>{
  const h=harness();
  let finish;const speaking=[];
  const scene=createSceneCoach({guide:h.guide,coach:{active:true,contextFor:()=>({}),announce:()=>{}},snapshot:async()=>({image:JPEG,capture:{request_age_ms:10}}),fetchImpl:async()=>({ok:true,status:200,json:async()=>({transcript:'Slide it left.',audio:null,provenance:'model'})}),speakFallback:()=>new Promise(r=>{finish=r;}),audioContextFactory:()=>{throw Error('no audio');}});
  scene.onState(s=>speaking.push(s.speaking));
  const pending=scene.look();
  await new Promise(r=>setTimeout(r,5));
  assert.equal(scene.speaking,true,'held speech in the page waits while the advice is read');
  finish();await pending;
  assert.equal(scene.speaking,false);assert.equal(scene.busy,false);
  assert.ok(speaking.includes(true)&&speaking.at(-1)===false);
});

test('a guarded answer is captioned with its provenance and stop() cancels an in-flight look',async()=>{
  const guarded=harness({body:{schemaVersion:1,transcript:'I cannot judge that from one picture.',audio:null,provenance:'guarded'}});
  await guarded.scene.look();
  assert.deepEqual(guarded.announced,[['I cannot judge that from one picture.','scene-guarded']]);
  const cancelled=harness({delay:30});
  const pending=cancelled.scene.look();
  cancelled.scene.stop();
  assert.equal(await pending,null);assert.equal(cancelled.announced.length,0);assert.equal(cancelled.scene.busy,false);
});
