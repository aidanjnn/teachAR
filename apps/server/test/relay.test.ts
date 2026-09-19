import { once } from 'node:events';
import Fastify from 'fastify';
import WebSocket from 'ws';
import { expect, it } from 'vitest';
import { type GuideEvent } from '@trail/contracts';
import { createPairingAuthority, registerPairingRoutes } from '../src/auth/pairing.js';
import { SpectatorRelay } from '../src/sessions/relay.js';
import fixture from '../../../fixtures/contracts/guide-event.json';

it('relays only native learner authority, restores a full snapshot and rejects spectator control', { timeout: 20000 }, async () => {
  const app=Fastify(); const auth=createPairingAuthority({allowedOrigins:['http://127.0.0.1:3406'],allowUsbLoopback:true}); const relay=new SpectatorRelay();
  await relay.register(app,auth); registerPairingRoutes(app,auth); await app.listen({host:'127.0.0.1',port:0});
  const address=app.server.address(); if(typeof address!=='object'||!address)throw new Error('address'); const origin=`http://127.0.0.1:${address.port}`;
  const pair=async(role:'learner'|'spectator')=>(await app.inject({method:'POST',url:'/api/pair',headers:{host:`127.0.0.1:${address.port}`},payload:{code:auth.issueCode(role).code,client:'native'}})).json().token as string;
  const learner=await pair('learner'); const spectator=await pair('spectator'); const headers={host:`127.0.0.1:${address.port}`,authorization:`Bearer ${learner}`};
  const connect=async()=> { const ws=new WebSocket(origin.replace('http','ws')+'/ws',{headers:{authorization:`Bearer ${spectator}`}}); const messages: unknown[]=[]; ws.on('message',raw=>messages.push(JSON.parse(raw.toString()))); await once(ws,'open'); return {ws,messages}; };
  const sockets:WebSocket[]=[];
  try {
    const event={...fixture,sessionId:auth.sessionId,seq:1} as GuideEvent;
    const response=await app.inject({method:'POST',url:'/api/guide-events',headers,payload:event}); expect(response.statusCode,response.body).toBe(204);
    const first=await connect();sockets.push(first.ws); await new Promise(resolve=>setTimeout(resolve,20));
    expect((first.messages.at(-1) as {snapshot:GuideEvent}).snapshot.seq).toBe(1);
    const duplicate=await app.inject({method:'POST',url:'/api/guide-events',headers,payload:{...event,seq:0}}); expect(duplicate.statusCode).toBe(409);
    first.ws.close();await once(first.ws,'close');const second=await connect();sockets.push(second.ws);await new Promise(resolve=>setTimeout(resolve,20));
    expect((second.messages.at(-1) as {snapshot:GuideEvent}).snapshot.runId).toBe(event.runId);
    const closed=once(second.ws,'close'); second.ws.send(JSON.stringify(event)); const [code]=await closed;expect(code).toBe(1008);
    expect((await app.inject({method:'POST',url:'/api/guide-events',headers:{...headers,authorization:`Bearer ${spectator}`},payload:event})).statusCode).toBe(403);
  } finally { for(const socket of sockets)socket.terminate();await app.close(); }
});
