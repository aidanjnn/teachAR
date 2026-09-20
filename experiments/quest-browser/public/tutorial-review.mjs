import * as THREE from '/vendor/three.module.js';
import {HandGuide} from '/hand-guide.mjs';
import {newTutorial,prepareStep,parseTutorialJSON,validateTutorial,trimStep,TutorialPlayer,MAX_FILE_BYTES,learningReadiness,authoringReadiness,finishTutorial} from '/tutorial-core.mjs';
import {NarrationPlayback} from '/narration.mjs';

// Entirely generated fixture: never presented as a physical task recording.
export function syntheticTutorial(){
  const tutorial=newTutorial('Synthetic two-hand motion — software test');
  tutorial.source='synthetic-fixture';tutorial.calibration_span_m=.4;
  tutorial.setup='Synthetic motion only, no physical task lesson. Mark an origin and direction for a rendering test.';
  const pose=(x,y,z,side)=>{
    const sign=side==='left'?-1:1,base=[x,y,z];
    const points=[base];
    for(let i=0;i<4;i++)points.push([x-sign*(.025+i*.014),y,z-.015-i*.012]);
    for(let finger=0;finger<4;finger++)for(let j=0;j<5;j++)points.push([x+sign*(finger-1.5)*.018,y,z-.035-j*.020]);
    return points.map(p=>({p,q:[0,0,0,1],radius:.006}));
  };
  for(let step=0;step<2;step++){
    const frames=Array.from({length:91},(_,i)=>{const a=i/90;return {t:i*100/3,left:pose(.06+.12*a,.08+.1*Math.sin(a*Math.PI),-.12-step*.06,'left'),right:pose(.34-.12*a,.08,-.12-step*.06,'right')};});
    tutorial.steps.push(prepareStep(frames,`Synthetic action ${step+1}: inspect both ghosts; this is not a physical task lesson.`));
  }
  return tutorial;
}

export function mountReview(guide,{isActive,tell}){
  const $=id=>document.getElementById(id);
  let selected=0,player=null,renderer=null,scene,camera,ghosts,foldPreview,previous=0,sourceStep=null;
  const status=message=>{$('review-status').textContent=message;};
  const voice=new NarrationPlayback({onError:status});
  const editable=()=>{if(isActive())throw Error('Exit AR before editing, importing or replacing a tutorial.');};
  const report=async fn=>{try{editable();await fn();}catch(e){status(e.message);tell(e.message);}};
  async function replace(data){await guide.replaceTutorial(data);sourceStep=null;renderList();}
  function selectedStep(){return guide.tutorial.steps[selected];}
  function initPreview(){
    if(renderer)return;
    renderer=new THREE.WebGLRenderer({canvas:$('motion-preview'),antialias:true});renderer.setSize(640,400,false);renderer.setClearColor('#122d26');
    scene=new THREE.Scene();camera=new THREE.PerspectiveCamera(55,640/400,.01,20);
    ghosts=['right','left'].map(()=>{const g=new HandGuide({speak:()=>{},verify:()=>{},exit:()=>{}});g.attach(scene);g.enableHologram();return g;});
    foldPreview=new THREE.Line(new THREE.BufferGeometry(),new THREE.LineBasicMaterial({color:0xffd47d}));scene.add(foldPreview);
    scene.add(new THREE.GridHelper(1.2,12,0x6ba797,0x2b5146));
  }
  function select(index){
    selected=index;const step=selectedStep();if(!step)return;
    player=new TutorialPlayer([step]);player.setRate(Number($('preview-speed').value));sourceStep=step;initPreview();
    foldPreview.geometry.dispose();foldPreview.geometry=new THREE.BufferGeometry().setFromPoints((step.cues?.[0]?.points||[]).map(p=>new THREE.Vector3(...p)));foldPreview.visible=!!step.cues?.length;
    const bounds=new THREE.Box3();
    for(const f of step.frames)for(const side of ['left','right'])for(const j of f[side]||[])if(j)bounds.expandByPoint(new THREE.Vector3(...j.p));
    const center=bounds.getCenter(new THREE.Vector3()),size=Math.max(.4,bounds.getSize(new THREE.Vector3()).length());
    camera.position.copy(center).add(new THREE.Vector3(0,size*.8,size*1.2));camera.lookAt(center);
    $('step-title').value=step.title||'';$('step-instruction').value=step.instruction;$('trim-start').value=0;$('trim-end').value=(step.duration_ms/1000).toFixed(3);
    $('narration-summary').textContent=step.narration_issue?`Narration needs repair: ${step.narration_issue}`:step.narration?`Recorded narration: ${(step.narration.duration_ms/1000).toFixed(1)} seconds. Listen with the ghost before approving. Timing is approximate.`:'No recorded narration. This step uses written instructions.';
    $('remove-narration').disabled=!step.narration&&!step.narration_issue;
    $('guide-hands').value=step.guide_hands||'recorded';
    $('reviewed').checked=step.reviewed;$('step-photo').hidden=!step.reference;
    if(step.reference)$('step-photo').src=step.reference.image;else $('step-photo').removeAttribute('src');
    $('scrub').max=step.duration_ms;$('scrub').value=0;
    $('step-quality').textContent=`Left ${Math.round(step.quality.left_tracked_fraction*100)}% tracked (longest gap ${Math.round(step.quality.left_max_gap_ms)} ms); right ${Math.round(step.quality.right_tracked_fraction*100)}% (gap ${Math.round(step.quality.right_max_gap_ms)} ms). Coverage is not accuracy.`;
    $('step-editor').hidden=false;
  }
  function renderList(){
    const tutorial=guide.tutorial,steps=tutorial.steps;
    $('tutorial-provenance').textContent=tutorial.source==='synthetic-fixture'?'SYNTHETIC SOFTWARE FIXTURE — not a person performing a task.':'Recorded tutorial. Software has not verified the physical result.';
    $('tutorial-readiness').textContent=learningReadiness(tutorial).message;
    $('authoring-status').textContent=tutorial.completion?'FINISHED · expert reviewed; physical result unverified':`DRAFT · ${authoringReadiness(tutorial).message}`;
    $('review-save-status').textContent=guide.savedMessage;
    const list=$('step-list');list.replaceChildren();
    steps.forEach((step,i)=>{
      const button=document.createElement('button');button.type='button';button.className='secondary';button.dataset.step=String(i);
      button.textContent=`${i+1}. ${step.title||step.instruction||'Untitled'} · ${(step.duration_ms/1000).toFixed(1)}s · ${step.reviewed?'reviewed':'needs review'}`;
      button.onclick=()=>select(i);list.append(button);
    });
    selected=Math.max(0,Math.min(selected,steps.length-1));
    if(!steps.length){$('step-editor').hidden=true;sourceStep=null;player=null;if(ghosts)ghosts.forEach(g=>g.ghost.visible=false);}
    else if(sourceStep!==steps[selected])select(selected);
    if(document.activeElement!==$('tutorial-title'))$('tutorial-title').value=tutorial.title;
    if(document.activeElement!==$('tutorial-setup'))$('tutorial-setup').value=tutorial.setup;
    document.querySelectorAll('[data-tutorial-edit]').forEach(e=>e.disabled=isActive());
    $('remove-narration').disabled=isActive()||(!selectedStep()?.narration&&!selectedStep()?.narration_issue);
  }
  $('save-tutorial-details').onclick=()=>void report(async()=>{
    const next=structuredClone(guide.tutorial);next.title=$('tutorial-title').value;
    if(next.setup!==$('tutorial-setup').value)next.steps.forEach(s=>s.reviewed=false);
    next.setup=$('tutorial-setup').value;next.revision++;
    await replace(next);status('Starting layout and title saved. Tutorial is a draft until finished again.');
  });
  $('finish-tutorial').onclick=()=>void report(async()=>{
    await replace(finishTutorial(guide.tutorial));status('Tutorial finished and saved. You can export it or start learning in AR.');
  });
  $('import-tutorial').onchange=event=>void report(async()=>{
    const file=event.target.files[0];event.target.value='';if(!file)return;
    if(file.size>MAX_FILE_BYTES)throw Error('Choose a tutorial JSON file no larger than 48 MB.');
    const parsed=parseTutorialJSON(await file.text());
    if(guide.tutorial.steps.length&&!confirm('Open this imported tutorial? Your other saved tutorials remain in the library.'))return;
    await replace(parsed);status('Imported and validated. Re-mark the workspace before AR. Imported motion is not hardware-validated.');
  });
  $('new-tutorial').onclick=()=>void report(async()=>{
    // Previous recordings remain in the local library.
    await replace(newTutorial());$('tutorial-instructions').value='';status('New tutorial ready.');
  });
  $('load-synthetic').onclick=()=>void report(async()=>{
    if(guide.tutorial.steps.length&&!confirm('Replace the current tutorial with a clearly labelled synthetic test fixture?'))return;
    await replace(syntheticTutorial());status('Synthetic sample loaded. Review the steps; this does not test physical tracking.');
  });
  $('save-step-edits').onclick=()=>void report(async()=>{
    const next=structuredClone(guide.tutorial),step=next.steps[selected];if(!step)return;
    step.guide_hands=$('guide-hands').value;step.title=$('step-title').value;step.instruction=$('step-instruction').value;step.reviewed=$('reviewed').checked;
    if(step.narration_issue&&step.reviewed)throw Error('Re-record or remove failed narration before approving this step.');
    next.title=$('tutorial-title').value||'Tabletop practice';next.revision++;
    await replace(validateTutorial(next));status('Instruction and expert review saved. Physical correctness remains unverified.');
  });
  $('guide-hands').onchange=()=>{$('reviewed').checked=false;};
  $('step-instruction').oninput=()=>{$('reviewed').checked=false;};
  $('step-title').oninput=()=>{$('reviewed').checked=false;};
  $('remove-narration').onclick=()=>void report(async()=>{
    if(!confirm('Remove narration and use the written instruction? Review this step again before finishing.'))return;
    const next=structuredClone(guide.tutorial),step=next.steps[selected];step.narration=null;step.narration_issue=null;step.reviewed=false;next.revision++;
    await replace(next);status('Narration removed. Review the written instruction and motion again.');
  });
  $('trim-step').onclick=()=>void report(async()=>{
    const next=structuredClone(guide.tutorial),old=next.steps[selected];if(!old)return;
    next.steps[selected]=trimStep(old,Number($('trim-start').value)*1000,Number($('trim-end').value)*1000);
    next.revision++;await replace(next);status('Trim saved. Review was cleared; shortening the end also clears its result photo.');
  });
  $('delete-step').onclick=()=>void report(async()=>{
    if(!selectedStep()||!confirm(`Delete step ${selected+1}?`))return;
    const next=structuredClone(guide.tutorial);next.steps.splice(selected,1);next.revision++;
    await replace(next);status('Step deleted.');
  });
  for(const [button,delta] of [['move-step-up',-1],['move-step-down',1]])$(button).onclick=()=>void report(async()=>{
    const next=structuredClone(guide.tutorial),destination=selected+delta;if(destination<0||destination>=next.steps.length)return;
    [next.steps[selected],next.steps[destination]]=[next.steps[destination],next.steps[selected]];
    next.steps.forEach(s=>s.reviewed=false);next.revision++;selected=destination;await replace(next);status('Step order changed. Review all steps in their new order.');
  });
  $('preview-play').onclick=()=>{voice.unlock();if(player)player.paused=!player.paused;};
  $('preview-replay').onclick=()=>{voice.unlock();player?.replay();};
  $('preview-sound').onclick=()=>voice.unlock();
  $('preview-voice').onchange=()=>{voice.enabled=$('preview-voice').checked;if(voice.enabled)voice.unlock();else voice.stop();};
  $('preview-speed').onchange=()=>player?.setRate(Number($('preview-speed').value));
  $('scrub').oninput=()=>{if(player){player.time=Number($('scrub').value);player.paused=true;}};
  $('download-tutorial').onclick=()=>{
    try{const data=validateTutorial(guide.tutorial),text=JSON.stringify(data);
      if(new TextEncoder().encode(text).byteLength>MAX_FILE_BYTES)throw Error('Tutorial exceeds the download size limit.');
      const url=URL.createObjectURL(new Blob([text],{type:'application/json'})),a=document.createElement('a');
      a.href=url;a.download='trail-tutorial.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
    }catch(e){status(e.message);}
  };
  $('download-diagnostics').onclick=()=>{
    const url=URL.createObjectURL(new Blob([JSON.stringify(guide.exportDiagnostics(),null,2)],{type:'application/json'})),a=document.createElement('a');
    a.href=url;a.download='trail-tutorial-diagnostics.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  };
  let wasActive=false;
  function animate(time){
    const active=isActive();if(active!==wasActive){wasActive=active;if(!active)sourceStep=null;renderList();}
    if(!document.hidden&&!active&&player&&renderer){
      const frame=player.tick(previous?time-previous:0);ghosts[0].drawHand(frame?.right,0x8debd4);ghosts[1].drawHand(frame?.left,0x92bfff);
      renderer.render(scene,camera);$('scrub').value=player.time;$('preview-play').textContent=player.paused?'Resume':'Pause';
      $('playback-time').textContent=`${(player.time/1000).toFixed(1)} / ${(player.step.duration_ms/1000).toFixed(1)} seconds`;
    }
    voice.sync(player,!document.hidden&&!active);
    previous=time;requestAnimationFrame(animate);
  }
  guide.onChange=renderList;renderList();requestAnimationFrame(animate);
  document.addEventListener('visibilitychange',()=>{if(document.hidden){voice.stop();if(player)player.paused=true;}});
  return {refresh:renderList};
}
