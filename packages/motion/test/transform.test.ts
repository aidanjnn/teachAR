import { describe, expect, it } from 'vitest';
import { RecordingSchema, type Pose } from '@trail/contracts';
import { invertTransform, transformPose } from '../src/index.js';
import raw from '../../../fixtures/synthetic-reach.v1.json';

const translatedAndRotated: Pose = {
  positionM: [1.25, 0.4, -0.7],
  orientationXyzw: [0, Math.sin(Math.PI / 4), 0, Math.cos(Math.PI / 4)],
};
describe('rigid workspace transforms', () => {
  it('applies rotation before translation without scaling', () => {
    const pose: Pose = { positionM: [1, 0, 0], orientationXyzw: [0, 0, 0, 1] };
    const result = transformPose(pose, translatedAndRotated);
    expect(result.positionM[0]).toBeCloseTo(1.25, 6);
    expect(result.positionM[1]).toBeCloseTo(0.4, 6);
    expect(result.positionM[2]).toBeCloseTo(-1.7, 6);
    expect(Math.hypot(...result.positionM.map((n, i) => n - translatedAndRotated.positionM[i]!))).toBeCloseTo(1, 6);
  });
  it('round-trips all valid fixture poses through another workspace', () => {
    const recording = RecordingSchema.parse(raw);
    const inverse = invertTransform(translatedAndRotated);
    for (const frame of recording.frames) {
      const hand = frame.hands.right;
      if (hand.status === 'missing') continue;
      for (const pose of Object.values(hand.joints)) {
        const result = transformPose(transformPose(pose, translatedAndRotated), inverse);
        result.positionM.forEach((value, index) => expect(value).toBeCloseTo(pose.positionM[index]!, 6));
        const dot = result.orientationXyzw.reduce((sum, value, index) => sum + value * pose.orientationXyzw[index]!, 0);
        expect(Math.abs(dot)).toBeCloseTo(1, 6);
      }
    }
  });
  it('round-trips a nonidentity orientation and treats quaternion signs equally', () => {
    const pose: Pose = { positionM: [0, 0, 0], orientationXyzw: [Math.SQRT1_2, 0, 0, Math.SQRT1_2] };
    const result = transformPose(transformPose(pose, translatedAndRotated), invertTransform(translatedAndRotated));
    result.orientationXyzw.forEach((value, index) => expect(value).toBeCloseTo(pose.orientationXyzw[index]!, 6));
    const negative: Pose = { ...translatedAndRotated, orientationXyzw: [0, -Math.SQRT1_2, 0, -Math.SQRT1_2] };
    const positiveResult = transformPose(pose, translatedAndRotated);
    transformPose(pose, negative).positionM.forEach((value, index) => expect(value).toBeCloseTo(positiveResult.positionM[index]!, 6));
  });
});
