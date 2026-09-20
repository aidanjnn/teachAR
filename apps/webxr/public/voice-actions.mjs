// The server interprets speech; only this local allowlist can dispatch runtime actions.
export function voiceIntentContext(g){
 const allowed=['help','stop','home'];
 if(g.mode==='learn')allowed.push('pause','resume','replay','instruction',...(g.player.index>0?['previous']:[]),...(g.watchOnly||g.player.index<g.tutorial.steps.length-1?['next']:[]));
 if(g.mode==='review-step')allowed.push('pause','resume','replay',...(g.player.index>0?['previous']:[]),...(g.watchOnly||g.player.index<g.tutorial.steps.length-1?['next']:[]));
 if(['author','step-ready'].includes(g.mode))allowed.push('record','finish');
 if(['capture','capture-paused'].includes(g.mode))allowed.push('save',g.mode==='capture'?'pause':'resume',...(g.fluidCapture?['finish']:[]));
 if(g.mode==='confirm-home')allowed.push('save','resume');
 const step=g.player?.step;
 return {mode:g.mode,allowed:g.pending||['saving','saving-step','saving-tutorial','polishing-tutorial'].includes(g.mode)?['stop']:allowed,step:step?{title:String(step.title||'').slice(0,100),instruction:String(step.instruction||'').slice(0,1000)}:null};
}
export function voiceContext(g){return [g.takeGeneration,g.tutorial?.id,g.tutorial?.revision,g.mode,g.player?.index,g.epoch,g.gatePaused].join('|');}
export function applyVoiceCommand(g,command,{saveCutoff}={}){
 if(!g.activeSession)return {ok:false,message:'Enter AR first.'};
 if(g.pending||['saving','saving-step','saving-tutorial','polishing-tutorial'].includes(g.mode))return {ok:false,message:'Wait for the countdown or save to finish.'};
 const review=g.mode==='review-step',follow=g.mode==='learn',capture=['capture','capture-paused'].includes(g.mode);
 const done=message=>{g.log('voice_command',{command,kind:'user-requested',physical_verified:false});return {ok:true,message};};
 if(command==='help'){g.action('voice-open');g.action('voice-help');return done('Here are some things you can say.');}
 if(command==='home'){g.action('home');return done(g.mode==='confirm-home'?'Would you like to save this take before going Home?':'Home');}
 if(g.mode==='confirm-home'&&command==='save'){g.action('home-save');return done('Saving this take before going Home.');}
 if(g.mode==='confirm-home'&&command==='resume'){g.action('keep-take');return done('Your take is paused. Say resume when ready.');}
 if(command==='instruction'&&follow)return done(g.player.step.instruction);
 if(command==='record'&&g.mode==='step-ready'){g.action('next-recording');return done('Recording starts in three seconds.');}
 if(command==='record'&&g.mode==='author'){g.action('primary');return done('Recording starts in three seconds.');}
 if(review&&['pause','resume','replay','next','previous'].includes(command)){
  if(command==='pause'||command==='resume'){g.player.paused=command==='pause';g.player.audioPaused=command==='pause';if(command==='pause')g.audioPlayer?.stop();return done(command==='pause'?'Preview paused.':'Preview resumed.');}
  const index=g.player.index+(command==='next'?1:command==='previous'?-1:0);if(index<0||index>=g.tutorial.steps.length)return {ok:false,message:'There is no step in that direction.'};g.audioPlayer?.stop();g.player.index=index;g.action('replay');return done(`Showing step ${index+1}.`);
 }
 if(command==='pause'){
  if(g.mode==='capture'){g.action('replay');return done('Recording paused.');}
  if(follow){if(g.watchOnly?!!g.audioPlayer?.node||!g.player.paused:!g.gatePaused)g.action('replay');return done('Guidance paused.');}
 }
 if(command==='resume'){
  if(g.mode==='capture-paused'){g.action('replay');return g.problem?{ok:false,message:g.problem}:done('Recording resumed.');}
  if(follow){if(g.watchOnly?g.player.paused:g.gatePaused)g.action('replay');return done('Guidance resumed.');}
 }
 if(command==='save'&&capture){
  if(g.stepByStep){if(!g.saveCurrentStep(saveCutoff))return {ok:false,message:g.problem};return done('Step saved. Return to the rest position for the next step.');}
  if(g.fluidCapture){if(!g.sealFluidSegment(false,'finish'))return {ok:false,message:g.problem};return done('Saving step.');}
  g.action('primary');return g.problem?{ok:false,message:g.problem}:done('Saving step for review.');
 }
 if(command==='finish'&&(capture||['author','step-ready'].includes(g.mode))){
  if(capture&&g.fluidCapture)g.finishFluid();else if(['author','step-ready'].includes(g.mode))g.saveTask=g.finishAuthoring();else return {ok:false,message:'Save the current step first.'};
  return done('Finishing tutorial.');
 }
 if(follow&&g.watchOnly&&command==='next'&&g.player.index===g.tutorial.steps.length-1){g.action('watch-next');return done('Practice finished. Check your result.');}
 if(follow&&['replay','next','previous'].includes(command)){
  const index=g.player.index+(command==='next'?1:command==='previous'?-1:0);
  if(index<0||index>=g.tutorial.steps.length)return {ok:false,message:command==='next'?'This is the last step.':'This is the first step.'};
  // Navigation is not a movement checkpoint and never calls confirm().
  g.audioPlayer?.stop();g.coach?.onAttempt();g.epoch++;g.player.index=index;g.gatePaused=false;g.showStep();
  return done(command==='replay'?'No worries. Let’s watch this step again.':`Showing step ${index+1}.`);
 }
 return {ok:false,message:'That command is not available here.'};
}
