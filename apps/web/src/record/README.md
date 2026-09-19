# Recording adapter

`audio.ts` records narration with MediaRecorder on a caller-supplied monotonic
epoch and reports `NarrationCapture` (MIME, duration, start offset, sync error).
Hand capture, explicit markers, and the combined recorder (TRAIL-04) remain planned.
