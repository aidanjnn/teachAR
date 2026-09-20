import test from 'node:test';
import assert from 'node:assert/strict';
import {coachContextFor,createTutorCoach,GUIDE_MAP_KEY} from '../public/tutorial-coach.mjs';

const tutorial=(revision=3)=>({id:'tut_1',revision,title:'Record player',setup:'Sleeve on the left. '.repeat(40),steps:[
  {id:'s1',title:'',instruction:'Slide the record out of the sleeve by its edges.'},
  {id:'s2',title:'Place it on the platter',instruction:''},
]});
const memoryStorage=()=>{const m=new Map();return {getItem:k=>m.has(k)?m.get(k):null,setItem:(k,v)=>m.set(k,String(v)),removeItem:k=>m.delete(k)};};

function fakeRuntime({session={status:'paired',role:'author',sessionId:'sess'},publish={status:200,body:{id:'11111111-1111-4111-8111-111111111111',revision:1}},connectMode='text'}={}){
  const calls={createCoach:[],setStep:[],setAttempt:[],dispose:0,ask:0,askText:[],fetch:[]};
  const fetchImpl=async(url,init={})=>{
    calls.fetch.push({url,init});
    if(url==='/api/coach-guides')return {ok:publish.status<400,status:publish.status,json:async()=>publish.body};
    throw Error('unexpected fetch '+url);
  };
  const runtime={
    sessionState:async()=>session,
    pairBrowser:async code=>code==='12345678'?{ok:true,role:'author'}:{ok:false,message:'Code not accepted.'},
    createCoach:options=>{
      calls.createCoach.push(options);
      const handlers={state:new Set(),transcript:new Set(),answer:new Set(),error:new Set()};
      return {
        context:options.context,state:{mode:'idle'},
        connect:async()=>{handlers.state.forEach(h=>h({mode:connectMode}));return connectMode;},
        ask:()=>{calls.ask++;},
        askText:async q=>{calls.askText.push(q);const answer={answer:'Answer for '+options.context.currentStepId,source:'text'};handlers.answer.forEach(h=>h(answer));return answer;},
        setStep:(id,rev)=>calls.setStep.push([id,rev]),
        setAttempt:id=>calls.setAttempt.push(id),
        dispose:()=>{calls.dispose++;},
        onState:h=>{handlers.state.add(h);return()=>handlers.state.delete(h);},
        onTranscript:h=>{handlers.transcript.add(h);return()=>handlers.transcript.delete(h);},
        onAnswer:h=>{handlers.answer.add(h);return()=>handlers.answer.delete(h);},
        onLiveError:h=>{handlers.error.add(h);return()=>handlers.error.delete(h);},
        _handlers:handlers,
      };
    },
  };
  return {runtime,fetchImpl,calls};
}

test('coach context fills titles and instructions the prototype leaves empty and bounds layout notes',()=>{
  const context=coachContextFor(tutorial(),{id:'guide-1',revision:4},{runId:'run',attemptId:'att',stepId:'s2',epoch:7});
  assert.equal(context.tutorialId,'guide-1');assert.equal(context.tutorialRevision,4);
  assert.equal(context.currentStepId,'s2');assert.equal(context.stepRevision,7);
  assert.equal(context.steps[0].title,'Slide the record out of the sleeve by its edges.'.slice(0,60));
  assert.equal(context.steps[1].instruction,'Follow the ghost hand for this step.');
  assert.ok(context.layoutNotes.length<=500);
  assert.equal(context.title,'Record player');
  assert.throws(()=>coachContextFor(tutorial(),{id:'g',revision:1},{runId:'run',attemptId:'att',stepId:'missing',epoch:0}),/current step/i);
});

test('start publishes a coach guide once per tutorial revision and grounds the coach on it',async()=>{
  const storage=memoryStorage();
  const {runtime,fetchImpl,calls}=fakeRuntime();
  const coach=createTutorCoach({runtime,fetchImpl,storage});
  const state=await coach.start(tutorial(),tutorial().steps[0],2);
  assert.equal(state.mode,'text');assert.equal(state.grounded,true);assert.equal(state.pairing,'paired');
  assert.equal(calls.fetch.filter(c=>c.url==='/api/coach-guides').length,1);
  const published=JSON.parse(calls.fetch[0].init.body);
  assert.equal(published.sourceId,'tut_1');assert.equal(published.steps.length,2);assert.equal(published.schemaVersion,1);
  assert.equal(calls.createCoach[0].context.tutorialId,'11111111-1111-4111-8111-111111111111');
  assert.equal(calls.createCoach[0].context.tutorialRevision,1);
  assert.deepEqual(JSON.parse(storage.getItem(GUIDE_MAP_KEY)),{tut_1:{revision:3,id:'11111111-1111-4111-8111-111111111111',guideRevision:1}});
  // Same revision again: no second publish.
  await coach.start(tutorial(),tutorial().steps[1],3);
  assert.equal(calls.fetch.filter(c=>c.url==='/api/coach-guides').length,1);
  assert.equal(calls.dispose,1,'restarting disposes the previous coach');
  // A new tutorial revision republishes.
  await coach.start(tutorial(4),tutorial(4).steps[0],4);
  assert.equal(calls.fetch.filter(c=>c.url==='/api/coach-guides').length,2);
});

test('step and attempt changes reach the coach with the tutor epoch, and stop disposes it',async()=>{
  const {runtime,fetchImpl,calls}=fakeRuntime();
  const coach=createTutorCoach({runtime,fetchImpl,storage:memoryStorage()});
  await coach.start(tutorial(),tutorial().steps[0],1);
  coach.onStep(tutorial().steps[1],5);
  assert.deepEqual(calls.setStep,[['s2',5]]);
  coach.onAttempt();coach.onAttempt();
  assert.equal(calls.setAttempt.length,2);assert.notEqual(calls.setAttempt[0],calls.setAttempt[1]);
  coach.ask();assert.equal(calls.ask,1);
  const captions=[];coach.onCaption(c=>captions.push(c));
  const answer=await coach.askText('what now');
  assert.equal(answer.answer,'Answer for s1');assert.equal(captions.at(-1).role,'coach');
  coach.stop();assert.equal(calls.dispose,1);assert.equal(coach.active,false);
  coach.onStep(tutorial().steps[0],6);assert.equal(calls.setStep.length,1,'no calls after stop');
});

test('an unpaired browser gets a reason instead of a coach, and pairing clears it',async()=>{
  const {runtime,fetchImpl,calls}=fakeRuntime({session:{status:'unpaired',message:'Pair first'}});
  const coach=createTutorCoach({runtime,fetchImpl,storage:memoryStorage()});
  const state=await coach.start(tutorial(),tutorial().steps[0],0);
  assert.equal(state.mode,'idle');assert.equal(state.reason,'unpaired');assert.equal(calls.createCoach.length,0);
  assert.equal((await coach.pair('00000000')).ok,false);
  const paired=await coach.pair('12345678');assert.equal(paired.ok,true);assert.equal(coach.state.pairing,'paired');
});

test('a server without pairing coaches from client steps, and a refused publish falls back to ungrounded text',async()=>{
  const open=fakeRuntime({session:{status:'no-pairing'}});
  const coachOpen=createTutorCoach({runtime:open.runtime,fetchImpl:open.fetchImpl,storage:memoryStorage()});
  const stateOpen=await coachOpen.start(tutorial(),tutorial().steps[0],0);
  assert.equal(stateOpen.grounded,false);assert.equal(stateOpen.reason,'no-pairing');
  assert.equal(open.calls.fetch.length,0,'no publish without pairing');
  assert.equal(open.calls.createCoach[0].context.tutorialId,'tut_1');
  const refused=fakeRuntime({session:{status:'paired',role:'learner',sessionId:'s'},publish:{status:403,body:{error:'forbidden'}}});
  const coachRefused=createTutorCoach({runtime:refused.runtime,fetchImpl:refused.fetchImpl,storage:memoryStorage()});
  const stateRefused=await coachRefused.start(tutorial(),tutorial().steps[0],0);
  assert.equal(stateRefused.grounded,false);assert.equal(stateRefused.reason,'publish_403');
  assert.equal(refused.calls.createCoach.length,1);
});
