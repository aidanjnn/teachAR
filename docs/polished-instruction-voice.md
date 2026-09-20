# Polished spoken tutorial instructions

The expert's raw narration and the learner's instruction voice are separate assets.
The author can now turn a recorded explanation into concise step text, approve that
wording, and save generated speech with the local tutorial. Replay needs no provider
request. No camera or object understanding is implied by rewriting narration.

## Author and learner flow

In AR: **Review recordings → Polish instruction voice → Polish recorded explanation**.
Read the proposed instruction, then **Approve wording & generate voice**. The original
recording is retained. Listen to the resulting step and approve/review it normally;
finish the tutorial again before following. Cancel/Home/Exit during a request discard
its late result. Voice commands and the separate coach are stopped while polishing.

In browser tools: open **Review current**, select a step, choose **Polish this explanation**,
edit the proposed title/instruction if necessary, then **Approve wording & generate voice**.
The same screen can generate speech from a manually written instruction. AR offers
**Use current written instruction** too. **Use original recording** removes the generated
track without deleting the original narration or reverting the written instruction.

Generation is explicit, uses the paired author API, and is labelled AI speech. Ambiguous
references ("this corner", "over there") must be reviewed; the model must not invent
orientation, objects, quantities or technique. The prompt removes filler, repetition
and recording-control chatter but preserves meaningful sequence, conditions and cautions.

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
/api/voice/instruction-audio` accepts approved text up to 240 characters and generates
speech through the existing voice provider. Both require the author role. They share
48 attempts per server process (including failures), one operation at a time and a
2-second start cooldown. This is a request allowance, not a monetary budget; server
restart resets it. Provider/client deadlines are bounded. Replaying locally saved
instruction speech makes no API calls. Existing raw transcription/label routes retain
their separate behavior.

This is reusable across origami and other tasks. There is no crane-specific wording,
no automatic step segmentation from speech and no fabricated missing instructions.

## Acceptance

- Record a narrated step with filler and a clear action; polish it; confirm the wording
  preserves direction/order and removes filler. Reject or edit any mistaken rewrite.
- Generate and hear its AI instruction; follow at 0.5×/0.75× ghost speed and verify the
  voice stays natural. Try a short motion with a longer spoken instruction.
- Pause/replay, leave AR during generation, retry a failed save, and edit the instruction.
- Export/import/reopen the tutorial; verify both original and generated tracks survive.
- Switch to the original recording and verify it plays again.

Automated tests use synthetic audio and provider stubs. User-reported original narration
playback is positive headset evidence for the existing recorder/replayer, not acceptance
of the newly generated instruction voice. A worn-headset test of this new flow is still required.

### Delivery evidence

377 shared/API tests and typechecks/builds passed; 115 WebXR module tests, 53 Python
cases, 20 synthetic WebXR/browser workflows and eight desktop workflows passed.
Focused label/provider tests passed after prompt refinement. Browser review was checked
at 1100 px and 375 px, and the immersive instruction-review canvas was inspected.
A live synthetic spoken explanation passed through the new transcription/label/speech
routes. Its final draft was: “Bring the bottom edge to the top edge. Align the corners,
then press the crease.” Generated MP3 was returned successfully. This is provider
integration evidence, not a worn-headset acceptance claim. No personal recording was
used or changed for these tests.
