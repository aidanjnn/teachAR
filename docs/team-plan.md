# Trail: four-person execution plan

**Objective:** deliver the quality target in [the implementation plan](plan.md): freshly demonstrated bottle and LEGO-style tasks become reviewed tutorials; another learner follows translucent ghost hands on **Quest 3S**, talks to **GPT Live**, and asks “Am I doing this right?” using a fresh headset-camera image. One reusable engine serves both tasks with fixed starting layouts per tutorial.

**Selected stack:** a standalone **Unity + Meta XR** Android headset app in `apps/quest`, plus the existing TypeScript/Fastify server and desktop review/spectator tools. Unity setup and all native features remain planned; the existing web diagnostic stays useful. This document replaces the IWSDK assignments. It does not restart the build clock or claim completed implementation. [Plan section 4](plan.md#4-stack-and-repository-setup) owns setup; section 6 owns contracts.

## 1. The four jobs

| Person | Owns the outcome | First deliverable |
| --- | --- | --- |
| **1 — Headset and spatial experience** | Native hand capture, calibration UI, separate ghost, guide presentation, MRUK camera acquisition | Five-second real recording/replay and one fresh headset frame |
| **2 — Motion and contracts** | Pure C# motion engine, C#/TS wire compatibility, offline segmentation/gates and fixtures | Synthetic learner completes one step; invalid input and skipped gates fail |
| **3 — Voice and AI** | Native mic/WebRTC/audio, narration alignment, server Live/Responses, labels and interruption | Audible two-way GPT Live exchange on the Quest APK |
| **4 — Platform and integration** | Unity project/build/settings/main scene, native auth/network/storage, web review/spectator and release checks | Reproducible APK, preserved web checks, paired native API connection |

Person 4 coordinates integration; each feature owner integrates and tests their own module. Prior XR experience does not lower the target. Schedule real device access and use fixtures so three people can work while one wears the headset.

## 2. Start together, then split

Use 15 minutes to assign names, confirm actual remaining hours and toolchain readiness, choose the bottle and second task, mark the mat and freeze starting layouts. Record one shared kickoff time and the next integration gate. Unity/account/Android downloads are a real setup dependency; do not pretend this is a five-minute npm install.

Agree on one canonical recording, tutorial, guide-event and scene-observation fixture. Preserve the 25-joint v1 wire format through named native mapping; coordinate changes using [plan section 6](plan.md#6-shared-contracts-to-freeze-before-parallel-implementation). Do not create competing JSON formats.

| Person | First 60–90 minutes, subject to toolchain readiness | Shared output |
| --- | --- | --- |
| 1 | With 4, configure one OpenXR/Meta rig, passthrough and hands; prepare mat; implement native pose and MRUK probes | Device diagnostics, named joint sample, fresh frame |
| 2 | Pure C# assemblies, strict DTO cases and golden transform/mapping/dwell fixtures; preserve TypeScript tests | Contract fixtures and engine API usable without headset |
| 3 | Check account/server protocol independently, then native WebRTC audio prefab and Android build compatibility | Native audio interface, server session routes and first heard headset exchange |
| 4 | Create/pin Unity project and Android profile; preserve pnpm baseline; add native pairing/API adapter | APK/build recipe, token contract and server endpoint |

The first integrated proof is the **same standalone APK** running hand capture/ghost, native camera snapshots and two-way speech together. Desktop provider tests and separate SDK samples are useful diagnostics, not substitutes.

## 3. Person 1: headset and spatial experience

**Tickets:** TRAIL-01/04/05/07; feature runtime in 18; native camera portion of 17; headset quality in 12.

**Own:** `apps/quest/Assets/Trail/Runtime/XR/`, motion files in `Runtime/Record/`, `Runtime/Guide/`, `Runtime/Scene/`, spatial scripts in `Presentation/`, separate rig/ghost/UI prefabs. Own device evidence with the team. Person 3 owns narration files and the Coach prefab; Person 4 owns the main scene.

Build in this order:

1. Fresh tracked hands against one origin; explicit side, validity, 26→25 named mapping and coordinate adapter. Reject controller-driven/cached/synthetic poses as real capture.
2. MRUK camera permission/feed probe early; bind a delivered frame to its timestamp/source. Supply owned copied pixels without ghost overlays for 3/4.
3. Call Person 2's calibration engine from three-point UI; display fourth-mark error. Recenter/removal/origin changes invalidate registration.
4. Record/reload five seconds in canonical workspace coordinates; show diagnostic skeleton, then a separately driven articulated ghost.
5. Integrate Person 2's reducer in one ordered sampling/effect path; wire local Pause/Repeat/Resume and tracking-loss recovery.
6. Add adaptive cue, small world-space controls, voice status/captions and measured visual polish. No model-driven target changes.
7. Test transfer with another person, both tasks, real grasp visibility and camera/audio/casting concurrency.

**Done:** independent learner calibration and paced completion; loss/recenter cannot advance; fresh camera evidence reaches coaching. Needs domain APIs from 2, audio/context from 3, build/auth/files from 4. If tracking/calibration fails, pair with 2 on the actual data rather than widening tolerances.

## 4. Person 2: motion and contracts

**Tickets:** TRAIL-03/06; math in 05, segmentation/gates in 08, conversion tests in 18.

**Own:** `apps/quest/Assets/Trail/Contracts/`, `Motion/`, their EditMode tests, shared `fixtures/`, and `packages/motion` offline authoring/reference logic. Propose `packages/contracts` changes with Person 4; all consumers review serialized changes.

Build in this order:

1. Strict C#/Zod fixture compatibility, named-joint map, reflection/rotation conversion and sidecar/version migration cases.
2. Pure C# rigid calibration and round trips; retain TypeScript baseline and golden expected results. No UnityEngine types in domain assemblies.
3. C# start/gate/dwell/repeat reducer with explicit clock and fresh validity. Slow learner, shortcut, stale sample and interrupted dwell tests precede device tuning.
4. TypeScript offline segmentation/checkpoint/gate generation for server compilation and browser review; same coordinate conventions and fixtures as native runtime.
5. Tune only from measured recordings; distinguish cosmetic path lookahead from completion evidence.
6. After the domain gate passes, take a bounded timeline/reference-review widget if 4 needs help.

**Done:** native runtime owns progression deterministically; cross-language fixtures agree where algorithms overlap. The server/compiler cannot advance a live step. No second competing runtime state machine is introduced in the browser.

## 5. Person 3: voice and AI

**Tickets:** TRAIL-09/10/16; Responses/Live portion of 17; voice dependency and compatibility support in 18.

**Own:** `apps/quest/Assets/Trail/Runtime/Coach/`, narration/audio files under `Runtime/Record/`, a separate Coach prefab/tests, `apps/server/src/ai/` and owned Live/label/inspection route modules. Person 4 registers routes and supplies auth/storage.

Build in this order:

1. Validate `gpt-live-1` account/protocol, then prove native Android mic → WebRTC → Live → headset speaker. Test echo, interruption, permissions, data channel, ICE and cleanup with XR active. Browser/Editor success is a diagnostic only.
2. Freeze native audio interface with 1: one microphone owner, bounded sample buffers, common epoch, mute/end and playback generation control. Coordinate UPM dependency/settings with 4.
3. Produce complete WAV narration with sample-clock mapping; test start/end drift before transcription/labels.
4. Implement server-owned session creation/sideband/delegation, exact current-step context, stale audio suppression and unavailable state.
5. Implement bounded Responses assessment using 1's fresh Quest frame and 4's reviewed expert references. Correct-looking, visibly wrong and obscured states need different grounded feedback.
6. Integrate labels with 2's fixed segments and 4's review; AI cannot invent coordinates, adjust tolerances or emit completion.

**Done:** real headset conversation and visual feedback while guidance runs, with tested failures and interruption. Own provider/transport failures rather than transferring them to 4. SDK WebRTC support does not establish GPT Live compatibility until the actual APK is tested.

## 6. Person 4: platform and integration

**Tickets:** TRAIL-02/11/18; coordinates 08/13/17; optional 15 only after core quality.

**Own:** `apps/quest/Packages/`, `ProjectSettings/`, main `Scenes/Trail.unity`, build/test wrappers and `Editor/`, `Runtime/Network/`, `Runtime/Storage/`, other server code and web review/spectator. Own pnpm changes only when needed; the desktop viewer does not need IWSDK or a Vite downgrade.

Build in this order:

1. Freeze compatible editor/OpenXR/Meta/WebRTC set with 1/3, establish Android ARM64/IL2CPP build/install, preserve `.meta`/GUIDs and existing web checks. Record activation/CI constraints.
2. Native bearer pairing/auth and role-scoped HTTP/WS, retaining browser cookie/Origin checks. No authentication bypass because a native request has no Origin.
3. Native private-file cache and server atomic upload/finalize, immutable tutorial identity and recovery. Keys never enter the APK.
4. Register 3's provider routes; receive 1's nonce-bound camera frames. Build expert-reference selection/storage and invalidate review on boundary edits. A webcam assists debugging/reduced demos, not headset-camera acceptance.
5. Desktop timeline/review/spectator with real data, reconnect/stale states and composed audience view.
6. Integrate feature prefabs into the main scene, maintain known-good APK/server pairs, run applicable gates and coordinate acceptance/runbook.

**Done:** another teammate builds/installs/pairs the app, records/reloads a tutorial and runs a useful spectator view. Each module owner fixes their own failures; 4 owns the queue and common interfaces, not all implementation.

## 7. Shared handoffs

| Handoff | Producer → consumer | Acceptance |
| --- | --- | --- |
| Unity baseline | 4 with 1/3 → all | Exact editor/UPM lock, build profile, APK install and reproducible commands |
| Contracts/fixtures | 2 with 4 → all | Same JSON accepted/rejected by C# and Zod; explicit native sidecar versions |
| Pose/calibration | 1 + 2 → guide | Same reference basis, valid named joints, held-out mark and reflected-axis tests |
| Real recording | 1 → 2/3/4 | Fresh workspace data, actual timestamps, gaps and consent/provenance |
| Motion engine | 2 → 1 | C# reducer/effects, ordered gates and simulated learner; no SDK/I/O dependencies |
| Segments/gates | 2 → 3/4 | Fixed IDs/ranges and recomputable targets on boundary edits |
| Narration | 3 → 2/4 | Complete WAV, MIME/duration/offset/drift; replayable after upload |
| Live | 3 → 1/4 | Native prefab/interface, server sideband, captions/state; actual audible success |
| Scene evidence | 1 → 3/4 | Copied MRUK frame bound to nonce/source/timestamp, bounded readback and age |
| References | 4 review + 1 capture → 3 | Expert images and descriptions tied to actual recording/step revision |
| Assessment | 3 → 1/4 | Server-bound identity, grounded result; cannot advance or resume guide |
| Spectator | 1 guide snapshots → 4 | Authoritative run/sequence, stale display and reconnect snapshot |

Person 1 owns the capture epoch; Person 3 reports audio mapping uncertainty. Person 1 acknowledges exact step/attempt and pauses locally before an admitted inspection. Resume/Repeat/new question invalidates that work. Person 4 issues scoped capture requests; Person 1 returns only a new authorized source frame; Person 3 rechecks context and age before speech.

## 8. Headset schedule and integration cadence

- Person 1 has primary spatial slots, but reserve joint camera/audio slots as soon as the first APK installs. Person 3 must not wait until the final hours for device audio.
- Others use shared synthetic fixtures, Editor PlayMode inputs and mocked providers. Label simulator input clearly.
- At each checkpoint each owner brings a concrete artifact, test result and named blocker. Do not merge four isolated demos at the end.
- Preserve the original gates: setup/fixture; first native diagnostics; H+4 combined physical slice; H+7 one step; H+11 multi-step; H+15 natural authoring/second task; H+18 freeze. Reconcile with actual remaining time and toolchain downloads.
- Person 4 immediately rechecks event/sponsor deadlines in the participant portal; the old schedule is historical planning context.

## 9. Git, Unity assets and rebalancing

Use focused branches and modules. Person 4 alone composes the main scene/settings/locks; feature owners supply separate prefabs and keep `.meta` files intact. Shared-contract changes include fixtures and migration notes. No unrelated dependency upgrades, duplicated providers or force-regeneration of the repository.

If blocked for roughly 20 minutes, post the exact failing boundary, current evidence and needed input. Pair the two relevant people while the others continue. If 4's review UI is behind, 2 takes a named widget after domain gates; if storage is behind, 3 takes a named route using 4's abstraction. If physical transfer fails, 1/2 prioritize it while 3/4 keep voice/backend useful. Cut sponsor extras before core polish or truthful behavior.

## 10. Ticket accountability

These labels map to [plan section 17](plan.md#17-immediate-tickets-to-create), not existing GitHub issues. Each supporting owner implements/tests their own listed piece.

| Ticket | Accountable | Support / split |
| --- | --- | --- |
| TRAIL-01 Runtime/task/deadlines | 1 | 4 checks deadlines and network route |
| TRAIL-02 Scaffold/native API | 4 | Everyone preserves current checks; 4 adds scoped native pairing |
| TRAIL-03 Contracts and fixture | 2 | 4 coordinates shared-contract acceptance; 1/3 review |
| TRAIL-04 Real capture/replay | 1 | 2 validates exported fixture |
| TRAIL-05 Registration | 1 | 2 implements/tests math; second person performs transfer check |
| TRAIL-06 C# motion progression | 2 | 1 supplies live samples |
| TRAIL-07 Interactive step | 1 | 2 supplies reducer; 4 composes scene/records integrated result |
| TRAIL-08 Multi-step authoring/persistence | 4 | 1 capture/markers; 2 segmentation/gates; 3 narration associations |
| TRAIL-09 Synchronized narration | 3 | 1 shares clock/session lifecycle; 4 persists asset |
| TRAIL-10 Semantic labels | 3 | 2 supplies segments; 4 persists/reviews labels |
| TRAIL-11 Spectator/recovery | 4 | 1 emits snapshots; 2/3 exercise failure cases |
| TRAIL-12 Visual/interaction quality | 1 | 4 owns review/spectator; 2 path cues; 3 voice UX |
| TRAIL-13 Learner acceptance/demo | 4 | 1 device; 2 evidence; 3 provider/video; recruit a non-builder learner |
| TRAIL-14 Optional sponsor additions | 3 | 4 checks eligibility/submission and integration capacity |
| TRAIL-15 Optional haptics | 4 | Only after core quality gates; drop if it displaces required work |
| TRAIL-16 GPT Live conversation | 3 | 1 mounts headset UI and tests audio concurrency; 4 registers paired routes |
| TRAIL-17 Scene-grounded spoken inspection | 4 | 4 reference storage; 1 native MRUK capture; 3 assessor/Live delivery; 2 review widget after motion gates pass |
| TRAIL-18 Unity + Meta XR setup | 4 | 4 editor/UPM/settings/build/main scene; 1 rig/raw hands/camera/UI; 2 C#/TS fixtures; 3 native WebRTC compatibility |


Start TRAIL-16/17/18 early. Native setup in 18 unblocks APK validation for capture/voice/camera; 02/03 supply shared API/contracts. Ticket numbers preserve references, not chronological order.

## 11. Finish as one team

Run existing pnpm/fixture/Playwright gates for the web/server and the implemented Unity EditMode/PlayMode/build gates for native code. No command should be claimed available before its wrapper exists. CI licensing gaps are reported, not hidden behind green web checks. Record device evidence separately in `docs/validation.md` only after testing.

The target requires both fresh task families, independent learner calibration, paced local progression, tracking-loss recovery, a readable articulated ghost, real headset conversation, and fresh **headset-camera** feedback for correct/wrong/obscured views. Three consecutive runs and a non-builder trial must work. Ship a reproducible APK/server pair, exported tutorial, runbook and labeled backup video. A webcam, controller-only replay, manual labels or unavailable voice are disclosed reduced outcomes.

**First assignments:** 1—native hands/ghost/MRUK probes; 2—C# domain and cross-language fixtures; 3—native GPT Live audio and server delegation; 4—Unity build/project plus native API/auth/storage. Converge on one functioning APK before optional integrations.
