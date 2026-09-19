import { z } from 'zod';
import * as contracts from '../src/index.js';
// Service/authoring transports have independent owners. Adding one must not silently
// change the native frozen contract surface or claim untested native parity.
export const NATIVE_SCHEMA_NAMES = [
  'JointName', 'Side', 'Vec3', 'Quat', 'Pose', 'HandSample', 'MotionFrame', 'WorkspaceDefinition', 'Recording',
  'MotionGate', 'HandTarget', 'TutorialStep', 'TutorialProvenance', 'Tutorial', 'TutorialDraftStep', 'TutorialDraftEdit', 'CompletionMode',
  'GuideContextRef', 'GuideSnapshot', 'GuideEvent', 'CalibrationV2', 'ClockMapping', 'NativeCaptureSidecar',
  'SceneSource', 'StepSceneReference', 'SceneReferenceManifest', 'InspectionRequest', 'SceneObservation', 'CoachAssessment', 'InspectionResult',
  'RecordingMetadata', 'CreateRecordingRequest', 'MotionChunk', 'FinalizeRecordingRequest',
] as const;
export function buildContractSchemas() {
  const registry = z.registry<{id: string}>();
  for (const name of [...NATIVE_SCHEMA_NAMES].sort()) {
    const schema = contracts[`${name}Schema`];
    registry.add(schema, {id: name});
  }
  return z.toJSONSchema(registry);
}
