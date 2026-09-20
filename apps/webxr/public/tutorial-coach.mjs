// Bridges the browser tutorial to the shared coach runtime (public/vendor/trail-coach.js, built from apps/web).
// The coach only ever hears reviewed step text through the paired server; it never advances a step.
export const GUIDE_MAP_KEY='trail-coach-guides';
const MAX_TITLE=60,MAX_INSTRUCTION=240,MAX_NOTES=500,MAX_TUTORIAL_TITLE=120;
export const CAPTION_GAP_MS=2500,LEARNER_TURN_MS=800;
const uuid=()=>globalThis.crypto.randomUUID();
const clip=(text,max)=>String(text??'').trim().slice(0,max);

/** Coach steps must have a title and an instruction; the prototype lets either be empty. */
export function coachSteps(tutorial){
  return tutorial.steps.map((step,index)=>{
    const instruction=clip(step.instruction,MAX_INSTRUCTION)||'Follow the ghost hand for this step.';
    const title=clip(step.title,MAX_TITLE)||clip(instruction,MAX_TITLE)||`Step ${index+1}`;
    return {id:step.id,title,instruction};
  });
}
/** Builds the CoachContext the runtime and the server share. `guideRef` is the published guide, or the tutorial itself when ungrounded. */
export function coachContextFor(tutorial,guideRef,{runId,attemptId,stepId,epoch}){
  const steps=coachSteps(tutorial);
  if(!steps.some(s=>s.id===stepId))throw Error('Current step is not part of this tutorial.');
  const notes=clip(tutorial.setup,MAX_NOTES);
  return {
    tutorialId:guideRef.id,tutorialRevision:guideRef.revision,runId,attemptId,
    title:clip(tutorial.title,MAX_TUTORIAL_TITLE)||'Tabletop practice',steps,
    currentStepId:stepId,stepRevision:Math.max(0,Math.floor(epoch||0)),
    ...(notes?{layoutNotes:notes}:{}),
  };
}
export function publishBody(tutorial){
  const notes=clip(tutorial.setup,MAX_NOTES);
  return {schemaVersion:1,sourceId:tutorial.id,title:clip(tutorial.title,MAX_TUTORIAL_TITLE)||'Tabletop practice',...(notes?{layoutNotes:notes}:{}),steps:coachSteps(tutorial)};
}
function readMap(storage){try{const raw=storage?.getItem(GUIDE_MAP_KEY);const parsed=raw?JSON.parse(raw):{};return parsed&&typeof parsed==='object'?parsed:{};}catch{return {};}}
function writeMap(storage,map){try{storage?.setItem(GUIDE_MAP_KEY,JSON.stringify(map));}catch{/* private mode: the guide is republished next time */}}

/**
 * Owns one coach at a time. `runtime` is the bundle's exports ({createCoach, sessionState, pairBrowser});
 * it is loaded lazily from /vendor/trail-coach.js unless injected, so tests never touch the network or a microphone.
 */
export function createTutorCoach({runtime=null,fetchImpl=(input,init)=>fetch(input,init),storage=globalThis.localStorage,audioSink=null,tell=()=>{}}={}){
  let api=null,loaded=runtime,attemptId=null,runId=null,epoch=0,captionAt=0,startGeneration=0,captionStreaming=false,activeTutorial=null,guideRef=null,currentStep=null;
  const state={mode:'idle',listenRequested:false,pairing:'unknown',role:null,grounded:false,reason:null,error:null,caption:'',tutorialId:null,tutorialRevision:null};
  const stateHandlers=new Set(),captionHandlers=new Set();
  const snapshot=()=>({...state});
  const emit=()=>{for(const h of stateHandlers)h(snapshot());};
  // Live transcripts arrive as deltas, and the learner's own words can interleave with them. One coach turn keeps growing
  // while its deltas keep coming; a pause longer than a couple of seconds or a whole text answer starts a new caption.
  const caption=entry=>{
    const text=String(entry.delta||''),now=Date.now();
    if(entry.role==='coach'){const continues=captionStreaming&&!entry.source&&now-captionAt<CAPTION_GAP_MS;state.caption=continues?state.caption+text:text;captionStreaming=!entry.source;captionAt=now;}
    // The learner's words trail their speech: a straggler within a second of a coach delta does not split the answer; a later question does.
    else if(now-captionAt>=LEARNER_TURN_MS)captionStreaming=false;
    for(const h of captionHandlers)h(entry);
  };
  async function load(){
    if(loaded)return loaded;
    try{loaded=await import('/vendor/trail-coach.js');}
    catch(e){throw Error(`Voice coach bundle failed to load (${e?.message||e}). Run pnpm --filter @trail/web build:tutor-coach and reload.`);}
    return loaded;
  }

  // The browser's mapping is a hint; the server is the truth. A wiped server or a republish from another device must not leave the coach ungrounded while the badge says otherwise.
  async function verifyGuide(id){
    try{
      const response=await fetchImpl(`/api/coach-guides/${encodeURIComponent(id)}/query`,{method:'POST',credentials:'same-origin'});
      if(response.status===404)return {state:'missing'};
      if(!response.ok)return {state:'unknown'};
      const body=await response.json();return {state:'ok',id:body.id,revision:body.revision};
    }catch{return {state:'unknown'};}
  }
  async function ensureGuide(tutorial){
    const map=readMap(storage),known=map[tutorial.id];
    if(known&&known.revision===tutorial.revision&&known.id){
      const check=await verifyGuide(known.id);
      if(check.state==='ok'){if(check.revision!==known.guideRevision){map[tutorial.id]={...known,guideRevision:check.revision};writeMap(storage,map);}return {id:check.id,revision:check.revision,grounded:true,reason:null};}
      if(check.state==='unknown')return {id:known.id,revision:known.guideRevision,grounded:true,reason:'guide_unverified'};
      delete map[tutorial.id];writeMap(storage,map);
    }
    let response;
    try{
      response=await fetchImpl('/api/coach-guides',{method:'POST',credentials:'same-origin',headers:{'content-type':'application/json'},body:JSON.stringify(publishBody(tutorial))});
    }catch{
      if(known?.id)return {id:known.id,revision:known.guideRevision,grounded:true,reason:'publish_failed_earlier_revision'};
      return {id:tutorial.id,revision:tutorial.revision,grounded:false,reason:'publish_failed'};
    }
    if(response.ok){
      const body=await response.json();
      map[tutorial.id]={revision:tutorial.revision,id:body.id,guideRevision:body.revision};writeMap(storage,map);
      return {id:body.id,revision:body.revision,grounded:true,reason:null};
    }
    // A learner cannot publish; an earlier published revision is still server-reviewed text, so prefer it.
    if(known?.id)return {id:known.id,revision:known.guideRevision,grounded:true,reason:'publish_'+response.status+'_earlier_revision'};
    return {id:tutorial.id,revision:tutorial.revision,grounded:false,reason:'publish_'+response.status};
  }

  async function start(tutorial,step,currentEpoch=0){
    // Any stop() or tutorial change while this start is still awaiting cancels it; nothing is created or connected afterwards.
    stop();
    const generation=++startGeneration;
    const cancelled=()=>generation!==startGeneration;
    const rt=await load();
    if(cancelled())return snapshot();
    const session=await rt.sessionState(fetchImpl);
    if(cancelled())return snapshot();
    if(session.status==='unpaired'){state.pairing='unpaired';state.role=null;state.reason='unpaired';state.error=session.message||null;emit();return snapshot();}
    if(session.status==='unavailable'){state.pairing='unknown';state.reason='server_unavailable';state.error=session.message||'The server is not answering.';emit();return snapshot();}
    state.pairing=session.status==='paired'?'paired':'none';state.role=session.role||null;state.error=null;
    epoch=currentEpoch;attemptId=uuid();state.tutorialId=tutorial.id;state.tutorialRevision=tutorial.revision;state.caption='';
    const guide=session.status==='no-pairing'?{id:tutorial.id,revision:tutorial.revision,grounded:false,reason:'no-pairing'}:await ensureGuide(tutorial);
    if(cancelled())return snapshot();
    state.grounded=guide.grounded;state.reason=guide.reason;
    runId=uuid();activeTutorial=tutorial;guideRef=guide;currentStep=step;
    const context=coachContextFor(tutorial,guide,{runId,attemptId,stepId:step.id,epoch});
    const created=rt.createCoach({context,fetchImpl,...(audioSink?{audioSink}:{})});
    api=created;
    created.onState(s=>{if(api!==created)return;state.mode=s.mode;state.listenRequested=!!s.listenRequested;emit();});
    created.onTranscript(entry=>{if(api!==created||entry.stale)return;caption(entry);});
    created.onAnswer(answer=>{if(api!==created)return;caption({role:'coach',delta:answer.answer,stepRevision:epoch,stale:false,source:answer.source||'text'});});
    created.onLiveError(error=>{if(api!==created)return;state.error=error.message;emit();tell(error.message);});
    state.mode='connecting';emit();
    let mode='text';
    try{mode=await created.connect();}catch(e){if(api===created)state.error=e?.message||'Coach did not start.';}
    if(api===created&&!cancelled()){state.mode=mode;emit();}
    return snapshot();
  }
  function onStep(step,currentEpoch){epoch=currentEpoch;currentStep=step;api?.setStep(step.id,Math.max(0,Math.floor(currentEpoch||0)));}
  // The scene coach reuses this grounded identity (published guide id and revision) so both coaches answer from the same reviewed text.
  function contextFor(step,currentEpoch=epoch){if(!api||!activeTutorial||!guideRef)throw Error('Start the coach first.');return coachContextFor(activeTutorial,guideRef,{runId,attemptId,stepId:step.id,epoch:currentEpoch});}
  // A whole answer from another source (the scene coach) lands in the same caption and transcript as spoken answers.
  function announce(text,source='scene'){caption({role:'coach',delta:String(text||''),stepRevision:epoch,stale:false,source});}
  function onAttempt(){if(!api)return;attemptId=uuid();api.setAttempt(attemptId);}
  function ask(){api?.ask();}
  function askText(question){return api?api.askText(question):Promise.resolve(null);}
  function stop(){startGeneration++;if(api){const old=api;api=null;try{old.dispose();}catch{/* already gone */}}state.tutorialId=null;state.tutorialRevision=null;activeTutorial=null;guideRef=null;currentStep=null;captionAt=0;captionStreaming=false;state.listenRequested=false;if(state.mode!=='idle'){state.mode='idle';emit();}}
  async function pair(code){
    const rt=await load();const result=await rt.pairBrowser(code,fetchImpl);
    if(result.ok){state.pairing='paired';state.role=result.role;state.reason=null;state.error=null;}else state.error=result.message;
    emit();return result;
  }
  return {
    get state(){return snapshot();},get active(){return !!api;},
    // Cheap reads for the per-frame headset panel and the speech gate; no copy.
    get mode(){return state.mode;},get listenRequested(){return state.listenRequested;},get currentStep(){return currentStep;},
    // Run and attempt identity: a Repeat or a restart changes it, and answers requested under the old identity are stale.
    get identity(){return api?{runId,attemptId}:null;},get caption(){return state.caption;},get captionAgeMs(){return captionAt?Date.now()-captionAt:Infinity;},get tutorialId(){return state.tutorialId;},get tutorialRevision(){return state.tutorialRevision;},
    start,stop,onStep,onAttempt,ask,askText,pair,contextFor,announce,
    onCaption(h){captionHandlers.add(h);return()=>captionHandlers.delete(h);},
    onState(h){stateHandlers.add(h);return()=>stateHandlers.delete(h);},
  };
}
