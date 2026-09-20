# Devpost submission text for Trail

Copy each block below into the matching Devpost field. Markers:

- `[CHOOSE]` means two variants are written and one must be deleted.
- `[UPDATE BEFORE SUBMIT]` means the fact was true on Saturday night and may change by morning.
- `[PLACEHOLDER]` means nothing exists yet. Delete the section if that is still true at 8 am.

Facts below were checked against `main` at `6b0a069`, PR 19 (`codex/native-mvp-integration`), Hamza's `codex/recording-integration` branch and PR 17 (`codex/browser-tutor-handoff`) as of 11:45 pm Saturday.

---

## 1. Elevator pitch

Devpost allows 200 characters. Pick one.

Recommended:

> Record an expert's hands once. A ghost of them guides you through the same physical task on a Quest 3S at your own pace, with a voice coach that answers but never advances the step.

Shorter:

> Ghost hands for real-world skills. One recorded demonstration becomes a guide you follow with your own hands, in your own room, on a Quest 3S.

Plainer:

> Someone shows you once. Trail records their hands and replays them as a translucent ghost over your own table, and only moves on when your hands have done the move.

The current pitch, "Your guide through complex actions", does not say what Trail is or that it is a headset. Replace it.

---

## 2. About the project

Paste everything between the lines into the "About the project" field. Devpost renders Markdown.

---

## Inspiration

The way people learn to do things with their hands has not changed. Someone stands beside you, says "no, like this," and moves your hands. A video cannot do that. A manual cannot. [TEAM: one true sentence here about who taught one of you something by moving your hands. Past finalists open with a real hook like this. Delete if nobody has one.]

So we asked what the smallest thing is that carries a physical lesson. Our answer was the expert's hands over time, in a coordinate system that is not tied to their table. Record that once, put a translucent copy of it over someone else's table, and let them follow at whatever speed they need. The headset watches their own wrists and only moves on when they have actually made the move.

One rule from the first hour shaped everything after it. The AI may talk. It may never advance the guide. That decision made most of the architecture obvious.

## What it does

Trail runs on a Meta Quest 3S with hand tracking and no controllers. There are two people in the loop.

The expert puts a 50 by 35 centimetre mat on any table, touches three marks on it to register the workspace, then does the task while talking through it. Trail records 25 named joints per hand, thirty times a second, in mat coordinates, so the recording does not care which room or table it came from. The narration is recorded on the same clock.

On a laptop, Trail finds the natural pauses in the wrist motion and proposes step boundaries, transcribes the narration with Whisper, and asks a model for a title and a one-line instruction per step. The expert corrects anything and finalizes. A finalized guide cannot be edited again.

The learner lays out the same parts on their own mat and touches the same three marks. A fourth mark checks the alignment. If it is off by more than 2 centimetres, Trail refuses and asks for another try rather than stretching the motion to fit. A cyan ghost hand then shows the first move, with a short path line and a ring at the destination. When the learner's wrist reaches that ring, within 4 centimetres, and holds for half a second, the headset says "Movement checkpoint reached" and shows the next move. Gates along the path have to be passed in order. If tracking is lost, the hold starts over. Nothing except the learner's own hands can advance a step.

While working, the learner can talk to a voice coach. It answers only from the reviewed step text. Ask "am I done?" and it tells you it only checks the hand movement checkpoint. Ask "am I doing this right?" and a fresh frame from the headset camera goes to a separate vision service that compares it with the expert's reference photo and comes back with advice and stated uncertainty. It never says "verified." A laptop page shows the live step and progress to everyone around the table.

## How we built it

[CHOOSE one of the two headset paragraphs below and delete the other.]

[Variant A, native Unity app] The headset app is Unity 6 with the Meta XR SDK, OpenXR and XR Hands. The part that decides whether a step is complete is plain C# with no engine, network, file or timer dependencies, so we run it in a 24-scenario harness on a laptop and trust that the headset makes the same decision. Passthrough, hand tracking, the camera frame and the WebRTC audio link are thin Unity adapters around that core. The recording and guide formats are Zod schemas in TypeScript with generated C# on the other side, and both languages validate the same fixture files so they cannot drift.

[Variant B, Quest Browser] The headset experience runs in Quest Browser using WebXR hand input, passthrough and Three.js, so it needs no install. Guides live in the browser's local database with export and import, and the progression logic is a pure module with its own adversarial tests, so missing or stale tracking pauses a gate instead of passing it. The server and desktop tools share Zod schemas for recordings and guides, with fixture files that both TypeScript and the C# runtime validate.

The server is Node with Fastify. It stores recordings and guides, hands out short-lived pairing codes so nothing is reachable unpaired, relays the learner's progress to the spectator page over a WebSocket, and owns every provider credential. The headset never sees an API key.

Voice is GPT-Live over WebRTC. The client only exchanges the connection offer through our server. Step changes are pushed to the model by the server over its own side channel, with a generation number so a late update can never move the model backwards. Step labels come from gpt-4.1-mini with structured outputs. Transcription uses whisper-1 because it is the model that returns word timestamps, which we need to line narration up with motion. Image checks go through a separate vision process that calls the Responses API with the current frame, up to two reference photos and a strict JSON schema for the answer.

Every pull request runs typechecks, unit tests, builds and browser tests in GitHub Actions. As of Saturday night that is 361 unit and API tests, 7 end-to-end browser flows with a fake microphone, and 57 EditMode plus 13 PlayMode Unity tests run locally. We have shipped 21 pull requests this weekend, and every substantive decision is written up in a dated log in the repo.

## Challenges we ran into

The app had never actually started on a headset. Forty-one Unity tests were green, and the first real launch on Saturday evening crashed on startup because two components looked for siblings inside a rig that was still switched off. Then it rendered black. Hamza's logs showed the passthrough layer being paused while the app still had focus. Aidan traced it to a pairing panel that hid itself by deactivating the object it lived on, which happened to be the app root, camera rig included. [UPDATE BEFORE SUBMIT if a full step is followed on device: add one sentence about it here.]

Hand tracking loses fingers the moment you grip something. We stopped fighting it. Trail checks only the wrist, after the grasp, and the demo task uses big lightweight parts so a wrist position means something. The plan has a rule we kept coming back to: never widen a tolerance to hide a bad calibration. Make the parts bigger instead.

Live voice has ordering problems a text chatbot never has. If the learner moves to step three while an update for step two is still in flight, the model must not answer about step two. Every step update carries a generation number, anything older is refused with a 409, and the server refuses to hand out a session at all unless its control channel to the model opens within five seconds. A late refusal for an already superseded update used to surface as an error in the coach. We fixed that on Saturday night.

GPT-Live has no end-of-turn event, so the coach auto-mutes after ten seconds without speech. That is a heuristic, and we say so.

Our hosted Unity CI never passed once, eight runs out of eight, and not because of our code. The test-runner action emitted a negated flag that the CLI it wraps rejects, because that CLI turns negation off in its argument parser. We found it by reading both projects' source, then retired hosted native CI the same night and run the Unity gates locally.

Android refuses plain HTTP over a USB cable in the built app, and three different ways of allowing it failed. So the headset can load a guide from a file pushed over the cable, and anything over the network needs HTTPS. [UPDATE BEFORE SUBMIT if the headset paired successfully.]

## Accomplishments that we're proud of

The first launch on a real Quest 3S, with passthrough and the Trail menu visible, happened Saturday at 10:19 pm. [UPDATE BEFORE SUBMIT with whatever ran on device by morning.]

A recording format that survives a change of room. Meters, radians, monotonic milliseconds, 25 named joints, all relative to the mat, validated identically in TypeScript and C#.

A progression engine with no timers and no I/O. The start gate comes before the hold, only fresh valid samples count, and tracking loss cannot complete a step. Twenty-four scenarios prove it on a laptop before it ever runs on the headset.

A coach that refused to cheat in a live test on Saturday night. Asked "okay, I'm done," it answered: "I can't see the parts, so the system only checks the hand movement checkpoint. Watch the ghost hand to match the slide into the center."

Pairing before exposure. Browser sessions need an origin check, the headset needs a scoped bearer token, spectators can watch and never control, and finalized guides are immutable.

## What we learned

Green editor tests say nothing about composition order on real hardware. Two bugs that had been in the code for hours were invisible to forty-one passing tests and obvious in the first ten seconds on a headset.

Decide what the AI is not allowed to do before you decide what it does. "Never advance the step" removed a whole class of design arguments.

Wrist-only tracking is a limit you can design around. Big parts, checkpoints after the grab, honest labels. "Movement checkpoint reached" is less exciting than "Correct!" and we would pick it again.

Record in the mat's coordinates and the room stops mattering. Most of the transfer problem dissolved once we stopped storing anything about the expert's table.

When CI fails eight times in a row, read the tool's source instead of retrying.

## What's next for Trail

Object tracking, so parts can move independently and the ghost can retarget to where they actually are. We deferred it on purpose. The first version keeps the starting layout fixed.

Authoring entirely on the headset, without the laptop round trip.

Mirroring a right-handed demonstration for a left-handed learner.

Native voice measured on the device: echo cancellation, interruption, and latency with the microphone, hand tracking and camera all running at once.

A real library of tasks recorded by people who are good at them.

## For the sponsor judges

### OpenAI API prize

What the OpenAI API does in Trail. GPT-Live carries the spoken coach over WebRTC, with our server pushing the current step to the model over the side channel so the model never trusts the client's text. gpt-4.1-mini with structured outputs turns each movement segment plus its narration into a title and instruction that the expert reviews. whisper-1 transcribes the narration with timestamps so spans can be aligned to motion. An image-capable Responses model, called from a separate vision service with a strict JSON schema, compares a fresh headset frame with the expert's reference photos and returns a verdict, evidence and a stated limitation.

How Codex helped. Trail's workflow was built around Codex from the first commit. Branches are named `codex/<task>`, the repo carries a set of Codex skills for commit, PR, staff review, cleanup, signoff, catch-up and PR babysitting under `.agents/skills/workflow`, and `docs/codex-log.md` has more than sixty dated entries recording what Codex researched, changed and verified. [TEAM: pick the one example you will say out loud.]

- The voice workstream, PR 3. Codex read the current GPT-Live, Realtime, transcription and structured-output docs against the pinned SDK version, wrote the design spec and plan, implemented the contracts, provider, routes, browser coach and Voice Lab, then fixed all five of Aidan's review findings. Ali verified the live path with a real key on the desktop.
- The Unity toolchain. Codex installed and validated the pinned Unity 6000.3.24f1 editor and Android toolchain and wrote the reproducible steps in `docs/native-setup.md`.
- Catch-ups. When five feature branches landed in the same afternoon, Codex ran the catch-up skill on each open PR, resolved conflicts in the shared contracts and recorded the validation for each.

### Cognition, best use of Devin

Devin opened two pull requests during the event. PR 9 rewrote the plan to record the Unity commitment, reorder voice delivery and add demo-risk handling. PR 12 added verified local desktop execution notes to the manual-flows skill. Both were reviewed and merged. [TEAM: this is thin for "most technically impressive project built with Devin." Decide whether to keep this track selected.]

### Sentry, best use of Sentry [PLACEHOLDER]

Not integrated as of Saturday night. The plan proposes Tracing and Logs as the two products beyond error monitoring, and the prize requires one concrete defect found or improved with them. If that happens by morning, write three sentences here: which two products, what they showed, what changed. Otherwise delete this section.

### Huawei OMNI Live challenge [PLACEHOLDER]

Not integrated as of Saturday night. Environment placeholders exist and nothing in the repo calls an OMNI model. The prize requires vision, speech and language from an OMNI model in one end-to-end scenario, with a working demo. The Devpost text must not claim OMNI use unless that changes. [TEAM: decide whether to keep this track selected.]

---

## 3. Built with

Devpost tags, lowercase, up to 25. Past finalists list between two and ten. Keep it under twelve.

Always: `meta-quest`, `openai`, `gpt-live`, `whisper`, `typescript`, `node.js`, `fastify`, `zod`, `webrtc`, `websocket`, `playwright`, `codex`

[CHOOSE] Variant A adds: `unity`, `c#`, `openxr`
[CHOOSE] Variant B adds: `webxr`, `three.js`, `javascript`

Add `devin` only if the Cognition track stays selected.

---

## 4. Try it out links

- `https://github.com/aidanjnn/trail`

No hosted demo. The server is a loopback development tool by design.

---

## 5. Image gallery

Devpost wants 3:2, JPG or PNG, under 5 MB, up to 15. The first image is the card thumbnail in the gallery of 260 projects, so it has to read at 300 pixels wide. Past finalists used photos of the real rig, in-headset captures, one or two screenshots and a team or build photo. No slide-style graphics.

Suggested order and what to capture:

1. Hero photo. The headset on the table beside the mat and the demo parts, natural light, nothing else in frame. Take it tonight with a phone. This is the thumbnail.
2. In-headset capture of the ghost hand over the real parts, with the target ring visible. `adb exec-out screencap -p > shot.png` gives a stereo pair at 3664 by 1920. Crop one eye to 3:2. [UPDATE BEFORE SUBMIT: only possible once the ghost shows on device.]
3. Voice Lab with the "live" badge and the transcript where the coach says "I can't see the parts, so the system only checks the hand movement checkpoint." You had this on screen tonight. Crop tight.
4. The authoring workbench with the step strip, the 3D replay and a transcript. `test-results/authoring-review.png` exists from the end-to-end run but is a full-page capture. Reshoot at 1500 by 1000 after importing the sample.
5. The spectator page during a run, showing the step name and progress bars.
6. The concept storyboard, `docs/mockups/translucent-assembly-2026-09-19/guidance-sequence.png`. Already 3:2. Caption: "Concept storyboard from the plan, not a screenshot."
7. Architecture diagram as an image. Devpost does not render Mermaid. Paste the diagram from the README into mermaid.live, export PNG, pad to 3:2.
8. Calibration mat close-up with the A, B and C marks, the D check mark, and the parts in their starting outlines.
9. Build photo. One of you recording as the expert, headset on, hands visible over the mat.

Skip the first-person concept render. One concept image is enough, and judges should not mistake it for a capture.

---

## 6. Video

Optional on the form. If there is time Sunday morning, a 60 to 90 second phone video of one learner run beats anything edited: calibrate, ghost appears, one chime, one question to the coach, finished object held up. The plan's recovery kit calls for this video anyway as the fallback if the headset fails during judging. Upload unlisted to YouTube and paste the link.

---

## 7. Additional info form

"Which of the following AI tools did you use this weekend?" Select every tool anyone on the team actually used. OpenAI is certain. Add Devin under Other if the Cognition track stays.

"Did you implement a generative AI model or API in your hack?" Replace "Yes, voice" with:

> Yes. GPT-Live is the spoken coach in the headset, connected over WebRTC with our server pushing the current step to the model so it answers only from reviewed instructions and never marks a step complete. whisper-1 transcribes the expert's narration with timestamps so we can align it to hand motion, gpt-4.1-mini with structured outputs writes a title and instruction per movement segment for the expert to review, and an image-capable Responses model compares a fresh headset camera frame with the expert's reference photos when the learner asks "am I doing this right?"

---

## 8. Open items for the team

1. Which headset runtime is the demo. PR 17 now says Quest Browser is "the immediate demo runtime" and PR 19 and PR 21 keep shipping the Unity app. The story above has both variants marked `[CHOOSE]`. Whichever runtime is chosen, the "What it does" section stays true; the "How we built it" paragraph and the tags change.
2. OMNI is selected on the form and not in the code. Either integrate it or expect that section to be deleted.
3. Devin's contribution is two documentation PRs. Decide whether to keep that track.
4. Sentry is selected and not integrated.
5. Every `[UPDATE BEFORE SUBMIT]` marker depends on what runs on the headset between now and 8 am.
