// Desktop-page controls for the voice coach. Start here, before entering AR; the headset panel only exposes Ask.
import {CAPTION_GAP_MS,LEARNER_TURN_MS} from './tutorial-coach.mjs';
export function mountCoachPanel(guide,coach,{tell,sceneCoach=null}){
  const $=id=>document.getElementById(id);
  const log=$('coach-log'),mode=$('coach-mode'),status=$('coach-status'),pairForm=$('coach-pair');
  // One line per voice per turn. Deltas keep appending to that voice's current line until it pauses; a straggling learner word never splits it.
  const current={learner:null,coach:null};
  function line(role,text){
    const li=document.createElement('li');li.dataset.role=role;li.textContent=`${role==='coach'?'Coach':'You'}: ${text}`;log.append(li);
    while(log.children.length>40)log.firstChild.remove();log.scrollTop=log.scrollHeight;return li;
  }
  function describe(state){
    mode.textContent=state.mode;mode.dataset.mode=state.mode;
    const bits=[];
    if(state.pairing==='unpaired')bits.push('Pair this browser with the server first.');
    else if(state.pairing==='paired')bits.push(`Paired as ${state.role}.`);
    else if(state.pairing==='none')bits.push('Server without pairing: coaching from the steps in this browser.');
    if(state.mode==='connecting')bits.push('Connecting…');
    else if(state.mode==='live')bits.push(state.listenRequested?'Ask queued: the microphone opens as soon as the step update is acknowledged.':'Live voice ready. Press Ask, or choose Ask coach inside AR, then speak.');
    else if(state.mode==='listening')bits.push('Listening…');
    else if(state.mode==='text')bits.push('Text answers only; live voice is not available from this server.');
    if(state.mode!=='idle'&&state.grounded===false)bits.push(`Answers use this browser's step text, not server-reviewed text${state.reason?` (${state.reason})`:''}.`);
    if(state.error)bits.push(state.error);
    status.textContent=bits.join(' ');
    pairForm.hidden=state.pairing!=='unpaired';
    for(const id of ['coach-ask','coach-ask-text','coach-stop'])$(id).disabled=!coach.active;
    refreshLook();
  }
  // Look & advise needs the coach (grounding) and a camera stream; the button says which is missing.
  function refreshLook(){const look=$('coach-look');if(!look)return;const why=sceneCoach?sceneCoach.reason:'Scene coaching is not available on this page.';look.disabled=!!why||!!sceneCoach?.busy;look.title=why||'Send a fresh camera frame and the step\'s reference photo to the scene coach.';look.textContent=sceneCoach?.busy?'Looking…':'Look & advise';}
  sceneCoach?.onState(refreshLook);setInterval(refreshLook,1000);
  coach.onState(describe);
  coach.onCaption(entry=>{
    const text=String(entry.delta||'');if(!text)return;
    const now=Date.now(),turn=current[entry.role];
    // A learner line well after the coach's last words starts the next exchange, so the following answer gets its own line below the question.
    if(entry.role==='learner'&&current.coach&&now-current.coach.at>=LEARNER_TURN_MS)current.coach=null;
    if(turn&&!entry.source&&now-turn.at<CAPTION_GAP_MS&&turn.el.isConnected){turn.el.textContent+=text;turn.at=now;return;}
    current[entry.role]={el:line(entry.role,text),at:now};
  });
  $('coach-start').onclick=async()=>{
    const tutorial=guide.tutorial;
    if(!tutorial.steps.length){tell('Record or open a tutorial before starting the coach.');return;}
    $('coach-start').disabled=true;
    try{const state=await coach.start(tutorial,tutorial.steps[0],guide.epoch||0);if(state.reason==='unpaired')$('coach-code').focus();}
    catch(e){tell(e.message);}
    finally{$('coach-start').disabled=false;}
  };
  pairForm.onsubmit=event=>{event.preventDefault();$('coach-pair-button').click();};
  $('coach-pair-button').onclick=async()=>{
    const result=await coach.pair($('coach-code').value);
    if(result.ok){$('coach-code').value='';status.textContent=`Paired as ${result.role}. Start the coach.`;}else tell(result.message);
  };
  $('coach-ask').onclick=()=>coach.ask();
  $('coach-look').onclick=()=>{const question=$('coach-question').value.trim();void sceneCoach?.look(question||undefined);};
  $('coach-ask-text').onclick=async()=>{
    const question=$('coach-question').value.trim();if(!question)return;
    current.learner=null;current.coach=null;line('learner',question);$('coach-question').value='';
    const answer=await coach.askText(question);if(!answer)tell('Start the coach before asking.');
  };
  $('coach-question').onkeydown=event=>{if(event.key==='Enter'){event.preventDefault();$('coach-ask-text').click();}};
  $('coach-stop').onclick=()=>{sceneCoach?.stop();coach.stop();};
  // A coach started for one tutorial must not keep answering after the expert swaps or edits it: the published guide no longer matches.
  const previous=guide.onChange;
  guide.onChange=()=>{
    previous?.();
    if(coach.active&&(guide.tutorial.id!==coach.tutorialId||guide.tutorial.revision!==coach.tutorialRevision)){
      sceneCoach?.stop();coach.stop();status.textContent='Coach stopped because the tutorial changed. Start it again for the current steps.';
    }
  };
  describe(coach.state);
}
