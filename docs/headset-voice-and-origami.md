# Headset voice controls and origami demo

For polished tutorial narration (recorded explanation → reviewed instruction → saved AI speech), see [instruction voice](polished-instruction-voice.md).

## What this delivery connects

Main's PR #28 supplies the shared GPT-Live coach, paired step-text grounding,
narration transcription and label drafts. This branch brings that runtime together with
the merged immersive entry/holographic hands and fluid-workspace UX from PRs #25/#29 under
`apps/webxr`. It adds natural spoken actions to the actual `TutorialGuide`, not a separate
voice demo. Unity remains retired. No OMNI or visual grading was added.

Inside AR, open **Voice → Enable voice controls** (returns to the task automatically). Say one request and
wait for the acknowledgement. **Commands & help** has three pages of examples:

| Say, for example | Behavior |
| --- | --- |
| “Start recording” | Existing three-second recording countdown |
| “Save it now” | Save current step; continuous recording continues |
| “Pause recording” / “Continue” | Pause/resume the current take |
| “Finish tutorial” | Finish continuous recording and await local persistence |
| “Can you go back please?” | Previous step; fresh local attempt |
| “I don't think I got that” | Replay **this** step from its preview |
| “Next step” | Explicit navigation; no movement/physical verification |
| “What do I do?” | Read the current recorded instruction |
| A question about this instruction | Short answer grounded in the supplied step text |
| “Go home” | Existing save/discard/stay protection for an unfinished take |
| “Help” / “Stop listening” | Open examples / release microphone |

A wake word is optional. While explicitly enabled, nearby speech can be transcribed;
this is not an on-device wake-word system. Off-task speech should select no action,
but interpretation can be wrong: clear status and existing manual controls remain.
Ambiguous requests clarify instead of advancing. The model's free-form response never
serves as an executable action. No arbitrary function names, coordinates, delete action,
physical-result confirmation or autonomous progression are exposed.

## One server, one origin

`pnpm dev` still starts the independent Python hand/camera lab. **That server does not
provide these voice routes.** For the complete headset experience:

```sh
pnpm install --frozen-lockfile
pnpm build
# Configure AI_PROVIDER=openai and OPENAI_API_KEY privately in .env, or use the
# OPENAI_API_KEY_FILE environment variable with start:headset. Never put it in JS.
pnpm start:headset
adb reverse tcp:4345 tcp:4345
adb shell am start -a android.intent.action.VIEW -d http://localhost:4345/tutorial com.oculus.browser
```

`start:headset` defaults to loopback 4345 with exact localhost/127.0.0.1 pairing origins.
Existing environment values take precedence. A private initial author browser pairing
code is written to `data/pairing.json` (or `$DATA_DIR/pairing.json`); it expires after
five minutes and is single-use. Enter it in **Voice → Enter pairing code**, or use the
browser-tools pairing form before AR. A paired desktop can issue later codes through
the existing pairing UI. Never commit the code file. Restart requires fresh pairing.
Preserve the previous Quest URL/port if recordings live at a different origin; browser
storage belongs to the origin. Stop an older server on 4345 before starting this one.
For Wi-Fi, configure actual HTTPS and exact pairing origins; HTTP LAN IPs are not a
substitute for a secure WebXR/microphone context.

The optional **Live coach (separate)** reuses main's GPT-Live conversational session.
It answers through Ask coach and pauses command listening so two microphone loops do
not compete. Commands with brief task answers work without opening a Live session.
Live access depends on the configured account/model; failure must not stop hand guidance.

## Implementation contract for voice / OMNI teammates

- `voice-commands.mjs`: opted-in microphone ownership, AudioWorklet energy/silence
  segmentation, PCM encoder, bounded requests, reply audio, generation/context rejection.
- `voice-actions.mjs`: current-screen allowlist and local dispatch. Next/previous/replay
  reset the attempt; they never call `confirm()` or emit movement-completion events.
- `routes/voice-commands.ts`: paired author/learner ASR + intent route and one-use speech
  tickets. Spectators cannot spend credits or send commands.
- `ai/voice-intent.ts`: structured action schema and interpretation prompt. Input is
  untrusted speech/step text. Questions have no visual evidence. Runtime validates again.
- `tutorial-guide.mjs`: immersive Voice/help screens, pause on opening settings,
  protected recording exit, current save/record/navigation APIs. `voice_command` events
  are explicitly user-requested and `physical_verified:false`.
- `ar.js`: command microphone can clone an existing narration stream; stopping the
  clone does not stop narration. Exit/pagehide release it; XR invisibility prevents
  requests/actions. Live coach speech and local system speech suppress command listening.
  Narration no longer blocks commands: the microphone requests echo cancellation,
  playback/progression pause during command processing, and the command loop ignores
  its own spoken replies. Test acoustic echo/false triggers on the worn headset.
  Default fetch is called through a global wrapper so browsers never receive the
  VoiceCommands instance as the native fetch receiver.
- Speech replies use `gpt-4o-mini-tts-2025-12-15` through the server and Web Audio playback.
  The connected Quest Browser has no `speechSynthesis`; do not assume desktop TTS works.
  Captions remain if speech fails. The UI labels the voice as AI.
- Keys and audio stay out of bundles/logs/Git. Audio is sent to the configured provider
  only while commands are on. No raw transcripts/audio are added to diagnostics.
- Limits: 0.2–6 s canonical mono PCM16 clips; one interpretation in flight; minimum
  2.5 s between server starts; 60 clips / 10 min per enabled client session; 120 attempts
  per server process, including failures. One ≤240-character speech reply ticket per
  interpreted clip, expires in 30 s, consumed once. Provider deadlines and SDK retries
  are bounded. These are request caps, **not a dollar-denominated accounting ledger**;
  server restart resets them. Existing separate Live coach has its own 30-minute TTL.

Do not wire OMNI observations into the local navigation dispatcher. A visual checker
should emit separately timestamped advisory evidence, with a later explicit physical
result gate if needed. Voice user navigation is different from AI inference that a
step is complete.

## General origami and paper alignment

The current demo direction is origami in general, not a required crane lesson. Use a
short recorded sequence, large two-colour paper, identical size for expert and learner,
and a contrasting uncluttered table. More elaborate models can be split into chapters:
the browser currently caps a tutorial at 12 recorded steps. No authored origami recording
has been fabricated or inserted into the library. Reliable autonomous grading of every
crease, concealed finger or paper layer remains outside this implementation.

For initial calibration, choose the same named paper corners in the same order, with
the same coloured face and orientation. Keep the original scale. A square has four
visually equivalent corners, so detecting “paper” alone does not resolve orientation.
Rigid origin+heading cannot adapt to differently sized sheets or paper deformation.

Useful next vision work is **initial sheet-outline/corner assistance**, not a generic
object classifier: contrast/contours, quadrilateral fitting and confidence, then a
user-approved orientation. [OpenCV contour approximation](https://docs.opencv.org/4.13.0/dc/dcf/tutorial_js_contour_features.html)
can propose the outline cheaply. Image corners are still 2D: mapping into the XR
workspace needs a calibrated camera pose/intrinsics plus table plane/depth, or manual
3D confirmation. Browser camera access/concurrency must be feature-tested. Never turn
image pixels directly into metre coordinates or promise arbitrary-object retargeting.
During folding the outline changes and hands obscure it; use visible milestones and
reference photos, not tracking the original flat-sheet quadrilateral forever.

For this demo, prefer manual/voice step boundaries for small crease actions. The
existing fluid hold rule requires 8 cm of palm displacement: finger-only creases may
not arm it. Expert narration should describe crease/orientation intent. Ghosts should
illustrate the motion, not require matching every fingertip exactly.

## Acceptance checklist and evidence boundaries

1. Pair Quest, Enter, open Voice, enable, return to the task. Verify visible listening
   status, microphone permission and audible AI acknowledgement.
2. Follow a real recording: “pause”, “continue”, “I didn't get that”, “go back please”,
   and “next step”. Confirm the correct index/preview; no false physical-success badge.
3. Create: record a movement, “save it now”, a second movement, “finish tutorial”.
   Reopen from Library; verify both motion/media segments and durable-save cues.
4. Say “don't go to the next step”; ensure no navigation. Hide/end XR or change steps
   while a request is pending; stale replies must not act. Decline mic permission,
   stop listening, and unplug network; manual guidance must remain available.
5. With narration enabled, verify the expert's speech and AI replies do not trigger
   commands, microphone clones do not interrupt recording, and TTS is audible.

Automated tests distinguish synthetic hand/audio and mocked providers from live API
checks. Successful transcription/interpretation/TTS requests do not establish real
Quest microphone recognition, audible playback, concurrency, or a successful origami task.
Record final device observations separately before claiming end-to-end human acceptance.

### Observed during this delivery

Software gates: 372 shared/API tests + typechecks/builds; fixtures; eight desktop
workflows; 112 browser-module tests, 53 Python cases, 18 synthetic browser workflows.
Focused voice tests were rerun after final playback changes. Live API examples above
and synthetic audio transcription/TTS passed. On the connected Quest Browser 152,
a separate in-memory guide received synthetic speech through real ASR/intent and
navigated from step index 1 to 0. Reply audio decoded, but playback completion was
not observed; the audio clock stalled during remote tests (including a top-page
probe). This is an open worn-headset acceptance item, not a claim that audible replies
are already verified. A bounded playback timeout retains text and unlocks commands.
Existing recordings were not modified; probes were removed and streams/contexts stopped.
