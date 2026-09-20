import test from 'node:test';
import assert from 'node:assert/strict';
import {encodeNarration} from '../public/narration-core.mjs';
import {draftFromNarration,wavBytesFromDataUrl} from '../public/narration-labels.mjs';

const narration=()=>encodeNarration(new Float32Array(16000));
const tutorial=()=>({id:'tut',title:'Record player',setup:'Sleeve left, turntable centre.',steps:[
  {id:'s1',title:'',instruction:'',narration:narration()},
  {id:'s2',title:'',instruction:'Typed already',narration:null},
  {id:'s3',title:'',instruction:'',narration:narration()},
]});
const transcript=text=>({schemaVersion:1,source:'model',model:'whisper-1',language:'en',audioDurationMs:1000,spans:text?[{id:'sp1',startMs:0,endMs:900,text}]:[]});
const labels=(stepId,extra={})=>({schemaVersion:1,labels:[{stepId,title:'Slide the record out',instruction:'Hold it by the edges and slide it out of the sleeve.',narrationSpanIds:['sp1'],needsReview:false}],provenance:{labels:'model',model:'gpt-4.1-mini',promptVersion:'v1'},failure:null,...extra});

function fetchStub(plan){
  const calls=[];
  const fetchImpl=async(url,init)=>{calls.push({url,init});const next=plan.shift();if(!next)throw Error('unplanned fetch '+url);
    return {ok:next.status<400,status:next.status,json:async()=>next.body};};
  return {fetchImpl,calls};
}

test('WAV bytes come straight from the local data URL',()=>{
  const bytes=wavBytesFromDataUrl(narration().audio);
  assert.equal(bytes.length,44+16000*2);assert.equal(String.fromCharCode(...bytes.subarray(0,4)),'RIFF');
  assert.throws(()=>wavBytesFromDataUrl('https://example.com/a.wav'),/local WAV/);
});

test('each narrated step is transcribed then labelled as one segment; steps without narration are skipped',async()=>{
  const {fetchImpl,calls}=fetchStub([
    {status:200,body:transcript('slide the record out by its edges')},{status:200,body:labels('s1')},
    {status:200,body:transcript('')},
  ]);
  const proposals=await draftFromNarration(tutorial(),{fetchImpl});
  assert.equal(calls[0].url,'/api/voice/transcriptions');
  assert.equal(calls[0].init.headers['content-type'],'audio/wav');
  assert.equal(calls[0].init.headers['x-audio-duration-ms'],'1000');
  assert.equal(calls[0].init.body.length,44+32000);
  assert.equal(calls[1].url,'/api/voice/labels');
  const body=JSON.parse(calls[1].init.body);
  assert.deepEqual(body.segments,[{id:'s1',startMs:0,endMs:1000}]);assert.equal(body.taskContext,'Sleeve left, turntable centre.');assert.equal(body.transcript.spans.length,1);
  assert.equal(proposals.length,2,'s2 has no narration');
  assert.deepEqual(proposals[0],{stepId:'s1',title:'Slide the record out',instruction:'Hold it by the edges and slide it out of the sleeve.',needsReview:false,provenance:'model',model:'gpt-4.1-mini',transcriptSource:'model',transcriptText:'slide the record out by its edges'});
  assert.equal(proposals[1].stepId,'s3');assert.match(proposals[1].error,/No speech/);
});

test('one failing step does not hide the others, and a pairing refusal stops the run',async()=>{
  const partial=fetchStub([{status:503,body:{error:'provider_unavailable',message:'The AI provider did not respond.'}},{status:200,body:transcript('press the cap on')},{status:200,body:labels('s3')}]);
  const proposals=await draftFromNarration(tutorial(),{fetchImpl:partial.fetchImpl});
  assert.equal(proposals[0].error,'The AI provider did not respond.');assert.equal(proposals[1].title,'Slide the record out');
  const refused=fetchStub([{status:403,body:{error:'forbidden'}}]);
  await assert.rejects(draftFromNarration(tutorial(),{fetchImpl:refused.fetchImpl}),/Pair this browser as the author/);
  assert.equal(refused.calls.length,1,'stops after the refusal');
});

test('a label result without this step reports the server failure',async()=>{
  const {fetchImpl}=fetchStub([{status:200,body:transcript('hello')},{status:200,body:labels('other',{labels:[],failure:{code:'refusal',message:'Model declined.'}})}]);
  const [proposal]=await draftFromNarration({...tutorial(),steps:[tutorial().steps[0]]},{fetchImpl});
  assert.equal(proposal.error,'Model declined.');assert.equal(proposal.transcriptText,'hello');
});

test('narration longer than two minutes is refused before any request',async()=>{
  const long={id:'tut',title:'t',setup:'',steps:[{id:'s1',title:'',instruction:'',narration:{audio:narration().audio,duration_ms:150000}}]};
  const {fetchImpl,calls}=fetchStub([]);
  const [proposal]=await draftFromNarration(long,{fetchImpl});
  assert.match(proposal.error,/two minutes/);assert.equal(calls.length,0);
});
