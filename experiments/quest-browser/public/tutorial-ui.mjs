// Contextual headset UI. Hit boxes come from the same view model as the visible controls.
export function tutorialView(g){
 const v={tag:'TRAIL',title:'Your spatial workshop',text:'',detail:'',buttons:[]};
 const b=(id,label)=>v.buttons.push({id,label});
 switch(g.mode){
 case 'home':v.title='What would you like to do?';v.text='Teach a movement, or follow one at your own pace.';b('create','Create tutorial');b('library','Follow tutorial');if(g.tutorial.steps.length)b('edit-current','Continue current draft');break;
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
 case 'confirm-discard':v.title='Discard this unfinished take?';v.text='Your previously saved recordings remain in the library.';b('discard-take','Discard take');b('keep-take','Keep recording');break;
 case 'saving':v.title='Saving your recording…';v.text='Keep the session open while narration finishes.';break;
 case 'review-step':v.tag=`CREATE · REVIEW ${g.player.index+1} / ${g.tutorial.steps.length}`;v.title='Review your recording';v.text=g.player.step.instruction;v.detail=g.player.step.narration_issue?'Narration needs repair. Open More options.':'Inspect the start and ending before approving this recording.';b('primary','Approve & save');b('replay','Replay recording');b('hand','Record replacement');b('review-options','More options');break;
 case 'review-options':v.tag='CREATE · REVIEW OPTIONS';v.title='Refine this recording';v.text='Detailed trimming and instruction edits are available on the review page after exiting AR.';b('verify','Reference photo · 3s');b('cue','Mark guide line');b('removeCue',g.player.step.narration_issue?'Use text instruction':'Clear guide line');b('guide-hands',`Guide: ${g.player.step.guide_hands||'recorded'} hands`);b('review-back','Back to review');break;
 case 'saved':v.tag='CREATE · SAVED';v.title='Ready to follow';v.text=`${g.tutorial.title} · ${g.tutorial.steps.length} recordings. Saved on this device; no download required.`;b('start-follow','Follow this tutorial');b('author-back','Add another recording');b('home','Back home');break;
 case 'learn':{
  v.tag=`FOLLOW · ${g.player.index+1} / ${g.tutorial.steps.length}`;v.text=g.player.step.instruction;
  const state=g.followEngine?.state;
  v.title=g.watchOnly?'Watch the demonstration':g.gatePaused?'Paused — take your time':({waiting:g.followEngine?.started?'Waiting for you':'Bring your hands to the start',following:'Follow the next movement',tracking:'Show your hands again','reference-gap':'Recording has tracking gaps',checkpoint:'Movement checkpoint reached'})[state]||'Bring your hands to the start';
  v.detail=g.watchOnly?'Demonstration only. Return to guided practice when ready.':state==='checkpoint'?'Position reached. Check the physical result yourself.':state==='reference-gap'?'Choose Watch again, or re-record with the required hands visible.':state==='tracking'?'Progress is held. Missing tracking is not a movement error.':'The ghost waits for your position. It does not grade objects or grip.';
  if(g.watchOnly)b('try-follow','Ready to try');else if(g.followEngine?.done)b('primary','Result looks right · next');
  if(g.coach?.active&&g.coach.state.caption&&!g.watchOnly&&state!=='checkpoint')v.detail=`Coach: ${g.coach.state.caption.slice(0,150)}`;
  b('replay',g.watchOnly?(g.player.paused?'Resume replay':'Pause replay'):(g.gatePaused?'Resume':'Pause'));b('watch-demo','Watch again');if(g.coach?.active)b('coach-ask',g.coach.state.mode==='listening'?'Listening…':'Ask coach');b('learn-options','More options');break;}
 case 'learn-options':v.tag='FOLLOW · OPTIONS';v.title='Practice controls';v.text='Returning from this menu keeps your place and reacquires the current movement.';b('restart-follow','Restart movement');b('hand','Previous recording');b('removeCue',`Palm zones ${g.alignmentEnabled?'ON':'OFF'}`);b('move-tutorial','Reposition tutorial');b('learn-back','Back to practice');b('home','Back home');break;
 case 'finished':v.tag='FOLLOW · COMPLETE';v.title='Tutorial completed';v.text='You reached the movement checkpoints and confirmed the results. Physical correctness was not automatically verified.';b('start-follow','Practise again');b('home','Back home');break;
 }
 if(g.pending?.kind==='save-position'&&performance.now()>=g.pending.until){v.title='Hold both hands still';v.text=g.note;v.buttons=[{id:'set-save-position',label:'Restart countdown'}];if(g.tutorial.save_position)v.buttons.push({id:'cancel-save-position',label:'Keep current position'});else v.buttons.push({id:'home',label:'Back home'});}
 else if(g.pending){v.title=`${Math.max(0,Math.ceil((g.pending.until-performance.now())/1000))} seconds`;v.text=g.note;v.buttons=[];}
 if(g.problem){v.detail=g.problem;}
 return v;
}
export function uiButtons(view){
 const n=view.buttons.length,columns=2,w=498,h=n>4?58:72,start=n>4?302:350;
 return [...view.buttons.map((b,i)=>({...b,x:30+(i%columns)*522,y:start+Math.floor(i/columns)*(h+12),w,h})),{id:'panel-place',label:'Move panel',x:760,y:18,w:162,h:50},{id:'exit',label:'Exit AR',x:936,y:18,w:114,h:50}];
}
export function drawTutorialUI(g,ctx,hover){
 const v=tutorialView(g);g.uiButtons=uiButtons(v);
 ctx.clearRect(0,0,1080,560);ctx.fillStyle='#152c29';ctx.beginPath();ctx.roundRect(0,0,1080,560,32);ctx.fill();
 ctx.fillStyle='#a5c8be';ctx.font='600 21px system-ui';ctx.fillText(v.tag,30,48);
 ctx.fillStyle='#f1faf5';ctx.font='600 40px system-ui';g.text(ctx,v.title,30,119,1020,45,2);
 ctx.fillStyle='#d0e3db';ctx.font='27px system-ui';g.text(ctx,v.text,30,191,1000,34,3);
 ctx.fillStyle=g.problem?'#ffd395':'#9fc9ba';ctx.font='21px system-ui';g.text(ctx,v.detail,30,v.buttons.length>4?277:314,1020,26,1);
 for(const b of g.uiButtons){const primary=b===g.uiButtons[0];ctx.fillStyle=hover===b.id?'#d0fbee':primary?'#abead5':'#2b4841';ctx.beginPath();ctx.roundRect(b.x,b.y,b.w,b.h,14);ctx.fill();ctx.fillStyle=hover===b.id||primary?'#153a2f':'#e4f3ee';ctx.font=`600 ${b.y===18?20:25}px system-ui`;ctx.textAlign='center';ctx.fillText(b.label,b.x+b.w/2,b.y+b.h/2+8);}
 ctx.textAlign='left';return `${v.title}. ${v.text}. ${v.detail}`;
}
