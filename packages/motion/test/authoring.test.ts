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
  it('keeps equal-time adjacent end/start markers as contiguous half-open steps', () => {
    const recording = createAuthoringFixture();
    const ends = recording.markers.filter(m => m.kind === 'step-end'); const starts = recording.markers.filter(m => m.kind === 'step-start');
    for (let i = 1; i < starts.length; i++) ends[i - 1]!.tMs = starts[i]!.tMs;
    const steps = proposeSteps(recording).steps;
    for (let i = 1; i < steps.length; i++) expect(steps[i]!.startFrame).toBe(steps[i - 1]!.endFrameExclusive);
    for (const step of steps) expect(step.endFrameExclusive).toBeGreaterThan(step.startFrame);
  });
});
