import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { JOINT_NAMES, OPENXR_JOINT_MAP, RecordingSchema, parseTutorialForRecording, type Pose, type Tutorial } from '../src/index.js';
const dir = process.argv[2] ?? 'fixtures/contracts'; mkdirSync(dir, { recursive: true });
function save(name: string, value: unknown) { writeFileSync(`${dir}/${name}.json`, JSON.stringify(value, null, 2) + '\n'); }
const pose = (x: number, y: number, z: number): Pose => ({ positionM: [x, y, z], orientationXyzw: [0, 0, 0, 1] });
const workspace = { id: 'mat-v1', version: 1 as const, widthM: 0.6, depthM: 0.4, calibrationMarksM: { A: [0,0,0], B: [0.6,0,0], C: [0,0,-0.4], D: [0.6,0,-0.4] }, layoutId: 'synthetic-layout', dominantHand: 'right' as const, calibrationMethod: 'three-point-index-tip-v1' as const };
const recording = RecordingSchema.parse({ schemaVersion: 1, id: 'contract-recording', coordinateFrame: 'workspace', workspace, jointOrder: JOINT_NAMES, nominalSampleHz: 30, durationMs: 100,
  frames: [0, 40, 100].map((tMs, index) => ({ tMs, hands: Object.fromEntries(['left','right'].map(side => [side, { status:'valid', joints: Object.fromEntries(JOINT_NAMES.map((name, i) => [name, pose(index * 0.1 + i * 0.001, side === 'left' ? 0.2 : 0.1, -0.1)])) }])), head: null })), markers: [{ id:'start',tMs:0,kind:'step-start',source:'review' },{id:'end',tMs:100,kind:'step-end',source:'review'}], audio:null,source:'synthetic-fixture' });
save('recording', recording);
const hash = createHash('sha256').update(JSON.stringify(recording)).digest('hex');
const wrist = (frame: number) => { const hand = recording.frames[frame]!.hands.right; if (hand.status !== 'valid') throw Error(); return hand.joints.wrist; };
const tutorial: Tutorial = { schemaVersion:1,id:'tutorial-1',revision:1,recordingId:recording.id,recordingHash:hash,workspace:recording.workspace,status:'ready',steps:[{id:'step-1',title:'Move the synthetic hand',instruction:'Follow the path and hold at the checkpoint.',startFrame:0,endFrameExclusive:3,checkpointFrame:2,targets:[{side:'right',joint:'wrist',startPose:wrist(0),checkpointPose:wrist(2),positionToleranceM:0.04,orientationToleranceRad:null,gesture:'any',motionGates:[{frameIndex:1,positionM:wrist(1).positionM,toleranceM:0.05,dwellMs:100}],pathCorridorM:0.08}],dwellMs:500,startDwellMs:300,completionMode:'path-and-pose',narrationSpanIds:[]}],provenance:{segmentation:'explicit-markers',labels:'manual',model:null,promptVersion:'manual-v1'}};
parseTutorialForRecording(tutorial,recording,hash); save('tutorial',tutorial);
save('draft-edit',{baseRevision:1,steps:[{id:'step-1',startFrame:0,endFrameExclusive:3,checkpointFrame:2,activeHands:['right'],completionMode:'path-and-pose',title:'Move',instruction:'Move and hold.'}]});
const state={phase:'guiding',tutorialId:'tutorial-1',tutorialRevision:1,stepId:'step-1',stepRevision:1,attemptId:'attempt-1',dwellProgress:0,pathProgress:0.5,nextGateByHand:{right:1},calibrationValid:true,tracking:{left:'valid',right:'valid'}};
const envelope={schemaVersion:1,sessionId:'session-1',runId:'run-1',seq:1,tMs:100};
save('guide-event',{...envelope,type:'snapshot',state});
save('guide-tracking',{...envelope,type:'tracking-changed',state:{...state,phase:'tracking-lost',tracking:{left:'valid',right:'missing'}}});
save('guide-completed',{...envelope,type:'step-completed',stepId:'step-1',attemptId:'attempt-1',evidence:'user-confirmed'});
save('guide-ended',{...envelope,type:'guide-ended',reason:'cancelled'});
const native={schemaVersion:1,recordingId:recording.id,recordingHash:hash,trackingSessionId:'tracking-1',originRevision:1,provider:'synthetic',editorVersion:'fixture',sdkVersion:'fixture',skeleton:'openxr-26',adapterVersion:'canonical-v1',clock:{source:'native-monotonic',offsetToMonotonicMs:0,uncertaintyMs:0},confidencePolicy:'all-required-joints-valid',source:'synthetic-fixture'};
save('native-sidecar',native);
save('calibration-v2',{schemaVersion:2,id:'calibration-1',referenceSpaceType:'native-device',trackingSessionId:'tracking-1',originRevision:1,referenceFromWorkspace:pose(1,2,3),sampledReferencePointsM:[[1,2,3],[1.6,2,3],[1,2,2.6]],verificationErrorM:0,valid:true});
const reference={id:'reference-1',recordingId:recording.id,recordingHash:hash,tutorialId:tutorial.id,tutorialRevision:tutorial.revision,stepId:'step-1',assetId:'synthetic-image',source:'quest-camera',visibleOutcome:'The synthetic block is beside the marked square.'};
save('scene-references',{schemaVersion:1,recordingId:recording.id,recordingHash:hash,tutorialId:tutorial.id,tutorialRevision:tutorial.revision,references:[reference]});
const request={runId:'run-1',tutorialId:tutorial.id,tutorialRevision:1,stepId:'step-1',stepRevision:1,attemptId:'attempt-1',requestId:'request-1',liveSessionId:'session-1',sessionGeneration:1,requestEpoch:1,delegationId:null,question:'Is the block beside the square?',referenceIds:['reference-1']}; save('inspection-request',request);
save('scene-observation',{id:'observation-1',requestId:'request-1',captureNonce:'nonce-1',sourceSessionId:'source-1',source:'quest-camera',assetId:'image-1',sourceFrameSeq:15,captureAgeAtSendMs:30,receivedAtServerMonoMs:1000});
save('inspection-result',{request,observationId:'observation-1',referenceIds:['reference-1'],assessment:{verdict:'visible-match',observedEvidence:['The block is visibly beside the square.'],limitation:'This does not verify attachment or hidden surfaces.',feedback:'The visible placement matches the reviewed reference.',suggestedAction:'none'},provenance:'mock'});
const {frames, ...metadata}=recording; save('create-recording',{metadata}); save('motion-chunk',{frames,sha256:createHash('sha256').update(JSON.stringify(frames)).digest('hex')});save('finalize-recording',{chunkCount:1,sha256:hash});
// Synthetic service/native authoring envelopes; none are real media or recordings.
save('tutorial-job-create',{recordingId:recording.id,recordingHash:hash,segmentationRevision:1});
save('tutorial-finalize',{baseRevision:1});
save('reference-edit',{baseRevision:1,references:[reference]});
save('reference-image-upload',{recordingId:recording.id,recordingHash:hash,frameIndex:2,source:'workspace-webcam',image:{mimeType:'image/png',dataBase64:'c3ludGhldGlj',sha256:createHash('sha256').update('synthetic').digest('hex'),width:1,height:1}});
save('spectator-state',{type:'spectator-state',connected:false,updatedAt:0,ageMs:0,snapshot:null,step:null});
save('spectator-connected',{type:'spectator-state',connected:true,updatedAt:1000,ageMs:10,snapshot:{...envelope,type:'snapshot',state},step:{title:'Move the synthetic block',instruction:'Follow the fixture motion.',index:1,total:1,completionMode:'path-and-pose',source:'fallback'}});
save('tutorial-label-batch',{baseRevision:1,recordingHash:hash,labels:[{id:'step-1',title:'Move the synthetic block',instruction:'Follow the fixture motion.',narrationSpanIds:[]}],provenance:{labels:'fallback',model:null,promptVersion:'synthetic-v1'}});
save('recording-byte-chunk',{dataBase64:Buffer.from(JSON.stringify(recording)).toString('base64'),sha256:hash});
save('joint-map',{excludedNativeJoint:'XR_HAND_JOINT_PALM_EXT',canonicalToNative:OPENXR_JOINT_MAP});
// Independently specified rigid-transform/basis expected values (not outputs of the implementation).
const q=Math.SQRT1_2;
save('transforms',{cases:[
  {name:'translated',pose:pose(0.1,0.2,-0.3),referenceFromWorkspace:pose(1,2,3),expected:pose(1.1,2.2,2.7)},
  {name:'rotated-y-90',pose:pose(1,0,0),referenceFromWorkspace:{positionM:[1,2,3],orientationXyzw:[0,q,0,q]},expected:{positionM:[1,2,2],orientationXyzw:[0,q,0,q]}},
  {name:'rotated-z-90',pose:pose(1,0,0),referenceFromWorkspace:{positionM:[0,0,0],orientationXyzw:[0,0,q,q]},expected:{positionM:[0,1,0],orientationXyzw:[0,0,q,q]}},
],basisCases:[{pose:{positionM:[1,2,3],orientationXyzw:[q,0,0,q]},expected:{positionM:[1,2,-3],orientationXyzw:[-q,0,0,q]}}]});
const authoring = { schemaVersion: 1, tutorialId: 'synthetic-tutorial', takeIndex: 0,
  savePosition: { leftM: [0,0,0], rightM: [0.2,0,0] },
  trim: { startMs: 0, endMsExclusive: 101 }, trimReason: 'explicit-stop' };
save('take-authoring', authoring);
save('authored-capture', { schemaVersion: 1, recording, authoring });
const valid: [string,string][]=[['TakeAuthoringMetadata','take-authoring'],['AuthoredCapture','authored-capture'],['Recording','recording'],['Tutorial','tutorial'],['TutorialDraftEdit','draft-edit'],['GuideEvent','guide-event'],['GuideEvent','guide-tracking'],['GuideEvent','guide-completed'],['GuideEvent','guide-ended'],['NativeCaptureSidecar','native-sidecar'],['CalibrationV2','calibration-v2'],['SceneReferenceManifest','scene-references'],['InspectionRequest','inspection-request'],['SceneObservation','scene-observation'],['InspectionResult','inspection-result'],['CreateRecordingRequest','create-recording'],['MotionChunk','motion-chunk'],['FinalizeRecordingRequest','finalize-recording'],['TutorialJobCreate','tutorial-job-create'],['TutorialFinalize','tutorial-finalize'],['ReferenceEdit','reference-edit'],['ReferenceImageUpload','reference-image-upload'],['SpectatorState','spectator-state'],['SpectatorState','spectator-connected'],['TutorialLabelBatch','tutorial-label-batch'],['RecordingByteChunk','recording-byte-chunk']];
type Case={name:string;contract:string;file?:string;valid:boolean;patches?:{path:(string|number)[];value?:unknown;remove?:boolean}[];json?:string};
const cases:Case[]=valid.map(([contract,file])=>({name:`valid ${file}`,contract,file:`${file}.json`,valid:true}));
function bad(contract:string,file:string,name:string,path:(string|number)[],value?:unknown,remove=false){cases.push({name,contract,file:`${file}.json`,valid:false,patches:[{path,...(remove?{remove:true}:{value})}]});}
for (const [contract,file] of valid) {
  bad(contract,file,`${file} unknown field`,['unexpected'],true);
  bad(contract,file,`${file} missing field`,[Object.keys(JSON.parse(requireText(file)))[0]!],undefined,true);
  if (contract === 'MotionChunk') {
    bad(contract,file,'motion-chunk timestamp duplicate',['frames',1,'tMs'],0);
    bad(contract,file,'motion-chunk timestamp decreasing',['frames',2,'tMs'],20);
  }
}
function requireText(file:string){return readFileSync(`${dir}/${file}.json`, 'utf8');}
bad('TutorialJobCreate','tutorial-job-create','authoring zero segmentation revision',['segmentationRevision'],0);
bad('TutorialJobCreate','tutorial-job-create','authoring bad recording hash',['recordingHash'],'invalid');
bad('TutorialFinalize','tutorial-finalize','authoring fractional base revision',['baseRevision'],1.5);
bad('ReferenceEdit','reference-edit','authoring too many references',['references'],Array(65).fill(reference));
bad('ReferenceImageUpload','reference-image-upload','authoring unsupported image source',['source'],'synthetic-camera');
bad('ReferenceImageUpload','reference-image-upload','authoring invalid frame index',['frameIndex'],3600);
bad('SpectatorState','spectator-state','spectator negative age',['ageMs'],-1);
bad('TutorialLabelBatch','tutorial-label-batch','authoring empty label batch',['labels'],[]);
bad('TutorialLabelBatch','tutorial-label-batch','authoring unknown provenance',['provenance','labels'],'ai');
bad('RecordingByteChunk','recording-byte-chunk','byte chunk malformed base64',['dataBase64'],'!!!');
bad('RecordingByteChunk','recording-byte-chunk','byte chunk empty payload',['dataBase64'],'');
bad('RecordingByteChunk','recording-byte-chunk','byte chunk invalid hash',['sha256'],'G'.repeat(64));
bad('Recording','recording','unknown recording version',['schemaVersion'],2);
bad('Recording','recording','missing named joint',['frames',0,'hands','right','joints','wrist'],undefined,true);
bad('Recording','recording','extra palm',['frames',0,'hands','right','joints','palm'],pose(0,0,0));
bad('Recording','recording','zero quaternion',['frames',0,'hands','right','joints','wrist','orientationXyzw'],[0,0,0,0]);
bad('Recording','recording','short vec3',['frames',0,'hands','right','joints','wrist','positionM'],[0,0]);
bad('Recording','recording','timestamp duplicate',['frames',1,'tMs'],0);
bad('Recording','recording','duration outside limit',['durationMs'],120001);
bad('Recording','recording','frame beyond duration',['durationMs'],99);
bad('Recording','recording','duplicate marker',['markers',1,'id'],'start');
bad('Recording','recording','joint order mismatch',['jointOrder',0],'thumb-tip');
bad('Recording','recording','missing hand discriminator',['frames',0,'hands','left','status'],undefined,true);
bad('Recording','recording','missing sample cannot carry joints',['frames',0,'hands','left'],{status:'missing',reason:'unavailable',joints:{}});
bad('Tutorial','tutorial','duplicate target hand',['steps',0,'targets'],[tutorial.steps[0]!.targets[0],tutorial.steps[0]!.targets[0]]);
bad('Tutorial','tutorial','checkpoint outside range',['steps',0,'checkpointFrame'],3);
bad('Tutorial','tutorial','reversed range',['steps',0,'startFrame'],3);
bad('Tutorial','tutorial','path without gates',['steps',0,'targets',0,'motionGates'],[]);
bad('Tutorial','tutorial','gate at checkpoint',['steps',0,'targets',0,'motionGates',0,'frameIndex'],2);
bad('Tutorial','tutorial','gate at start',['steps',0,'targets',0,'motionGates',0,'frameIndex'],0);
bad('Tutorial','tutorial','overlapping steps',['steps'],[tutorial.steps[0],{...tutorial.steps[0],id:'step-2'}]);
bad('Tutorial','tutorial','hash invalid',['recordingHash'],'a'.repeat(64)+'\n');
bad('Tutorial','tutorial','model provenance missing',['provenance','labels'],'model');
bad('GuideEvent','guide-event','unknown guide event',['type'],'advance');
bad('GuideEvent','guide-event','unsafe seq',['seq'],9007199254740992);
bad('GuideEvent','guide-event','fractional revision',['state','stepRevision'],0.5);
bad('GuideEvent','guide-event','progress outside bounds',['state','dwellProgress'],1.1);
bad('GuideEvent','guide-event','incomplete attempt identity',['state','attemptId'],null);
bad('SceneReferenceManifest','scene-references','cross tutorial reference',['references',0,'tutorialRevision'],2);
bad('InspectionRequest','inspection-request','duplicate reference',['referenceIds'],['reference-1','reference-1']);
bad('InspectionResult','inspection-result','result reference mismatch',['referenceIds'],['reference-2']);
bad('InspectionResult','inspection-result','visual result lacks observation',['observationId'],null);
bad('InspectionResult','inspection-result','visual verdict lacks evidence',['assessment','observedEvidence'],[]);
bad('NativeCaptureSidecar','native-sidecar','legacy skeleton',['skeleton'],'ovr-24');
bad('CalibrationV2','calibration-v2','old calibration version',['schemaVersion'],1);
bad('CreateRecordingRequest','create-recording','metadata marker duplicate',['metadata','markers',1,'id'],'start');
for (const [name,json] of [['duplicate key','{"schemaVersion":1,"schemaVersion":1}'],['escaped duplicate key','{"id":1,"\\u0069d":2}'],['infinite exponent','1e999'],['trailing token','{} {}'],['trailing comma','{"a":1,}'],['leading zero','01'],['bad escape','"\\x"'],['control char','"\n"'],['comment','/*x*/{}'],['deep nesting','['.repeat(66)+'0'+']'.repeat(66)]] ) cases.push({name:name!,contract:'Recording',json:json!,valid:false});
// Duplicate-key cases are otherwise valid recordings so rejection cannot be
// accidentally explained by missing required fields.
for (const escaped of [false,true]) cases.push({name:escaped?'valid recording with escaped duplicate':'valid recording with duplicate key',contract:'Recording',valid:false,json:JSON.stringify(recording).replace('"schemaVersion":1', '"schemaVersion":1,"'+(escaped?'\\u0073chemaVersion':'schemaVersion')+'":1')});
const audio={assetId:'audio-1',mimeType:'audio/wav',durationMs:100,audioStartOffsetMs:0,syncMethod:'manual-markers',estimatedSyncErrorMs:null};
for (const [name,path,value] of [
  ['legacy audio',['audio'],audio],
  ['negative quaternion',['frames',0,'hands','right','joints','wrist','orientationXyzw'],[0,0,0,-1]],
  ['quaternion tolerance boundary',['frames',0,'hands','right','joints','wrist','orientationXyzw'],[0,0,0,0.9999]],
  ['zero coordinates',['frames',0,'hands','right','joints','wrist','positionM'],[0,0,0]],
  ['missing hand preserves explicit reason',['frames',1,'hands','left'],{status:'missing',reason:'nonfinite'}],
] as const) cases.push({name,contract:'Recording',file:'recording.json',valid:true,patches:[{path:[...path],value}]});
bad('Recording','recording','native audio cannot silently widen v1',['audio'],{...audio,syncMethod:'unity-dsp-clock-map'});
bad('Recording','recording','audio offset limit',['audio'],{...audio,audioStartOffsetMs:5001});
bad('Recording','recording','audio blob URL',['audio'],{...audio,assetId:'blob:test'});
bad('TakeAuthoringMetadata','take-authoring','save position out of workspace bounds',['savePosition','leftM',0],11);
bad('TakeAuthoringMetadata','take-authoring','reversed take trim',['trim','startMs'],102);
bad('TakeAuthoringMetadata','take-authoring','empty take trim',['trim','startMs'],101);
bad('TakeAuthoringMetadata','take-authoring','unsupported authoring version',['schemaVersion'],2);
bad('TakeAuthoringMetadata','take-authoring','negative take index',['takeIndex'],-1);
bad('AuthoredCapture','authored-capture','motion reaches excluded trim boundary',['authoring','trim','endMsExclusive'],100);
save('corpus',{cases});
