import {THEMES,drawIcon} from './tutorial-design.mjs';
// Contextual headset UI. Hit boxes come from the same view model as the visible controls.
export function tutorialView(g){
 const v={tag:'TRAIL',mode:g.mode,title:'Your workspace',text:'',detail:'',buttons:[],compact:['capture','capture-paused','learn'].includes(g.mode)&&!g.problem&&!g.pending};
 const b=(id,label)=>v.buttons.push({id,label});
 switch(g.mode){
 case 'home':v.title='Your workspace';v.text='Teach a skill. Learn from a recording.';b('create','Create tutorial');b('library','Follow tutorial');if(g.tutorial.steps.length)b('edit-current','Continue current draft');break;
 case 'settings':v.tag='PREFERENCES';v.title='Make room for the task';v.text='Move the panel to either side. Your workspace and recording keep their original placement.';b('theme',`Appearance: ${g.appearance?.theme==='light'?'Warm gray':'Charcoal'}`);b('sound',`Event sounds: ${g.appearance?.sound?'On':'Off'}`);b('panel-place','Move panel');b('settings-back','Back');break;
 case 'trim':v.tag='CREATE · TRIM';v.title='Keep the useful movement';v.text=`Start ${(g.trimRange?.[0]/1000).toFixed(2)}s · End ${(g.trimRange?.[1]/1000).toFixed(2)}s`;v.detail='Adjust in quarter seconds. Applying a trim requires review again.';b('trim-start-less','Start −0.25s');b('trim-start-more','Start +0.25s');b('trim-end-less','End −0.25s');b('trim-end-more','End +0.25s');b('trim-apply','Apply & review');b('trim-cancel','Cancel');break;
 case 'loading-library':v.title='Opening your library…';break;
 case 'library':{
  const t=g.library?.[g.libraryIndex];v.tag='FOLLOW · LIBRARY';v.title=t?.title||'No tutorials yet';v.text=t?`${t.steps.length} recordings · ${t.completion?'ready to follow':'draft — review first'}`:'Create your first tutorial. Saved recordings stay on this headset.';
  if(t){b('open-tutorial',t.completion?'Open tutorial':'Review draft');if(g.library.length>1){b('library-prev','Previous tutorial');b('library-next','Next tutorial');}}
  b('home','Back home');break;}
 case 'save-home':v.tag='CREATE · SAVE POSITION';v.title='Where will you return to save?';v.text='Choose a comfortable, visible spot for both hands, away from the task. Set it once; every recording uses this same save zone.';v.detail='After each action: hold the ending, then return to the save rings. The return is trimmed from the recording.';b('set-save-position','Set save position · 3s');if(g.tutorial.save_position)b('cancel-save-position','Keep current position');else b('home','Back home');break;
 case 'setup-new':v.tag='CREATE · PREPARE';v.title='Define the starting setup';v.text=g.tutorial.setup||'Use the first recorded hand pose and an optional reference photo to show the setup. Add written details in the setup page when needed.';b('setup-ready',g.tutorial.setup?'Use this setup':'Use first pose as setup');b('home','Back home');break;
 case 'setup-follow':v.tag='FOLLOW · PREPARE';v.title=g.tutorial.title;v.text=g.tutorial.setup;b('setup-ready','Ready · place tutorial');b('home','Back home');break;
 case 'start':v.tag='PLACE · 1 / 2';v.title='Choose the origin';v.text='Mark where the recording’s origin belongs in this workspace. Hold your right index fingertip there during the countdown.';b('primary','Mark origin · 4s');b('home','Back home');break;
 case 'end':v.tag='PLACE · 2 / 2';v.title='Point along the workspace';v.text='Mark a second point to the right of the origin. It sets direction, not size. Any spacing from 20–120 cm works.';b('primary','Mark direction · 4s');b('redo-placement','Restart placement');break;
 case 'placement':v.tag='PLACE · PREVIEW';v.title='Does the recording line up?';v.text=g.tutorial.steps.length?'The first pose is shown at its recorded size. Move the placement to match your task, or mark the origin again.':'Your new workspace is ready. Recorded motion will be relative to this origin and direction.';b('placement-ready',g.intent==='follow'?'Looks right · follow':'Looks right · record');b('adjust-placement','Adjust placement');b('redo-placement','Mark again');break;
 case 'adjust-placement':v.tag='PLACE · ADJUST';v.title='Move the tutorial';v.text='Shift 5 cm per press. Original movement and hand size are preserved.';b('shift-left','← Left');b('shift-right','Right →');b('shift-away','Away');b('shift-near','Toward you');b('rotate-placement','Rotate 10°');b('placement-back','Done');break;
 case 'author':v.tag='CREATE · RECORD';v.title=g.tutorial.title;v.text='Record the full movement or one action at a time. No task-specific steps are generated.';v.detail=g.savedMessage;b('primary','Start recording · 3s');if(g.tutorial.steps.length){b('hand','Review recordings');b('clear','Follow saved tutorial');}b('author-options','More options');break;
 case 'author-options':v.tag='CREATE · OPTIONS';v.title='Recording options';v.text='Hold the endpoint, then return to the save position chosen at the start of this tutorial. You can explicitly change it here.';b('toggle-clean',`Return to save ${g.cleanSave?'ON':'OFF'}`);b('change-save-position','Change save position');if(g.tutorial.steps.length)b('capture-reference','Reference photo · 3s');b('author-back','Back to recording');b('home','Back home');break;
 case 'capture':case 'capture-paused':v.tag='CREATE · RECORDING';v.title=g.mode==='capture'?'Demonstrate at your pace':'Recording paused';v.text=g.cleanSave?'Hold the finished pose for one second, then return both hands to the same save rings for one second. The return is removed.':'Finish the movement, then save. Review can trim any reach toward the controls.';v.detail=`${((g.recordElapsed||0)/1000).toFixed(1)} seconds · ${g.cleanSave?(g.endpoint.returnSince!==null?'Hold in the save rings…':g.endpoint.cutoff(g.recordElapsed)!==null?'Ending held · return to the save rings':'Hold the ending before returning to save'):g.narrator?.take?'narration recording':'motion only'}`;b('primary',g.cleanSave?'Save at last hold':'Finish recording');b('replay',g.mode==='capture'?'Pause':'Resume');if(g.cleanSave)b('removeCue','Save full take');b('discard-confirm','Discard take…');break;
 case 'confirm-exit':v.title='Leave this unfinished take?';v.text='Your earlier saved recordings stay in the library. This unfinished movement will be discarded.';b('keep-take','Stay · keep recording');b('exit-discard','Discard take & exit');break;
 case 'confirm-discard':v.title='Discard this unfinished take?';v.text='Your previously saved recordings remain in the library.';b('discard-take','Discard take');b('keep-take','Keep recording');break;
 case 'saving':v.title='Saving your recording…';v.text='Keep the session open while narration finishes.';break;
 case 'review-step':v.tag=`CREATE · REVIEW ${g.player.index+1} / ${g.tutorial.steps.length}`;v.title='Review your recording';v.text=g.player.step.instruction;v.detail=g.player.step.narration_issue?'Narration needs repair. Open More options.':'Inspect the start and ending before approving this recording.';b('primary','Approve & save');b('replay','Replay recording');b('review-pause',g.player.paused?'Resume preview':'Pause preview');b('hand','Record replacement');b('review-options','Edit recording');b('keep-add','Keep & add next');break;
 case 'review-options':v.tag='CREATE · REVIEW OPTIONS';v.title='Refine this recording';v.text='Trim the start or ending here. Written instructions can be edited on the review page after exiting AR.';b('trim-open','Trim movement');b('verify','Reference photo · 3s');b('cue','Mark guide line');b('removeCue',g.player.step.narration_issue?'Use text instruction':'Clear guide line');b('guide-hands',`Guide: ${g.player.step.guide_hands||'recorded'} hands`);b('review-back','Back to review');break;
 case 'saved':v.tag='CREATE · SAVED';v.title='Ready to follow';v.text=`${g.tutorial.title} · ${g.tutorial.steps.length} recordings. Saved on this device; no download required.`;b('start-follow','Follow this tutorial');b('author-back','Add another recording');b('home','Back home');break;
 case 'learn':{
  v.tag=`FOLLOW · ${g.player.index+1} / ${g.tutorial.steps.length}`;v.text=g.player.step.instruction;
  const state=g.followEngine?.state;
  v.title=g.watchOnly?'Watch the demonstration':g.gatePaused?'Paused — take your time':({waiting:g.followEngine?.started?'Waiting for you':'Bring your hands to the start',following:'Follow the next movement',tracking:'Show your hands again','reference-gap':'Recording has tracking gaps',checkpoint:'Movement checkpoint reached'})[state]||'Bring your hands to the start';
  v.detail=g.watchOnly?'Demonstration only. Return to guided practice when ready.':state==='checkpoint'?'Position reached. Check the physical result yourself.':state==='reference-gap'?'Choose Watch again, or re-record with the required hands visible.':state==='tracking'?'Progress is held. Missing tracking is not a movement error.':'The ghost waits for your position. It does not grade objects or grip.';
  if(g.watchOnly)b('try-follow','Ready to try');else if(g.followEngine?.done&&!g.practice)b('primary','Result looks right · next');
  b('replay',g.watchOnly?(g.player.paused?'Resume replay':'Pause replay'):(g.gatePaused?'Resume':'Pause'));b('restart-follow','Repeat');if(g.coach?.active)b('coach-ask',g.coach.mode==='listening'?'Listening…':'Ask coach');b('learn-options','Menu');break;}
 case 'learn-options':v.tag='FOLLOW · OPTIONS';v.title='Practice controls';v.text='Your place is held. Return when ready.';b('watch-demo','Watch demonstration');b('restart-follow','Restart movement');b('hand','Previous recording');b('removeCue',`Palm zones ${g.alignmentEnabled?'ON':'OFF'}`);b('move-tutorial','Reposition tutorial');b('learn-back','Back to practice');b('home','Back home');break;
 case 'finished':v.tag='FOLLOW · COMPLETE';v.title='Tutorial completed';v.text='You reached the movement checkpoints and confirmed the results. Physical correctness was not automatically verified.';b('start-follow','Practise again');b('home','Back home');break;
 }
 if(g.pending?.kind==='save-position'&&performance.now()>=g.pending.until){v.title='Hold both hands still';v.text=g.note;v.buttons=[{id:'set-save-position',label:'Restart countdown'}];if(g.tutorial.save_position)v.buttons.push({id:'cancel-save-position',label:'Keep current position'});else v.buttons.push({id:'home',label:'Back home'});}
 else if(g.pending){v.title=`${Math.max(0,Math.ceil((g.pending.until-performance.now())/1000))} seconds`;v.text=g.note;v.buttons=[];}
 if(g.mode==='learn'&&g.practice&&!g.watchOnly&&!g.gatePaused){
  const phase=g.practice.phase;
  if(phase==='preview'){v.title='Watch first';v.detail='Watch the full movement. Then try it at your own pace.';}
  if(phase==='ready'){v.title=g.followEngine.state==='reference-gap'?'Recording has tracking gaps':g.followEngine.state==='tracking'?'Show your hands again':'Your turn';v.detail='Bring your palms near the starting regions. Exact finger matching is not needed.';}
  if(phase==='practice'){v.title=g.followEngine.state==='tracking'?'Show your hands again':g.followEngine.state==='reference-gap'?'Recording has tracking gaps':'Move at your own pace';v.detail='Follow the direction and broad checkpoints. You do not need to copy every motion.';}
  // A fresh coach caption briefly takes the detail line; guidance text returns on its own.
  if(g.mode==='learn'&&g.coach?.active&&g.coach.caption&&g.coach.captionAgeMs<12000&&!g.watchOnly)v.detail=`Coach: ${g.coach.caption.slice(0,150)}`;
  if(phase==='transition'){v.title=g.player.index+1<g.tutorial.steps.length?'Movement reached · next step':'Last movement reached';v.detail='No button needed. Physical result has not been checked.';}
 }
 if(g.mode==='finished'&&g.movementOnly){v.title='Movements finished';v.text='You followed the movement checkpoints. Check the physical result yourself; it has not been verified.';}
 if(g.problem){v.detail=g.problem;v.tone='warning';}
 if(g.mode==='learn'){const state=g.followEngine?.state;v.tone=state==='checkpoint'?'success':state==='tracking'||state==='reference-gap'||state==='waiting'&&g.followEngine?.started?'warning':null;v.progress=g.followEngine?g.followEngine.index/Math.max(1,g.followEngine.gates.length-1):null;if(state==='waiting'&&g.followEngine?.started&&!g.gatePaused)v.title='Continue toward the ghost';}
 if(g.pending)v.compact=false;
 return v;
}
// The renderer and ray hit testing consume these exact rectangles. Transparent space has no hit target.
export function uiButtons(view){
 const buttons=view.buttons;
 const global=view.compact?[{id:'settings',label:'Settings',x:860,y:420,w:180,h:64}]:[{id:'settings',label:'Settings',x:736,y:20,w:140,h:48},{id:'exit',label:'Exit AR',x:892,y:20,w:148,h:48}];
 if(view.mode==='settings')global.splice(0,1);
 if(view.mode==='home')return buttons.map((b,i)=>({...b,x:i<2?40+i*508:40,y:i<2?224:460,w:i<2?492:1000,h:i<2?210:64,icon:i<2?(i?'library':'plus'):null})).concat(global);
 if(view.compact){const width=Math.min(248,(792-(buttons.length-1)*12)/Math.max(1,buttons.length));return buttons.map((b,i)=>({...b,x:40+i*(width+12),y:420,w:width,h:64})).concat(global);}
 const columns=buttons.length>6?3:2,rows=Math.ceil(buttons.length/columns),height=rows>2?55:64,gap=12,start=536-rows*(height+gap),width=(1000-(columns-1)*16)/columns;
 return buttons.map((b,i)=>({...b,x:40+(i%columns)*(width+16),y:start+Math.floor(i/columns)*(height+gap),w:width,h:height})).concat(global);
}
export function drawTutorialUI(g,ctx,hover){
 const v=tutorialView(g),p=THEMES[g.appearance?.theme]||THEMES.charcoal;g.uiButtons=uiButtons(v);g.compactUI=v.compact;
 const box=(x,y,w,h,color,r=26)=>{ctx.fillStyle=color;ctx.beginPath();ctx.roundRect(x,y,w,h,r);ctx.fill();};
 ctx.clearRect(0,0,1080,560);ctx.textAlign='left';
 if(v.compact){box(24,18,670,310,p.surface);box(24,402,1032,100,p.surface,40);}else box(12,6,1056,548,p.surface,32);
 ctx.fillStyle=p.muted;ctx.font='500 20px system-ui';ctx.fillText(v.tag.replaceAll(' · ',' / '),40,52);
 ctx.fillStyle=v.tone?p[v.tone]:p.ink;ctx.font='500 40px system-ui';g.text(ctx,v.title,40,116,v.compact?610:980,46,2);
 ctx.fillStyle=p.muted;ctx.font='26px system-ui';g.text(ctx,v.text,40,184,v.compact?610:980,34,v.compact?2:3);
 if(v.progress!==null&&v.progress!==undefined){box(40,289,610,4,p.line,2);box(40,289,Math.max(4,610*v.progress),4,p.ink,2);}
 const detailY=v.compact?274:Math.min(316,Math.min(...g.uiButtons.filter(b=>!['settings','exit'].includes(b.id)).map(b=>b.y))-24);
 ctx.fillStyle=v.tone?p[v.tone]:p.muted;ctx.font='21px system-ui';g.text(ctx,v.detail,40,detailY,v.compact?610:1000,26,1);
 for(const [index,b]of g.uiButtons.entries()){
  const utility=['settings','exit'].includes(b.id),primary=index===0&&v.mode!=='home';
  box(b.x,b.y,b.w,b.h,hover===b.id?p.ink:primary?p.action:p.raised,b.icon?24:Math.min(32,b.h/2));
  const ink=hover===b.id||primary?p.actionInk:p.ink;ctx.fillStyle=ink;
  if(b.icon){ctx.strokeStyle=p.line;ctx.lineWidth=1.5;ctx.beginPath();ctx.roundRect(b.x+24,b.y+20,56,56,14);ctx.stroke();drawIcon(ctx,b.icon,b.x+38,b.y+34,28,ink);ctx.font='500 29px system-ui';ctx.fillText(b.label,b.x+24,b.y+130);ctx.fillStyle=p.muted;ctx.font='22px system-ui';ctx.fillText(b.icon==='plus'?'Teach a skill':'Learn from a recording',b.x+24,b.y+170);}
  else {ctx.font=`500 ${utility?20:24}px system-ui`;while(ctx.measureText(b.label).width>b.w-28&&parseInt(ctx.font.match(/(\d+)px/)[1])>17){const n=parseInt(ctx.font.match(/(\d+)px/)[1]);ctx.font=`500 ${n-1}px system-ui`;}ctx.textAlign='center';ctx.fillText(b.label,b.x+b.w/2,b.y+b.h/2+8);ctx.textAlign='left';}
 }
 const event=g.feedback?.visible(performance.now());
 if(event&&v.compact){box(716,18,340,116,p.surface);ctx.fillStyle=event.kind==='error'?p.warning:p.success;ctx.font='23px system-ui';g.text(ctx,event.text,738,59,294,30,2);}
 return `${v.title}. ${v.text}. ${v.detail}`;
}
