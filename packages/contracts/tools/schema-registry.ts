import { z } from 'zod';
import * as contracts from '../src/index.js';
// Keep this explicit: every native/shared transport addition needs generated C#,
// shared valid/invalid fixtures, and compatibility notes. Authoring envelopes are
// covered by the same corpus; generated DTOs do not imply native UI consumers.
export const NATIVE_SCHEMA_NAMES = [
  'TakeAuthoringMetadata', 'AuthoredCapture', 'JointName', 'Side', 'Vec3', 'Quat', 'Pose', 'HandSample', 'MotionFrame', 'WorkspaceDefinition', 'Recording',
  'MotionGate', 'HandTarget', 'TutorialStep', 'TutorialProvenance', 'Tutorial', 'TutorialDraftStep', 'TutorialDraftEdit', 'CompletionMode',
  'GuideContextRef', 'GuideSnapshot', 'GuideEvent', 'CalibrationV2', 'ClockMapping', 'NativeCaptureSidecar',
  'SceneSource', 'StepSceneReference', 'SceneReferenceManifest', 'InspectionRequest', 'SceneObservation', 'CoachAssessment', 'InspectionResult',
  'RecordingMetadata', 'CreateRecordingRequest', 'MotionChunk', 'FinalizeRecordingRequest',
  'TutorialJobCreate', 'TutorialFinalize', 'ReferenceEdit', 'ReferenceImageUpload', 'SpectatorState', 'TutorialLabelBatch', 'RecordingByteChunk',
] as const;
export function buildContractSchemas() {
  const registry = z.registry<{id: string}>();
  for (const name of [...NATIVE_SCHEMA_NAMES].sort()) {
    const schema = contracts[`${name}Schema`];
    registry.add(schema, {id: name});
  }
  return z.toJSONSchema(registry);
}
