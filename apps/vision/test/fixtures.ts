import { createHash } from 'node:crypto';
import sharp from 'sharp';
import type { CoachAssessment, VisionImage, VisionInspectionInput } from '@trail/contracts';
export const token = 'synthetic-service-token-for-tests-0001';
export const auth = { authorization: `Bearer ${token}` };
export async function image(width = 16, height = 16): Promise<VisionImage> {
  const data = await sharp({ create: { width, height, channels: 3, background: '#4488aa' } }).png().toBuffer();
  return { mimeType: 'image/png', dataBase64: data.toString('base64'), sha256: createHash('sha256').update(data).digest('hex'), width, height };
}
export function assessment(verdict: CoachAssessment['verdict'] = 'visible-match'): CoachAssessment {
  return { verdict, observedEvidence: verdict === 'uncertain' ? [] : ['The visible block edges align with the reviewed reference.'],
    limitation: 'This snapshot cannot establish hidden attachment or tightness.',
    feedback: verdict === 'uncertain' ? 'The connection is obscured; show another view.' : verdict === 'adjustment-needed' ? 'The visible block is offset from the reference; compare its placement.' : 'The placement appears aligned in this snapshot.',
    suggestedAction: verdict === 'uncertain' ? 'show-another-view' : 'none' };
}
export async function input(): Promise<VisionInspectionInput> {
  const img = await image();
  return { schemaVersion: 1,
    request: { requestId: 'request-1', liveSessionId: 'app-check', sessionGeneration: 1, requestEpoch: 1,
      delegationId: null, question: 'Does this placement match?', referenceIds: ['reference-1'],
      runId: 'run-1', tutorialId: 'tutorial-1', tutorialRevision: 1, stepId: 'step-1', stepRevision: 1, attemptId: 'attempt-1' },
    observation: { id: 'observation-1', requestId: 'request-1', captureNonce: 'nonce-1', sourceSessionId: 'camera-1',
      source: 'quest-camera', assetId: 'ephemeral-1', sourceFrameSeq: 2, captureAgeAtSendMs: 30, receivedAtServerMonoMs: 100 },
    currentImage: img,
    references: [{ reference: { id: 'reference-1', recordingId: 'recording-1', recordingHash: 'a'.repeat(64), tutorialId: 'tutorial-1',
      tutorialRevision: 1, stepId: 'step-1', assetId: 'expert-1', source: 'quest-camera', visibleOutcome: 'Visible edges align.' }, image: img }],
    approvedStep: { title: 'Place block', instruction: 'Align the large block with the reference.', expectedVisibleOutcome: 'Visible edges align.' },
    movementSummary: 'Guide paused; endpoint is not assembly proof.', remainingBudgetMs: 2000,
  };
}
