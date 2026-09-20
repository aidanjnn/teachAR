// Look & advise: one fresh camera frame, the step's reference photo and a question go to the paired server's scene coach,
// which asks an OMNI multimodal model and returns speech plus a transcript. Advice only: nothing here touches progression,
// and the key and the model live on the server. Requires the voice coach to be started so the context is grounded.
export const DEFAULT_QUESTION='Look at my table. Am I set up right for this step?';
export const STALE_MESSAGE='View changed; advice discarded.';
const REQUEST_TIMEOUT_MS=18000,RESUME_TIMEOUT_MS=1500,FALLBACK_SPEECH_TIMEOUT_MS=20000;

export function createSceneCoach({guide,coach,snapshot,hasCamera=()=>true,fetchImpl=(input,init)=>fetch(input,init),tell=()=>{},speakFallback=null,audioContextFactory=()=>new AudioContext()}){
  const state={busy:false,speaking:false,message:'',error:null};
  let generation=0,abort=null,playing=null;
  const stateHandlers=new Set();
  const emit=()=>{for(const h of stateHandlers)h({...state});};
  const uuid=()=>globalThis.crypto.randomUUID();
  const strip=dataUrl=>{const m=/^data:(image\/jpeg);base64,([A-Za-z0-9+/]+={0,2})$/.exec(String(dataUrl||''));return m?{mimeType:m[1],dataBase64:m[2]}:null;};
  const source=()=>/oculusbrowser|quest/i.test(globalThis.navigator?.userAgent||'')?'quest-camera':'workspace-webcam';
  function reason(){
    if(!coach?.active)return 'Start the coach first so the advice is grounded on the published steps.';
    if(!hasCamera())return 'Enable the camera first so the coach can see your table.';
    return null;
  }
  async function look(question=DEFAULT_QUESTION){
    if(state.busy)return null;
    const why=reason();if(why){tell(why);return null;}
    // Inside AR the player names the step; on the flat page it is the step the coach was started or last updated on.
    const step=guide.player?.step||coach.currentStep;if(!step){tell('Open a step before asking the coach to look.');return null;}
    const gen=++generation,epoch=guide.epoch??0,tutorialId=guide.tutorial?.id,stepId=step.id;
    // A late answer for another step, epoch or tutorial is dropped; the learner may have moved on.
    const current=()=>gen===generation&&guide.epoch===epoch&&guide.tutorial?.id===tutorialId&&(guide.player?.step||coach.currentStep)?.id===stepId;
    state.busy=true;state.error=null;state.message='Looking at your table…';emit();
    try{
      const shot=await snapshot();const image=strip(shot?.image);
      if(!image)throw Error('The camera did not deliver a fresh frame.');
      if(!current()){if(gen===generation)state.message=STALE_MESSAGE;return null;}
      const context=coach.contextFor(step,epoch),reference=strip(step.reference?.image);
      // The timer holds its own controller: a later look or stop() must never be aborted by an earlier timer.
      const controller=new AbortController();abort=controller;const timer=setTimeout(()=>controller.abort(),REQUEST_TIMEOUT_MS);
      let response;
      try{
        response=await fetchImpl('/api/scene-coach',{method:'POST',credentials:'same-origin',headers:{'content-type':'application/json'},signal:controller.signal,
          body:JSON.stringify({schemaVersion:1,requestId:uuid(),context,question:String(question||DEFAULT_QUESTION).slice(0,240),source:source(),image,reference,captureAgeMs:Math.max(0,Math.round(shot.capture?.request_age_ms??0)),epoch})});
      }finally{clearTimeout(timer);}
      const body=await response.json().catch(()=>({}));
      if(!response.ok)throw Error(body.message||`The scene coach answered ${response.status}.`);
      if(!current()){if(gen===generation)state.message=STALE_MESSAGE;return null;}
      state.message=body.transcript;emit();
      coach.announce(body.transcript,body.provenance==='guarded'?'scene-guarded':'scene');
      if(body.audio?.dataBase64)await play(body.audio.dataBase64,current,gen);
      else await fallback(body.transcript,gen);
      return body;
    }catch(e){
      if(gen!==generation)return null;
      state.error=e?.message||'The scene coach is unavailable.';state.message=state.error;tell(state.error);return null;
    }finally{
      if(gen===generation){state.busy=false;abort=null;emit();}
    }
  }
  // The tutor voice reads the advice while the scene coach counts as speaking, so the page does not talk over it.
  async function fallback(text,gen){
    if(!speakFallback)return;
    if(gen===generation){state.speaking=true;emit();}
    try{await Promise.race([Promise.resolve(speakFallback(text)),new Promise(r=>setTimeout(r,FALLBACK_SPEECH_TIMEOUT_MS))]);}
    catch{/* speech unavailable */}
    finally{if(gen===generation){state.speaking=false;emit();}}
  }
  async function play(base64,current,gen){
    let context=null;
    try{context=audioContextFactory();}catch{await fallback(state.message,gen);return;}
    try{
      // A context the browser keeps suspended (no activation) must not hold the coach busy; the tutor voice takes over.
      await Promise.race([Promise.resolve(context.resume?.()),new Promise(r=>setTimeout(r,RESUME_TIMEOUT_MS))]);
      if(context.state&&context.state!=='running')throw Error('audio context suspended');
      const bytes=Uint8Array.from(atob(base64),c=>c.charCodeAt(0));
      const buffer=await context.decodeAudioData(bytes.buffer);
      if(!current())return;
      const node=context.createBufferSource();node.buffer=buffer;node.connect(context.destination);playing=node;state.speaking=true;emit();
      await new Promise(resolve=>{
        let done=false;const finish=()=>{if(done)return;done=true;clearInterval(watch);clearTimeout(deadline);resolve();};
        // Playback stops the moment the learner moves on; a stalled audio clock cannot hold the coach busy forever.
        const watch=setInterval(()=>{if(!current()){try{node.stop();}catch{/* already stopped */}finish();}},100);
        const deadline=setTimeout(()=>{try{node.stop();}catch{/* already stopped */}finish();},buffer.duration*1000+2000);
        node.onended=finish;node.start();
      });
    }catch{if(gen===generation)await fallback(state.message,gen);}
    finally{if(gen===generation){playing=null;state.speaking=false;emit();}try{await context?.close?.();}catch{/* already closed */}}
  }
  function stop(){generation++;abort?.abort();abort=null;try{playing?.stop();}catch{/* already stopped */}playing=null;state.busy=false;state.speaking=false;emit();}
  return {
    look,stop,
    get available(){return reason()===null;},get reason(){return reason();},
    get busy(){return state.busy;},get speaking(){return state.speaking;},get message(){return state.message;},get state(){return {...state};},
    onState(h){stateHandlers.add(h);return()=>stateHandlers.delete(h);},
  };
}
