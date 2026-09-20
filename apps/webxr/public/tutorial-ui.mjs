import {THEMES,drawIcon} from './tutorial-design.mjs';
// Contextual headset UI. Hit boxes come from the same view model as the visible controls.
export function tutorialView(g){
 const v={tag:'TRAIL',mode:g.mode,title:'Your workspace',text:'',detail:'',buttons:[],compact:['capture','capture-paused','learn'].includes(g.mode)&&!g.problem&&!g.pending};
 const b=(id,label)=>v.buttons.push({id,label});
 switch(g.mode){
 case 'home':v.title='Your workspace';v.text='Teach a skill. Learn from a recording.';b('create','Create tutorial');b('library','Library');if(g.tutorial.steps.length)b('edit-current','Continue current draft');break;
 case 'settings':v.tag='PREFERENCES';v.title='Make room for the task';v.text='Pinch and drag the handle above the panel. Drag the timer itself to move it around your work surface.';b('theme',`Appearance: ${g.appearance?.theme==='light'?'Warm gray':'Charcoal'}`);b('sound',`Event sounds: ${g.appearance?.sound?'On':'Off'}`);b('panel-place','Move panel');b('boundary-help','Quest boundary help');b('settings-back','Back');break;
 case 'trim':v.tag='CREATE · TRIM';v.title='Keep the useful movement';v.text=`Start ${(g.trimRange?.[0]/1000).toFixed(2)}s · End ${(g.trimRange?.[1]/1000).toFixed(2)}s`;v.detail='Adjust in quarter seconds. Applying a trim requires review again.';b('trim-start-less','Start −0.25s');b('trim-start-more','Start +0.25s');b('trim-end-less','End −0.25s');b('trim-end-more','End +0.25s');b('trim-apply','Apply & review');b('trim-cancel','Cancel');break;
 case 'loading-library':v.title='Opening your library…';break;
 case 'library':{
  const items=g.libraryItems?.()||g.library||[],page=Math.floor((g.libraryIndex||0)/3),start=page*3;
  v.tag='YOUR TUTORIALS';v.title='Library';v.text=g.libraryQuery?`Search: ${g.libraryQuery}`:'Your skills, ready when you are.';v.detail=`${items.length} tutorials · ${g.libraryFilter||'all'}`;
  items.slice(start,start+3).forEach((t,i)=>v.buttons.push({id:`library-item-${start+i}`,label:t.title,subtitle:`${t.steps.length} steps · ${t.completion?'Ready to follow':'Draft'}`,card:true}));
  b('library-search','Search');b('library-filter',`Show: ${g.libraryFilter||'all'}`);if(g.libraryQuery)b('library-clear','Clear search');
  if(items.length>3){b('library-page-prev','Previous');b('library-page-next','Next');}if(!items.length)v.text=g.libraryQuery?'No matching tutorials. Clear search or try another name.':'Your first tutorial belongs here. Choose Home, then Create.';break;}
 case 'boundary-help':v.tag='QUEST SETUP';v.title='Use your current workspace';v.text='Trail uses stationary-compatible local tracking. If Quest asks for an old play area, open headset Boundary settings and choose Stationary at your current location.';v.detail='The headset controls its boundary. Trail cannot switch or disable it.';b('help-back','Back');break;
 case 'confirm-home':v.title='Save before going Home?';v.text='Earlier saved steps stay in your library. Save this take, or discard only the unfinished movement.';b('home-save','Save take & Home');b('home-discard','Discard take & Home');b('keep-take','Keep recording');break;
 case 'media-setup':v.tag='CREATE · CAPTURE';v.title='Add your voice and reference photos';v.text='Enable both once for this session. Narration records only during a take; photos stay local until you choose to share.';v.detail='Browser permission prompts may appear. You can create with hands alone.';b('media-enable','Enable narration & photos');b('media-skip','Hands only');b('home','Back home');break;
 case 'media-wait':v.tag='CREATE · PERMISSIONS';v.title='Allow capture when prompted';v.text='Respond to the browser permission prompts. Hand recording is available even if you decline.';b('media-skip','Continue with hands only');break;
 case 'save-home':v.tag='CREATE · SAVE POSITION';v.title='Where will you return to save?';v.text='Choose a comfortable, visible spot for both hands, away from the task. Set it once; every recording uses this same save zone.';v.detail='After each action: hold the ending, then return to the save rings. The return is trimmed from the recording.';b('set-save-position','Set save position · 3s');if(g.tutorial.save_position)b('cancel-save-position','Keep current position');else b('home','Back home');break;
 case 'setup-new':v.tag='CREATE · PREPARE';v.title='Define the starting setup';v.text=g.tutorial.setup||'Arrange the objects as the learner should start. The first recorded hand pose and optional photo will be the starting reference. You can explain the layout in your narration.';b('setup-ready',g.tutorial.setup?'Use this setup':'Use first pose as setup');b('toggle-fluid',g.fluidCapture?'Recording: hold to save':'Recording: manual steps');b('home','Back home');break;
 case 'setup-follow':v.tag='FOLLOW · PREPARE';v.title=g.tutorial.title;v.text=g.tutorial.setup;b('setup-ready','Ready · place tutorial');b('home','Back home');break;
 case 'start':v.tag='PLACE · 1 / 2';v.title='Choose the origin';v.text='Mark where the recording’s origin belongs in this workspace. Hold your right index fingertip there during the countdown.';b('primary','Mark origin · 4s');b('home','Back home');break;
 case 'end':v.tag='PLACE · 2 / 2';v.title='Point along the workspace';v.text='Mark a second point to the right of the origin. It sets direction, not size. Any spacing from 20–120 cm works.';b('primary','Mark direction · 4s');b('redo-placement','Restart placement');break;
 case 'placement':v.tag='PLACE · PREVIEW';v.title='Does the recording line up?';v.text=g.tutorial.steps.length?'The first pose is shown at its recorded size. Move the placement to match your task, or mark the origin again.':'Your new workspace is ready. Recorded motion will be relative to this origin and direction.';b('placement-ready',g.intent==='follow'?'Looks right · follow':'Looks right · record');b('adjust-placement','Adjust placement');b('redo-placement','Mark again');break;
 case 'adjust-placement':v.tag='PLACE · ADJUST';v.title='Move the tutorial';v.text='Shift 5 cm per press. Original movement and hand size are preserved.';b('shift-left','← Left');b('shift-right','Right →');b('shift-away','Away');b('shift-near','Toward you');b('rotate-placement','Rotate 10°');b('placement-back','Done');break;
 case 'author':v.tag='CREATE · RECORD';v.title=g.tutorial.title;v.text='Record the full movement or one action at a time. No task-specific steps are generated.';v.detail=`${g.fluidCapture?'Continuous · Required hands: '+g.captureHands+' · ':''}${g.savedMessage}`;b('primary','Start recording · 3s');if(g.tutorial.steps.length){b('hand','Review recordings');b('clear','Follow saved tutorial');}b('author-options','More options');break;
 case 'author-options':v.tag='CREATE · OPTIONS';v.title='Recording options';v.text='Continuous: move, then hold still to save each step. Choose the hands the learner must use. Return-to-save is an alternative mode.';b('capture-hands',`Required hands: ${g.captureHands}`);b('toggle-fluid',`Continuous hold-save ${g.fluidCapture?'ON':'OFF'}`);b('toggle-clean',`Return to save ${g.cleanSave?'ON':'OFF'}`);b('change-save-position','Change save position');if(g.tutorial.steps.length)b('capture-reference','Reference photo · 3s');b('author-back','Back to recording');b('home','Back home');break;
 case 'capture':case 'capture-paused':v.tag='CREATE · RECORDING';v.title=g.mode==='capture'?'Demonstrate at your pace':'Recording paused';v.text=g.cleanSave?'Hold the finished pose for one second, then return both hands to the same save rings for one second. The return is removed.':'Finish the movement, then save. Review can trim any reach toward the controls.';v.detail=`${((g.recordElapsed||0)/1000).toFixed(1)} seconds · ${g.cleanSave?(g.endpoint.returnSince!==null?'Hold in the save rings…':g.endpoint.cutoff(g.recordElapsed)!==null?'Ending held · return to the save rings':'Hold the ending before returning to save'):g.narrator?.take?'narration recording':'motion only'}`;b('primary',g.cleanSave?'Save at last hold':'Finish recording');b('replay',g.mode==='capture'?'Pause':'Resume');if(g.cleanSave)b('removeCue','Save full take');b('discard-confirm','Discard take…');break;
 case 'confirm-exit':v.title='Leave this unfinished take?';v.text='Your earlier saved recordings stay in the library. This unfinished movement will be discarded.';b('keep-take','Stay · keep recording');b('exit-discard','Discard take & exit');break;
 case 'confirm-discard':v.title='Discard this unfinished take?';v.text='Your previously saved recordings remain in the library.';b('discard-take','Discard take');b('keep-take','Keep recording');break;
 case 'saving':v.title='Saving your recording…';v.text='Keep the session open while narration finishes.';break;
 case 'saving-tutorial':v.title='Saving on this device…';v.text='Keep the page open until the local save completes.';break;
 case 'review-step':v.tag=`CREATE · REVIEW ${g.player.index+1} / ${g.tutorial.steps.length}`;v.title='Review your recording';v.text=g.player.step.instruction;v.detail=g.player.step.narration_issue?'Narration needs repair. Open More options.':'Choose required hands and inspect the start and ending before approving.';b('primary',g.saveStatus==='failed'?'Retry approval & save':'Approve & save');b('replay','Replay recording');b('review-pause',g.player.paused?'Resume preview':'Pause preview');b('hand','Record replacement');b('review-options','Edit recording');b('keep-add','Keep & add next');break;
 case 'review-options':v.tag='CREATE · REVIEW OPTIONS';v.title='Refine this recording';v.text='Trim the start or ending here. Written instructions can be edited on the review page after exiting AR.';b('trim-open','Trim movement');b('verify','Reference photo · 3s');b('cue','Mark guide line');b('removeCue',g.player.step.narration_issue?'Use text instruction':'Clear guide line');b('guide-hands',`Required hands: ${g.player.step.guide_hands&&g.player.step.guide_hands!=='recorded'?g.player.step.guide_hands:'choose'}`);b('review-back','Back to review');break;
 case 'saved':v.tag='CREATE · SAVED';v.title='Ready to follow';v.text=`${g.tutorial.title} · ${g.tutorial.steps.length} recordings. Saved on this device; no download required.`;b('start-follow','Follow this tutorial');b('author-back','Add another recording');b('home','Back home');break;
 case 'learn':{
  v.tag=`FOLLOW · ${g.player.index+1} / ${g.tutorial.steps.length}`;v.text=g.player.step.instruction;
  const state=g.followEngine?.state;
  v.title=g.watchOnly?'Watch the demonstration':g.gatePaused?'Paused — take your time':({waiting:g.followEngine?.started?'Waiting for you':'Bring your hands to the start',following:'Follow the next movement',tracking:'Show your hands again','reference-gap':'Recording has tracking gaps',checkpoint:'Movement checkpoint reached'})[state]||'Bring your hands to the start';
  v.detail=g.watchOnly?'Demonstration only. Return to guided practice when ready.':state==='checkpoint'?'Position reached. Check the physical result yourself.':state==='reference-gap'?'Choose Watch again, or re-record with the required hands visible.':state==='tracking'?'Progress is held. Missing tracking is not a movement error.':'The ghost waits for your position. It does not grade objects or grip.';
  if(g.watchOnly)b('try-follow','Ready to try');else if(g.followEngine?.done&&!g.practice)b('primary','Result looks right · next');
  b('replay',g.watchOnly?(g.player.paused?'Resume replay':'Pause replay'):(g.gatePaused?'Resume':'Pause'));b('restart-follow','Repeat');if(g.coach?.active){const m=g.coach.mode;b('coach-ask',m==='listening'?'Listening…':g.coach.listenRequested?'Ask queued…':m==='live'?'Ask coach':m==='connecting'?'Coach connecting…':'Coach: text only');}if(g.sceneCoach?.available&&!g.watchOnly&&v.buttons.length<5)b('coach-look',g.sceneCoach.busy?'Looking…':'Look & advise');b('learn-options','Menu');break;}
 case 'learn-options':v.tag='FOLLOW · OPTIONS';v.title='Practice controls';v.text='Your place is held. Return when ready.';b('watch-demo','Watch demonstration');b('restart-follow','Restart movement');b('hand','Previous recording');b('removeCue',`Palm zones ${g.alignmentEnabled?'ON':'OFF'}`);b('move-tutorial','Reposition tutorial');b('learn-back','Back to practice');b('home','Back home');break;
 case 'finished':v.tag='FOLLOW · COMPLETE';v.title='Tutorial completed';v.text='You reached the movement checkpoints and confirmed the results. Physical correctness was not automatically verified.';b('start-follow','Practise again');b('home','Back home');break;
 }
 if(g.fluidCapture&&['capture','capture-paused'].includes(g.mode)){v.text='At each ending, hold your tracked hands still until the ring fills. Then continue moving to record the next step.';v.detail=`${((g.recordElapsed||0)/1000).toFixed(1)}s · ${g.tutorial.steps.length} steps captured · ${g.segmenter?.progress>0?'Hold to save…':'Move to begin the next step'}`;v.buttons=[{id:'fluid-stop',label:'Finish tutorial'},{id:'replay',label:g.mode==='capture'?'Pause':'Resume'}];}
 if(g.pending?.kind==='save-position'&&performance.now()>=g.pending.until){v.title='Hold both hands still';v.text=g.note;v.buttons=[{id:'set-save-position',label:'Restart countdown'}];if(g.tutorial.save_position)v.buttons.push({id:'cancel-save-position',label:'Keep current position'});else v.buttons.push({id:'home',label:'Back home'});}
 else if(g.pending){v.title=`${Math.max(0,Math.ceil((g.pending.until-performance.now())/1000))} seconds`;v.text=g.note;v.buttons=[];}
 if(g.mode==='learn'&&g.practice&&!g.watchOnly&&!g.gatePaused){
  const phase=g.practice.phase;
  if(phase==='preview'){v.title='Watch first';v.detail='Watch the full movement. Then try it at your own pace.';}
  if(phase==='ready'){v.title=g.followEngine.state==='reference-gap'?'Recording has tracking gaps':g.followEngine.state==='tracking'?'Show your hands again':'Your turn';v.detail='Bring your palms near the starting regions. Exact finger matching is not needed.';}
  if(phase==='practice'){v.title=g.followEngine.state==='tracking'?'Show your hands again':g.followEngine.state==='reference-gap'?'Recording has tracking gaps':'Move at your own pace';v.detail='Follow the direction and broad checkpoints. You do not need to copy every motion.';}
  if(phase==='transition'){v.title=g.player.index+1<g.tutorial.steps.length?'Movement reached · next step':'Last movement reached';v.detail='No button needed. Physical result has not been checked.';}
 }
 // A fresh coach answer takes the detail line while watching, waiting or practising; the transition's unverified-result notice and tracking states keep theirs.
 if(g.mode==='learn'&&g.coach?.active&&g.coach.caption&&g.coach.captionAgeMs<12000&&!g.gatePaused&&g.practice?.phase!=='transition'&&!['tracking','reference-gap','checkpoint'].includes(g.followEngine?.state))v.detail=`Coach: ${g.coach.caption.slice(0,150)}`;
 if(g.mode==='learn'&&g.sceneCoach?.busy)v.detail='Looking at your table…';
 if(g.mode==='finished'&&g.movementOnly){v.title='Movements finished';v.text='You followed the movement checkpoints. Check the physical result yourself; it has not been verified.';}
 if(g.problem){v.detail=g.problem;v.tone='warning';}
 if(g.mode==='learn'){const state=g.followEngine?.state;v.tone=state==='checkpoint'?'success':state==='tracking'||state==='reference-gap'||state==='waiting'&&g.followEngine?.started?'warning':null;v.progress=g.followEngine?g.followEngine.index/Math.max(1,g.followEngine.gates.length-1):null;if(state==='waiting'&&g.followEngine?.started&&!g.gatePaused)v.title='Continue toward the ghost';}
 if(g.pending)v.compact=false;
 if(g.saveStatus==='saving')v.detail=g.savedMessage;
 if(g.saveStatus==='failed'){v.compact=false;v.title='Could not save locally';v.text=g.savedMessage;v.detail='Your changes are still open here.';if(v.buttons.length<8)b('retry-save','Retry local save');}
 return v;
}
// The renderer and ray hit testing consume these exact rectangles. Transparent space has no hit target.
export function uiButtons(view){
 const buttons=view.buttons.filter(b=>b.id!=='home');
 const global=[{id:'home',label:'Home',x:584,y:20,w:136,h:48},{id:'settings',label:'Settings',x:736,y:20,w:140,h:48},{id:'exit',label:'Exit AR',x:892,y:20,w:148,h:48}];
 if(['settings','media-wait'].includes(view.mode))global.splice(1,1);
 if(view.mode==='library'){const cards=buttons.filter(b=>b.card),tools=buttons.filter(b=>!b.card);return cards.map((b,i)=>({...b,x:40+i*338,y:214,w:322,h:194})).concat(tools.map((b,i)=>({...b,x:40+i*(1000/tools.length),y:456,w:1000/tools.length-12,h:64})),global);}
 if(view.mode==='home')return buttons.map((b,i)=>({...b,x:i<2?40+i*508:40,y:i<2?224:460,w:i<2?492:1000,h:i<2?210:64,icon:i<2?(i?'library':'plus'):null})).concat(global);
 if(view.compact){const width=Math.min(248,(792-(buttons.length-1)*12)/Math.max(1,buttons.length));return buttons.map((b,i)=>({...b,x:40+i*(width+12),y:420,w:width,h:64})).concat(global);}
 const columns=buttons.length>6?3:2,rows=Math.ceil(buttons.length/columns),height=rows>2?55:64,gap=12,start=536-rows*(height+gap),width=(1000-(columns-1)*16)/columns;
 return buttons.map((b,i)=>({...b,x:40+(i%columns)*(width+16),y:start+Math.floor(i/columns)*(height+gap),w:width,h:height})).concat(global);
}
export function drawTutorialUI(g,ctx,hover){
 const v=tutorialView(g),p=THEMES[g.appearance?.theme]||THEMES.charcoal;g.uiButtons=uiButtons(v);g.compactUI=v.compact;
 const box=(x,y,w,h,color,r=26)=>{ctx.fillStyle=color;ctx.beginPath();ctx.roundRect(x,y,w,h,r);ctx.fill();};
 ctx.clearRect(0,0,1080,560);ctx.textAlign='left';
 if(v.compact){box(24,18,1032,310,p.surface);box(24,402,1032,100,p.surface,40);}else box(12,6,1056,548,p.surface,32);
 ctx.fillStyle=p.muted;ctx.font='500 20px system-ui';ctx.fillText(v.tag.replaceAll(' · ',' / '),40,52);
 ctx.fillStyle=v.tone?p[v.tone]:p.ink;ctx.font='500 40px system-ui';g.text(ctx,v.title,40,116,v.compact?610:980,46,2);
 ctx.fillStyle=p.muted;ctx.font='26px system-ui';g.text(ctx,v.text,40,184,v.compact?610:980,34,v.compact?2:3);
 if(v.progress!==null&&v.progress!==undefined){box(40,289,610,4,p.line,2);box(40,289,Math.max(4,610*v.progress),4,p.ink,2);}
 const detailY=v.mode==='library'?439:v.compact?274:Math.min(316,Math.min(...g.uiButtons.filter(b=>!['settings','exit','home'].includes(b.id)).map(b=>b.y))-24);
 ctx.fillStyle=v.tone?p[v.tone]:p.muted;ctx.font='21px system-ui';g.text(ctx,v.detail,40,detailY,v.compact?610:1000,26,1);
 for(const [index,b]of g.uiButtons.entries()){
  const utility=['settings','exit','home'].includes(b.id),primary=index===0&&v.mode!=='home'&&!b.card;
  box(b.x,b.y,b.w,b.h,hover===b.id?p.ink:primary?p.action:p.raised,b.icon?24:Math.min(32,b.h/2));
  const ink=hover===b.id||primary?p.actionInk:p.ink;ctx.fillStyle=ink;
  if(b.card){ctx.font='500 26px system-ui';g.text(ctx,b.label,b.x+24,b.y+60,b.w-48,34,2);ctx.fillStyle=hover===b.id?p.actionInk:p.muted;ctx.font='21px system-ui';ctx.fillText(b.subtitle,b.x+24,b.y+151,b.w-48);}
  else if(b.icon){ctx.strokeStyle=p.line;ctx.lineWidth=1.5;ctx.beginPath();ctx.roundRect(b.x+24,b.y+20,56,56,14);ctx.stroke();drawIcon(ctx,b.icon,b.x+38,b.y+34,28,ink);ctx.font='500 29px system-ui';ctx.fillText(b.label,b.x+24,b.y+130);ctx.fillStyle=p.muted;ctx.font='22px system-ui';ctx.fillText(b.icon==='plus'?'Teach a skill':'Learn from a recording',b.x+24,b.y+170);}
  else {ctx.font=`500 ${utility?20:24}px system-ui`;while(ctx.measureText(b.label).width>b.w-28&&parseInt(ctx.font.match(/(\d+)px/)[1])>17){const n=parseInt(ctx.font.match(/(\d+)px/)[1]);ctx.font=`500 ${n-1}px system-ui`;}ctx.textAlign='center';ctx.fillText(b.label,b.x+b.w/2,b.y+b.h/2+8);ctx.textAlign='left';}
 }
 const event=g.feedback?.visible(performance.now());
 if(event&&v.compact){box(716,92,340,116,p.surface);ctx.fillStyle=event.kind==='error'?p.warning:p.success;ctx.font='23px system-ui';g.text(ctx,event.text,738,133,294,30,2);}
 return `${v.title}. ${v.text}. ${v.detail}`;
}
