import {zodTextFormat} from 'openai/helpers/zod';import {LandmarkSuggestions} from '../src/ai/landmarks.js';
import Fastify from 'fastify';import {expect,it,vi} from 'vitest';
import {registerVoiceRoutes} from '../src/routes/voice.js';import {createMockProvider} from '../src/ai/mock.js';
const result={status:'uncertain',note:'Confirm orientation',landmarks:[{label:'Left corner',uv:[.2,.7]},{label:'Right corner',uv:[.8,.7]}]};
it('visual setup requires consent, bounds image points and fails closed on bad model output',async()=>{
 const landmarks=vi.fn(async()=>result),app=Fastify();await registerVoiceRoutes(app,{...createMockProvider({transcriptFixturePath:"unused"}),name:'openai',landmarks} as never);
 try{
  expect((await app.inject({method:'POST',url:'/api/workspace/landmarks',payload:{image:'data:image/jpeg;base64,/9j/'}})).statusCode).toBe(400);expect(landmarks).not.toHaveBeenCalled();
  const request={method:'POST' as const,url:'/api/workspace/landmarks',payload:{consent:true,image:'data:image/jpeg;base64,/9j/'}};
  const response=await app.inject(request);expect(response.statusCode).toBe(200);expect(response.json().status).toBe('uncertain');
  landmarks.mockResolvedValueOnce({...result,landmarks:[{label:'bad',uv:[99,0]}]});expect((await app.inject(request)).statusCode).toBe(503);
 }finally{await app.close();}
});

it('landmark schema is representable in strict model outputs',()=>{expect(()=>zodTextFormat(LandmarkSuggestions,'workspace_landmarks')).not.toThrow();});
