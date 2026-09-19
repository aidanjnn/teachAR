import { RecordingSchema, type MotionFrame, type Recording } from '@trail/contracts';
import rawFixture from '../../../../fixtures/synthetic-reach.v1.json';

export const fixture = RecordingSchema.parse(rawFixture);

/** Select the actual preceding observation. Missing frames remain missing. */
export function frameAtTime(recording: Recording, tMs: number): MotionFrame {
  const first = recording.frames[0];
  if (!first) throw new Error('Recording has no frames');
  let selected = first;
  for (const frame of recording.frames) {
    if (frame.tMs > tMs) break;
    selected = frame;
  }
  return selected;
}
