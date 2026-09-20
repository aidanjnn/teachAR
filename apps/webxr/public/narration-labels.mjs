// Turns each step's recorded narration into a drafted title and instruction through the paired server:
// Whisper transcribes the step's WAV, then the label route writes text for that one segment. The expert still reviews.
const WAV_PREFIX='data:audio/wav;base64,';
const MAX_TASK_CONTEXT=500;
const MAX_DRAFT_MS=120_000;

export function wavBytesFromDataUrl(dataUrl){
  if(typeof dataUrl!=='string'||!dataUrl.startsWith(WAV_PREFIX))throw Error('Narration is not a local WAV.');
  const raw=atob(dataUrl.slice(WAV_PREFIX.length)),bytes=new Uint8Array(raw.length);
  for(let i=0;i<raw.length;i++)bytes[i]=raw.charCodeAt(i);
  return bytes;
}

class DraftError extends Error{constructor(message,{fatal=false,status=null}={}){super(message);this.fatal=fatal;this.status=status;}}

async function readError(response,fallback){
  try{const body=await response.json();return body?.message||body?.error||fallback;}catch{return fallback;}
}

async function draftStep(tutorial,step,fetchImpl){
  const bytes=wavBytesFromDataUrl(step.narration.audio);
  const duration=Math.max(1,Math.round(step.narration.duration_ms||0));
  // The transcription route accepts at most two minutes of narration per request.
  if(duration>MAX_DRAFT_MS)return {stepId:step.id,error:'Narration longer than two minutes cannot be drafted. Trim the step first.'};
  const transcribed=await fetchImpl('/api/voice/transcriptions',{method:'POST',credentials:'same-origin',
    headers:{'content-type':'audio/wav','x-audio-start-offset-ms':'0','x-audio-duration-ms':String(duration)},body:bytes});
  if(transcribed.status===401||transcribed.status===403)throw new DraftError('Pair this browser as the author before drafting from narration.',{fatal:true,status:transcribed.status});
  if(!transcribed.ok)throw new DraftError(await readError(transcribed,`Transcription failed (${transcribed.status}).`),{status:transcribed.status});
  const transcript=await transcribed.json();
  const spoken=(transcript.spans||[]).map(s=>s.text).join(' ').trim();
  if(!spoken)return {stepId:step.id,error:'No speech was recognised in this narration.',transcriptSource:transcript.source||null};
  const taskContext=String(tutorial.setup||'').trim().slice(0,MAX_TASK_CONTEXT);
  const labelled=await fetchImpl('/api/voice/labels',{method:'POST',credentials:'same-origin',headers:{'content-type':'application/json'},
    body:JSON.stringify({schemaVersion:1,segments:[{id:step.id,startMs:0,endMs:duration}],transcript,...(taskContext?{taskContext}:{})})});
  if(labelled.status===401||labelled.status===403)throw new DraftError('Pair this browser as the author before drafting from narration.',{fatal:true,status:labelled.status});
  if(!labelled.ok)throw new DraftError(await readError(labelled,`Labelling failed (${labelled.status}).`),{status:labelled.status});
  const result=await labelled.json();
  const label=(result.labels||[]).find(l=>l.stepId===step.id);
  if(!label)return {stepId:step.id,error:result.failure?.message||'The server returned no label for this step.',transcriptSource:transcript.source||null,transcriptText:spoken};
  return {stepId:step.id,title:label.title,instruction:label.instruction,needsReview:label.needsReview!==false,
    provenance:result.provenance?.labels||'fallback',model:result.provenance?.model||null,transcriptSource:transcript.source||null,transcriptText:spoken};
}

/** One proposal per narrated step, in tutorial order. A failure on one step never hides the others; a pairing refusal stops the run. */
export async function draftFromNarration(tutorial,{fetchImpl=(input,init)=>fetch(input,init)}={}){
  const proposals=[];
  for(const step of tutorial.steps){
    if(!step.narration?.audio)continue;
    try{proposals.push(await draftStep(tutorial,step,fetchImpl));}
    catch(e){
      if(e?.fatal)throw e;
      proposals.push({stepId:step.id,error:e?.message||'Drafting failed.'});
    }
  }
  return proposals;
}
