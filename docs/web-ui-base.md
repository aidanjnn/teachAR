# Connected browser UI/UX base

This builds on the runnable browser tutor rather than replacing it with the design preview. No Unity assets or native code are required. Run `pnpm dev` from the repository root, then open `/tutorial`; use `pnpm quest:open` for the USB-connected Quest. Existing device-local tutorials remain on their original browser origin. Changing the port creates a different library.

The follow loop is now extended by [watch / prepare / practise](web-practice-flow.md): previews and automatic movement-only transitions replace per-step result buttons.

## Implemented workflow

- Home offers boxed-plus **Create tutorial**, library **Follow tutorial**, and current-draft recovery. Charcoal is default; warm-gray appearance and event sound preferences persist locally.
- Create uses the existing workspace and one-time save-position setup. Manual start/pause/resume and the experimental return-to-save gesture remain available. Active recording uses a compact instruction panel and controls.
- Review supports pause/replay, trim-start/end in quarter-second increments, and **Keep & add** for another recording. Trimming invalidates approval and the old endpoint photo. Detailed instruction text editing stays in the nonimmersive browser review page.
- Finishing waits for the device-local write before showing Saved or emitting the green pulse/ding. Failed writes stay visible; a late write from an old session cannot switch a new session to Saved. Storage is local, not cloud synchronization.
- Follow preserves start-pose waiting, ordered learner-paced movement gates, pause/repeat/watch, tracking-loss recovery and separate physical-result status. Cyan procedural hands and restrained learner outlines accompany a short path cue. Palm proximity is not object, grip or finger-pose verification.
- Settings pauses recording; returning does not silently resume it. Leaving an unfinished take offers recovery/discard. Appearance, sound and panel relocation are available in AR. Noninteractive transparent panel areas do not act as buttons.
- Event cues have cooldowns and visible text. Save success can briefly turn tracked/ghost hands green. Audio requires a user gesture and is suppressed during narration recording. Optional camera, narration and advanced tooling remain collapsed outside the main flow.

The rendered hands remain articulated procedural geometry, not a new skinned hand asset. The setup transform remains rigid: tutorials can relocate/rotate, but do not automatically retarget to different objects or proportions. No task-specific folding steps were added.

## Source boundaries for the next integration

| Concern | Source under `apps/webxr/public` |
| --- | --- |
| Shared appearance, preferences and icons | `tutorial-design.mjs`, `tutorial.css` |
| Immersive view model, rendering and matching hit rectangles | `tutorial-ui.mjs` |
| Existing action/state owner, save lifecycle, settings, trimming and guidance | `tutorial-guide.mjs` |
| DOM Home/library and review | `tutorial-shell.mjs`, `tutorial-review.mjs`, `tutorial-select.mjs`, `tutorial.html` |
| Event envelope, expiry/cooldown and quiet local tones | `tutorial-feedback.mjs`; `ar.js` receives `onFeedback` |
| Hand rendering | `hand-guide.mjs` |

Do not create a parallel UI progression controller when connecting voice/vision. Route authorized actions through the existing guide, retain session/step freshness checks, and keep model output advisory. Use a distinct physical-placement result rather than treating a movement checkpoint as object success. The existing separate voice backend and image-checking lab are not connected into a new OMNI loop by this change.

## Headset acceptance still required

1. Open `/tutorial` on Quest; choose Create and enter AR. Check Charcoal and Warm gray, then place the panel beside the working area.
2. Establish workspace/save position once. Record two short general actions; pause/resume one. Open Settings during a take and verify it pauses. Try Exit and return without discarding.
3. Review each take, trim control-reaching motion, and approve again. Keep/add returns to authoring. Finish; verify save text and optional ding/green flash. Reload and find the tutorial in the library.
4. Follow in a relocated workspace. The ghost must wait for the required starting hands. Move off path, return, hide one required hand, then recover. Check that path/green guidance does not advance during invalid tracking.
5. Pause/repeat/watch, then finish the movement. Movement completion must not be read as physical-result confirmation. Verify that controls remain readable/reachable and the compact panel does not obscure the task.
6. Test sound mute and optional narration/camera separately, then together. Browser automation cannot validate Quest tracking, occlusion, microphone/camera ownership or comfort.

Automated regression evidence is recorded in `docs/codex-log.md`. No paid requests are needed for the UI workflow. Keep private recordings, media, credentials and runtime state out of Git.
