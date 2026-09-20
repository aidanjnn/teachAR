import test from 'node:test';import assert from 'node:assert/strict';
import {CaptureSetup} from '../public/experience-entry.mjs';
test('optional capture setup combines successes and permission failures',async()=>{
 const setup=new CaptureSetup({camera:async()=>{throw Error('Denied');},microphone:async()=>{},stopCamera:()=>{},stopMicrophone:()=>{}});
 const result=await setup.enable();assert.equal(result.camera,false);assert.equal(result.microphone,true);assert.deepEqual(result.errors,['camera: Denied']);assert.equal(setup.pending,false);
});
test('cancelled capture setup cannot enable the next resource or publish readiness',async()=>{
 let finish,microphones=0,stopped=0;
 const setup=new CaptureSetup({camera:()=>new Promise(r=>finish=r),microphone:async()=>microphones++,stopCamera:()=>stopped++,stopMicrophone:()=>stopped++});
 const pending=setup.enable();setup.cancel();finish();assert.equal(await pending,null);assert.equal(microphones,0);assert.equal(stopped,2);
});
