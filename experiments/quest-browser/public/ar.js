import * as THREE from '/vendor/three.module.js';
import {feedback, SwapTrial, BUTTONS, hitButton} from '/ar-state.mjs';
import {HandGuide, handButton} from '/hand-guide.mjs';
import {TutorialGuide,tutorialButton} from '/tutorial-guide.mjs';
import {mountTutorialShell} from '/tutorial-shell.mjs';
import {mountReview} from '/tutorial-review.mjs';
import {nextVideoSnapshot} from '/camera-snapshot.mjs';
import {SpatialControls} from '/spatial-controls.mjs';
import {CaptureSetup} from '/experience-entry.mjs';
import {FeedbackAudio} from '/tutorial-feedback.mjs';
import {NarrationRecorder,NarrationPlayback} from '/narration.mjs';
const tutorialMode=location.pathname==='/tutorial';
const handsMode=tutorialMode||location.pathname==='/hands';
const feedbackAudio=new FeedbackAudio();
const narrator=tutorialMode?new NarrationRecorder({onStatus:message=>{document.getElementById('microphone-status').textContent=message;}}):null;
const narrationPlayer=tutorialMode?new NarrationPlayback({onError:message=>tell(message)}):null;
const guide=handsMode?new (tutorialMode?TutorialGuide:HandGuide)({speak,verify:()=>action('check'),exit:()=>closeAR(),snapshot:tutorialSnapshot,media:tutorialMode?{enable:()=>captureSetup.enable(),cancel:()=>captureSetup.cancel()}:null,narrator,audioPlayer:narrationPlayer,onFeedback:event=>{feedbackAudio.enabled=guide.appearance.sound;if(!narrator?.take||event.kind==='saved')feedbackAudio.play(event);}}):null;

const $=id=>document.getElementById(id);
const hud=$('hud-preview'), ctx=hud.getContext('2d');
const capture=document.createElement('canvas'), captureCtx=capture.getContext('2d');
let stream=null, cameraGeneration=0, uploading=false, lastVideo=-1, lastUpload=-Infinity;
let status=null, statusAt=-Infinity, polling=false, busy=false, pendingCheck=0;
let session=null, renderer=null, scene, camera, head, panel, texture, rayLines=[],panelNeedsPlace=true,panelSide=false;
let spatial=null,libraryInput=null,animatedMode=null,modeEntered=0;
let xrSupported=false, trial=null, trialRunning=false, lastSpeech='', lastDraw='', hover='';
let notice='', noticeUntil=0, referenceImage=null, referenceRevision=null, boxes=[], firstCorner=null;
let frameTime=0, networkTime=0, remoteFrameId=0, handHudTime=-Infinity;
const captureSetup=tutorialMode?new CaptureSetup({camera:()=>stream?.getVideoTracks().some(t=>t.readyState==='live')?Promise.resolve():startCamera(true),microphone:()=>narrator.ready?Promise.resolve():narrator.enable(),stopCamera,stopMicrophone:()=>narrator.disable()}):null;
const raycaster=new THREE.Raycaster(), direction=new THREE.Vector3(0,0,-1);

async function tutorialSnapshot() {
  const video=$('video'),generation=cameraGeneration,activeSession=session;
  return nextVideoSnapshot({video,valid:()=>visible()&&!!stream&&generation===cameraGeneration&&session===activeSession,
    draw:()=>{
      const canvas=document.createElement('canvas'),scale=Math.min(1,640/video.videoWidth,640/video.videoHeight);
      canvas.width=Math.round(video.videoWidth*scale);canvas.height=Math.round(video.videoHeight*scale);
      canvas.getContext('2d').drawImage(video,0,0,canvas.width,canvas.height);
      return {image:canvas.toDataURL('image/jpeg',.8),captured_at:new Date().toISOString(),source:'local-camera',verification:'reference only; not checked'};
    }});
}

function visible() { return session ? session.visibilityState==='visible' : !document.hidden; }
function tell(message) { notice=message; noticeUntil=performance.now()+6500; $('notice').textContent=message; }
function speak(message) {
  if (!$('speech').checked || !('speechSynthesis' in window) || !visible()) return;
  speechSynthesis.cancel(); const utterance=new SpeechSynthesisUtterance(message);
  utterance.rate=1; speechSynthesis.speak(utterance);
}
async function api(path, body, timeout=5000) {
  const response=await fetch(path,{method:body===undefined?'GET':'POST',
    headers:body===undefined?{}:{'Content-Type':'application/json','X-Tester-Token':status?.token||''},
    body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(timeout)});
  const data=await response.json(); if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
  return data;
}
function pauseOnLeave() {
  pendingCheck=0; trialRunning=false;
  if (status?.token) fetch('/api/ai/auto',{method:'POST',keepalive:true,
    headers:{'Content-Type':'application/json','X-Tester-Token':status.token},body:'{"enabled":false}'}).catch(()=>{});
  if (status?.automatic) status.automatic.enabled=false;
  window.speechSynthesis?.cancel();
}
function stopCamera() {
  cameraGeneration++; stream?.getTracks().forEach(t=>t.stop()); stream=null;
  $('video').srcObject=null; lastUpload=-Infinity; lastVideo=-1;
  $('camera-status').textContent='Camera stopped. Enable camera to resume.';
}
async function startCamera(propagate=false) {
  if (session&&!tutorialMode) return;
  pauseOnLeave(); stopCamera(); const generation=cameraGeneration;
  $('camera-start').disabled=true;
  try {
    if (!navigator.mediaDevices || !isSecureContext) throw new Error('Open the localhost address on Quest through the USB connection.');
    if(!tutorialMode)await poll();
    const kind=/oculusbrowser|quest/i.test(navigator.userAgent)?'quest':'laptop';
    // Never silently delete a saved Quest reference by switching to a laptop.
    if (!tutorialMode && status?.capture?.source!==kind) throw new Error(`This checker expects ${status?.capture?.source || 'Quest'}. Open this page on that device; change source in laptop diagnostics only if intentional.`);
    const deviceId=$('devices').value;
    const acquired=await navigator.mediaDevices.getUserMedia({audio:false,video:{width:{ideal:1280},height:{ideal:960},frameRate:{ideal:15},
      ...(deviceId?{deviceId:{exact:deviceId}}:{facingMode:{ideal:'environment'}})}});
    if (generation!==cameraGeneration) {acquired.getTracks().forEach(t=>t.stop()); return;}
    stream=acquired; $('video').srcObject=stream; await $('video').play();
    const active=stream.getVideoTracks()[0].getSettings().deviceId;
    const devices=(await navigator.mediaDevices.enumerateDevices()).filter(d=>d.kind==='videoinput');
    $('devices').replaceChildren(...devices.map((d,i)=>{const option=document.createElement('option'); option.value=d.deviceId;
      option.textContent=d.label||`Camera ${i+1}`;option.selected=d.deviceId===active;return option;}));
    tell(tutorialMode?'Reference photos ready.':'Camera started. Confirm the preview shows the table, then enter AR.');
    await pump(); await poll();
  } catch(e) { stopCamera(); tell(e.message);if(propagate===true)throw e; }
  finally { $('camera-start').disabled=false; }
}
async function pump() {
  if (!stream || uploading || !visible()) return;
  const video=$('video'), generation=cameraGeneration;
  if (video.readyState<2 || !video.videoWidth || video.currentTime===lastVideo) return;
  uploading=true; lastVideo=video.currentTime;
  try {
    const scale=Math.min(1,960/video.videoWidth,960/video.videoHeight);
    capture.width=Math.round(video.videoWidth*scale); capture.height=Math.round(video.videoHeight*scale);
    captureCtx.drawImage(video,0,0,capture.width,capture.height);
    if(tutorialMode){lastUpload=performance.now();$('camera-status').textContent='Camera ready for local step photos. No frames uploaded.';return;}
    const result=await api('/api/frame',{image:capture.toDataURL('image/jpeg',.82).split(',')[1],source:'camera'});
    if (generation===cameraGeneration) {
      lastUpload=performance.now(); remoteFrameId=result.frame_id;
      $('camera-status').textContent=`Camera connected · frame ${result.frame_id} · ${stream.getVideoTracks()[0].label}`;
    }
  } catch(e) { $('camera-status').textContent=`Upload failed: ${e.message}`; }
  finally { uploading=false; }
}
async function poll() {
  if (polling) return;
  polling=true;
  try {
    const started=performance.now(); const next=await api('/api/ai/status');
    // Include status transport time, and avoid headset/laptop wall-clock skew.
    if (next.latest) next.latest.age_ms+=performance.now()-started;
    if (next.capture?.age_ms!=null) next.capture.age_ms+=performance.now()-started;
    status=next; statusAt=performance.now();
    if (trial && trial.revision!==status.capture.revision) {
      trial=null;trialRunning=false;pendingCheck=0;tell('Reference changed. Restart the test with the new reference.');
    }
    $('readiness').textContent=!status.capture?.has_reference?'Reference missing: open Reference setup below.':
      performance.now()-lastUpload>3000?'Reference saved. Start this page’s camera.':
      !status.enabled?'Camera ready; AI unavailable or allowance exhausted. Check laptop diagnostics.':'Ready. Your saved reference will be reused.';
    if(handsMode)$('readiness').textContent=status.capture?.has_reference?'Saved image reference available. Hand guidance works with or without the camera.':'Hand guidance is ready without a reference. Set up images only if you want final placement verification.';
    if(tutorialMode)$('readiness').textContent='Tutorial mode: both hands, local step photos, manual learner confirmation. No paid checks.';
    $('budget').textContent=`${status.calls||0}/${status.max_calls||100} paid attempts · $${(status.reserved_usd||0).toFixed(2)} of $${(status.budget_usd||2).toFixed(2)} allowance reserved. Exiting AR pauses checks.`;
  } catch(e) { tell(`Server connection: ${e.message}`); }
  finally { polling=false; update(); }
}
function beginTrial() {
  trial=new SwapTrial(status.capture.revision, Math.max(status.capture.frame_id, remoteFrameId));
  trialRunning=true; lastSpeech='';
}
async function setAuto(enabled) {
  pendingCheck=0;
  await api('/api/ai/auto',{enabled});
  if (status) status.automatic.enabled=enabled;
  if (enabled && (!trial || trial.phase===3)) beginTrial();
  trialRunning=enabled;
  await poll();
}
async function closeAR() {
  pauseOnLeave(); await session?.end(); tell(tutorialMode?'AR closed. Your saved tutorials remain in the library.':'AR closed. Paid checks paused.');
}
async function action(id) {
  if(tutorialMode){void feedbackAudio.unlock();if(['create','library','settings','home'].includes(id))feedbackAudio.play({kind:'open'});}

  if (id==='exit') {
    if(tutorialMode){guide.action(id);update();}else await closeAR();
    return;
  }
  if(handsMode && id!=='check'){if(id!=='verify')pendingCheck=0;guide.action(id);update();return;}
  if (busy || !status || performance.now()-statusAt>4000) return;
  busy=true;
  try {
    if (id==='auto') {
      const enabled=!status.automatic.enabled;
      await setAuto(enabled); tell(enabled?'Automatic checks on. Look at the table.':'Paid checks paused.');
    } else if (id==='check') {
      if (!status.enabled || !status.ready || performance.now()-lastUpload>3000) throw new Error('Need the live camera, saved reference, and available AI allowance.');
      if (status.busy || status.automatic.busy || status.cooldown_seconds>0) throw new Error('A check is running or cooling down. Wait for the countdown.');
      // Pause periodic checks while the user clears their hands for this shot.
      await setAuto(false); if (!handsMode) {if (!trial) beginTrial(); trialRunning=true;}
      pendingCheck=performance.now()+3000; tell('Check in 3 seconds. Look at the table and clear your hands.');
      speak('Checking in three seconds. Clear your hands.');
    }
  } catch(e) {tell(e.message);} finally {busy=false;update();}
}
async function doManualCheck() {
  pendingCheck=0; busy=true; const attempt=guide?.attempt;
  try {
    if (!visible() || performance.now()-lastUpload>3000) throw new Error('Camera paused. No check sent.');
    const answer=await api('/api/ai/check',{},25000); guide?.acceptVerification(answer,attempt); await poll();
  } catch(e) {tell(e.message);} finally {busy=false;update();}
}
function wrap(text,x,y,width,lineHeight,font,maxLines=3) {
  ctx.font=font; const words=String(text||'').split(/\s+/); let line='', row=0;
  for (let index=0;index<words.length;index++) {
    const word=words[index];
    if (ctx.measureText(line+word).width>width && line) {
      ctx.fillText(line.trim(),x,y+row*lineHeight); line='';row++;
      if (row===maxLines-1) { // Remaining text is still available in the page/voice.
        const remaining=words.slice(index).join(' ');
        if (ctx.measureText(remaining).width>width) {
          let tail=remaining;while(ctx.measureText(tail+'…').width>width)tail=tail.slice(0,-1);
          ctx.fillText(tail+'…',x,y+row*lineHeight);return;
        }
      }
    }
    line+=word+' ';
  }
  if(row<maxLines)ctx.fillText(line.trim(),x,y+row*lineHeight);
}
function update() {
  const now=performance.now();
  if(handsMode){
    $('enter').disabled=!!session||!xrSupported||busy||(tutorialMode&&guide.loading);
    $('enter').textContent=tutorialMode?'Enter the experience':xrSupported?'Enter hand guidance · free':'Immersive AR unavailable in this browser';
    if(now-handHudTime<50)return;handHudTime=now;
    const network=now<noticeUntil?notice:pendingCheck?'Image check in '+Math.ceil((pendingCheck-now)/1000)+'s':busy?'Image check running…':`Motion guidance: no API calls · camera ${now-lastUpload<3000?'connected':'off'} · image checks ${status?.calls||0}/${status?.max_calls||100}`;
    if(tutorialMode){const event=guide.feedback.visible(now),toast=$('feedback-toast');toast.hidden=!event;if(event){toast.textContent=event.text;toast.dataset.kind=event.kind;}}
    hud.setAttribute('aria-label',guide.draw(ctx,now,hover,network));if(texture)texture.needsUpdate=true;
    return;
  }
  const result=feedback(status,now-statusAt,now-lastUpload);
  const live=now-statusAt<=4000 && now-lastUpload<=3000;
  $('enter').disabled=!!session || !xrSupported || !live || !status?.ready || !status?.enabled || busy;
  if (!session && !xrSupported) $('enter').textContent='Immersive AR unavailable in this browser';
  else $('enter').textContent='Enter AR · start paid checks every 10s';
  if (trialRunning && trial?.observe(status,result)) {
    $('trial').textContent=trial.instruction;
    speak(trial.instruction);
    if (trial.phase===3) {trialRunning=false; void setAuto(false).catch(e=>tell(e.message)); tell('Matched → swapped → restored observed. Paid checks paused.');}
  }
  const signature=result.verdict+result.message;
  if (trialRunning && result.usable && signature!==lastSpeech) {lastSpeech=signature; speak(`${result.title}. ${result.message} ${trial?.instruction||''}`);}
  const a=status?.automatic;
  const schedule=pendingCheck?`CHECK IN ${Math.max(0,Math.ceil((pendingCheck-now)/1000))}s`:busy||a?.busy||status?.busy?'CHECKING…':
    a?.enabled?`NEXT CHECK ${a.countdown_seconds ?? '?'}s`:'PAID CHECKS PAUSED';
  const instructions=trial?.instruction||'Start correct → swap fox / square → restore.';
  const message=result.message;
  hud.setAttribute('aria-label',`${result.title}. ${message} ${instructions}`);
  const footer=now<noticeUntil?notice:`Point + trigger / pinch · ${status?.calls||0}/${status?.max_calls||100} paid attempts`;
  const drawKey=JSON.stringify([result.title,result.verdict,result.ageSeconds,message,schedule,instructions,hover,status?.calls,a?.enabled,footer]);
  if (drawKey===lastDraw) return; lastDraw=drawKey;
  ctx.clearRect(0,0,1080,560);ctx.fillStyle='#10231f';ctx.fillRect(0,0,1080,560);
  const accent={pass:'#9cf0ca',fail:'#ff9e95',unknown:'#ffe094'}[result.verdict];
  ctx.fillStyle=accent;ctx.fillRect(0,0,14,560);
  ctx.font='600 24px system-ui';ctx.fillStyle='#b3ccc5';ctx.fillText('TRAIL · '+schedule,36,45);
  ctx.font='700 50px system-ui';ctx.fillStyle=accent;ctx.fillText(result.title,36,114);
  ctx.fillStyle='#f4fff9';wrap(message,36,166,1000,38,'29px system-ui',3);
  ctx.fillStyle='#b3ccc5';ctx.font='22px system-ui';
  ctx.fillText(result.ageSeconds==null?'Show all three toys and labels.':`Snapshot ${result.ageSeconds}s old · AI feedback is delayed`,36,298);
  ctx.fillStyle='#f4fff9';wrap(instructions,36,347,1000,30,'600 26px system-ui',2);
  for (const b of BUTTONS) {
    ctx.fillStyle=hover===b.id?'#85ddbf':'#294d43';ctx.fillRect(b.x,b.y,b.w,b.h);
    ctx.fillStyle=hover===b.id?'#10231f':'#f4fff9';ctx.font='600 29px system-ui';ctx.textAlign='center';
    ctx.fillText(({check:pendingCheck?'Get ready…':'Check in 3s',auto:a?.enabled?'Pause checks':'Resume checks',exit:'Exit AR'})[b.id],b.x+b.w/2,b.y+54);
  }
  ctx.textAlign='left';ctx.fillStyle='#b3ccc5';ctx.font='19px system-ui';
  wrap(footer,36,537,1000,24,'19px system-ui',1);
  if (texture) texture.needsUpdate=true;
}
function initRenderer() {
  if(renderer)return;
  renderer=new THREE.WebGLRenderer({alpha:true,antialias:true}); renderer.setClearColor(0x000000,0);
  renderer.setSize(16,16); renderer.domElement.className='xr-canvas';document.body.append(renderer.domElement);
  renderer.xr.enabled=true;renderer.xr.setReferenceSpaceType('local');
  scene=new THREE.Scene();camera=new THREE.PerspectiveCamera();head=new THREE.Group();scene.add(head);guide?.attach(scene);
  texture=new THREE.CanvasTexture(hud);texture.colorSpace=THREE.SRGBColorSpace;
  panel=new THREE.Mesh(new THREE.PlaneGeometry(tutorialMode?1.08:1.35,tutorialMode?.56:.70),new THREE.MeshBasicMaterial({map:texture,transparent:true,depthTest:false,depthWrite:false,toneMapped:false}));
  panel.position.set(0,.34,-1.4);panel.renderOrder=10;if(tutorialMode){scene.add(panel);spatial=new SpatialControls(scene,panel,guide);guide.onLibrarySearch=()=>{if(libraryInput){libraryInput.value=guide.libraryQuery||'';libraryInput.focus();}if(!session?.isSystemKeyboardSupported){guide.problem='Use a connected keyboard to search, or browse the cards and filters.';}};guide.onRepositionPanel=()=>{panelSide=!panelSide;panelNeedsPlace=true;};}else head.add(panel);
  for(let i=0;i<2;i++) {
    const line=new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(),new THREE.Vector3(0,0,-2)]),
      new THREE.LineBasicMaterial({color:0xffffff,transparent:true,opacity:.8,depthTest:false}));
    line.visible=false;line.renderOrder=11;scene.add(line);rayLines.push(line);
  }
  renderer.setAnimationLoop((time,frame)=>{
    if(!frame || !session)return;
    const reference=renderer.xr.getReferenceSpace(), pose=frame.getViewerPose(reference);
    if(!pose||session.visibilityState!=='visible'){spatial?.cancel();guide?.hide();return;}
    if(tutorialMode&&panelNeedsPlace){
      const q=new THREE.Quaternion().copy(pose.transform.orientation),forward=new THREE.Vector3(0,0,-1).applyQuaternion(q);forward.y=0;if(forward.lengthSq()<.01)forward.set(0,0,-1);forward.normalize();
      const right=new THREE.Vector3().crossVectors(forward,new THREE.Vector3(0,1,0));
      panel.position.copy(pose.transform.position).addScaledVector(forward,1.1).addScaledVector(right,panelSide?.38:-.38);panel.position.y=pose.transform.position.y-.08;
      panel.lookAt(new THREE.Vector3(pose.transform.position.x,panel.position.y,pose.transform.position.z));panelNeedsPlace=false;panel.updateMatrixWorld(true);
    }
    head.position.copy(pose.transform.position);head.quaternion.copy(pose.transform.orientation);head.updateMatrixWorld(true);
    hover='';rayLines.forEach(l=>l.visible=false);
    let i=0;
    for(const source of session.inputSources) {
      const target=frame.getPose(source.targetRaySpace,reference);if(!target)continue;
      spatial?.move(source,target);const hit=hitFromPose(target); if(hit)hover=hit;
      const line=rayLines[i++];if(line){line.visible=true;line.position.copy(target.transform.position);line.quaternion.copy(target.transform.orientation);}
    }
    if(spatial?.drag&&!Array.from(session.inputSources).includes(spatial.drag.source))spatial.cancel();
    guide?.tick(frame,session,reference,time);
    if(tutorialMode){
      spatial.tick(time,pose);
      if(animatedMode!==guide.mode){animatedMode=guide.mode;modeEntered=time;}
      const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
      const t=Math.min(1,(time-modeEntered)/220),scale=reduced?1:.975+.025*(1-(1-t)**3);panel.scale.setScalar(scale);
    }
    update();renderer.render(scene,camera);
    // XR drives networking too, so this does not depend on background DOM RAF.
    service(time);
  });
}
function hitFromPose(pose) {
  const origin=new THREE.Vector3().copy(pose.transform.position);
  const rotation=new THREE.Quaternion().copy(pose.transform.orientation);
  raycaster.set(origin,direction.clone().applyQuaternion(rotation));
  const hit=raycaster.intersectObject(panel)[0];return hit?.uv?(tutorialMode?((u,v)=>tutorialButton(u,v,guide.uiButtons)):handsMode?handButton:hitButton)(hit.uv.x,hit.uv.y):null;
}
async function enterAR() {
  if (session || busy) return;
  try {
    initRenderer();
    narrationPlayer?.unlock();void feedbackAudio.unlock();
    // Must happen directly inside the click, before awaiting unrelated work.
    const requested=navigator.xr.requestSession('immersive-ar',handsMode?{requiredFeatures:['hand-tracking']}:{optionalFeatures:['hand-tracking']});
    busy=true;speak(tutorialMode?'Welcome to Trail. Choose Create or Follow.':'Starting the headset test. Look at the toys and labels.');
    const active=await requested; session=active;
    active.addEventListener('end',()=>{libraryInput?.remove();libraryInput=null;spatial?.reset();session=null;captureSetup?.cancel();guide?.endSession();pauseOnLeave();hover='';tell(tutorialMode?'AR closed. Your saved tutorials remain in the library.':'AR closed. Paid checks paused.');update();});
    active.addEventListener('visibilitychange',()=>{if(active.visibilityState!=='visible'){spatial?.cancel();pauseOnLeave();guide?.hide();}});
    if(tutorialMode){
      libraryInput=document.createElement('input');libraryInput.type='search';libraryInput.maxLength=80;libraryInput.setAttribute('aria-label','Search tutorials in AR');libraryInput.style.cssText='position:fixed;left:0;top:0;width:1px;height:1px;opacity:0;';document.body.append(libraryInput);
      libraryInput.oninput=()=>{guide.libraryQuery=libraryInput.value.slice(0,80);guide.libraryIndex=0;};
      active.addEventListener('selectstart',event=>{if(active.visibilityState!=='visible')return;const pose=event.frame.getPose(event.inputSource.targetRaySpace,renderer.xr.getReferenceSpace());if(pose)spatial.start(event.inputSource,pose);});
      active.addEventListener('selectend',event=>spatial.end(event.inputSource));
    }
    active.addEventListener('select',event=>{
      if(spatial?.suppressed.has(event.inputSource))return;
      if(session!==active || active.visibilityState!=='visible')return;
      const pose=event.frame.getPose(event.inputSource.targetRaySpace,renderer.xr.getReferenceSpace());
      const hit=pose && hitFromPose(pose); if(hit)void action(hit);
    });
    await renderer.xr.setSession(active);
    if(handsMode){
      if(tutorialMode){
        const title=$('tutorial-title').value.slice(0,120)||'Untitled tutorial',setup=$('tutorial-setup').value.slice(0,2000);
        if(title!==guide.tutorial.title||setup!==guide.tutorial.setup){if(setup!==guide.tutorial.setup)guide.tutorial.steps.forEach(s=>{s.reviewed=false;s.acceptance=null;});guide.tutorial.title=title;guide.tutorial.setup=setup;guide.changed();}
        guide.cleanSave=!!guide.tutorial.save_position;guide.alignmentEnabled=$('palm-zones').checked;
        guide.instructions=$('tutorial-instructions').value.split('\n').map(s=>s.trim());
      }
      panelNeedsPlace=true;guide.begin(tutorialMode?'home':undefined);if(tutorialMode)guide.nextEntry=null;
      renderer.xr.getReferenceSpace().addEventListener('reset',()=>{panelNeedsPlace=true;guide.reset();tell('XR origin changed. Mark the workspace again.');speak('Tracking origin changed. Mark the workspace again.');});
      await setAuto(false).catch(()=>tell('Server unavailable. Local hand guidance still works.'));
      return;
    }
    await $('video').play();
    const deadline=performance.now()+6000;
    while (performance.now()-lastUpload>1500 && session===active && performance.now()<deadline) {
      await pump();
      await new Promise(resolve=>setTimeout(resolve,100));
    }
    if (session!==active) return;
    if (performance.now()-lastUpload>1500) throw new Error('Camera stopped during immersive entry. No paid checks started.');
    await poll();
    // Exclude checks captured before this test started.
    beginTrial(); await setAuto(true);
    tell('Look at the table. Checks run automatically. Follow the spoken instructions.');
  } catch(e) {
    pauseOnLeave();if(session)await session.end().catch(()=>{});
    tell(`Could not start AR: ${e.message}. Use the feedback preview below or retry Enter AR.`);
  } finally {busy=false;update();}
}
function service(time) {
  if(!visible())return;
  if(time-frameTime>600){frameTime=time;void pump();}
  if(time-networkTime>1000){networkTime=time;void poll();}
  if(pendingCheck && performance.now()>=pendingCheck && !busy)void doManualCheck();
}
function drawReference() {
  if(!referenceImage)return;
  const canvas=$('reference'), c=canvas.getContext('2d');c.drawImage(referenceImage,0,0,canvas.width,canvas.height);
  boxes.forEach((b,i)=>{c.strokeStyle=['#8fe7cd','#ffd28a','#c9b2ff'][i];c.lineWidth=4;c.strokeRect(...b);c.font='24px system-ui';c.fillStyle=c.strokeStyle;c.fillText(['goose','fox','square'][i],b[0],Math.max(26,b[1]-8));});
  $('mark-help').textContent=boxes.length===3?'Ready: save the three boxes.':`Mark ${['goose','fox','square'][boxes.length]}: ${firstCorner?'second':'first'} corner.`;
  $('save-boxes').disabled=boxes.length!==3;
}
$('save-reference').onclick=async()=>{
  try {
    await setAuto(false);await api('/api/reference',{});
    const state=await api('/api/state');referenceRevision=state.revision;boxes=[];firstCorner=null;
    referenceImage=new Image(); referenceImage.src='/api/reference.jpg?t='+Date.now();await referenceImage.decode();
    $('reference').width=referenceImage.width;$('reference').height=referenceImage.height;drawReference();await poll();
  } catch(e){tell(e.message);}
};
$('reference').onclick=event=>{
  if(!referenceImage || boxes.length===3)return;
  const canvas=$('reference'),r=canvas.getBoundingClientRect();const p=[(event.clientX-r.left)*canvas.width/r.width,(event.clientY-r.top)*canvas.height/r.height];
  if(!firstCorner)firstCorner=p;
  else {boxes.push([Math.round(Math.min(p[0],firstCorner[0])),Math.round(Math.min(p[1],firstCorner[1])),Math.round(Math.abs(p[0]-firstCorner[0])),Math.round(Math.abs(p[1]-firstCorner[1]))]);firstCorner=null;}
  drawReference();
};
$('undo').onclick=()=>{firstCorner=null;boxes.pop();drawReference();};
$('save-boxes').onclick=async()=>{try{await api('/api/boxes',{boxes,revision:referenceRevision});trial=null;await poll();tell('Reference ready. Enter AR to test.');}catch(e){tell(e.message);}};
$('camera-start').onclick=()=>startCamera();$('devices').onchange=startCamera;$('enter').onclick=enterAR;
$('stop').onclick=async()=>{pauseOnLeave();stopCamera();narrator?.disable();narrationPlayer?.stop();await session?.end();};
if(tutorialMode){
  document.addEventListener('pointerdown',()=>{feedbackAudio.enabled=guide.appearance.sound;void feedbackAudio.unlock();},{passive:true});
  $('microphone-enable').onclick=async()=>{try{await narrator.enable();narrationPlayer.unlock();}catch(e){tell(e.message);}};
  $('microphone-disable').onclick=()=>narrator.disable();
  $('narration-playback').onchange=()=>{narrationPlayer.enabled=$('narration-playback').checked;if(!narrationPlayer.enabled)narrationPlayer.stop();else narrationPlayer.unlock();};
}
$('speech').onchange=()=>{if(!$('speech').checked)window.speechSynthesis?.cancel();else speak('Spoken corrections enabled.');};
hud.onclick=event=>{if(tutorialMode&&!session){tell('This is a preview. Enter AR on Quest to use these controls.');return;}const r=hud.getBoundingClientRect();const id=(tutorialMode?((u,v)=>tutorialButton(u,v,guide.uiButtons)):handsMode?handButton:hitButton)((event.clientX-r.left)/r.width,1-(event.clientY-r.top)/r.height);if(id)void action(id);};
document.addEventListener('visibilitychange',()=>{if(!visible()){pauseOnLeave();guide?.hide();if(!session)stopCamera();}});
window.addEventListener('pagehide',()=>{feedbackAudio.close();pauseOnLeave();stopCamera();narrator?.disable();narrationPlayer?.stop();});
window.addEventListener('beforeunload',event=>{if(tutorialMode&&(guide.hasUnfinishedTake()||guide.segmentJobs.size||['saving','saving-tutorial'].includes(guide.mode)||['saving','failed'].includes(guide.saveStatus))){event.preventDefault();event.returnValue='';}});
// A separate timer keeps the non-immersive setup and fallback usable.
setInterval(()=>{service(performance.now());update();},200);
try {xrSupported=!!navigator.xr && await navigator.xr.isSessionSupported('immersive-ar');}
catch {xrSupported=false;}
tell(xrSupported?(tutorialMode?'Enter the experience to create or follow a tutorial.':handsMode?'Ready. Put down controllers and choose Enter hand guidance. Camera is optional.':'Quest AR is available. Enable camera to begin.'):'Open this page on Quest for immersive AR. Desktop preview remains available.');
if(tutorialMode){await guide.restore();$('tutorial-title').value=guide.tutorial.title;$('tutorial-instructions').value=guide.tutorial.steps.map(s=>s.instruction).join('\n');}
if(tutorialMode){mountReview(guide,{isActive:()=>!!session,tell});mountTutorialShell(guide,{isActive:()=>!!session,tell});}
await poll();update();

if(handsMode){
  $('export-motion').onclick=()=>{const data=guide.exportData();if(!data){tell('Record a movement first.');return;}const a=document.createElement('a');const url=URL.createObjectURL(new Blob([JSON.stringify(data)],{type:'application/json'}));a.href=url;a.download=tutorialMode?'trail-tutorial.json':'trail-hand-recording.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
}
