# Polished spoken tutorial instructions

The expert's raw narration and the learner's instruction voice are separate assets.
Finishing a tutorial now automatically prepares concise wording and AI speech from
usable recorded narration. Replay needs no provider request. No camera or object
understanding is implied by rewriting narration.

## Author and learner flow

Record the steps, then **Finish tutorial**. Trail saves the original tutorial first,
then processes narrated steps sequentially: transcribe → concise instruction → speech
→ durable local save. The finishing screen shows step progress. Existing generated
speech and steps without narration are skipped. No per-step polish/approval clicks
are required. The author requested this automatic behavior; the API marks requests
`automatic:true`, not as reviewed wording. Rewritten steps retain expert movement
acceptance but do not claim the author replay-reviewed the generated wording.

If narration is ambiguous (`needsReview`), keep that step's original narration. On
pairing/provider/allowance failure stop additional calls and preserve the remaining
original recordings. The saved screen reports how many were polished; there are no
automatic failure retries. Exiting AR cancels pending processing and rejects late
results, while the already saved original tutorial remains available. Keep the page
open until processing finishes to retain all generated instructions.

Optional **More options → Instruction voice** in AR and the browser review tools
still let an author edit/review a single instruction, generate speech from written
text, or restore original narration. Manual wording edits invalidate older generated
speech. Automatic processing works from both AR and the browser Finish action.

Generation uses the paired author API and is labelled AI speech. The prompt removes
filler, repetition and recording-control chatter while preserving meaningful order,
conditions and cautions. It must not invent missing orientation, objects or technique.
Review the resulting lesson before demonstrating it to another learner.

Following plays the saved instruction at normal speaking speed while the ghost previews.
The movement preview waits for the voice to finish before the start-position phase.
Pausing/menus stop the audio; replay starts it again. A bounded audio-clock watchdog
falls back to the written instruction if playback stalls. That wait is presentation
only: it never supplies movement evidence or confirms the paper is folded correctly.

## Format and ownership

Browser v3 steps may contain `instruction_voice`:
`{source: "ai", text, audio, duration_ms}`. `audio` is bounded inline mono PCM16 WAV at
16 kHz, at most 30 seconds. Its duration is derived from bytes and is independent of
motion duration. `text` must exactly match the step instruction; edited instructions
invalidate old speech. Trimming/replacing a motion drops its generated voice. Original
`narration` keeps its existing motion-aligned timing and validation.

`instruction-voice.mjs` handles client requests, bounded decoding and portable validation.
`NarrationPlayback` selects the generated track when present, preserving original
recorded narration otherwise. `TutorialGuide` and browser review own approval and
persistence; storage failures stay visible and do not report a successful save.

`POST /api/voice/polish` accepts canonical recorded WAV up to two minutes, transcribes
through the existing provider, and uses the existing segment-label pipeline. Fixture
transcripts and fallback labels cannot become polished results. `POST
/api/voice/instruction-audio` accepts reviewed (`approved:true`) or finish-generated (`automatic:true`) text up to 240 characters and generates
speech through the existing voice provider. Both require the author role. They share
48 attempts per server process (including failures), one operation at a time and a
2-second start cooldown. This is a request allowance, not a monetary budget; server
restart resets it. Provider/client deadlines are bounded. Replaying locally saved
instruction speech makes no API calls. Existing raw transcription/label routes retain
their separate behavior.

This is reusable across origami and other tasks. There is no crane-specific wording,
no automatic step segmentation from speech and no fabricated missing instructions.

## Acceptance

- Record narrated steps with filler and clear actions; Finish once; confirm automatic wording
  preserves direction/order and removes filler. Reject or edit any mistaken rewrite.
- Generate and hear its AI instruction; follow at 0.5×/0.75× ghost speed and verify the
  voice stays natural. Try a short motion with a longer spoken instruction.
- Pause/replay, leave AR during generation, retry a failed save, and edit the instruction.
- Export/import/reopen the tutorial; verify both original and generated tracks survive.
- Switch to the original recording and verify it plays again.

Automated tests use synthetic audio and provider stubs. User-reported original narration
playback is positive headset evidence for the existing recorder/replayer, not acceptance
of the newly generated instruction voice. A worn-headset test of this new flow is still required.

### Earlier delivery evidence (manual flow)

377 shared/API tests and typechecks/builds passed; 115 WebXR module tests, 53 Python
cases, 20 synthetic WebXR/browser workflows and eight desktop workflows passed.
Focused label/provider tests passed after prompt refinement. Browser review was checked
at 1100 px and 375 px, and the immersive instruction-review canvas was inspected.
A live synthetic spoken explanation passed through the new transcription/label/speech
routes. Its final draft was: “Bring the bottom edge to the top edge. Align the corners,
then press the crease.” Generated MP3 was returned successfully. This is provider
integration evidence, not a worn-headset acceptance claim. No personal recording was
used or changed for these tests.
