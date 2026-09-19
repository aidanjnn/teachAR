import { JOINT_NAMES, RecordingSchema, type Recording, type MotionFrame, type Vec3 } from '@trail/contracts';

/** Four explicitly marked large-part motions; synthetic diagnostic only. */
export function createAuthoringFixture(): Recording {
  const frames: MotionFrame[] = [];
  for (let step = 0; step < 4; step++) {
    for (let frame = 0; frame < 90; frame++) {
      const progress = Math.max(0, Math.min(1, (frame - 18) / 50));
      const x = -.18 + step * .08 + progress * .08;
      const position: Vec3 = [x, .12 + Math.sin(progress * Math.PI) * .08, -.08 + (step % 2) * .04];
      const joints = Object.fromEntries(JOINT_NAMES.map((name, index) => [name, { positionM: [position[0] + (index % 5) * .008, position[1], position[2] + Math.floor(index / 5) * .012], orientationXyzw: [0, 0, 0, 1] }]));
      frames.push({ tMs: (step * 90 + frame) * 1000 / 30, hands: { left: { status: 'missing', reason: 'unavailable' }, right: { status: 'valid', joints: joints as Extract<MotionFrame['hands']['right'], { status: 'valid' }>['joints'] } }, head: null });
    }
  }
  return RecordingSchema.parse({ schemaVersion: 1, id: 'synthetic-four-movements', coordinateFrame: 'workspace', workspace: { id: 'synthetic-mat', version: 1, widthM: .5, depthM: .35, calibrationMarksM: { A: [-.25, 0, -.175], B: [.25, 0, -.175], C: [-.25, 0, .175], D: [.25, 0, .175] }, layoutId: 'large-parts-demo', dominantHand: 'right', calibrationMethod: 'three-point-index-tip-v1' }, jointOrder: [...JOINT_NAMES], nominalSampleHz: 30, durationMs: frames.at(-1)!.tMs, frames, markers: Array.from({ length: 4 }, (_, step) => [{ id: `start-${step}`, tMs: frames[step * 90]!.tMs, kind: 'step-start', source: 'review' }, { id: `end-${step}`, tMs: frames[step * 90 + 89]!.tMs, kind: 'step-end', source: 'review' }]).flat(), audio: null, source: 'synthetic-fixture' });
}
