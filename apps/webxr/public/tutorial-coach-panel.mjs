// Desktop-page controls for the voice coach. Start here, before entering AR; the headset panel only exposes Ask.
export function mountCoachPanel(guide,coach,{tell}){
  const $=id=>document.getElementById(id);
  const log=$('coach-log'),mode=$('coach-mode'),status=$('coach-status'),pairForm=$('coach-pair');
  let lastRole=null,lastItem=null;
  function line(role,text){
    const li=document.createElement('li');li.dataset.role=role;li.textContent=`${role==='coach'?'Coach':'You'}: ${text}`;log.append(li);
    while(log.children.length>40)log.firstChild.remove();lastRole=role;lastItem=li;log.scrollTop=log.scrollHeight;
  }
  function describe(state){
    mode.textContent=state.mode;mode.dataset.mode=state.mode;
    const bits=[];
    if(state.pairing==='unpaired')bits.push('Pair this browser with the server first.');
    else if(state.pairing==='paired')bits.push(`Paired as ${state.role}.`);
    else if(state.pairing==='none')bits.push('Server without pairing: coaching from the steps in this browser.');
    if(state.mode==='connecting')bits.push('Connecting…');
    else if(state.mode==='live')bits.push('Live voice ready. Press Ask, or choose Ask coach inside AR, then speak.');
    else if(state.mode==='listening')bits.push('Listening…');
    else if(state.mode==='text')bits.push('Text answers only; live voice is not available from this server.');
    if(state.mode!=='idle'&&state.grounded===false)bits.push(`Answers use this browser's step text, not server-reviewed text${state.reason?` (${state.reason})`:''}.`);
    if(state.error)bits.push(state.error);
    status.textContent=bits.join(' ');
    pairForm.hidden=state.pairing!=='unpaired';
    for(const id of ['coach-ask','coach-ask-text','coach-stop'])$(id).disabled=!coach.active;
  }
  coach.onState(describe);
  coach.onCaption(entry=>{
    const text=String(entry.delta||'');if(!text)return;
    if(entry.role===lastRole&&lastItem&&!entry.source){lastItem.textContent+=text;return;}
    line(entry.role,text);
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
  $('coach-ask-text').onclick=async()=>{
    const question=$('coach-question').value.trim();if(!question)return;
    lastRole=null;line('learner',question);$('coach-question').value='';
    const answer=await coach.askText(question);if(!answer)tell('Start the coach before asking.');
  };
  $('coach-question').onkeydown=event=>{if(event.key==='Enter'){event.preventDefault();$('coach-ask-text').click();}};
  $('coach-stop').onclick=()=>coach.stop();
  // A coach started for one tutorial must not keep answering after the expert swaps or edits it: the published guide no longer matches.
  const previous=guide.onChange;
  guide.onChange=()=>{
    previous?.();
    if(coach.active&&(guide.tutorial.id!==coach.tutorialId||guide.tutorial.revision!==coach.tutorialRevision)){
      coach.stop();status.textContent='Coach stopped because the tutorial changed. Start it again for the current steps.';
    }
  };
  describe(coach.state);
}
