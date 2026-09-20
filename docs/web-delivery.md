# Web-first Trail delivery

## Decision and runnable entry point

The user selected Quest Browser / WebXR as the immediate demo runtime on 2026-09-19, while preserving Unity work. This supersedes native-only delivery assumptions elsewhere in the historical plan. No Unity install, APK or native PR is required to run this browser tutor. The path remains `experiments/quest-browser` to avoid a disruptive move before the demo; it is now the selected demo, not merely a porting reference.

Start with [the runnable README](../experiments/quest-browser/README.md). `/tutorial` on port 4321 is the product entry. `apps/web` is the separate desktop/backend application; running `pnpm dev` does not start the headset tutor. The server is a loopback single-user development tool, not a public deployment.

This PR preserves the functional local source, tests and [interactive visual reference](design/trail-ui/README.md). It does not claim the reference has already replaced the headset UI. Do not merge the native integration PRs just to obtain browser features.

## What exists versus what remains

| Capability | Browser source today | Boundary / next work |
| --- | --- | --- |
| Create / Follow | DOM and in-headset contextual workflow, library/drafts | Apply the cleaner visual reference; current immersive panel is broad and text-heavy |
| Expert recording | Both tracked hands, timestamps, manual start/pause/resume/stop | No automatic task understanding; tracking quality remains device-dependent |
| Save gesture | One configured position per tutorial, endpoint hold and return trimming, manual fallback | Experimental; cyclic actions can trigger it; inspect retained end before approval |
| Review / local save | Replay, trim, instructions, approvals, IndexedDB drafts/library, import/export | Detailed edits currently require exiting AR to the browser page; no automatic cross-device sync |
| Narration / photos | Optional local narration with trimming/playback; reference snapshots | Concurrent mic/camera/immersive hands needs a fresh Quest run; not a continuous expert video recorder |
| Transfer | Origin plus heading, translate/rotate and preview at original scale | Same object geometry/layout; no stretching to different shirts or arbitrary object rearrangement |
| Ghosts / learner guidance | Procedural articulated translucent hands, learner outlines/palm zones, start gate, ordered learner-paced movement targets | Palm proximity does not grade fingers, grip, contact or object outcome; not a polished skinned mesh |
| Recovery | Pause/repeat, tracking/focus-gap gates, registration reset, explicit result confirmation | Re-test headset interruption/re-entry and positioning after UI changes |
| Image checks | Separate local OpenCV and opt-in paid snapshot lab, capped attempts/cooldown/source/freshness checks | Plushie-specific experiment; not general tutorial completion or continuous 3D object tracking |
| Voice coach | Connected: the tutor publishes reviewed step text as a server coach guide, starts the bundled GPT-Live coach from its Voice coach card, follows step and attempt changes, and exposes Ask coach in the headset panel; narration drafts titles and instructions through Whisper and the label route | Mic + WebRTC + immersive session together on the Quest is unverified; live voice needs `AI_PROVIDER=openai`; one Ask at a time, no hands-free listening |
| OMNI | Research/integration target | No OMNI tutor pipeline or live sponsor-model acceptance in this PR |
| Hand feedback/audio | Existing geometry feedback and some speech paths | Proposed durable-save pulse/ding, coherent event vocabulary and compact dock still need implementation |

The user reported recording, leaving AR, exporting/reloading/replaying and relocating the cloth tutorial by marking its workspace. That is useful bounded human evidence, not a quantified accuracy result. Automated tests use synthetic hands/media/providers; none establishes novice task success or hidden-hand accuracy.

## What the browser can do, and what does not transfer

Meta documents [WebXR hand input](https://developers.meta.com/horizon/documentation/web/webxr-hands/) and [mixed-reality passthrough](https://developers.meta.com/horizon/documentation/web/webxr-mixed-reality/). These support our core capture/ghost/local-guidance direction. Custom spatial controls, visual/audio cues, narration and server-backed AI can be composed here without a Unity runtime.

Unity Interaction SDK prefabs, C# controllers, MRUK components and native Android adapters cannot execute in the browser. Keep their workflow lessons, recreate presentation in Three.js, and connect browser-facing services explicitly. Do not promise identical native room meshes, persistent/shared anchors, camera calibration/depth or background lifecycle from WebXR. Feature-detect browser APIs and test the installed Quest version. [WebXR requires a supported browser and secure context](https://developer.mozilla.org/en-US/docs/Web/API/WebXR_Device_API); the current USB localhost setup is the development route, HTTPS is needed for ordinary remote hosting.

Passthrough display is not itself access to camera pixels. Existing Quest camera success is useful evidence for this device, but simultaneous capture, AR, hands and duplex voice still needs testing. Hidden hands, cloth deformation and recognizing object contact are not solved by choosing either renderer. No hand vibration exists without a separate actuator; controller haptics, if used, need capability detection.

## Source map for the next implementation

| Location under `experiments/quest-browser` | Owns |
| --- | --- |
| `public/tutorial-guide.mjs` | XR session, sampling/rendering, actions, save lifecycle, current registration |
| `public/tutorial-ui.mjs` | Contextual headset view model and matching visual hit rectangles; port design here |
| `public/tutorial-shell.mjs`, `tutorial.html`, `ar.css` | Non-immersive Home/library/setup/review navigation and style |
| `public/tutorial-follow.mjs` | Local ordered progression; preserve start/freshness/dwell semantics |
| `public/tutorial-assist.mjs` | Palm comparator and clean-save endpoint detector |
| `public/tutorial-core.mjs`, `tutorial-store.mjs`, `tutorial-review.mjs` | Validated prototype format, local persistence, review/trim |
| `public/narration.mjs`, `narration-core.mjs`, `camera-snapshot.mjs` | Optional local media and timeline/freshness handling |
| `server.py`, `ai_verifier.py`, `auto_checks.py` | Local camera lab and bounded paid verifier; not the shared production API |
| `tests/`, `test-all.sh` | Pure, server and synthetic browser regressions |

Prototype `trail.tutorial.prototype.v3` is not the repository's native wire contract. A coach adapter must build validated approved-step context and explicit generation IDs; never silently submit browser JSON as a native recording. Keep provider keys on the server. The headset browser alone owns its local learner progression; AI/desktop observations cannot advance it. Native reducers remain unchanged.

## Next small implementation slices

1. **Clean functional presentation.** Apply the reference tokens and boxed tiles to DOM and the actual XR canvas. Collapse active guidance to a side card/dock. Render hit targets from the same layout as visible controls. Preserve existing actions and tests; do not ship a screenshot of the mock as controls. Start with Home, Recording, Waiting, Guiding and tracking-loss states.
2. **Honest event feedback.** Emit save pulse/ding after the awaited IndexedDB write, distinct recording start/pause/end cues, tracking-loss pause and recovery. Sound mute, cooldown, visible failure and no false save success. Preserve one-time save position and explicit review.
3. **One coherent coach integration.** Done for step context and voice: `public/tutorial-coach.mjs` builds the shared `CoachContext`, publishes a coach guide, and maps the tutor epoch onto step revisions; the coach owns its own microphone stream and browser speech is silenced while it can talk. Still open: current-frame context (no camera pixels in WebXR), OMNI behind a replaceable adapter once its API/access is confirmed, and on-device measurement of mic, WebRTC and the immersive session together.
4. **Headset acceptance.** Record two actions, pause, return to the same save zone, review the trimmed ends, save, reload, relocate, wait at the start, move deliberately off path, recover, hide a hand, pause/repeat, confirm physical result. Then independently test real voice + camera + XR together and measure response latency.

General object detection/retargeting follows a working demo; it is not a prerequisite for this fixed-layout tutor. Keep the chosen physical task in recorded data, not hardcoded movement logic.

## Validation and publication boundaries

See the latest [activity log](codex-log.md) for exact software checks on this branch. No new live provider or headset test is claimed. Keep recordings, narration, camera frames, credentials, `.runtime`, `.secrets`, virtual environments and model weights out of Git. Published source does not copy this browser origin's private library; existing tutorials remain on the original device/origin. Export/import locally if a test requires transfer.
