import test from 'node:test';
import assert from 'node:assert/strict';
import {COMMAND_PHRASES,TranscriptCommandMatcher,matchCommand,normalizeUtterance} from '../public/local-commands.mjs';

const ALL=Object.keys(COMMAND_PHRASES);

test('normalization strips punctuation, case and polite edges but keeps the words',()=>{
 assert.equal(normalizeUtterance('Okay coach, GO BACK please!'),'go back');
 assert.equal(normalizeUtterance(" Hey Trail, can you save it now? "),'save it');
 assert.equal(normalizeUtterance("I didn’t get that."),"i didn't get that");
 assert.equal(normalizeUtterance('Please please pause, thanks'),'pause');
});

test('exact phrases map to actions; questions that merely contain a command word never match',()=>{
 assert.deepEqual(matchCommand('Go back please.',ALL),{action:'previous',utterance:'go back'});
 assert.equal(matchCommand('Save it now',ALL).action,'save');
 assert.equal(matchCommand("I didn't get that",ALL).action,'replay');
 assert.equal(matchCommand('What happens when I press save?',ALL),null);
 assert.equal(matchCommand('Is the next step harder than this one?',ALL),null);
 assert.equal(matchCommand('next step',['pause','resume']),null,'a phrase for an action the screen does not allow is ignored');
 assert.equal(matchCommand('x'.repeat(90),ALL),null);
 assert.equal(matchCommand('',ALL),null);
});

test('the matcher waits for a sentence end or a pause, evaluates once, then starts fresh',async()=>{
 const fired=[];let allowed=ALL;const timers=new Map();let id=0;
 const matcher=new TranscriptCommandMatcher({allowed:()=>allowed,onCommand:(action,utterance)=>fired.push([action,utterance]),quietMs:600,schedule:(fn,ms)=>{const key=++id;timers.set(key,{fn,ms});return key;},cancel:key=>timers.delete(key)});
 // Word-by-word deltas, no punctuation yet: nothing fires until the quiet timer.
 matcher.push(' go');matcher.push(' back');
 assert.deepEqual(fired,[]);assert.equal(timers.size,1);
 const [pending]=timers.values();assert.equal(pending.ms,600);pending.fn();
 assert.deepEqual(fired,[['previous','go back']]);
 // A sentence end evaluates immediately and the buffer is empty afterwards.
 matcher.push(' Save it now.');
 assert.deepEqual(fired.at(-1),['save','save it']);
 assert.equal(matcher.buffer,'');
 // A question never fires, and a coach turn or stop resets whatever was buffered.
 matcher.push(' what is the next');matcher.reset();matcher.push(' step?');
 assert.equal(fired.length,2);
 // The allowed list is read at evaluation time, so a screen change between the words and the pause is respected.
 matcher.push(' next step');allowed=['pause'];const [late]=timers.values();late.fn();
 assert.equal(fired.length,2);
});
