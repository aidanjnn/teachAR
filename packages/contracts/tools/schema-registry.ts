import { z } from 'zod';
import * as contracts from '../src/index.js';
// Explicit shared API schema exports, including legacy capture import compatibility.
// New transports require valid/invalid fixtures and compatibility notes.
export const CONTRACT_SCHEMA_NAMES = [
  'JointName', 'Side', 'Vec3', 'Quat', 'Pose', 'HandSample', 'MotionFrame', 'WorkspaceDefinition', 'Recording',
  'MotionGate', 'HandTarget', 'TutorialStep', 'TutorialProvenance', 'Tutorial', 'TutorialDraftStep', 'TutorialDraftEdit', 'CompletionMode',
  'GuideContextRef', 'GuideSnapshot', 'GuideEvent', 'CalibrationV2', 'ClockMapping', 'NativeCaptureSidecar',
  'SceneSource', 'StepSceneReference', 'SceneReferenceManifest', 'InspectionRequest', 'SceneObservation', 'CoachAssessment', 'InspectionResult',
  'RecordingMetadata', 'CreateRecordingRequest', 'MotionChunk', 'FinalizeRecordingRequest',
  'TutorialJobCreate', 'TutorialFinalize', 'ReferenceEdit', 'ReferenceImageUpload', 'SpectatorState', 'TutorialLabelBatch', 'RecordingByteChunk',
] as const;
export function buildContractSchemas() {
  const registry = z.registry<{id: string}>();
  for (const name of [...CONTRACT_SCHEMA_NAMES].sort()) {
    const schema = contracts[`${name}Schema`];
    registry.add(schema, {id: name});
  }
  return z.toJSONSchema(registry);
}
