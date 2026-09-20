import test from 'node:test';
import assert from 'node:assert/strict';
import {TutorialPractice} from '../public/tutorial-follow.mjs';
const hand=x=>Array.from({length:25},()=>({p:[x,0,0]}));
const hands=x=>({left:hand(x),right:hand(x+.4)});
const step={guide_hands:'both',frames:[0,.1,0].flatMap((x,i)=>Array.from({length:5},(_,j)=>({t:(i*5+j)*40,...hands(x)})))};
test('a short out-and-back recording requires its excursion before automatic advancement',()=>{
 const practice=new TutorialPractice(step);practice.ready();let t=0;
 for(;t<5000;t+=40)practice.update(hands(0),t);
 assert.equal(practice.advance,false,'Stationary hands must not finish a recorded 10 cm excursion');
 assert.equal(practice.follower.done,false);
 assert(practice.follower.gates.some(g=>g.left[0].p[0]===.1),'The ghost must show the excursion');
 for(const x of [.1,0])for(let i=0;i<25;i++)practice.update(hands(x),t+=40);
 for(let i=0;i<35;i++)practice.update(hands(0),t+=40);
 assert.equal(practice.advance,true,'Following the complete excursion must still finish');
});
