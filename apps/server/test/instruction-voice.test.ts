import Fastify from 'fastify';
import { afterEach, expect, it, vi } from 'vitest';
import { registerVoiceRoutes } from '../src/routes/voice.js';
import { createMockProvider } from '../src/ai/mock.js';
import { createPairingAuthority } from '../src/auth/pairing.js';
import type { AiProvider } from '../src/ai/provider.js';
import { buildLabelPrompt } from '../src/ai/labels.js';

afterEach(()=>vi.restoreAllMocks());
const transcript={schemaVersion:1 as const,source:'model' as const,model:'test',language:'en',audioDurationMs:1000,spans:[{id:'one',startMs:0,endMs:900,text:'Um bring the left corner to the right, then crease. Save it.'}]};
const provider:AiProvider={...createMockProvider({transcriptFixturePath:'fixtures/narration-transcript.v1.json'}),name:'openai',transcribe:async()=>transcript,label:async()=>({schemaVersion:1,labels:[{stepId:'instruction',title:'Fold in half',instruction:'Bring the left corner to the right corner. Crease the fold.',narrationSpanIds:['one'],needsReview:false}],provenance:{labels:'model',model:'test',promptVersion:'test'},failure:null}),speak:async()=>new Uint8Array([1,2,3])};
function wav(){const b=Buffer.alloc(32044);b.write('RIFF');b.writeUInt32LE(b.length-8,4);b.write('WAVEfmt ',8);b.writeUInt32LE(16,16);b.writeUInt16LE(1,20);b.writeUInt16LE(1,22);b.writeUInt32LE(16000,24);b.writeUInt32LE(32000,28);b.writeUInt16LE(2,32);b.writeUInt16LE(16,34);b.write('data',36);b.writeUInt32LE(32000,40);return b;}
async function appWith(p=provider,auth?:ReturnType<typeof createPairingAuthority>){const app=Fastify();await registerVoiceRoutes(app,p,{...(auth?{auth}:{})});return app;}
it('drafts from real narration, returns original transcript, then speaks only approved text',async()=>{
 let now=10000;vi.spyOn(Date,'now').mockImplementation(()=>now);const speak=vi.fn(provider.speak!),app=await appWith({...provider,speak});
 try{
 const draft=await app.inject({method:'POST',url:'/api/voice/polish',headers:{'content-type':'audio/wav'},payload:wav()});expect(draft.statusCode).toBe(200);expect(draft.json().transcript).toContain('Um');expect(speak).not.toHaveBeenCalled();
 expect((await app.inject({method:'POST',url:'/api/voice/instruction-audio',payload:{text:'Do it'}})).statusCode).toBe(400);
 now+=2100;const audio=await app.inject({method:'POST',url:'/api/voice/instruction-audio',payload:{text:draft.json().instruction,approved:true}});expect(audio.statusCode).toBe(200);expect(audio.headers['content-type']).toContain('audio/mpeg');expect(speak.mock.calls[0]?.[0]).toBe(draft.json().instruction);
 }finally{await app.close();}
});
it('rejects mock speech, malformed PCM and fallback labels',async()=>{
 for(const p of [{...provider,transcribe:async()=>({...transcript,source:'fixture' as const})},{...provider,label:async()=>({...await provider.label({} as never,AbortSignal.timeout(1000)),provenance:{labels:'fallback' as const,model:null,promptVersion:'test'}})}]){
 const app=await appWith(p);try{expect((await app.inject({method:'POST',url:'/api/voice/polish',headers:{'content-type':'audio/wav'},payload:wav()})).statusCode).toBe(503);}finally{await app.close();}}
 const app=await appWith();try{const b=wav();b.writeUInt32LE(48000,24);expect((await app.inject({method:'POST',url:'/api/voice/polish',headers:{'content-type':'audio/wav'},payload:b})).statusCode).toBe(400);}finally{await app.close();}
});
it('enforces author role before paid calls',async()=>{
 const auth=createPairingAuthority({allowedOrigins:["http://localhost:4345"],allowUsbLoopback:true}),app=await appWith(provider,auth);
 try{expect((await app.inject({method:'POST',url:'/api/voice/instruction-audio',payload:{text:'Fold.',approved:true}})).statusCode).toBe(401);}finally{await app.close();}
});
it('caps authoring including failures and bounds input',async()=>{
 let now=10000;vi.spyOn(Date,'now').mockImplementation(()=>now);const speak=vi.fn(async()=>{throw Error('offline');}),app=await appWith({...provider,speak});
 try{for(let i=0;i<48;i++){now+=2100;expect((await app.inject({method:'POST',url:'/api/voice/instruction-audio',payload:{text:'Fold.',approved:true}})).statusCode).toBe(503);}now+=2100;expect((await app.inject({method:'POST',url:'/api/voice/instruction-audio',payload:{text:'Fold.',approved:true}})).statusCode).toBe(429);expect(speak).toHaveBeenCalledTimes(48);expect((await app.inject({method:'POST',url:'/api/voice/instruction-audio',payload:{text:'a'.repeat(241),approved:true}})).statusCode).toBe(400);}finally{await app.close();}
});
it('prompt removes filler and control chatter while preserving conditions and missing context',()=>{
 const prompt=buildLabelPrompt({schemaVersion:1,segments:[{id:'instruction',startMs:0,endMs:1000}],transcript});expect(prompt.instructions).toContain('Remove fillers');expect(prompt.instructions).toContain('negation');expect(prompt.instructions).toContain('Do not guess');
});
