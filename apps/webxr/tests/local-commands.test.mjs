import test from 'node:test';
import assert from 'node:assert/strict';
import {COMMAND_PHRASES,TranscriptCommandMatcher,matchCommand,normalizeUtterance} from '../public/local-commands.mjs';

const ALL=Object.keys(COMMAND_PHRASES);
// A fake clock and scheduler: fired or cancelled timers disappear, so a test always drives the timer it expects.
function clockAndTimers(){
 let now=0,id=0;const timers=new Map();
 return {now:()=>now,advance:ms=>{now+=ms;},schedule:(fn,ms)=>{const key=++id;timers.set(key,{fn,ms});return key;},cancel:key=>timers.delete(key),
  fire(){const [key,entry]=[...timers.entries()].at(-1)??[];if(!entry)return false;timers.delete(key);entry.fn();return true;},get pending(){return timers.size;}};
}
function matcher(overrides={}){
 const fired=[],seen=[],env=clockAndTimers();
 const m=new TranscriptCommandMatcher({allowed:()=>ALL,onCommand:(action,utterance)=>fired.push([action,utterance]),onUtterance:text=>seen.push(text),quietMs:600,now:env.now,schedule:env.schedule,cancel:env.cancel,...overrides});
 return {m,fired,seen,env};
}

test('normalization strips punctuation, case and polite edges but keeps the words',()=>{
 assert.equal(normalizeUtterance('Okay coach, GO BACK please!'),'go back');
 assert.equal(normalizeUtterance(" Hey Trail, can you save it now? "),'save it');
 assert.equal(normalizeUtterance("I didn’t get that."),"i didn't get that");
 assert.equal(normalizeUtterance('Please please pause, thanks'),'pause');
});

test('exact phrases map to actions; questions and one-word replies never do',()=>{
 assert.deepEqual(matchCommand('Go back please.',ALL),{action:'previous',utterance:'go back'});
 assert.equal(matchCommand('Save it now',ALL).action,'save');
 assert.equal(matchCommand("I didn't get that",ALL).action,'replay');
 assert.equal(matchCommand('What happens when I press save?',ALL),null);
 assert.equal(matchCommand('Is the next step harder than this one?',ALL),null);
 assert.equal(matchCommand('Next step?',ALL),null,'a one-phrase question with rising intonation is still a question');
 for(const word of ['again','continue','back','next','save','finish','record','home'])assert.equal(matchCommand(word,ALL),null,`"${word}" alone is conversation, not a command`);
 assert.equal(matchCommand('next step',['pause','resume']),null,'a phrase for an action the screen does not allow is ignored');
 assert.equal(matchCommand('x'.repeat(90),ALL),null);
 assert.equal(matchCommand('',ALL),null);
});

test('a fragmented question is judged as one sentence, so its tail cannot act alone',()=>{
 const {m,fired,env}=matcher();
 m.push(' What is the');env.fire();
 assert.deepEqual(fired,[]);
 env.advance(900);m.push(' next step?');
 assert.deepEqual(fired,[],'the question mark judged the joined sentence at once');
 // Same split without punctuation, closed by a pause.
 env.advance(500);m.push(' what is the');env.fire();env.advance(700);m.push(' next step');env.fire();
 assert.deepEqual(fired,[]);
 // After a real pause the same words are a fresh turn and a real command.
 env.advance(2500);m.push(' next step');env.fire();
 assert.deepEqual(fired,[['next','next step']]);
});

test('the matcher waits for a sentence end or a pause, flushes on a speaker change, and reads the allowed list when it judges',()=>{
 let allowed=ALL;const {m,fired,env}=matcher({allowed:()=>allowed});
 m.push(' go');m.push(' back');
 assert.deepEqual(fired,[]);assert.equal(env.pending,1);
 env.fire();
 assert.deepEqual(fired,[['previous','go back']]);
 env.advance(3000);m.push(' Save it now.');
 assert.deepEqual(fired.at(-1),['save','save it']);assert.equal(m.buffer,'');
 // The coach starts talking before the quiet timer: the pending command is judged, not dropped.
 env.advance(3000);m.push(' Pause');assert.equal(env.pending,1);m.flush();
 assert.deepEqual(fired.at(-1),['pause','pause']);assert.equal(env.pending,0);
 // The allowed list is read at evaluation time, so a screen change between the words and the pause is respected.
 env.advance(3000);m.push(' next step');allowed=['pause'];env.fire();
 assert.equal(fired.length,3);
 // Stop resets everything, including the sentence memory.
 m.push(' go');m.reset();assert.equal(m.buffer,'');assert.equal(m.previous,null);assert.equal(env.pending,0);
});

test('a very long turn stays quiet until the learner pauses, so an overflow never re-arms mid-sentence',()=>{
 const {m,fired,env}=matcher();
 m.push(' '+'blah '.repeat(60));
 assert.equal(m.suppressed,true);assert.equal(m.buffer,'');
 m.push(' so should I go to the next step');env.fire();
 assert.deepEqual(fired,[],'the tail of the long sentence did not act');
 env.advance(2500);m.push(' next step.');
 assert.deepEqual(fired,[['next','next step']],'a fresh turn after the pause works again');
});
