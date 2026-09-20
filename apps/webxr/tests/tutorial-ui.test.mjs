import test from 'node:test';
import assert from 'node:assert/strict';
import {tutorialView,uiButtons} from '../public/tutorial-ui.mjs';
import {TutorialFeedback} from '../public/tutorial-feedback.mjs';
const guide=mode=>({mode,tutorial:{steps:[],title:'Example',setup:''},player:{index:0,step:{}},endpoint:{returnSince:null,cutoff:()=>null},appearance:{theme:'charcoal',sound:true}});
test('all workflow controls fit the texture and never overlap another target',()=>{
 for(const mode of ['home','library','save-home','setup-new','setup-follow','start','end','placement','adjust-placement','author','author-options','capture','capture-paused','confirm-discard','confirm-exit','saving','review-step','review-options','trim','settings','saved','learn','learn-options','finished']){
  const g=guide(mode);g.trimRange=[0,3000];g.cleanSave=true;g.tutorial.steps=[{}];
  const buttons=uiButtons(tutorialView(g));
  for(const b of buttons){assert(b.x>=0&&b.y>=0&&b.x+b.w<=1080&&b.y+b.h<=560,`${mode}/${b.id} out of bounds`);assert(b.w>=100&&b.h>=44);}
  for(let i=0;i<buttons.length;i++)for(let j=i+1;j<buttons.length;j++){const a=buttons[i],b=buttons[j];assert(a.x+a.w<=b.x||b.x+b.w<=a.x||a.y+a.h<=b.y||b.y+b.h<=a.y,`${mode}: ${a.id}/${b.id} overlap`);}
 }
});
test('completion is not offered for a waiting, off-path or watch-only learner',()=>{
 const g=guide('learn');g.followEngine={state:'waiting',started:false,index:0,gates:[{}]};
 for(const state of ['waiting','following','tracking','reference-gap']){g.followEngine.state=state;assert(!tutorialView(g).buttons.some(b=>b.id==='primary'));}
 g.followEngine.done=true;g.followEngine.state='checkpoint';assert(tutorialView(g).buttons.some(b=>b.id==='primary'));
 g.watchOnly=true;assert(!tutorialView(g).buttons.some(b=>b.id==='primary'));
});
test('recording and practice use compact controls; setup and errors stay readable',()=>{
 assert(tutorialView(guide('capture')).compact);assert(tutorialView(guide('learn')).compact);
 assert(!tutorialView(guide('start')).compact);const g=guide('capture');g.problem='Failed';assert(!tutorialView(g).compact);
});
test('feedback is bounded, cooldown-limited and cleared on session reset',()=>{
 const f=new TutorialFeedback();assert.equal(f.visible(0),null);assert(f.emit('saved','Saved',100));assert.equal(f.emit('saved','Saved',101),null);assert.equal(f.visible(1900),null);
 assert(f.emit('error','Not saved',2000));assert.equal(f.visible(2500).kind,'error');f.clear();assert.equal(f.visible(2501),null);
});
