import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import sharp from 'sharp';
import { expect, it } from 'vitest';
import { RecordingSchema, type GuideEvent, type VisionInspectionInput } from '@trail/contracts';
import { createAuthoringFixture } from '@trail/motion';
import { createApp } from '../src/app.js';
import { readConfig } from '../src/config.js';
import { createPairingAuthority } from '../src/auth/pairing.js';
import { TutorialRepository } from '../src/storage/repository.js';
import { ReferenceStore } from '../src/storage/references.js';
import { digest } from '../src/storage/files.js';
import { createVisionApp } from '../../vision/src/app.js';
import { readConfig as visionConfig } from '../../vision/src/config.js';

it('wires approved storage references through paused guide admission to the real vision HTTP boundary', { timeout: 30000 }, async () => {
  const root=await mkdtemp(join(tmpdir(),'trail-inspection-wiring-'));const token='synthetic-service-token-with-more-than-32-characters';
  let observed:VisionInspectionInput|undefined;
  const vision=createVisionApp(visionConfig({VISION_SERVICE_TOKEN:token}),{provider:{name:'mock',model:'explicit-test-provider',async assess(input){observed=input;return{verdict:'uncertain',observedEvidence:[],limitation:'Synthetic integration test only.',feedback:'Show another view.',suggestedAction:'show-another-view'};}}});
  await vision.listen({host:'127.0.0.1',port:0});const address=vision.server.address();if(!address||typeof address==='string')throw new Error('address');
  const auth=createPairingAuthority({allowedOrigins:['http://127.0.0.1:3406'],allowUsbLoopback:true});
  const app=await createApp(readConfig({DATA_DIR:root,VISION_SERVICE_URL:`http://127.0.0.1:${address.port}`,VISION_SERVICE_TOKEN:token}),{auth});
  try {
    const repo=new TutorialRepository(root);const refs=new ReferenceStore(repo);const recording=createAuthoringFixture();const{frames,...metadata}=recording;const upload=await repo.createRecording(metadata);recording.id=upload.id;
    const hash=digest(JSON.stringify(RecordingSchema.parse(recording)));await repo.upload(upload.id,0,frames,digest(JSON.stringify(frames)));await repo.finalizeRecording(upload.id,1,hash);
    const job=await repo.compile(upload.id,hash,1);let tutorial=await repo.tutorial(job.tutorialId!);
    tutorial=await repo.edit(tutorial.id,{baseRevision:1,steps:tutorial.steps.map(step=>({id:step.id,title:step.title,instruction:'Move the large part.',startFrame:step.startFrame,endFrameExclusive:step.endFrameExclusive,checkpointFrame:step.checkpointFrame,activeHands:step.targets.map(t=>t.side),completionMode:step.completionMode}))});
    const bytes=await sharp({create:{width:24,height:24,channels:3,background:'#226677'}}).png().toBuffer();const image={mimeType:'image/png' as const,dataBase64:bytes.toString('base64'),sha256:digest(bytes),width:24,height:24};
    const asset=await refs.upload({recordingId:upload.id,recordingHash:hash,frameIndex:tutorial.steps[0]!.checkpointFrame,source:'workspace-webcam',image});
    const reviewed=await refs.review(tutorial.id,{baseRevision:tutorial.revision,references:[{id:'reviewed-view',recordingId:upload.id,recordingHash:hash,tutorialId:tutorial.id,tutorialRevision:tutorial.revision,stepId:tutorial.steps[0]!.id,assetId:asset.id,source:'workspace-webcam',visibleOutcome:'Large part is visible.'}]});
    tutorial=await repo.finalizeTutorial(tutorial.id,reviewed.tutorial.revision);
    const paired=await app.inject({method:'POST',url:'/api/pair',headers:{host:'127.0.0.1:3406'},payload:{code:auth.issueCode('learner').code,client:'native'}});const headers={host:'127.0.0.1:3406',authorization:`Bearer ${paired.json().token}`};
    const context={runId:'run',tutorialId:tutorial.id,tutorialRevision:tutorial.revision,stepId:tutorial.steps[0]!.id,stepRevision:1,attemptId:'attempt'};
    const event:GuideEvent={schemaVersion:1,type:'snapshot',sessionId:auth.sessionId,runId:context.runId,seq:1,tMs:10,state:{phase:'paused',tutorialId:tutorial.id,tutorialRevision:tutorial.revision,stepId:context.stepId,stepRevision:1,attemptId:'attempt',dwellProgress:0,pathProgress:0,nextGateByHand:{right:0},calibrationValid:true,tracking:{left:'missing',right:'valid'}}};
    expect((await app.inject({method:'POST',url:'/api/guide-events',headers,payload:event})).statusCode).toBe(204);
    const lease=await app.inject({method:'POST',url:'/api/inspection-sessions',headers,payload:context});
    expect(lease.statusCode,lease.body).toBe(200);
    const start={schemaVersion:1,context,liveSessionId:lease.json().liveSessionId,sessionGeneration:1,requestEpoch:1,question:'What is visible?',sourceSessionId:'camera-test',source:'workspace-webcam',sourceFrameSeq:0};
    expect((await app.inject({method:'POST',url:'/api/inspections',headers,payload:{...start,liveSessionId:'invented-session'}})).statusCode).toBe(409);
    const capture=await app.inject({method:'POST',url:'/api/inspections',headers,payload:start});expect(capture.statusCode,capture.body).toBe(200);const instruction=capture.json();
    const result=await app.inject({method:'POST',url:'/api/scene-observations',headers,payload:{schemaVersion:1,requestId:instruction.request.requestId,requestEpoch:1,captureNonce:instruction.captureNonce,sourceSessionId:'camera-test',source:'workspace-webcam',sourceFrameSeq:1,captureAgeAtSendMs:1,image}});
    expect(result.statusCode,result.body).toBe(200);expect(result.json().provenance).toBe('mock');expect(observed?.approvedStep.instruction).toBe('Move the large part.');expect(observed?.references[0]?.reference.tutorialRevision).toBe(tutorial.revision);
    const resumed={...event,seq:2,state:{...event.state,phase:'guiding'}};expect((await app.inject({method:'POST',url:'/api/guide-events',headers,payload:resumed})).statusCode).toBe(204);
    expect((await app.inject({method:'POST',url:'/api/inspections',headers,payload:{...start,requestEpoch:2}})).statusCode).toBe(409);
  } finally {await app.close();await vision.close();await rm(root,{recursive:true,force:true});}
});
