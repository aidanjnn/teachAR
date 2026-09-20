# Devpost submission text for Trail

Copy each block into the matching Devpost field. Markers used below:

- `[CHOOSE]` marks the two headset variants. Both stay in until the team decides. Delete the other one before 8 am.
- `[UPDATE BEFORE SUBMIT]` marks a fact that was true late Saturday and may improve overnight.
- `[PLACEHOLDER]` marks a sponsor section with nothing behind it yet. Delete it if that is still true.

Facts were checked against `main` at `6b0a069`, PR 19 (`codex/native-mvp-integration`), PR 21, Hamza's `codex/recording-integration` branch and PR 17 (`codex/browser-tutor-handoff`) around midnight Saturday.

---

## 1. Elevator pitch

One sentence, under 200 characters. Pick one.

Recommended:

> Record an expert's hands once, and a ghost of them floats over anyone's table, waiting for their hands to catch up.

For a software crowd:

> Git clone for hands: one recorded demonstration, replayed as a ghost over any table, until your hands match the expert's.

Plainer:

> Ghost hands for the real world: record a pro once on a Quest 3S, then follow their exact movements over your own table at your own pace.

The current pitch, "Your guide through complex actions", could describe a PDF. Replace it.

---

## 2. About the project

Paste everything between the two horizontal rules into "About the project". Devpost renders Markdown, tables and code blocks. It does not render Mermaid, which is why the diagrams below are plain text.

---

**Record an expert's hands once. A ghost of them floats over anyone's table, waiting for their hands to catch up.**

Trail is a mixed-reality tutor for physical skills, built this weekend for the Meta Quest 3S. An expert does a task once while talking through it. Trail turns that into a guide anyone can follow with their own hands, in their own room, at their own speed, with a voice coach that answers questions and is not allowed to decide when you are done.

## Inspiration

The way people learn to do things with their hands has not changed in a few thousand years. Someone stands beside you, says "no, like this," and moves your hands. A video cannot do that. A manual cannot. [TEAM: one true sentence here about who taught one of you something by physically moving your hands. Past finalists open with a real moment like that. Delete if nobody has one.]

So we asked what the smallest thing is that carries a physical lesson. Our answer was the expert's hands over time, stored in a coordinate system that is not tied to their table. Record that once. Put a translucent copy of it over someone else's table. Let them follow at whatever speed they need, and let their own headset decide when they have actually made the move.

One rule from the first hour shaped everything after it. The AI may talk. It may never advance the guide. Once you accept that, most of the architecture falls out on its own, and a surprising number of arguments never happen.

## What it does

There are two people in the loop and one 50 by 35 centimetre mat. Everything else is a headset and a laptop.

| Moment | What happens | What checks it |
| --- | --- | --- |
| Record | The expert registers the mat by touching three marks, then does the task while narrating. Trail records 25 named joints per hand, 30 times a second, in mat coordinates, with the narration on the same clock. | Calibration must fit within 2 cm or recording will not start. |
| Review | On the laptop, Trail finds the pauses in the wrist motion, proposes step boundaries, transcribes the narration and drafts a title and one-line instruction per step. | The expert edits and finalizes. A finalized guide is immutable. |
| Follow | The learner lays out the same parts on their own mat and touches the same marks. A cyan ghost hand shows each move with a short path line and a ring at the destination. | Wrist inside the ring, within 4 cm, held for half a second. Path gates in order. Tracking loss resets the hold. |
| Ask | The learner talks to a voice coach while working. "What now?" repeats the step. "Am I done?" gets a refusal. "Am I doing this right?" sends a fresh camera frame to a vision service that compares it with the expert's reference photo. | The coach answers only from reviewed step text. The vision service returns advice with a stated limitation, never "verified." |
| Watch | A laptop page shows the live step and progress to everyone standing around the table. | Spectators can look. They cannot touch progression. |

Here is a real exchange from Saturday night, running against the live model, with the fixture guide loaded:

```
You   [step 1]: What do I do now
Coach [step 1]: Slide the base from its outline into the center of the mat carefully.

You   [step 1]: Okay, I'm done
Coach [step 1]: I can't see the parts, so the system only checks the hand movement
                checkpoint. Watch the ghost hand to match the slide into the center.
```

That second answer is the whole product in one line. The coach knows what it cannot see and says so.

### What makes Trail different

| Compare | Video tutorial | Typical AR overlay | Trail |
| --- | --- | --- | --- |
| Who sets the pace | The video | A timer or a tap | Your hands |
| Where the lesson lives | Someone else's table | Anchors in one room | A mat you can put anywhere |
| Who decides a step is done | You, by pausing | The app | Your wrist, 4 cm, half a second |
| What the AI is for | Nothing | Often "Correct!" | Answering questions. Never advancing. |
| How you author | Camera, editing software | 3D tooling | Do the task once and talk |
| Moving to a new room | Fine, it's a video | Re-anchor everything | Touch three marks |

## How we built it

```
                    RECORD                                   FOLLOW
                                                       
 expert hands ──► headset hand tracking          learner hands ──► headset hand tracking
 narration    ──► headset mic                                          │
        │                                                              ▼
        ▼                                            ┌──────────────────────────────┐
 25 joints/hand @ 30 Hz, mat coordinates             │  progression reducer (pure)   │
        │                                            │  start gate → path gates →    │
        ▼                                            │  checkpoint hold → next step  │
 ┌────────────────────┐   upload    ┌──────────┐     │  no timers, no I/O, no AI     │
 │ private cache on   │ ──────────► │  Trail   │     └───────────┬──────────────────┘
 │ the headset        │             │  server  │                 │ current step, attempt
 └────────────────────┘             │ Fastify  │ ◄───────────────┘
                                    │          │ ──► spectator page (WebSocket)
   whisper-1 ◄── narration ──────── │ owns the │
   gpt-4.1-mini ◄── segments ────── │ API keys │ ──► GPT-Live side channel (step context)
   expert reviews on the laptop ──► │          │
                                    └────┬─────┘
                                         │ fresh frame + 2 reference photos
                                         ▼
                                  ┌──────────────┐    Responses API, strict JSON schema
                                  │ vision       │ ─────────────────────────────────────►
                                  │ service      │ ◄── verdict, evidence, limitation
                                  └──────────────┘

   headset mic/speaker ◄───────── WebRTC ─────────► GPT-Live   (only the SDP offer touches our server)
```

### Architecture

| Layer | Technology | Job |
| --- | --- | --- |
| Headset `[CHOOSE A]` | Unity 6, Meta XR SDK 205, OpenXR, XR Hands, MRUK, Unity WebRTC | Passthrough, hand tracking, the ghost, camera frames, native audio |
| Headset `[CHOOSE B]` | Quest Browser, WebXR hand input, Three.js, IndexedDB | Passthrough, hand tracking, the ghost, local guide library, no install |
| Progression | Pure C# (`Contracts/`, `Motion/`) with a 24-scenario harness `[A]`, or a pure JS module with adversarial tests `[B]` | Decides, alone, when a step is complete |
| Contracts | Zod 4 schemas, generated C#, shared fixture files | One recording and guide format that TypeScript and C# both validate |
| Server | Node 22, Fastify 5, WebSocket | Storage, pairing, spectator relay, live session registry, credential boundary |
| Vision | Second Fastify process, Sharp, Responses API | Compares a fresh frame with reference photos, returns structured advice |
| Desktop | Vite 8, TypeScript, Three.js | Authoring workbench, 3D replay, spectator page, Voice Lab |
| Voice | GPT-Live over WebRTC, whisper-1, gpt-4.1-mini structured outputs | Spoken coach, timestamped transcription, step labels |
| Checks | Vitest, Playwright, Unity Test Framework, GitHub Actions | 361 tests, 7 browser flows, 57 EditMode and 13 PlayMode tests |

### The pieces that took the most thought

**1. A recording format that survives a change of room.** Every frame is 25 named joints per hand in metres, relative to the mat, with a monotonic timestamp. Missing hands are stored as missing, with a reason, instead of interpolated. The expert's room, table height and headset position never make it into the file. Abridged:

```json
{
  "tMs": 1466,
  "hands": {
    "left":  { "status": "missing", "reason": "unavailable" },
    "right": { "status": "valid", "joints": {
      "wrist":            { "positionM": [0.21, 0.04, -0.12], "orientationXyzw": [0, 0.7071, 0, 0.7071] },
      "index-finger-tip": { "positionM": [0.27, 0.03, -0.19], "orientationXyzw": [0, 0, 0, 1] }
    } }
  },
  "head": null
}
```

The same fixture files are validated by the Zod schemas in TypeScript and by the generated C# on the headset, so the two sides cannot quietly disagree.

**2. A progression reducer that cannot be fooled.** It takes time and fresh observations as inputs and owns no timers, files or network. That is why it runs unchanged in a laptop harness and on the headset.

| Rule | Value |
| --- | --- |
| Start gate | Wrist within 7 cm of the recorded start, held 200 ms, before any progress counts |
| Path gates | Three per move at the quarter points, 4 cm each, passed in order |
| Checkpoint | Wrist within 4 cm of the recorded end, held 500 ms |
| Stall | No sample for 100 ms clears the hold |
| Jump | Wrist moving more than 0.5 m between samples counts as tracking lost |
| Reacquire | 200 ms of fresh samples before anything counts again |
| Short moves | Under about 11 cm the step needs an explicit Start, so a shuffle cannot arm itself |
| Ways the AI can advance a step | None |

**3. Calibration that refuses instead of stretching.** The learner touches three marks. Each touch needs 400 ms of stillness with a spread under 1 cm. A fourth mark, excluded from the fit, has to land within 2 cm or the whole thing is rejected. The mat's measured edges must match the recorded mat within 2 cm too, so the motion is never scaled to fit. Recentering, focus loss or taking the headset off invalidates everything.

**4. A voice pipeline the client cannot lie to.** GPT-Live runs over WebRTC directly between the headset and OpenAI. The only thing that passes through our server is the SDP offer, and the server holds the key.

```
learner speaks ──► headset mic ──WebRTC──► GPT-Live ──WebRTC──► headset speaker
                                              ▲
     POST /api/live/sessions (offer) ────►    │ step context, generation n
     Trail server ────────────────────────────┘ (server-owned side channel)

     the server refuses the session unless the side channel opens within 5 s
     step updates carry a generation; older ones are refused with 409
     every session dies on its own 30-minute timer
```

The step text the model hears comes from the stored guide, never from the client. The browser used to be able to append text to the session. It cannot any more.

**5. Visual coaching with freshness rules.** When the learner asks "am I doing this right?", the headset captures a frame and the server forwards it to the vision service with up to two reviewed reference photos. The model answers in a strict JSON schema with a verdict from a fixed set, the evidence it saw, a limitation it must fill in, and a suggested action. A frame older than 5 seconds at dispatch is refused. One inspection at a time. A favourable verdict pauses nothing and advances nothing.

**6. Pairing before exposure.** Browsers get a cookie and must pass an origin check, including on the WebSocket upgrade. The headset gets a scoped bearer token. Spectators can watch and never control. Finalized guides are immutable. A missing Origin header never bypasses anything.

### How we worked

Twenty-one pull requests over the weekend, each with the same checklist: typecheck, 361 tests, builds, fixtures and 7 browser flows in GitHub Actions, then a staff-style review before merge. Every substantive decision is written in a dated log in the repo, `docs/codex-log.md`, which is past sixty entries. We built the delivery workflow around Codex from the first commit. Branches are named `codex/<task>` and the repo carries Codex skills for commit, PR, review, cleanup, catch-up and PR babysitting.

## Challenges we ran into

**1. It rendered black.** Forty-one Unity tests were green and the app had never actually started on a headset. The first real launch on Saturday evening crashed on startup because two components looked for siblings inside a rig that was still switched off. After fixing that, the view was black with one red dot per eye. Hamza's logs showed the passthrough layer being paused while the app still had focus, which ruled out the obvious focus-loss story. Aidan traced it to the pairing panel hiding itself by deactivating the object it lived on. That object was the app root, camera rig included. The wearer confirmed the room and the Trail menu at 10:19 pm. `[UPDATE BEFORE SUBMIT: add a sentence if a full step was followed on device overnight.]`

**2. Fingers vanish the moment you grab something.** Quest hand tracking is good in the open and falls apart around a gripped object. We stopped fighting it. Trail checks only the wrist, after the grasp, and the demo task uses big lightweight parts so a wrist position means something. The plan carries a rule we kept coming back to: never widen a tolerance to hide a bad calibration. Make the parts bigger instead.

**3. Live voice races itself.** If the learner moves to step three while the update for step two is still in flight, the model must not answer about step two. Every step update carries a generation number, anything older is refused, and the server will not hand out a session at all unless its own control channel to the model opens within five seconds. On Saturday night we found that a late refusal for an already superseded update surfaced as an error in the coach and dropped it to text mode. Fixed, with a test that replays the race.

**4. GPT-Live never says it is done talking.** There is no end-of-turn event, so the coach auto-mutes after ten seconds without speech. That is a heuristic. We say so in the docs rather than pretending it is a feature.

**5. Timestamps picked the transcription model for us.** whisper-1 is the only OpenAI transcription model that returns segment timestamps, and we need them to line narration up with motion. It is also scheduled for deprecation next year. We took it anyway and kept the alignment code behind an interface.

**6. A CI job that was never going to pass.** Our hosted Unity tests failed eight runs out of eight before Unity even started. The test-runner action emitted a negated flag that the CLI it wraps rejects, because that CLI turns negation off in its argument parser. We found it by reading both projects' source, retired hosted native CI the same night and run the Unity gates locally with the results recorded in the repo.

**7. Android versus the USB cable.** The built app refuses plain HTTP over a USB cable, and three different ways of allowing it failed, including the Unity setting that claims to. So the headset can load a guide from files pushed over the cable, and anything over the network needs HTTPS. `[UPDATE BEFORE SUBMIT if the headset paired successfully overnight.]`

## Accomplishments that we're proud of

| Number | What it means |
| --- | --- |
| 25 | named joints per hand, 30 times a second, in mat coordinates |
| 2 cm | maximum calibration error before Trail refuses to continue |
| 4 cm, 0.5 s | checkpoint radius and hold, checked on the learner's own headset |
| 0 | ways the AI can advance, complete or skip a step |
| 361 | automated tests on every pull request, plus 7 browser flows and 70 Unity tests locally |
| 21 | pull requests this weekend, each reviewed before merge |
| 10:19 pm | Saturday, the first time Trail rendered on a real Quest 3S `[UPDATE BEFORE SUBMIT]` |

- A coach that refused to cheat in a live test. Asked "okay, I'm done," it answered that it cannot see the parts and only the hand checkpoint counts. We did not script that answer. The rules did.
- A recording format and a progression reducer that run identically in a laptop harness and on the headset, because neither touches a clock, a file or a socket.
- Two backend processes, one credential boundary. The headset never sees an API key or the internal vision token.
- Calibration with a held-out check mark. It refuses bad registrations instead of scaling the motion to fit them, which is the honest choice and the annoying one.

## What we learned

**Green editor tests say nothing about composition order on real hardware.** Two bugs that had been in the code for hours were invisible to forty-one passing tests and obvious in the first ten seconds on a headset. Run on the device early, even when it is inconvenient. Especially then.

**Decide what the AI is not allowed to do before deciding what it does.** "Never advance the step" removed a whole class of design arguments and made the coach's prompt about a screen long.

**Wrist-only tracking is a limit you can design around.** Big parts, checkpoints after the grab, honest labels. "Movement checkpoint reached" is less exciting than "Correct!" and we would pick it again.

**Record in the mat's coordinates and the room stops mattering.** Most of the transfer problem dissolved once we stopped storing anything about the expert's table.

**Voice APIs have ordering problems that chat APIs do not.** Generations, refusals and server-owned context are not over-engineering for a hackathon. They are the difference between a coach that answers about the right step and one that sounds confident and wrong.

**When CI fails eight times in a row, read the tool's source instead of retrying.**

## What's next for Trail

| Feature | Status | Why |
| --- | --- | --- |
| Object tracking | Deferred on purpose | Parts could move independently and the ghost could retarget to where they are. The first version keeps the starting layout fixed. |
| Authoring on the headset | Partly built | Recording, save position and multi-take exist on device. Segmentation and review still go through the laptop. |
| Mirroring for left-handed learners | Planned | A right-handed demonstration should flip cleanly across the mat. |
| Native voice measured on device | In progress | Echo cancellation, interruption and latency with mic, hands and camera all running at once. |
| A library recorded by people who are good at things | The point | Trail is only as good as the hands it records. |

## For the sponsor judges

### OpenAI API prize

What the OpenAI API does in Trail:

| Model | Where | What it does |
| --- | --- | --- |
| GPT-Live (`gpt-live-1`) | Headset and browser coach | Spoken conversation over WebRTC. Our server pushes the current step over the side channel so the model never trusts client text. |
| gpt-4.1-mini, structured outputs | Authoring | Turns each movement segment plus its narration into a title and instruction for the expert to review. Provenance is recorded as model, manual or fallback. |
| whisper-1 | Authoring | Transcribes the narration with timestamps so spans can be aligned to motion. |
| Image-capable Responses model | Vision service | Compares a fresh headset frame with up to two reference photos and answers in a strict JSON schema with verdict, evidence and a stated limitation. |

How Codex helped. Trail's delivery workflow was built around Codex from the first commit. Branches are named `codex/<task>`, the repo carries a set of Codex skills for commit, PR, staff review, cleanup, signoff, catch-up and PR babysitting under `.agents/skills/workflow`, and `docs/codex-log.md` records what Codex researched, changed and verified, entry by entry. [TEAM: pick the one example you will say out loud in the demo.]

- The voice workstream, PR 3. Codex read the current GPT-Live, Realtime, transcription and structured-output docs against the pinned SDK version, wrote the design spec and plan, implemented the contracts, provider, routes, browser coach and Voice Lab, then fixed all five of Aidan's review findings. Ali verified the live path with a real key on the desktop.
- The Unity toolchain. Codex installed and validated the pinned Unity 6000.3.24f1 editor and Android toolchain and wrote the reproducible steps in `docs/native-setup.md`.
- Catch-ups. When five feature branches landed in the same afternoon, Codex ran the catch-up skill on each open PR, resolved conflicts in the shared contracts and recorded the validation for each.

### Cognition, best use of Devin

Devin opened two pull requests during the event. PR 9 rewrote the plan to record the Unity commitment, reorder voice delivery and add demo-risk handling. PR 12 added verified local desktop execution notes to the manual-flows skill. Both were reviewed and merged. [TEAM: this is thin for "most technically impressive project built with Devin." Decide whether to keep this track selected.]

### Sentry, best use of Sentry `[PLACEHOLDER]`

Not integrated as of Saturday night. The plan proposes Tracing and Logs as the two products beyond error monitoring, and the prize wants one concrete defect found with them. If that happens by morning, write three sentences here: which two products, what they showed, what changed. Otherwise delete this section.

### Huawei OMNI Live challenge `[PLACEHOLDER]`

Not integrated as of Saturday night. Environment placeholders exist and nothing in the repo calls an OMNI model. The prize requires vision, speech and language from an OMNI model in one end-to-end scenario with a working demo. This page must not claim OMNI use unless that changes. [TEAM: decide whether to keep this track selected.]

## Full tech stack

**Headset `[CHOOSE A]`:** Unity 6000.3, C#, Meta XR Core, Interaction and MRUK 205, Unity OpenXR 1.18, XR Hands 1.7, URP 17, Unity WebRTC 3.0
**Headset `[CHOOSE B]`:** Quest Browser, WebXR hand input and passthrough, Three.js 0.186, IndexedDB
**Server:** Node 22, Fastify 5, Zod 4, ws, Sharp, OpenAI SDK 7
**Vision:** Fastify 5, Sharp, OpenAI Responses API with strict JSON schema output
**Desktop:** Vite 8, TypeScript 5.9, Three.js 0.186, plain HTML and CSS
**Voice:** GPT-Live over WebRTC, whisper-1, gpt-4.1-mini structured outputs
**Checks:** Vitest 5, Playwright 1.63, Unity Test Framework, .NET 8 harnesses, GitHub Actions
**Process:** pnpm 11 workspace, Conventional Commits, Codex skills, a dated decision log

---

## 3. Built with

Devpost tags, lowercase, up to 25. Past finalists list between two and ten. Keep it near twelve.

Always: `meta-quest`, `openai`, `gpt-live`, `whisper`, `typescript`, `node.js`, `fastify`, `zod`, `webrtc`, `websocket`, `playwright`, `codex`

`[CHOOSE A]` adds: `unity`, `c#`, `openxr`
`[CHOOSE B]` adds: `webxr`, `three.js`, `javascript`

Add `devin` only if the Cognition track stays selected.

---

## 4. Try it out links

- `https://github.com/aidanjnn/trail`

No hosted demo. The server is a loopback development tool on purpose.

---

## 5. Image gallery, real captures

Devpost wants 3:2, JPG or PNG, under 5 MB, up to 15. The first image is the thumbnail in a gallery of 260 projects and has to read at 300 pixels wide. Past finalists used photos of the real rig, in-headset captures, one or two screenshots and a build photo.

Suggested order:

1. Hero photo. The headset on the table beside the mat and the demo parts, natural light, nothing else in frame. Phone camera is fine. This is the thumbnail.
2. In-headset capture of the ghost hand over the real parts, ring visible. `adb exec-out screencap -p > shot.png` gives a stereo pair at 3664 by 1920. Crop one eye to 3:2. `[UPDATE BEFORE SUBMIT: possible once the ghost shows on device.]`
3. Voice Lab with the "live" badge and the transcript where the coach says it cannot see the parts. You had this on screen tonight. Crop tight.
4. The authoring workbench with the step strip, the 3D replay and the transcript. `test-results/authoring-review.png` exists from the end-to-end run but is a full-page capture. Reshoot at 1500 by 1000 after importing the sample.
5. The spectator page mid-run, step name and progress visible.
6. Calibration mat close-up. A, B and C marks, the D check mark, parts in their starting outlines.
7. Architecture diagram as an image. Paste the Mermaid from the README into mermaid.live, export PNG, pad to 3:2.
8. Build photo. One of you recording as the expert, headset on, hands over the mat.

---

## 6. Concept renders, the ones we cannot shoot

These are for the back half of the gallery. They show where Trail goes once the engine works, in places we cannot bring to a hackathon table. Rules so they help instead of hurt:

- Caption every one "Concept render" in the Devpost caption field. Judges forgive ambition and punish being misled.
- Never make a concept the thumbnail. Real photo first, always.
- Match the look of the storyboard already in the repo: photoreal passthrough view, one translucent cyan hand at about 20 percent opacity, a thin path line, a hollow ring at the destination, a dark 50 by 35 cm mat with small marks, one small smoked-glass step card. No skeleton dots, no wireframe room, no dense HUD, no "verified" badge anywhere.
- Real hands and real objects in the scene, one ghost hand, never a ghost object.

Ideas, roughly in order of how much they say about the product:

1. **Two rooms, one motion.** A split image. Left, an expert at a cluttered workshop bench with the mat. Right, a student at a dorm desk with the same mat and parts. The same cyan ghost hand at the same point in the same move on both sides. Caption: "The recording does not know which room it is in."
2. **Grandmother's hands.** An older woman's hands over a floured mat folding dumplings, a faint cyan trail behind them. Second frame, years later, a young adult's hands under the same ghost in a different kitchen. This is the emotional version of the pitch. If we only make one concept, make this one.
3. **Physio at home.** A kitchen table, a therapy cone set, a patient's hand following a ghost reach-and-place. A tablet in the background shows the spectator view for the therapist. Caption: "The therapist recorded it once. The patient does it every morning."
4. **Under the sink.** An apprentice on their back under a sink, a ghost hand showing which way the trap arm turns. Trades training is where "someone shows you once" is literally the pedagogy.
5. **Line side.** A factory workstation, a wire harness board, a technician's gloved hand and a ghost hand over the next clip. Boeing has published numbers on AR-guided assembly. This says "we know where the money is" without a slide.
6. **Ground control's hands.** A station-style panel, an astronaut's hand following a ghost hand recorded on the ground. NASA already uses AR procedures on the ISS. This one is for the wow, and it is honest about being a concept.
7. **One teacher, twenty tables.** A classroom lab, each bench with the same mat, each student with the same ghost at a different step. The scale story in one frame.
8. **The recording moment.** Close on an expert's hand mid-move with a soft cyan trail behind it and the step card reading "Recording 02 / 04". This is the hero art for the top of the page if the real hero photo is weak.

Prompt scaffold that matches the repo storyboard, adapt the scene line per idea:

```
Photorealistic first-person mixed-reality passthrough view, landscape 3:2, soft daylight.
Scene: <the room, the table, the mat with four small marks, the real objects>.
Action: <the real hand and what it is doing>.
Overlay: exactly one translucent cyan articulated ghost hand, about 20 percent opaque, a few
centimetres ahead of the real hand, subtle bright edges; one thin curved cyan path cue; one thin
hollow cyan ring at the destination wrist position. Objects remain visible through the ghost.
UI: one small smoked-glass card at the edge reading "TRAIL", "<step> / <total>", "<instruction>".
Avoid: extra hands, ghost objects, skeleton dots, wireframe rooms, dense HUD, glowing parts,
headset border, controllers, any success or verification message.
Footer text: "Concept render".
```

---

## 7. Video

Optional on the form. If there is time Sunday morning, a 60 to 90 second phone video of one learner run beats anything edited: calibrate, ghost appears, one chime, one question to the coach, finished object held up. The plan's recovery kit calls for this video anyway as the fallback if the headset misbehaves during judging. Upload unlisted to YouTube and paste the link.

---

## 8. Additional info form

"Which of the following AI tools did you use this weekend?" Select every tool anyone on the team actually used. OpenAI is certain. Add Devin under Other if the Cognition track stays.

"Did you implement a generative AI model or API in your hack?" Replace "Yes, voice" with:

> Yes. GPT-Live is the spoken coach, connected over WebRTC with our server pushing the current step to the model so it answers only from reviewed instructions and never marks a step complete. whisper-1 transcribes the expert's narration with timestamps so we can align it to hand motion. gpt-4.1-mini with structured outputs writes a title and instruction per movement segment for the expert to review. An image-capable Responses model compares a fresh headset camera frame with the expert's reference photos when the learner asks "am I doing this right?" and answers in a fixed schema with a stated limitation.

---

## 9. Open items for the team

1. Which headset runtime is the demo. PR 17 now says Quest Browser is "the immediate demo runtime" and PR 19 and PR 21 keep shipping the Unity app. Both variants stay in the text until this is decided. "What it does" is true either way; the architecture rows, one paragraph and three tags change.
2. OMNI is selected on the form and not in the code. Either integrate it or expect that section to be deleted.
3. Devin's contribution is two documentation PRs. Decide whether to keep that track.
4. Sentry is selected and not integrated.
5. Every `[UPDATE BEFORE SUBMIT]` marker depends on what runs on the headset between now and 8 am.
