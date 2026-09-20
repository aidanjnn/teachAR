import { z } from 'zod';
import type { FastifyInstance,RouteShorthandOptions } from 'fastify';
import type { AiProvider } from '../ai/provider.js';
import { LandmarkSuggestions } from '../ai/landmarks.js';
const image=z.string().max(700000).regex(/^data:image\/jpeg;base64,[A-Za-z0-9+/]+=*$/);
const Input=z.object({consent:z.literal(true),image,reference:z.object({image,landmarks:LandmarkSuggestions.shape.landmarks}).optional()}).strict();
export function registerLandmarks(app:FastifyInstance,provider:AiProvider,guard:RouteShorthandOptions){
 let attempts=0,busy=false;
 app.post('/api/workspace/landmarks',{...guard,bodyLimit:1500000},async(request,reply)=>{
  reply.header('Cache-Control','no-store');const parsed=Input.safeParse(request.body);
  if(!parsed.success)return reply.code(400).send({message:'Provide a JPEG workspace view and explicit photo-sharing consent.'});
  if(!provider.landmarks||provider.name!=='openai')return reply.code(503).send({message:'Visual setup is unavailable. You can still mark two landmarks manually.'});
  if(busy||attempts>=24)return reply.code(429).send({message:'Visual setup is busy or its allowance is used. Manual marking remains available.'});
  busy=true;attempts++;
  try{return LandmarkSuggestions.parse(await provider.landmarks({image:parsed.data.image,...(parsed.data.reference?{reference:parsed.data.reference}:{})},AbortSignal.timeout(18000)));}
  catch{return reply.code(503).send({message:'Could not identify dependable landmarks. Clear the view or use manual marking.'});}
  finally{busy=false;}
 });
}
