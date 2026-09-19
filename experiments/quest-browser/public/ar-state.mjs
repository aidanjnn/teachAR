// Shared by the headset and deterministic tests. No provider calls here.
export const FRESH_MS = 12000;
export function feedback(status, elapsedMs = 0, uploadAgeMs = Infinity) {
  const unknown = (title, message) => ({verdict: 'unknown', title, message, usable: false});
  if (!status || elapsedMs > 4000) return unknown('Connection lost', 'Checks paused. Reconnect the USB cable and laptop server.');
  if (!status.capture?.has_reference) return unknown('Reference needed', 'Use setup below to save the three plushie appearances.');
  if (uploadAgeMs > 3000 || status.capture?.age_ms == null || status.capture.age_ms + elapsedMs > 4000)
    return unknown('Camera paused', 'Keep this app visible. If this persists, exit AR and restart the camera.');
  const latest = status.latest;
  if (!latest || latest.revision !== status.capture.revision) return unknown('Ready to check', 'Goose at A. Fox at B. Square at C. Show all three labels.');
  const ageMs = latest.age_ms + elapsedMs;
  if (!Number.isFinite(ageMs) || ageMs > FRESH_MS)
    return unknown('Previous result expired', 'Look at the table for a new check. An old result cannot confirm the current placement.');
  const verdict = ['pass', 'fail'].includes(latest.verdict) ? latest.verdict : 'unknown';
  return {verdict, title: {pass:'Arrangement matches', fail:'Wrong placement', unknown:'Cannot confirm yet'}[verdict],
    message: latest.message, ageSeconds: Math.floor(ageMs / 1000), usable: verdict !== 'unknown'};
}

// This records the acceptance-test sequence, not tutorial completion or a
// claim of ground-truth accuracy. Only fresh, ordered observations count.
export class SwapTrial {
  constructor(revision, minFrame = 0) { this.revision=revision; this.lastFrame=minFrame; this.phase=0; }
  observe(status, result) {
    const item=status?.latest;
    if (!item || item.revision !== this.revision || !result.usable || !Number.isInteger(item.frame_id) || item.frame_id <= this.lastFrame) return false;
    this.lastFrame=item.frame_id;
    const observed=Object.fromEntries((item.slots || []).map(s=>[s.slot, s.observed]));
    const swapped=observed.A==='goose' && observed.B==='square' && observed.C==='fox';
    if ((this.phase===0 && item.verdict==='pass') || (this.phase===1 && item.verdict==='fail' && swapped) || (this.phase===2 && item.verdict==='pass')) {
      this.phase++; return true;
    }
    return false;
  }
  get instruction() { return [
    '1/3 · Start with goose A, fox B, square C.',
    '2/3 · Now swap FOX and SQUARE. Leave the labels.',
    '3/3 · Restore FOX to B and SQUARE to C.',
    'Test sequence observed · matched, swapped, restored.'
  ][this.phase]; }
}

export const BUTTONS = [
  {id:'check', x:36, y:414, w:340, h:86},
  {id:'auto', x:392, y:414, w:340, h:86},
  {id:'exit', x:748, y:414, w:296, h:86}
];
export function hitButton(u, v) {
  const x=u*1080, y=(1-v)*560;
  return BUTTONS.find(b=>x>=b.x && x<=b.x+b.w && y>=b.y && y<=b.y+b.h)?.id || null;
}
