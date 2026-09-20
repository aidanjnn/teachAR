# Fluid recording, movable controls and immersive library

Follow-up to [immersive entry](web-immersive-entry.md) and [preview-first practice](web-practice-flow.md). User-directed browser delivery; no Unity changes.

## Implemented user flow

- `/tutorial` → Enter always opens immersive **Home**, with Create and Library. Restored data remains available but a previous entry intent never starts replay automatically.
- **Home**, Settings and Exit AR are visible on every headset screen. Home during recording offers save/discard/stay; saving waits for its completion. Opening settings or dragging a panel pauses active recording/practice.
- Main panel: point at **Pinch + move**, pinch/hold, move, release. Timer: point/pinch its surface and move. These move presentation only. To relocate the motion itself, use tutorial placement controls.
- A small timer/status panel sits beside the calibrated workspace. It shows countdowns, recording time, actual save feedback, and practice/next-preview status. This position comes from user calibration, not automatic table detection. It can be moved independently.
- Library has a three-card page, title/layout search, All/Ready/Draft filters and paging. Panel entrances animate for 220 ms; reduced-motion removes scale motion. It contains real local tutorials; no fake sample projects are inserted.
- Search focuses a DOM input through Meta's supported system-keyboard integration. If unavailable, connected-keyboard search and card/filter browsing remain available. This needs real headset acceptance.
- Short pitch-swept Web Audio cues accompany navigation, capture, pause, movement checkpoints and durable saves. Settings can mute them; visual status always remains. Save cues can be audible during continuous narration; test echo/bleed on Quest.

## Continuous authoring

Create defaults to **hold-to-save**. Prepare the objects, choose origin and heading, then start one demonstration. A save-position ritual is no longer required in this mode. The prior return-to-save/manual mode remains selectable from recording setup/options. Re-recording an existing step uses manual capture and review so it replaces that step rather than appending continuous segments.

1. Required hands default to Both, shown before recording. More options can select Left or Right for a one-hand task. A momentarily hidden hand never changes that selection.
2. At least 8 cm of palm displacement and 1.2 s of valid sampling arms the hold.
3. Stay within a 2 cm palm region for 1.4 s. Rings around the tracked palms and the surface bar show the hold filling.
4. The segment is committed and capture immediately continues; no per-segment approval screen. Fresh movement must arm another hold, so remaining still does not create duplicates.
5. Finish tutorial saves meaningful unfinished motion, ignores an idle tail, waits for pending media/storage, and makes the accepted tutorial available to Follow. Explicit finishing is still required once per tutorial.

These are demo defaults, not measured ergonomic thresholds. A pause intrinsic to the task can split a step; use manual mode for such tasks. Tiny finger-only movements do not arm an 8 cm palm threshold. Hidden active hands, backwards time, >200 ms sample gaps, focus loss and pause clear dwell; unseen motion is never graded. This records joint motion and optional narration, not a new continuous camera-video format.

Narration finishes asynchronously per segment while the next take begins. At most three unfinished segment jobs are allowed; existing 12-step, frame, duration and byte limits remain. Motion is persisted immediately, with an explicit pending-narration issue until audio is finalized. Interrupted narration requires repair. Storage errors pause recording and do not emit a successful-save event. Follow still requires valid authoring data and explicit tutorial Finish.

### Browser format change

The existing browser v3 format accepts optional step `acceptance: "hold" | "finish" | null`. `reviewed` remains false for continuous captures: a deliberate recording hold is author acceptance, not replay review. Completion reports `expert-accepted; physical result unverified` when any step was not replay-reviewed. Imported values are validated; required-hand tracking/timestamp gaps and narration issues still block readiness. Gapped continuous segments remain drafts needing repair. Edits to layout, guide hands, cues/photos, narration, step order or trimmed motion invalidate acceptance and require review again. Old recordings remain readable; old clients do not understand this acceptance field and may require review. Native wire contracts are unchanged.

## Quest boundary limitation

The app already requests `immersive-ar` with a **local** reference space, suitable for seated/stationary interaction. The browser cannot force Horizon OS to select Stationary, remove an existing room boundary, or persist a per-app OS boundary policy. Before entering, use the headset Boundary settings to select Stationary at your current location when offered. Launcher help and Settings → Quest boundary help explain this. No boundary bypass was added, and no bounded-floor space is requested.

## Reuse and sources

- [WebXR spatial tracking explainer](https://immersive-web.github.io/webxr/spatial-tracking-explainer.html): local versus bounded/unbounded tracking; a reference space is not an OS boundary-setting API.
- [Meta system keyboard in WebXR](https://developers.meta.com/horizon/documentation/web/webxr-keyboard/): focus a real DOM input, read its value, handle session visibility and remove it at session end.
- [Three.js point-and-drag example](https://threejs.org/examples/webxr_vr_handinput_pointerdrag.html): reuse Three raycasting and WebXR selection lifecycle; no additional rendering framework or conflicting XR loop is installed.
- Existing skinned hands, theme tokens, IndexedDB library, narration recorder and CanvasTexture panels are reused. Feedback audio uses browser oscillators rather than downloaded sound assets.

## Integration seams and acceptance

`fluid-capture.mjs` owns deterministic hold detection and library filtering. `tutorial-guide.mjs` owns segment acceptance, storage and local progression. `spatial-controls.mjs` owns presentation dragging, timer and hold rings. `ar.js` owns session/input/keyboard lifetime. `tutorial-ui.mjs` owns matching render/hit rectangles. Voice/OMNI must route authorized actions through these seams; model replies must not directly advance movement or claim physical correctness.

Software checks cover uninterrupted two-segment capture, no idle duplicates, storage rejection, acceptance export/trim invalidation, pause/tracking gaps, permission blur, search, and panel/timer dragging without changing calibration. Existing manual capture, narrated recording, review, import/export and learner progression regressions remain required.

The [PR #29 review repairs](pr29-review.md) add nested Home/Exit protection, countdown cancellation during dragging, immediate pause on failed motion storage, and durable completion of previously accepted narration after the next take is discarded or XR ends. Opening another tutorial waits for accepted media; failed saves retain the current data for retry/export. Desktop instruction/hand edits invalidate capture acceptance, and narration startup errors remain drafts requiring repair. Page unload still cannot guarantee asynchronous media completion; wait for local saves before closing the page.

Headset checklist: exit old AR, reload the same origin (`http://localhost:4345/tutorial` on the current dev setup), Enter → Create, choose hands-only or capture permissions, place the workspace, demonstrate two movements with deliberate endpoint holds, Finish, Home → Library → Follow. Try panel/timer dragging, Home mid-take, muting, search keyboard, tracking loss and deliberate off-path practice. Confirm narration boundaries and save cues by listening to replay. Verify comfort and actual tracking on Quest; synthetic browser tests do not establish those results.
