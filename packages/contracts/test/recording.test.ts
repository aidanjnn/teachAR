import { describe, expect, it } from 'vitest';
import { JOINT_NAMES, PoseSchema, RecordingSchema } from '../src/index.js';
import raw from '../../../fixtures/synthetic-reach.v1.json';

describe('recording v1 boundary', () => {
  it('round-trips the shared synthetic recording without losing missing intervals', () => {
    const recording = RecordingSchema.parse(raw);
    expect(RecordingSchema.parse(JSON.parse(JSON.stringify(recording)))).toEqual(recording);
    expect(JOINT_NAMES).toHaveLength(25);
    expect(recording.frames.filter(frame => frame.hands.right.status === 'missing')).toHaveLength(8);
    expect(recording.frames[0]?.hands.left.status).toBe('missing');
  });

  it('accepts zero coordinates and either sign of a unit quaternion', () => {
    expect(PoseSchema.safeParse({ positionM: [0, 0, 0], orientationXyzw: [0, 0, 0, -1] }).success).toBe(true);
  });

  it.each([
    ['unknown version', (value: typeof raw) => { value.schemaVersion = 2; }],
    ['duplicate timestamp', (value: typeof raw) => { value.frames[1]!.tMs = 0; }],
    ['out-of-duration frame', (value: typeof raw) => { value.durationMs = 1; }],
    ['wrong joint order', (value: typeof raw) => { value.jointOrder.reverse(); }],
    ['too many frames', (value: typeof raw) => { value.frames = Array.from({ length: 3601 }, () => value.frames[0]!); }],
    ['duration limit', (value: typeof raw) => { value.durationMs = 120001; }],
  ])('rejects %s', (_label, mutate) => {
    const value = structuredClone(raw);
    mutate(value);
    expect(RecordingSchema.safeParse(value).success).toBe(false);
  });

  it('rejects missing named joints and unexpected palm aliases', () => {
    const value = RecordingSchema.parse(raw);
    const hand = value.frames[0]!.hands.right;
    if (hand.status !== 'valid') throw new Error('Expected valid fixture start');
    const { wrist, ...rest } = hand.joints;
    expect(RecordingSchema.safeParse({ ...value, frames: [{ ...value.frames[0], hands: { left: { status: 'missing', reason: 'unavailable' }, right: { status: 'valid', joints: { ...rest, palm: wrist } } } }] }).success).toBe(false);
  });

  it.each([NaN, Infinity, -Infinity])('rejects nonfinite coordinate %s', value => {
    expect(PoseSchema.safeParse({ positionM: [value, 0, 0], orientationXyzw: [0, 0, 0, 1] }).success).toBe(false);
  });
  it.each([[0, 0, 0, 0], [0, 0, 0, 2], [0, 0, 0, 0.0001]])('rejects a nonunit quaternion %j', (...orientationXyzw) => {
    expect(PoseSchema.safeParse({ positionM: [0, 0, 0], orientationXyzw }).success).toBe(false);
  });
});
