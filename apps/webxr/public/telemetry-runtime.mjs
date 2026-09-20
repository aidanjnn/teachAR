// Observations only: this adapter never advances the guide or changes its rules.
import {palm} from './tutorial-assist.mjs';

export function createRuntimeObserver({telemetry,guide,now=()=>performance.now(),timeoutMs=5000,maxPending=8}={}) {
  let active=false,visible=true,lastFrame=-Infinity,poseAvailable=false,closed=false;
  let target=null,lastState='',lastCadenceKey='',lastEmission=-Infinity,drawnSignature=null,identity=null,identityKey=null;
  let previousFollower=null,previousPractice=false,lastTargetAt=-Infinity;
  const pending=new Map(),aliases=new Map(),objects=new WeakMap();let objectSerial=0;
  const safe=(fn,fallback)=>{try{return fn();}catch{return fallback;}};
  const emit=(type,data)=>safe(()=>telemetry.emit(type,data));
  const id=()=>safe(()=>telemetry.newId(),null);
  const source=input=>guide.tutorial?.source==='synthetic-fixture'?'synthetic':input||(active?'webxr':'desktop');
  const mode=()=>guide.mode||'unknown';
  const isPractice=()=>['learn','learn-options'].includes(mode())||
    (mode()==='settings'&&['learn','learn-options'].includes(guide.settingsReturn))||
    (mode()==='boundary-help'&&guide.helpReturn==='settings'&&['learn','learn-options'].includes(guide.settingsReturn));
  // Library card indices are local UI addresses, never remotely identifying controls.
  const safeControl=control=>/^library-item-\d+$/.test(control||'')?'library-item':control;
  const objectId=value=>{if(!value||typeof value!=='object')return 0;if(!objects.has(value))objects.set(value,++objectSerial);return objects.get(value);};
  // Text is compared locally to detect feedback changes, never included in events.
  const signature=()=>JSON.stringify([mode(),guide.player?.index??-1,guide.tutorial?.revision??0,
    guide.saveStatus,guide.pending?.kind,!!guide.gatePaused,!!guide.watchOnly,guide.player?.paused,
    guide.player?.rate,guide.practice?.phase,guide.followEngine?.state,guide.followEngine?.index,objectId(guide.followEngine),
    guide.libraryIndex,guide.libraryFilter,guide.libraryQuery,guide.captureHands,guide.fluidCapture,guide.appearance?.theme,guide.appearance?.sound,guide.trimRange,guide.cleanSave,guide.alignmentEnabled,guide.problem||'',guide.note||'',guide.savedMessage||'']);
  function context() {
    const key=guide.tutorial?.id??guide.tutorial;
    if(!aliases.has(key)){if(aliases.size>=32)aliases.delete(aliases.keys().next().value);aliases.set(key,id());}
    const practice=isPractice();
    const nextKey=[aliases.get(key),guide.tutorial?.revision??0,guide.player?.index??-1].join(':');
    if(nextKey!==identityKey||(practice&&!previousPractice)||(practice&&guide.followEngine!==previousFollower)) {
      identityKey=nextKey;identity={tutorial_key:aliases.get(key),attempt_id:id()};
    }
    previousPractice=practice;previousFollower=guide.followEngine;
    return {...identity,revision:guide.tutorial?.revision??0,step_index:guide.player?.index??-1,source:source(),mode:mode()};
  }
  function stage(item,name,extra={}) {
    if(item?.id)emit('interaction',{interaction_id:item.id,stage:name,control:safeControl(item.control)||'none',source:item.source,
      mode:mode(),step_index:guide.player?.index??-1,...extra});
  }
  function reject(item,reason,outcome='blocked') {
    stage(item,'rejected',{reason,outcome});pending.delete(item?.id);
    if(target===item)target=null;
  }
  function expire() {
    const time=now();
    for(const item of pending.values())if(time-item.started>=timeoutMs)reject(item,item.changed?'render_timeout':'no_state_change');
  }
  function targetControl(control,input='webxr') {
    if(closed)return null;
    const kind=source(input);
    if(target?.control===control&&target.source===kind)return target.id;
    // Coalesce ray jitter; activation still observes its actual hit immediately.
    if(now()-lastTargetAt<125)return null;
    lastTargetAt=now();
    if(target&&!pending.has(target.id))reject(target,'target_left','abandoned');
    target=null;
    if(control){target={id:id(),control,source:kind,started:now()};stage(target,'targeted',{outcome:'observed'});}
    return target?.id;
  }
  function activate(control,input='webxr') {
    if(closed)return null;
    const kind=source(input);
    const matches=target?.control===control&&target.source===kind;
    if(target&&!matches)reject(target,'target_left','abandoned');
    const item=matches?target:{id:id(),control:control||'none',source:kind,started:now()};
    if(!matches&&control)stage(item,'targeted',{outcome:'observed'});
    target=null;
    if(!item.id)return null;
    while(pending.size>=maxPending)reject(pending.values().next().value,'pending_limit');
    item.started=now();pending.set(item.id,item);stage(item,'activated',{outcome:'observed'});return item.id;
  }
  function hitTest(interactionId,matched,reason='no_control') {
    const item=pending.get(interactionId);if(!item)return;
    stage(item,'hit_test',{outcome:matched?'matched':'missed',...(matched?{}:{reason})});
    if(!matched)reject(item,reason);
  }
  function acceptedAction(item,before,after) {
    if(!item||guide.problem)return;
    const control=item.control,wasPractice=before.practice;
    const becamePractice=after.mode==='learn'&&!wasPractice;
    let action=null;
    if(control==='primary'&&before.mode==='learn'&&!before.hasPractice&&before.done&&!before.watchOnly&&(after.mode==='finished'||after.step!==before.step))action='confirm';
    else if(wasPractice&&['restart-follow','try-follow','verify'].includes(control)&&before.signature!==after.signature)action='repeat';
    else if(control==='watch-demo'&&wasPractice&&!before.watchOnly&&guide.watchOnly)action='help';
    else if(wasPractice&&['home','move-tutorial'].includes(control)&&before.signature!==after.signature)action='leave';
    else if(wasPractice&&control==='replay'&&!before.watchOnly&&before.paused!==!!guide.gatePaused)action=guide.gatePaused?'pause':'resume';
    else if(['learn-options','settings'].includes(control)&&before.mode==='learn'&&['learn-options','settings'].includes(after.mode))action='pause';
    else if(control==='learn-back'&&before.mode==='learn-options'&&after.mode==='learn')action='resume';
    if(action)emit('guide_action',{...before.context,action});
    if(becamePractice&&['start-follow','placement-ready','clear'].includes(control))emit('guide_action',{...context(),action:'start'});
  }
  function dispatch(interactionId,fn) {
    const item=pending.get(interactionId);
    let before;
    safe(()=>{
      if(!item)return;
      for(const other of pending.values())if(other!==item&&other.dispatched)reject(other,'superseded');
      before={signature:signature(),context:context(),mode:mode(),step:guide.player?.index??-1,
        done:!!guide.followEngine?.done,hasPractice:!!guide.practice,practice:isPractice(),watchOnly:!!guide.watchOnly,paused:!!guide.gatePaused};
      item.baseline=before.signature;item.dispatched=true;stage(item,'dispatched',{outcome:'dispatched'});
    });
    let result;
    try{result=fn();}catch(error){safe(()=>reject(item,'dispatch_error'));throw error;}
    safe(()=>{
      if(!item||!before)return;
      if(guide.problem){reject(item,'guide_rejected');return;}
      acceptedAction(item,before,{signature:signature(),mode:mode(),step:guide.player?.index??-1});
      observe();
    });
    // Promise completion is not save success or evidence that feedback was rendered.
    if(result&&typeof result.then==='function')result.then(()=>safe(()=>observe()),()=>safe(()=>reject(item,'dispatch_error')));
    return result;
  }
  function observe(options={}) {
    if(closed)return;
    if('active'in options)active=!!options.active;
    if('visible'in options)visible=!!options.visible;
    const observationGap=options.freshFrame&&Number.isFinite(lastFrame)?now()-lastFrame:0;
    if(options.freshFrame){lastFrame=now();poseAvailable=options.poseAvailable!==false;}
    expire();
    const currentSignature=signature();
    for(const item of pending.values()) {
      if(item.dispatched&&!item.changed&&currentSignature!==item.baseline) {
        if(guide.problem){reject(item,'guide_rejected');continue;}
        item.changed=true;item.signature=currentSignature;stage(item,'state_changed',{outcome:'changed'});
      } else if(item.changed)item.signature=currentSignature;
    }
    const info=context(),practice=isPractice();
    const choice=guide.player?.step?.guide_hands;
    const requiredLeft=choice==='left'||choice==='both',requiredRight=choice==='right'||choice==='both';
    const fresh=active&&visible&&poseAvailable&&now()-lastFrame<=250;
    const left=fresh&&!!palm(guide.currentHands?.left),right=fresh&&!!palm(guide.currentHands?.right);
    let phase='idle';
    if(practice&&active&&!visible)phase='hidden';
    else if(practice&&active){
      if(mode()!=='learn'||guide.gatePaused||guide.watchOnly)phase='user_paused';
      else if(!fresh)phase='system_wait';
      else if(guide.pending||guide.followEngine?.invalid||guide.followEngine?.state==='reference-gap'||(!requiredLeft&&!requiredRight))phase='system_wait';
      else if(guide.practice?.phase==='preview')phase='demo_preview';
      else if((requiredLeft&&!left)||(requiredRight&&!right))phase='tracking_lost';
      else if(guide.followEngine?.done)phase='checkpoint';
      else if(guide.practice?.phase==='ready')phase='ready';
      else phase='following';
    }
    const data={...info,phase,tracking_left:left,tracking_right:right,required_left:requiredLeft,required_right:requiredRight,
      ...(practice&&observationGap>250?{observation_gap_ms:Math.min(86400000,observationGap)}:{})};
    const key=JSON.stringify(data),time=now();
    const cadenceKey=JSON.stringify({...info,phase:['following','tracking_lost'].includes(phase)?'tracking':phase});
    // Sample rapidly alternating hand status at most 10 Hz; identity, pause,
    // visibility and checkpoint transitions remain immediate. Durations are observations.
    if(key!==lastState&&cadenceKey===lastCadenceKey&&time-lastEmission<100&&!data.observation_gap_ms)return;
    if(key!==lastState||time-lastEmission>=1000){emit('guide_state',data);lastState=key;lastCadenceKey=cadenceKey;lastEmission=time;}
  }
  function drawn(){drawnSignature=signature();}
  function rendered(){
    if(closed||!active||!visible)return;
    expire();
    for(const item of pending.values())if(item.changed&&item.signature===drawnSignature){
      stage(item,'feedback_rendered',{outcome:'ui_acknowledged'});pending.delete(item.id);
    }
  }
  function suspend(reason='session_ended'){
    for(const item of pending.values())reject(item,reason);
    if(target)reject(target,reason,'abandoned');target=null;drawnSignature=null;
    if(reason==='session_ended'){active=false;lastFrame=-Infinity;poseAvailable=false;}
  }
  const api={
    target:(...args)=>safe(()=>targetControl(...args)),activate:(...args)=>safe(()=>activate(...args)),
    hitTest:(...args)=>safe(()=>hitTest(...args)),reject:(interactionId,reason)=>safe(()=>reject(pending.get(interactionId),reason)),
    dispatch,observe:(...args)=>safe(()=>observe(...args)),drawn:()=>safe(drawn),rendered:()=>safe(rendered),
    suspend:(...args)=>safe(()=>suspend(...args)),close:()=>safe(()=>{suspend('session_ended');closed=true;}),
  };
  return api;
}
