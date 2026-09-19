# Browser tutor → Unity integration checklist

**For Hamza / the Unity integration owner.** The browser reference is now available in [experiments/quest-browser](../experiments/quest-browser/README.md). Merge this package to preserve the runnable UX, tests and findings; then port the behavior into the existing native architecture. **This package does not implement or validate the native port.**

Reviewed base: `8cd87f7` (19 September 2026). PRs [6](https://github.com/aidanjnn/trail/pull/6), [7](https://github.com/aidanjnn/trail/pull/7), [10](https://github.com/aidanjnn/trail/pull/10), [11](https://github.com/aidanjnn/trail/pull/11) and [15](https://github.com/aidanjnn/trail/pull/15) are merged. [PR 14](https://github.com/aidanjnn/trail/pull/14) remains open for voice grounding/auth. [PR 16](https://github.com/aidanjnn/trail/pull/16) removed native CI: hosted green checks alone do not establish Unity readiness. The [detailed source assessment](../experiments/quest-browser/NATIVE-INTEGRATION-HANDOFF.md) includes exact implementation references and historical evidence boundaries.

## What to preserve

| Existing native implementation | Integration rule |
| --- | --- |
| Pure C# `GuideController` / reducer / matcher | Sole progression authority; retain fresh samples, ordered gates, attempts, tracking-loss recovery and exactly-once completion. Browser visual state must not replace it. |
| `CaptureReplaySession` and canonical hand adapter | Extend their lifecycle; preserve timestamps, validity and joint mapping. |
| `WorkspaceCalibration` | Retain three-point fit plus independent fourth-point validation. Browser two-point placement has weaker evidence; it is not a drop-in substitute. |
| `NativeStorageFeature`, immutable revisions, preload hashes | Use for production saving/publishing/loading. Browser IndexedDB is an experience reference, not production storage. |
| Existing authored boundaries and reviewed instructions | Keep task-generic. A recorded step or detected pause does not tell us what physical action was successfully performed. |
| Native fresh-image inspection | Keep it advisory and bound to the paused guide/request. It does not continuously track objects or validate hand motion. |
| Pairing roles and strict TS/C# contracts | Create/Follow navigation must respect permissions. Any new metadata requires explicit versioning, validation and parity fixtures. |

## What testing actually established

The user reported recording, leaving AR, exporting, replaying and realigning a cloth demonstration after moving to another location. That is useful evidence for the manually placed browser workflow, not measured calibration accuracy or general transfer across different shirts. The image-checker trials produced plausible correct/wrong/uncertain snapshots; the local feature matcher struggled with viewpoint changes. Neither is a continuous object tracker.

The browser now contains holographic paired hands, local tolerance feedback, learner start waiting, ordered palm checkpoints, a tutorial library and a reusable save zone. Automated browser workflows use synthetic XR/hands/camera and mocked provider responses. The newest changes still need a real Quest run. Hand tracking under cloth, physical outcome accuracy, novice success rates and native frame time are unmeasured.

## Required integration work

These IDs are local checklist identifiers, not GitHub issues. Keep boxes open until the linked implementation **and its acceptance evidence** exist; add the implementation PR/build/test reference beside each completed item. A merge of this reference package completes none of them.

- [ ] **N0 — Establish the native baseline** (TRAIL-04/18). Install the current native APK on Quest 3S. Record the commit/build, runtime permissions, usable controls, valid two-hand observations and capture → review → preload → independently place → follow result. Run the existing local Unity checks after native changes; see [validation](../.agents/references/validation.md) and [device checks](device-check.md).
- [ ] **U1 — One Create/Follow shell** (TRAIL-08/12). Coordinate existing Capture, Guide and Storage controllers through a single experience controller. Home offers Create tutorial, Follow tutorial, Library and Settings; diagnostics stay in Settings. Standardize button hit areas, dwell/withdraw behavior, back/cancel and status placement. **Pass:** a new learner can reach follow mode without the laptop or contradictory engineering panels; author/learner pairing failures have a clear recovery path.
- [ ] **U2 — Set the save position once** (TRAIL-08). Create begins with stable visible left/right palm positions; after workspace registration persist them in workspace coordinates. Every take reuses these positions. Re-record, pause, review and next-step must not silently recapture them. Provide explicit Change save position; clear it for a new tutorial. **Pass:** record two different actions, returning to the same spot after each; inspect saved clips and metadata. Missing tracking, ordinary return-like task motion and accidental dwell must not save a bogus step.
- [ ] **U3 — Clean recording lifecycle** (TRAIL-04/08). Port pause/resume and deliberate endpoint-hold → return-to-save detection as testable C# logic. Trim poses and narration on the same timeline; exclude the return gesture and UI reaching. Preserve the previous take if its replacement is discarded. **Pass:** replay begins/ends on the demonstrated action, not button presses; pause, tracking loss, origin invalidation and cancel reset dwell; checkpoint time cannot include paused time. Keep explicit Stop available when a task naturally returns to the save position.
- [ ] **U4 — Paired ghost and honest green zones** (TRAIL-07/12). `GhostPresentation` currently selects one hand and `GuideController` presents `Targets[0]`. Render both required hands, with clear translucent expert geometry and distinct live-hand outlines. Draw the actual reviewed tolerance volume, not a fixed decorative radius. **Pass:** both hands remain legible against light/dark tables, missing tracking appears neutral, and green means motion proximity—not verified object placement. Tune on a real headset; do not claim centimeter accuracy from the configured radius.
- [ ] **U5 — Follow at the learner's pace** (TRAIL-06/07). Keep the native start/ordered-gate reducer; wire Watch → Your turn → Check result presentation to it. The ghost waits at the start until the required hands dwell there, then stays modestly ahead. Pause on missing required observations; require fresh reacquisition. **Pass:** wait 10 seconds before starting without the ghost running away, deliberately drift sideways and recover, skip a gate, cover a hand, repeat a step and resume after backend loss. No skipped gate or duplicate advancement. Recorded narration is not yet retimed to adaptive following; do not replay it misleadingly.
- [ ] **U6 — Explain relocation without silently scaling** (TRAIL-05/19). Let users place the declared workspace on a new table while preserving scale and handedness. Clearly identify origin, direction and validation marks, with visible sampling feedback and correction guidance. Browser origin+heading accepts different point spacing; native calibration has a stricter geometry contract. **Pass:** same objects and layout transfer after translation/yaw; incorrect scale, moved workspace and failed held-out checks cannot present valid alignment. Different shirt dimensions or changed object layouts require a separate retargeting design.
- [ ] **U7 — Save/review/load as one experience** (TRAIL-08/12). Reuse native durable storage and reviewed publication. Auto-generate an editable draft name; show Saving/Saved/Needs review/Ready to follow and a library. Keep task descriptions generic and human-reviewed. **Pass:** restart/load retains approved steps, layout, save-zone metadata and trim boundaries; failed upload cannot be presented as published. Desktop review may remain an explicit interim step; headset-only review is not already implemented natively.
- [ ] **C1 — Decide schema/import compatibility** (TRAIL-03/08). Add save-zone/trim metadata through versioned authoring contracts with TS/C# parity and rejection tests. Browser `trail.tutorial.prototype.v3` is not a native cache artifact. Port behavior first; either build an explicit external-source converter or visibly reject prototype files. **Pass:** nullable joints, clock differences, unsupported media and missing native calibration/provenance are never silently accepted or invented.
- [ ] **V1 — Close end-to-end acceptance** (TRAIL-07/08/12/19). Have a new user follow a reviewed 3–5-step task on a relocated workspace. Include waiting at the start, two-hand guidance, wrong movement/recovery, hidden-hand entry/exit checkpoints and explicit physical-result confirmation. Capture actual device build, tracking gaps, latency/frame time and observed failures. Keep motion checkpoint success separate from inspection advice and human-confirmed physical success.

Recommended order: **N0 → U1 → U2/U3/C1 → U4/U5 → U6/U7 → V1**. Keep a working native checkpoint build at each stage. Source tests are the regression specification; translate the important invariants into native tests instead of importing browser architecture.

## Where the porting references live

All paths below are under [experiments/quest-browser](../experiments/quest-browser/README.md).

| Behavior | Implementation reference | Regression reference |
| --- | --- | --- |
| Create/Follow, one-time setup, library | `public/tutorial-shell.mjs`, `tutorial-guide.mjs`, `tutorial-ui.mjs`, `tutorial-store.mjs` | `tests/browser-trail-flow.cjs`, `browser-save-position.cjs` |
| Recording / save-zone / clean trim | `public/tutorial-core.mjs`, `narration-core.mjs` | `tests/tutorial-core.test.mjs`, `narration.test.mjs`, `browser-narration.cjs` |
| Start wait, ordered palm gates, stale/lost tracking | `public/tutorial-follow.mjs`, `motion-core.mjs` | `tests/tutorial-follow.test.mjs`, `motion-core.test.mjs` |
| Holograms, workspace placement and UI | `public/tutorial-guide.mjs`, `tutorial-ui.mjs` | `tests/browser-tutorial.cjs`, `browser-trail-flow.cjs`; still requires visual/device acceptance |
| Review / trim / save / reload | `public/tutorial-review.mjs`, `tutorial-store.mjs` | `tests/browser-review.cjs`, `browser-tutorial.cjs` |
| Fresh photo / advisory state | `public/camera-snapshot.mjs`, `tutorial-assist.mjs` | `tests/camera-snapshot.test.mjs`, `tutorial-assist.test.mjs`, `browser-camera-snapshot.cjs`, `browser-assistance.cjs` |

## Explicitly unresolved after merge

- General object detection, depth localization, object-relative retargeting, grasps and cloth deformation. The [offline detector spike](../experiments/model-spike/README.md) showed false positives and seconds-long CPU passes; it is not a live guidance dependency.
- Reliable evaluation of occluded hands. Use visible entry/exit checkpoints, pause grading during loss, and do not grade inferred joints as observations.
- Task success from motion alone, or portability to all shirts/assemblies. Same-size objects and a restored starting layout remain the bounded transfer claim.
- Native microphone/WebRTC coaching and grounding integration, including open PR 14. Browser voice implementation is not native voice acceptance.
- Multi-device tutorial synchronization from the browser prototype. Private browser recordings are intentionally not included in this PR; export separately only when their owner intends to share them.

## Merge and implementation protocol

Merge the reference folder and this checklist without replacing `apps/quest` or native contracts. Assign the next native PR to a bounded set of IDs above, include the relevant tests, and update this document with concrete evidence. Resolve new conflicts against current main; the source assessment is a snapshot, not an instruction to overwrite newer work. Keep local native validation explicit because hosted native CI has been removed. Do not mark the original plan's physical acceptance gates complete merely because code exists or the browser tests pass.
