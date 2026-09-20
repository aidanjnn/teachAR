// Real bundled SDK, local in-memory transport. No Sentry account or external uploads.
const {chromium}=require('@playwright/test');
const assert=require('node:assert/strict');

(async()=>{
 const browser=await chromium.launch({headless:true,...(process.env.TRAIL_BROWSER_CHANNEL?{channel:process.env.TRAIL_BROWSER_CHANNEL}:{})});
 try {
  const page=await browser.newPage();
  const external=[];
  await page.route('**/*',route=>{
   const url=new URL(route.request().url());
   if(!['127.0.0.1','localhost'].includes(url.hostname)){external.push(url.hostname);return route.abort();}
   return route.continue();
  });
  const origin=process.env.TRAIL_TEST_ORIGIN||'http://127.0.0.1:4321';
  await page.goto(origin+'/tutorial');
  await page.waitForSelector('#trail-diagnostics');
  const result=await page.evaluate(async()=>{
   const sdk=await import('/vendor/sentry.mjs');
   const {telemetry}=await import('/telemetry.mjs');
   const {initializeSentry}=await import('/telemetry-sentry.mjs');
   const envelopes=[];
   const stub={...sdk,makeFetchTransport:()=>({
    send(envelope){envelopes.push(envelope);return Promise.resolve({statusCode:200});},
    flush(){return Promise.resolve(true);}
   })};
   // Sentinel fixtures stand in for data that must never reach an outbound envelope.
   const secret=document.createElement('div');secret.id='private-sentry-fixture';
   secret.textContent='LEAK_PRIVATE_ROOM_TEXT';secret.title='LEAK_PRIVATE_ATTRIBUTE';
   secret.innerHTML+='<input value="LEAK_PRIVATE_INPUT"><img src="/LEAK_PRIVATE_IMAGE">';
   document.body.append(secret);
   document.title='LEAK_PRIVATE_TITLE';
   history.replaceState(null,'','/tutorial?private=LEAK_PRIVATE_URL#LEAK_FRAGMENT');
   document.querySelector('#trail-diagnostics').open=true;
   const bridge=await initializeSentry({enabled:true,replay_enabled:true,
    dsn:'https://0123456789abcdef0123456789abcdef@o1.ingest.us.sentry.io/1',
    environment:'test',release:'trail-browser@synthetic-test',traces_sample_rate:1},
    {telemetry,loadSdk:async()=>stub});
   sdk.setTag('private','LEAK_SCOPE_TAG');
   sdk.setContext('private',{secret:'LEAK_SCOPE_CONTEXT'});
   sdk.setUser({email:'LEAK_PRIVATE_EMAIL@example.com'});
   sdk.setAttribute?.('private','LEAK_SCOPE_ATTRIBUTE');
   const interaction_id=telemetry.newId();
   for(const [stage,outcome] of [['activated','observed'],['hit_test','matched'],['dispatched','dispatched'],['state_changed','changed'],['feedback_rendered','ui_acknowledged']]){
    telemetry.emit('interaction',{interaction_id,stage,outcome,control:'primary',source:'synthetic',mode:'learn',step_index:0,
     instruction:'LEAK_INSTRUCTION',image:'LEAK_CAMERA',headers:{authorization:'LEAK_TOKEN'}});
    await new Promise(resolve=>setTimeout(resolve,20));
   }
   const tutorial_key=telemetry.newId(),attempt_id=telemetry.newId();
   telemetry.emit('guide_state',{tutorial_key,attempt_id,revision:1,step_index:0,source:'synthetic',mode:'learn',phase:'following',
    tracking_left:true,tracking_right:true,required_left:true,required_right:true});
   telemetry.emit('step_summary',{tutorial_key,attempt_id,revision:1,step_index:0,source:'synthetic',outcome:'left',
    following_ms:1000,tracking_lost_ms:200,observed_ms:1200,tracking_interruptions:1,samples:3,checkpoint_reached:false});
   sdk.captureException(new Error('LEAK_EXCEPTION_MESSAGE'));
   console.log('LEAK_CONSOLE_MESSAGE');
   await fetch('/api/health?private=LEAK_NETWORK_QUERY');
   secret.setAttribute('data-private','LEAK_MUTATION_ATTRIBUTE');
   secret.textContent='LEAK_PRIVATE_MUTATION';
   // The pinned SDK requires >=4999 ms of session time before sending Replay.
   await new Promise(resolve=>setTimeout(resolve,5200));
   await sdk.getReplay?.()?.flush();
   await sdk.flush(3000);
   const decode=value=>value instanceof Uint8Array?new TextDecoder().decode(value):value instanceof ArrayBuffer?new TextDecoder().decode(value):value;
   const normalized=envelopes.map(([header,items])=>[header,items.map(([meta,payload])=>[meta,decode(payload)])]);
   const types=normalized.flatMap(([,items])=>items.map(([meta])=>meta.type));
   await bridge.close?.();
   return {status:bridge.status,types,envelopes:normalized,sdkVersion:sdk.SDK_VERSION};
  });
  assert.equal(result.status,'configured');
  const serialized=JSON.stringify(result.envelopes);
  assert.ok(!serialized.includes('LEAK_'),'Sensitive sentinel reached final SDK transport');
  assert.ok(result.types.includes('log'),'Real SDK did not produce structured Logs');
  assert.ok(result.types.includes('transaction')||result.types.includes('span'),'Real SDK did not produce Tracing');
  assert.ok(result.types.includes('replay_recording'),'Real SDK did not produce Replay');
  assert.ok(serialized.includes('feedback_rendered'),'Interaction timeline missing from Logs');
  assert.ok(serialized.includes('step_summary'),'Step evidence missing from Logs');
  assert.ok(serialized.includes('trail-diagnostics'),'Diagnostic DOM missing from Replay');
  const items=result.envelopes.flatMap(([,batch])=>batch);
  for(const [meta,payload] of items) {
   if(['event','transaction','replay_event'].includes(meta.type)) {
    assert.equal(payload.sdk?.settings?.infer_ip,'never','Final event must disable Relay IP inference');
    assert.equal(payload.sdk?.version,result.sdkVersion,'Privacy projection must track the pinned SDK version');
    assert.equal(payload.user,undefined,'Final event must not retain scoped user data');
   }
   if(meta.type==='log') assert.deepEqual(payload.ingest_settings,{infer_ip:'never',infer_user_agent:'never'});
  }
  const traceIds=new Set(items.filter(([meta])=>meta.type==='transaction').map(([,payload])=>payload.contexts?.trace?.trace_id));
  const interactionLogs=items.filter(([meta])=>meta.type==='log').flatMap(([,payload])=>payload.items).filter(log=>log.body==='trail.interaction');
  assert.ok(interactionLogs.length>=5&&interactionLogs.every(log=>traceIds.has(log.trace_id)),
   'Interaction Logs must link to the actual emitted trace');
  const replayTraceIds=items.filter(([meta])=>meta.type==='replay_event').flatMap(([,payload])=>payload.trace_ids||[]);
  assert.ok(replayTraceIds.some(id=>traceIds.has(id)),'Replay must link to the actual emitted trace');
  const replay=result.envelopes.flatMap(([,items])=>items).filter(([meta])=>meta.type==='replay_recording').map(([,payload])=>payload).join('\n');
  for(const text of ['Source','Synthetic fixture','UI acknowledged','Step observations','Checkpoint / confirmed / interrupted']) {
   assert.ok(replay.includes(text),`Useful diagnostic content missing from Replay: ${text}`);
  }
  assert.equal(external.length,0,'Test attempted external network traffic');
  console.log('Sentry real-SDK payload test passed: Logs, Tracing, Replay; sensitive sentinels excluded; no external transport.');
 } finally {await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
