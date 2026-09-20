# Web-first Trail delivery

## Decision and runnable entry point

The current foundation is the PR #17 → #23 → #24 stack, selected by the user on 2026-09-20.
The app now lives in `apps/webxr`; Unity source, C# consumers and native tooling
are retired. This document describes the retained browser behavior and next work.

Start with [the runnable README](../apps/webxr/README.md). `pnpm dev` launches
`/tutorial` (also `/`) on port 4321. `pnpm dev:desktop` starts the separate
TypeScript desktop/backend stack. The WebXR server remains a single-user
loopback development service, not a public deployment.

The tutor includes [the connected UI](web-ui-base.md) and
[preview-first practice with automatic movement transitions](web-practice-flow.md).
The standalone [visual reference](design/trail-ui/README.md) remains simulated.
PR #24 includes #23 and #17; those PRs need not be merged to use this branch.

## What exists versus what remains

| Capability | Browser source today | Boundary / next work |
| --- | --- | --- |
| Create / Follow | DOM and in-headset contextual workflow, library/drafts | Shared charcoal/light appearance, Create/Follow tiles and compact active panels implemented; headset legibility needs testing |
| Expert recording | Both tracked hands, timestamps, manual start/pause/resume/stop | No automatic task understanding; tracking quality remains device-dependent |
| Save gesture | One configured position per tutorial, endpoint hold and return trimming, manual fallback | Experimental; cyclic actions can trigger it; inspect retained end before approval |
| Review / local save | Replay, trim, instructions, approvals, IndexedDB drafts/library, import/export | Trim/pause/review available in AR; instruction text editing remains on the browser page; no automatic cross-device sync |
| Narration / photos | Optional local narration with trimming/playback; reference snapshots | Concurrent mic/camera/immersive hands needs a fresh Quest run; not a continuous expert video recorder |
| Transfer | Origin plus heading, translate/rotate and preview at original scale | Same object geometry/layout; no stretching to different shirts or arbitrary object rearrangement |
| Ghosts / learner guidance | Preview-first practice, broad start rings, relaxed ordered gates, automatic next-step previews and smoother translucent procedural hands | Palm proximity does not grade fingers, grip, contact or object outcome; not a polished skinned mesh |
| Recovery | Pause/repeat/watch, tracking/focus-gap gates, registration reset and movement-only final summary | Re-test headset interruption/re-entry and positioning after UI changes |
| Image checks | Separate local OpenCV and opt-in paid snapshot lab, capped attempts/cooldown/source/freshness checks | Plushie-specific experiment; not general tutorial completion or continuous 3D object tracking |
| Voice coach | Connected: the tutor publishes reviewed step text as a server coach guide, starts the bundled GPT-Live coach from its Voice coach card, follows step and attempt changes, and exposes Ask coach in the headset panel; narration drafts titles and instructions through Whisper and the label route | Mic + WebRTC + immersive session together on the Quest is unverified; live voice needs `AI_PROVIDER=openai` on the paired API; one Ask at a time, no hands-free listening |
| OMNI | Connected as advice: Look & advise sends a fresh frame, the step's reference photo and a question to Qwen-Omni through the yibuapi gateway (`SCENE_COACH=omni`), speech and caption come back, the hand loop stays the only progression authority | Live gateway acceptance (key pending), headset camera concurrency in AR, automatic paper anchoring |
| Hand feedback/audio | Durable-save green pulse/ding, muted event cues, cyan ghosts and learner outlines | Sound preference and cooldowns implemented; cues do not establish object correctness |

The user reported recording, leaving AR, exporting/reloading/replaying and relocating the cloth tutorial by marking its workspace. That is useful bounded human evidence, not a quantified accuracy result. Automated tests use synthetic hands/media/providers; none establishes novice task success or hidden-hand accuracy.

## Browser capability boundaries

The core is Three.js/WebXR hand capture, ghost rendering and local guidance.
Keep the existing origin-plus-heading placement at original scale. Browser APIs
must be capability-detected and validated on the installed Quest version;
persistent/shared anchors, room meshes and camera calibration/depth are not
established by this implementation. USB localhost is the development route;
ordinary remote hosting requires HTTPS and an explicit authentication design.

Passthrough display is not itself access to camera pixels. Concurrent capture,
AR, hands and duplex voice still needs a fresh device test. Hidden hands, cloth
deformation and object contact are not solved by the renderer. Haptics require
a separate supported actuator and remain optional.

## Source map for the next implementation

| Location under `apps/webxr` | Owns |
| --- | --- |
| `public/tutorial-guide.mjs` | XR session, sampling/rendering, actions, save lifecycle, current registration |
| `public/tutorial-ui.mjs` | Contextual headset view model and matching visual hit rectangles |
| `public/tutorial-shell.mjs`, `tutorial.html`, `tutorial.css`, `tutorial-design.mjs`, `tutorial-select.mjs` | Connected Home/library/review, appearance and accessible controls |
| `public/tutorial-feedback.mjs` | Durable-save and other event cues, mute and cooldowns |
| `public/tutorial-follow.mjs` | Local preview/ready/practice/transition phases and ordered gates; preserve start/freshness/dwell semantics |
| `public/tutorial-assist.mjs` | Palm comparator and clean-save endpoint detector |
| `public/tutorial-core.mjs`, `tutorial-store.mjs`, `tutorial-review.mjs` | Validated prototype format, local persistence, review/trim |
| `public/narration.mjs`, `narration-core.mjs`, `camera-snapshot.mjs` | Optional local media and timeline/freshness handling |
| `server.py`, `ai_verifier.py`, `auto_checks.py` | Local camera lab and bounded paid verifier; not the shared production API |
| `tests/`, `test-all.sh` | Pure, server and synthetic browser regressions |

Browser `trail.tutorial.prototype.v3` is not the shared API's recording/tutorial v1 contract. The coach adapter builds validated approved-step text context and explicit generation IDs; never silently submit browser JSON as an API recording. Keep provider keys on the server. The headset browser alone owns its local learner progression; AI/desktop observations cannot advance it.

## Next implementation and acceptance

The UI, compact controls, in-headset trim and durable-save feedback are implemented
in PR #23. PR #24 adds preview-first practice and automatic movement-only transitions.
The exact source/tuning/acceptance boundaries live in [UI base](web-ui-base.md) and
[practice flow](web-practice-flow.md).

Step-context voice coaching and narration drafts are also connected through the paired
API. Current-frame coaching, OMNI integration and simultaneous headset mic/WebRTC/XR
acceptance remain separate work.

1. **Fresh visual coach context.** Extend the connected step-text voice coach with
   reviewed references and fresh current-frame context. Preserve mic ownership,
   opt-in transmission, stale step/attempt rejection, budgets and cancellation.
   Integrate OMNI only after API/access is confirmed.
2. **Headset acceptance.** Record/review/save/reload a multi-step tutorial, relocate
   it, watch previews, enter broad start zones and follow hands-free transitions.
   Test off-path, stationary, hidden-hand, pause/repeat/focus recovery and final
   movement-only copy. Then test real voice + camera + XR and measure latency.

General object detection/retargeting follows a working demo. Physical-result gates
are separate work when needed; movement progress does not prove object correctness.

## Validation and publication boundaries

See the latest [activity log](codex-log.md) for exact software checks on this branch. No new live provider or headset test is claimed. Keep recordings, narration, camera frames, credentials, `.runtime`, `.secrets`, virtual environments and model weights out of Git. Published source does not copy this browser origin's private library; existing tutorials remain on the original device/origin. Export/import locally if a test requires transfer.
