import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
import { createApp } from '../src/app.js';
import { readConfig } from '../src/config.js';
import { createMockProvider } from '../src/ai/mock.js';
import { createPairingAuthority } from '../src/auth/pairing.js';
import type { AiProvider } from '../src/ai/provider.js';
import { commandAudioDuration } from '../src/routes/voice-commands.js';
import { voiceIntentPrompt, VoiceIntentSchema } from '../src/ai/voice-intent.js';
const dirs:string[]=[];
afterEach(async()=>{vi.restoreAllMocks();await Promise.all(dirs.splice(0).map(p=>rm(p,{recursive:true,force:true})));});
function wav(seconds=1){const b=Buffer.alloc(44+16000*2*seconds);b.write('RIFF');b.writeUInt32LE(b.length-8,4);b.write('WAVEfmt ',8);b.writeUInt32LE(16,16);b.writeUInt16LE(1,20);b.writeUInt16LE(1,22);b.writeUInt32LE(16000,24);b.writeUInt32LE(32000,28);b.writeUInt16LE(2,32);b.writeUInt16LE(16,34);b.write('data',36);b.writeUInt32LE(b.length-44,40);return b;}
const context={mode:'learn',allowed:['pause','replay'],step:{title:'First fold',instruction:'Lift the edge.'}};
const headers={'content-type':'audio/wav','x-trail-voice-context':encodeURIComponent(JSON.stringify(context))};
const provider:AiProvider={...createMockProvider({transcriptFixturePath:'fixtures/narration-transcript.v1.json'}),name:'openai',transcribe:async()=>({schemaVersion:1,source:'model',model:'test',language:'en',audioDurationMs:1000,spans:[{id:'one',startMs:0,endMs:900,text:'I did not get that'}]}),interpretCommand:async()=>({action:'replay',response:''})};
async function appWith(p:AiProvider=provider,auth?:ReturnType<typeof createPairingAuthority>){const dir=await mkdtemp(join(tmpdir(),'trail-commands-'));dirs.push(dir);return createApp(readConfig({DATA_DIR:dir}),{provider:p,...(auth?{auth}:{})});}
it('validates actual PCM duration and rejects disguised or oversized audio',()=>{expect(commandAudioDuration(wav())).toBe(1000);expect(commandAudioDuration(wav(7))).toBeNull();expect(commandAudioDuration(Buffer.alloc(44))).toBeNull();const b=wav();b.writeUInt16LE(2,22);expect(commandAudioDuration(b)).toBeNull();});
it('transcribes then interprets context; limits overlapping calls and total attempts',async()=>{
 let now=10000,calls=0;vi.spyOn(Date,'now').mockImplementation(()=>now);const app=await appWith({...provider,interpretCommand:async(_text,c)=>{calls++;expect(c.mode).toBe('learn');return {action:'replay',response:''};}});
 try{const post=()=>app.inject({method:'POST',url:'/api/voice/commands',headers,payload:wav()});const first=await post();expect(first.statusCode).toBe(200);expect(first.json()).toMatchObject({action:'replay',attempts:1});expect((await post()).statusCode).toBe(429);
 for(let i=1;i<120;i++){now+=3000;expect((await post()).statusCode).toBe(200);}now+=3000;expect((await post()).statusCode).toBe(429);expect(calls).toBe(120);
 }finally{await app.close();}
});
it('rejects fixture speech and invalid context without letting text control the tutor',async()=>{
 const app=await appWith({...provider,transcribe:async()=>({...await provider.transcribe({} as never),source:'fixture'})});try{expect((await app.inject({method:'POST',url:'/api/voice/commands',headers,payload:wav()})).statusCode).toBe(503);expect((await app.inject({method:'POST',url:'/api/voice/commands',headers:{'content-type':'audio/wav'},payload:wav()})).statusCode).toBe(400);}finally{await app.close();}
});
it('unpaired/spectator callers cannot spend credits; paired learners can',async()=>{
 const auth=createPairingAuthority({allowedOrigins:['http://localhost:3401'],allowUsbLoopback:true}),app=await appWith(provider,auth);try{
 const host={host:'localhost:3401'};expect((await app.inject({method:'POST',url:'/api/voice/commands',headers:{...headers,...host},payload:wav()})).statusCode).toBe(401);
 for(const role of ['spectator','learner'] as const){const r=await app.inject({method:'POST',url:'/api/pair',headers:host,payload:{code:auth.issueCode(role).code,client:'native'}});const res=await app.inject({method:'POST',url:'/api/voice/commands',headers:{...headers,...host,authorization:`Bearer ${r.json().token}`},payload:wav()});expect(res.statusCode).toBe(role==='spectator'?403:200);}
 }finally{await app.close();}
});
it('unavailable model actions are rejected and parser prompt separates uncertainty from navigation',async()=>{
 const app=await appWith({...provider,interpretCommand:async()=>({action:'finish',response:'Done!'})});try{const r=await app.inject({method:'POST',url:'/api/voice/commands',headers,payload:wav()});expect(r.json().action).toBe('none');}finally{await app.close();}
 const prompt=voiceIntentPrompt('I did not get that',{...context,allowed:['replay']});expect(prompt.instructions).toContain('CURRENT step');expect(prompt.instructions).toContain('never verification');expect(VoiceIntentSchema.safeParse({action:'delete',response:''}).success).toBe(false);
});
it('permits only one bounded speech reply per command ticket',async()=>{
 let spoken=0;const app=await appWith({...provider,speak:async()=>{spoken++;return new Uint8Array([1,2,3]);}});try{
 const command=await app.inject({method:'POST',url:'/api/voice/commands',headers,payload:wav()});const ticket=command.json().speechTicket;
 const reply=()=>app.inject({method:'POST',url:'/api/voice/speech',payload:{ticket,text:'Let’s watch this step again.'}});
 expect((await reply()).statusCode).toBe(200);expect((await reply()).statusCode).toBe(403);expect(spoken).toBe(1);
 }finally{await app.close();}
});
