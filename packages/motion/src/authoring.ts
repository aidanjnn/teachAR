import { RecordingSchema, type Recording, type Side, type TutorialDraftEdit, type TutorialStep } from '@trail/contracts';

const SIDES: Side[] = ['left', 'right'];
export type ProposedStep = TutorialDraftEdit['steps'][number];
const distance = (a: readonly number[], b: readonly number[]) => Math.hypot(...a.map((value, i) => value - b[i]!));
function valid(recording: Recording, index: number, sides: Side[]) {
  return sides.every(side => recording.frames[index]?.hands[side].status === 'valid');
}
function stable(recording: Recording, start: number, end: number, sides: Side[]) {
  if (end <= start || recording.frames[end]!.tMs - recording.frames[start]!.tMs < 200) return false;
  for (let i = start; i <= end; i++) {
    if (!valid(recording, i, sides)) return false;
    if (i === start) continue;
    const previous = recording.frames[i - 1]!; const current = recording.frames[i]!;
    const dt = current.tMs - previous.tMs;
    if (dt > 100) return false;
    for (const side of sides) {
      const a = previous.hands[side]; const b = current.hands[side];
      if (a.status !== 'valid' || b.status !== 'valid' || distance(a.joints.wrist.positionM, b.joints.wrist.positionM) / (dt / 1000) > .04) return false;
    }
  }
  return true;
}
function active(recording: Recording, start: number, end: number): Side[] {
  return SIDES.filter(side => {
    let travel = 0;
    for (let i = start + 1; i < end; i++) {
      const a = recording.frames[i - 1]!.hands[side]; const b = recording.frames[i]!.hands[side];
      if (a.status === 'valid' && b.status === 'valid') travel += distance(a.joints.wrist.positionM, b.joints.wrist.positionM);
    }
    return travel >= .03;
  });
}

/** Marker controls define ranges. Missing tracking is never interpreted as a pause. */
export function proposeSteps(input: Recording): { segmentation: 'explicit-markers' | 'motion-proposals'; steps: ProposedStep[] } {
  const recording = RecordingSchema.parse(input);
  const ranges: [number, number][] = [];
  const markers = [...recording.markers].sort((a, b) => a.tMs - b.tMs);
  if (markers.length) {
    let start: number | undefined;
    for (const marker of markers) {
      const frame = recording.frames.findIndex(value => value.tMs >= marker.tMs);
      if (marker.kind === 'step-start') {
        if (start !== undefined || frame < 0) throw new Error('Markers must alternate start/end');
        // An end and the next start resolving to the same frame stay contiguous: the earlier step yields that frame.
        const last = ranges[ranges.length - 1];
        if (last && last[1] > frame) { last[1] = frame; if (last[0] >= last[1]) throw new Error('Adjacent markers leave an empty step'); }
        start = frame;
      } else {
        if (start === undefined) throw new Error('End marker has no start');
        const end = frame < 0 ? recording.frames.length : frame + 1;
        ranges.push([start, end]); start = undefined;
      }
    }
    if (start !== undefined) throw new Error('Recording has an unfinished step marker');
  } else {
    // Pause runs >=400ms, separated by useful movement. Long pauses collapse to one boundary.
    const sides = active(recording, 0, recording.frames.length);
    if (!sides.length) throw new Error('No usable motion found');
    const holds: [number, number][] = [];
    let start = 0;
    for (let i = 1; i <= recording.frames.length; i++) {
      const a = recording.frames[i - 1]; const b = recording.frames[i];
      const quiet = a && b && b.tMs - a.tMs <= 100 && sides.every(side => {
        const left = a.hands[side]; const right = b.hands[side];
        return left.status === 'valid' && right.status === 'valid' && distance(left.joints.wrist.positionM, right.joints.wrist.positionM) / ((b.tMs - a.tMs) / 1000) <= .04;
      });
      if (quiet) continue;
      if (i - 1 > start && recording.frames[i - 1]!.tMs - recording.frames[start]!.tMs >= 400 && stable(recording, start, i - 1, sides)) holds.push([start, i - 1]);
      start = i;
    }
    for (let i = 1; i < holds.length; i++) {
      const left = holds[i - 1]!; const right = holds[i]!;
      // Split shared stationary hold in half, avoiding overlapping step ranges.
      const from = i === 1 ? left[0] : Math.floor((left[0] + left[1]) / 2) + 1;
      const to = i === holds.length - 1 ? right[1] + 1 : Math.floor((right[0] + right[1]) / 2) + 1;
      if (recording.frames[to - 1]!.tMs - recording.frames[from]!.tMs >= 700 && active(recording, from, to).length) ranges.push([from, to]);
    }
  }
  if (!ranges.length || ranges.length > 32) throw new Error('Review requires 1–32 usable segments');
  const steps = ranges.map(([startFrame, endFrameExclusive], index): ProposedStep => {
    const activeHands = active(recording, startFrame, endFrameExclusive);
    if (!activeHands.length) throw new Error(`Step ${index + 1} has no useful movement`);
    const step: ProposedStep = { id: `step-${index + 1}`, startFrame, endFrameExclusive, checkpointFrame: endFrameExclusive - 1, activeHands, completionMode: 'pose-match', title: `Movement ${index + 1}`, instruction: 'Review this movement and describe the visible action.' };
    deriveStep(recording, step);
    return step;
  });
  return { segmentation: markers.length ? 'explicit-markers' : 'motion-proposals', steps };
}

/** Recompute authoritative coordinates on every revision; clients submit frame references only. */
export function deriveStep(recording: Recording, edit: ProposedStep): TutorialStep {
  const { startFrame, endFrameExclusive, checkpointFrame, activeHands } = edit;
  if (!Number.isInteger(startFrame) || startFrame < 0 || endFrameExclusive > recording.frames.length || checkpointFrame <= startFrame || checkpointFrame >= endFrameExclusive || !activeHands.length) throw new Error('Invalid step range or active hands');
  let startHoldEnd = startFrame;
  while (startHoldEnd < checkpointFrame && recording.frames[startHoldEnd]!.tMs - recording.frames[startFrame]!.tMs < 200) startHoldEnd++;
  let endHoldStart = checkpointFrame;
  while (endHoldStart > startFrame && recording.frames[checkpointFrame]!.tMs - recording.frames[endHoldStart]!.tMs < 200) endHoldStart--;
  if (startHoldEnd >= endHoldStart || !stable(recording, startFrame, startHoldEnd, activeHands) || !stable(recording, endHoldStart, checkpointFrame, activeHands)) throw new Error('Choose separated, tracked stable start and checkpoint holds (at least 200ms each)');
  const targets = activeHands.map(side => {
    const start = recording.frames[startFrame]!.hands[side]; const checkpoint = recording.frames[checkpointFrame]!.hands[side];
    if (start.status !== 'valid' || checkpoint.status !== 'valid') throw new Error('Active hand is missing');
    const indices = [1, 2, 3].map(part => Math.round(startHoldEnd + (endHoldStart - startHoldEnd) * part / 4));
    const motionGates = [...new Set(indices)].filter(index => index > startHoldEnd && index < endHoldStart).map(frameIndex => {
      const hand = recording.frames[frameIndex]!.hands[side];
      if (hand.status !== 'valid') throw new Error('Intermediate gate has missing tracking; adjust boundaries or re-record');
      return { frameIndex, positionM: hand.joints.wrist.positionM, toleranceM: .04, dwellMs: 100 };
    });
    if (edit.completionMode === 'path-and-pose' && !motionGates.length) throw new Error('Path review needs an intermediate gate');
    return { side, joint: 'wrist' as const, startPose: start.joints.wrist, checkpointPose: checkpoint.joints.wrist, positionToleranceM: .04, orientationToleranceRad: null, gesture: 'any' as const, motionGates, pathCorridorM: .08 };
  });
  return { id: edit.id, title: edit.title, instruction: edit.instruction, startFrame, endFrameExclusive, checkpointFrame, targets, dwellMs: 500, startDwellMs: 200, completionMode: edit.completionMode, narrationSpanIds: [] };
}
