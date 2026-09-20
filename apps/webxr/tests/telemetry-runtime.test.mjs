import test from 'node:test';
import assert from 'node:assert/strict';
import {Telemetry} from '../public/telemetry.mjs';
import {createRuntimeObserver} from '../public/telemetry-runtime.mjs';
import {TutorialPractice} from '../public/tutorial-follow.mjs';

const hand=()=>Array.from({length:25},()=>({p:[0,0,0]}));
function setup(overrides={}) {
  let clock=0;
  const telemetry=new Telemetry({clock:()=>clock});
  const guide={mode:'home',tutorial:{id:'private tutorial id',revision:1,source:'live-capture'},problem:'',...overrides};
  const observer=createRuntimeObserver({telemetry,guide,now:()=>clock,...overrides.options});
  const events=type=>telemetry.snapshot().events.filter(e=>!type||e.type===type).map(e=>e.data);
  return {telemetry,guide,observer,events,time:value=>{clock=value;}};
}
function practice(){return {mode:'learn',player:{index:0,step:{guide_hands:'right'},paused:true},
  currentHands:{left:hand(),right:hand()},followEngine:{state:'waiting',done:false},gatePaused:false,watchOnly:false};}
function activate(observer,control='primary'){observer.target(control);const id=observer.activate(control);observer.hitTest(id,true);return id;}

test('a rendered acknowledgement requires both observed change and matching drawn state after renderer submission',()=>{
  const {observer,guide,events}=setup();observer.observe({active:true,visible:true,freshFrame:true});
  const id=activate(observer,'library');observer.dispatch(id,()=>{guide.mode='loading-library';});
  assert.deepEqual(events('interaction').map(e=>e.stage),['targeted','activated','hit_test','dispatched','state_changed']);
  observer.rendered();assert.equal(events('interaction').at(-1).stage,'state_changed');
  observer.drawn();assert.equal(events('interaction').at(-1).stage,'state_changed');
  observer.rendered();assert.equal(events('interaction').at(-1).stage,'feedback_rendered');
  assert.equal(events('interaction').at(-1).outcome,'ui_acknowledged');
});

test('an unchanged/dropped command times out without a false acknowledgement',()=>{
  const {observer,time,events}=setup();observer.observe({active:true,visible:true,freshFrame:true});
  const id=activate(observer);observer.dispatch(id,()=>{});observer.drawn();observer.rendered();
  time(5001);observer.observe();
  assert.equal(events('interaction').at(-1).reason,'no_state_change');
  assert(!events('interaction').some(e=>e.stage==='feedback_rendered'));
});

test('failed ray hit and blocked desktop preview never dispatch',()=>{
  const {observer,events}=setup();
  const miss=observer.activate(null,'webxr');observer.hitTest(miss,false,'no_pose');
  const preview=observer.activate('primary','desktop');observer.hitTest(preview,true);observer.reject(preview,'preview_only');
  assert.deepEqual(events('interaction').filter(e=>e.stage==='rejected').map(e=>e.reason),['no_pose','preview_only']);
  assert(!events('interaction').some(e=>e.stage==='dispatched'));
});

test('asynchronous action return is neither save success nor a rendered acknowledgement',async()=>{
  const {observer,guide,events}=setup();observer.observe({active:true,visible:true,freshFrame:true});
  let resolve;
  const id=activate(observer);observer.dispatch(id,()=>new Promise(done=>{resolve=done;}));
  observer.drawn();observer.rendered();
  assert(!events('interaction').some(e=>e.stage==='state_changed'));
  guide.mode='saved';resolve();await Promise.resolve();
  assert.equal(events('interaction').at(-1).stage,'state_changed');
  observer.rendered();assert.equal(events('interaction').at(-1).stage,'state_changed');
  observer.drawn();observer.rendered();assert.equal(events('interaction').at(-1).stage,'feedback_rendered');
});

test('a guide rejection keeps private reason text out of telemetry',()=>{
  const {observer,guide,events,telemetry}=setup(practice());observer.observe({active:true,visible:true,freshFrame:true});
  const id=activate(observer);observer.dispatch(id,()=>{guide.problem='secret tutorial instruction and private details';});
  assert.equal(events('interaction').at(-1).reason,'guide_rejected');
  assert.equal(events('guide_action').length,0);
  assert(!JSON.stringify(telemetry.snapshot()).includes('secret'));
  assert(!JSON.stringify(telemetry.snapshot()).includes('private tutorial id'));
});

test('fresh required-hand loss differs from user pause, rendering gaps and hidden pages',()=>{
  const {observer,guide,events,time}=setup(practice());
  observer.observe({active:true,visible:true,freshFrame:true});assert.equal(events('guide_state').at(-1).phase,'following');
  guide.currentHands.left=null;observer.observe({freshFrame:true});assert.equal(events('guide_state').at(-1).phase,'following');
  time(100);guide.currentHands.right=null;observer.observe({freshFrame:true});assert.equal(events('guide_state').at(-1).phase,'tracking_lost');
  guide.gatePaused=true;observer.observe({freshFrame:true});assert.equal(events('guide_state').at(-1).phase,'user_paused');
  time(500);observer.observe();assert.equal(events('guide_state').at(-1).phase,'user_paused');
  guide.gatePaused=false;observer.observe();assert.equal(events('guide_state').at(-1).phase,'system_wait');
  observer.observe({visible:false});assert.equal(events('guide_state').at(-1).phase,'hidden');
  observer.observe({visible:true,freshFrame:true,poseAvailable:false});assert.equal(events('guide_state').at(-1).phase,'system_wait');
});

test('repeat is attributed to the old attempt and the next attempt gets a new opaque identity',()=>{
  const {observer,guide,events}=setup(practice());observer.observe({active:true,visible:true,freshFrame:true});
  const before=events('guide_state').at(-1);
  const id=activate(observer,'restart-follow');observer.dispatch(id,()=>{guide.followEngine={state:'waiting',done:false};});
  const repeat=events('guide_action').find(e=>e.action==='repeat');assert.equal(repeat.attempt_id,before.attempt_id);
  assert.notEqual(events('guide_state').at(-1).attempt_id,before.attempt_id);
  assert.equal(events('guide_state').at(-1).tutorial_key,before.tutorial_key);
});

test('confirmation requires checkpoint and an accepted step transition; help is an explicit watch action',()=>{
  const {observer,guide,events}=setup(practice());observer.observe({active:true,visible:true,freshFrame:true});
  const help=activate(observer,'watch-demo');observer.dispatch(help,()=>{guide.watchOnly=true;});
  assert.equal(events('guide_action').at(-1).action,'help');
  guide.watchOnly=false;guide.followEngine.done=true;observer.observe();const before=events('guide_state').at(-1).attempt_id;
  const confirm=activate(observer);observer.dispatch(confirm,()=>{guide.player.index=1;guide.followEngine={state:'waiting',done:false};});
  assert.equal(events('guide_action').at(-1).action,'confirm');assert.equal(events('guide_action').at(-1).attempt_id,before);
});

test('state heartbeats and targets are deduplicated; synthetic identity remains disclosed',()=>{
  const {observer,events,time}=setup({...practice(),tutorial:{id:'fixture',revision:1,source:'synthetic-fixture'}});
  observer.observe({active:true,visible:true,freshFrame:true});
  for(let t=0;t<1000;t+=50){time(t);observer.target('primary');observer.observe({freshFrame:true});}
  assert.equal(events('guide_state').length,1);assert.equal(events('interaction').length,1);
  time(1000);observer.observe({freshFrame:true});assert.equal(events('guide_state').length,2);
  assert(events().every(e=>e.source==='synthetic'));
});

test('session teardown, hidden frames and pending limits cannot acknowledge stale feedback',()=>{
  const {observer,guide,events}=setup({options:{maxPending:2}});observer.observe({active:true,visible:true,freshFrame:true});
  const id=activate(observer);observer.dispatch(id,()=>{guide.mode='author';});observer.drawn();
  observer.suspend('hidden');observer.observe({visible:false});observer.rendered();
  assert.equal(events('interaction').at(-1).reason,'hidden');
  observer.activate('primary');observer.activate('replay');observer.activate('clear');
  assert(events('interaction').some(e=>e.reason==='pending_limit'));
  observer.close();assert.equal(events('interaction').at(-1).reason,'session_ended');
  assert(!events('interaction').some(e=>e.stage==='feedback_rendered'));
});

test('telemetry failure never blocks an action, changes guide semantics or hides the original exception',()=>{
  const guide={mode:'home',tutorial:{id:'a',revision:0}};
  const observer=createRuntimeObserver({guide,telemetry:{newId(){throw Error('telemetry unavailable');},emit(){throw Error('telemetry unavailable');}}});
  observer.observe({active:true});const id=observer.activate('primary');let called=0;
  observer.dispatch(id,()=>{called++;guide.mode='author';});assert.equal(called,1);assert.equal(guide.mode,'author');
  const error=Error('original');assert.throws(()=>observer.dispatch(id,()=>{throw error;}),e=>e===error);
  observer.close();
});

test('resumed frame stalls are explicit and authoring never masquerades as learner friction',()=>{
  const {observer,guide,events,time}=setup(practice());
  observer.observe({active:true,visible:true,freshFrame:true});time(1000);
  observer.observe({freshFrame:true});assert.equal(events('guide_state').at(-1).observation_gap_ms,1000);
  guide.mode='saving-tutorial';observer.observe();assert.equal(events('guide_state').at(-1).phase,'idle');
  observer.observe({visible:false});assert.equal(events('guide_state').at(-1).phase,'idle');
});

test('alternating ray jitter is rate bounded but an activation uses its immediate hit',()=>{
  const {observer,events,time}=setup();
  for(let t=0;t<1000;t+=10){time(t);observer.target(t%20?'primary':'replay');}
  assert(events('interaction').filter(e=>e.stage==='targeted').length<=8);
  const id=observer.activate('clear');observer.hitTest(id,true);
  const activation=events('interaction').findLast(e=>e.stage==='activated');
  assert.equal(activation.control,'clear');
});


test('pagehide finalizes real practice without inventing a hidden desktop attempt',()=>{
  const {observer,events}=setup(practice());observer.observe({active:true,visible:true,freshFrame:true});
  observer.suspend('session_ended');observer.observe({active:false,visible:false});
  assert.equal(events('guide_state').at(-1).phase,'idle');
});


test('voluntary demonstration playback is a user pause, not application-imposed waiting',()=>{
  const {observer,guide,events,time}=setup(practice());observer.observe({active:true,visible:true,freshFrame:true});
  const help=activate(observer,'watch-demo');observer.dispatch(help,()=>{guide.watchOnly=true;});
  assert.equal(events('guide_action').at(-1).action,'help');
  assert.equal(events('guide_state').at(-1).phase,'user_paused');
  time(500);observer.observe();assert.equal(events('guide_state').at(-1).phase,'user_paused');
});


test('current practice phases separate automatic preview, start waiting, movement and checkpoint without confirmation',()=>{
  const movedHand=x=>Array.from({length:25},()=>({p:[x,0,0]}));
  const hands=x=>({left:null,right:movedHand(x)});
  const step={guide_hands:'right',frames:[0,.3,.6].flatMap((x,i)=>Array.from({length:5},(_,j)=>({t:(i*5+j)*40,...hands(x)})))};
  const practice=new TutorialPractice(step);
  const {observer,guide,events,time}=setup({mode:'learn',practice,followEngine:practice.follower,player:{index:0,step},currentHands:{left:null,right:null}});
  observer.observe({active:true,visible:true,freshFrame:true});
  assert.equal(events('guide_state').at(-1).phase,'demo_preview');
  const attempt=events('guide_state').at(-1).attempt_id;
  guide.currentHands=hands(0);practice.update(guide.currentHands,0,true);time(100);observer.observe({freshFrame:true});
  assert.equal(events('guide_state').at(-1).phase,'ready');
  let t=100;
  for(;t<900;t+=40){time(t);practice.update(hands(0),t);observer.observe({freshFrame:true});}
  assert.equal(practice.phase,'practice');assert.equal(events('guide_state').at(-1).phase,'following');
  for(const x of [.3,.6])for(let i=0;i<30;i++){guide.currentHands=hands(x);time(t+=40);practice.update(guide.currentHands,t);observer.observe({freshFrame:true});}
  assert.equal(practice.follower.done,true);assert.equal(events('guide_state').at(-1).phase,'checkpoint');
  assert.equal(events('guide_state').at(-1).attempt_id,attempt);
  guide.mode='finished';observer.observe();
  assert.equal(events('guide_state').at(-1).phase,'idle');
  assert(!events('guide_action').some(e=>e.action==='confirm'));
});

test('nested practice settings preserve attempt identity and a Watch request from the menu is counted',()=>{
  const {observer,guide,events}=setup({...practice(),practice:{phase:'practice'}});
  observer.observe({active:true,visible:true,freshFrame:true});const first=events('guide_state').at(-1);
  observer.dispatch(activate(observer,'settings'),()=>{guide.settingsReturn='learn';guide.mode='settings';guide.gatePaused=true;});
  assert.equal(events('guide_state').at(-1).phase,'user_paused');
  assert.equal(events('guide_state').at(-1).attempt_id,first.attempt_id);
  observer.dispatch(activate(observer,'boundary-help'),()=>{guide.helpReturn='settings';guide.mode='boundary-help';});
  assert.equal(events('guide_state').at(-1).phase,'user_paused');
  assert.equal(events('guide_state').at(-1).attempt_id,first.attempt_id);
  guide.mode='learn-options';observer.observe();
  observer.dispatch(activate(observer,'watch-demo'),()=>{guide.mode='learn';guide.watchOnly=true;});
  assert.equal(events('guide_action').at(-1).action,'help');
  assert.equal(events('guide_state').at(-1).attempt_id,first.attempt_id);
});

test('library cards use one allowlisted control name and practice cannot emit legacy manual confirmation',()=>{
  const {observer,guide,events,telemetry}=setup({...practice(),practice:{phase:'transition'}});
  observer.observe({active:true,visible:true,freshFrame:true});
  observer.dispatch(activate(observer,'library-item-134'),()=>{guide.mode='loading-library';});
  assert(events('interaction').every(e=>e.control==='library-item'));
  assert(!JSON.stringify(telemetry.snapshot()).includes('library-item-134'));
  guide.mode='learn';guide.followEngine.done=true;observer.observe();
  observer.dispatch(activate(observer),()=>{guide.player.index=1;guide.followEngine={state:'waiting',done:false};});
  assert(!events('guide_action').some(e=>e.action==='confirm'));
});
