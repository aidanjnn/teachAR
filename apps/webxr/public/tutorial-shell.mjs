import {applyAppearance} from './tutorial-design.mjs';
import {enhanceSelects} from './tutorial-select.mjs';
import {newTutorial,validateTutorial} from './tutorial-core.mjs';
import {listTutorials,findTutorial} from './tutorial-store.mjs';
export function mountTutorialShell(guide,{isActive,tell}){
 const $=id=>document.getElementById(id);let route='home',generation=0;
 const locked=()=>{if(isActive())throw Error('Exit AR before changing tutorials.');};
 const run=fn=>{Promise.resolve().then(()=>{locked();return fn();}).catch(e=>tell(e.message));};
 function show(next){
  route=next;document.querySelectorAll('[data-screen]').forEach(e=>e.hidden=e.dataset.screen!==next);
  document.querySelectorAll('[data-route]').forEach(e=>e.setAttribute('aria-current',e.dataset.route===next?'page':'false'));
  guide.nextEntry=next==='create'?'create':'home';
  $('launch-title').textContent=next==='create'?'Continue creating in AR.':'Enter your spatial workshop.';
  $('launch-help').textContent=next==='create'?'Enter AR to place your workspace and record a movement.':'Choose Create or Follow inside AR. Your recordings stay on this browser.';
  if(next==='library')void library();
 }
 async function library(){
  const mine=++generation;try{
   const items=await listTutorials();if(mine!==generation)return;
   const host=$('tutorial-library');host.replaceChildren();
   for(const t of items.filter(t=>t.steps.length).map(validateTutorial)){
    const row=document.createElement('div');row.className='library-item';row.setAttribute('role','listitem');
    const info=document.createElement('div'),title=document.createElement('strong'),meta=document.createElement('p'),button=document.createElement('button');
    title.textContent=t.title;meta.textContent=`${t.steps.length} recordings · ${t.completion?'Ready to follow':'Draft — needs review'}`;
    button.textContent=t.completion?'Follow tutorial':'Review draft';button.dataset.tutorialEdit='';button.disabled=isActive();
    button.onclick=()=>run(async()=>{await guide.replaceTutorial(validateTutorial(await findTutorial(t.id)));if(t.completion){show('home');guide.nextEntry='follow';$('launch-title').textContent=`Follow: ${t.title}`;$('launch-help').textContent='Enter AR to check the starting setup and place the tutorial in your workspace.';}else show('review');});
    info.append(title,meta);row.append(info,button);host.append(row);
   }
   $('library-status').textContent=host.children.length?'':'No recordings yet. Create a tutorial to start.';
  }catch(e){$('library-status').textContent=e.message;}
 }
 document.querySelectorAll('[data-route]').forEach(b=>b.onclick=()=>run(()=>show(b.dataset.route)));
 $('create-tutorial').onclick=()=>run(async()=>{await guide.replaceTutorial(newTutorial(`Tutorial ${new Date().toLocaleDateString()}`));$('tutorial-instructions').value='';show('create');});
 $('ready-create').onclick=()=>run(async()=>{
  const next=structuredClone(guide.tutorial);next.title=$('tutorial-title').value.trim()||'Untitled tutorial';
  const layout=$('tutorial-setup').value.trim()||($('setup-from-pose').checked?'Arrange the task relative to the recorded first hand pose and any saved reference photo.':'');
  if(!layout)throw Error('Describe the starting setup, or choose “Use the first hand pose.”');
  if(next.setup!==layout)next.steps.forEach(s=>s.reviewed=false);next.setup=layout;next.revision++;
  await guide.replaceTutorial(next);guide.nextEntry='create';$('setup-status').textContent='Setup saved. Choose Enter Trail AR below.';$('enter').scrollIntoView({behavior:'smooth',block:'center'});
 });
 const updateAppearance=()=>{applyAppearance(guide.appearance);$('appearance-toggle').textContent=`Appearance: ${guide.appearance.theme==='light'?'Warm gray':'Charcoal'}`;$('event-sounds').textContent=`Event sounds: ${guide.appearance.sound?'On':'Off'}`;$('event-sounds').setAttribute('aria-pressed',String(guide.appearance.sound));};
 $('appearance-toggle').onclick=()=>{guide.appearance.theme=guide.appearance.theme==='light'?'charcoal':'light';updateAppearance();};
 $('event-sounds').onclick=()=>{guide.appearance.sound=!guide.appearance.sound;updateAppearance();};
 enhanceSelects();updateAppearance();
 const previous=guide.onChange;guide.onChange=()=>{previous?.();updateAppearance();$('shell-save').textContent=guide.savedMessage;$('continue-draft').hidden=!guide.tutorial.steps.length;if(route==='library')void library();};
 const synthetic=$('load-synthetic').onclick;$('load-synthetic').onclick=()=>{show('review');synthetic();};
 guide.ux=true;guide.mode='home';guide.nextEntry='home';guide.onChange();show('home');
 return {show};
}
