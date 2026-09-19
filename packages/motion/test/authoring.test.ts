import { describe, expect, it } from 'vitest';
import { createAuthoringFixture, deriveStep, proposeSteps } from '../src/index.js';

describe('offline authoring', () => {
  it('uses markers first and derives distinct stable start/checkpoint targets and ordered gates', () => {
    const recording = createAuthoringFixture(); const proposal = proposeSteps(recording);
    expect(proposal.segmentation).toBe('explicit-markers'); expect(proposal.steps).toHaveLength(4);
    for (const proposed of proposal.steps) {
      const step = deriveStep(recording, { ...proposed, completionMode: 'path-and-pose' });
      expect(step.targets[0]!.startPose.positionM).not.toEqual(step.targets[0]!.checkpointPose.positionM);
      expect(step.targets[0]!.motionGates).toHaveLength(3);
      expect(step.targets[0]!.side).toBe('right');
    }
  });
  it('proposes motion boundaries only from tracked pauses', () => {
    const recording = createAuthoringFixture(); recording.markers = [];
    const result = proposeSteps(recording); expect(result.segmentation).toBe('motion-proposals'); expect(result.steps.length).toBeGreaterThanOrEqual(3);
    for (const frame of recording.frames) frame.hands.right = { status: 'missing', reason: 'unavailable' };
    expect(() => proposeSteps(recording)).toThrow('No usable motion');
  });
  it('rejects unfinished markers, missing active hands and unstable endpoint ranges', () => {
    const recording = createAuthoringFixture(); const step = proposeSteps(recording).steps[0]!;
    expect(() => deriveStep(recording, { ...step, activeHands: ['left'] })).toThrow('stable');
    expect(() => deriveStep(recording, { ...step, startFrame: 30 })).toThrow('stable');
    recording.markers.pop(); expect(() => proposeSteps(recording)).toThrow('unfinished');
  });
});
