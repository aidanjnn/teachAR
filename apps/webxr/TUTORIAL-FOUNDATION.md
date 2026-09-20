# TeachAR: reviewed two-hand tutorials

A local Quest Browser testbed for the expert-record → review → learner-replay workflow. It now includes manual recording/pause, optional local narration, two articulated skeletons, optional expert-marked guide lines, local reference photos, a review editor, JSON import/export, and diagnostics. It does **not** automatically judge task results, recognize grasps, or adapt a lesson to differently shaped objects. Placement can be translated and rotated manually. The native GitHub runtime remains a separate implementation.

## Start here

From this directory:

```sh
sh launch-ar.sh tutorial
```

The server is also available at `http://127.0.0.1:4321/tutorial` on the laptop. Quest uses `http://localhost:4321/tutorial` through USB/ADB reverse. Keep the cable connected. Close other camera tabs before enabling the optional camera. The updated server must be running: `start-background.py` does not replace an existing process automatically.

### Five-minute headset test

1. Exit AR and reload **the same Quest URL** (`http://localhost:4321/tutorial`). Do not clear browser storage. Existing recordings migrate into Your tutorials. Camera and microphone are optional.
2. Press **Enter TeachAR AR**. Choose **Create tutorial** or **Follow tutorial** in the headset. The desktop page has the same choices; no desktop interaction is required for the basic flow.
3. To create: first choose **Set save position**, then hold both hands in a comfortable visible resting spot after the countdown. This zone is reused for all recordings. Next use the explicit **Use first pose as setup** option, or enter a written starting layout before AR. Mark an **origin**, then a point to its right for **direction**, using the right index fingertip countdown. Preview and confirm. Record a short movement, pause/resume as needed, Finish recording, inspect the replay, choose **Required hands: Left, Right or Both**, then **Approve & save**. Wait for the durable save result; a failed write stays in review with retry/export instructions. Add another recording or follow it.
4. To follow: choose your saved tutorial. Set up the physical task. Mark its origin and direction in the new workspace. A separation of 20–120 cm is accepted; it no longer has to match the expert’s spacing. Preview the first pose. **Adjust placement** shifts by 5 cm or rotates by 10 degrees; it preserves recorded size.
5. The ghost waits at the beginning. Bring the required palms near it and hold about 0.6 seconds. Follow the ordered targets at your pace. Move sideways: guidance waits. Hide a required hand: progress pauses and reports tracking loss. Return and continue. **Watch again** plays the demonstration independently.
6. At the final movement checkpoint, inspect the physical result and press **Result looks right · next**. The next recording waits for your start position again. Green is geometric proximity, not object/grip validation.
7. **Move panel** repositions the controls near your current view without moving the tutorial. **More options → Reposition tutorial** places the tutorial again and restarts it. Exit AR for detailed trimming, instruction edits, import/export and backup.

Only recordings actually captured/imported appear in review. Generic Step 1/2 labels do not imply inferred instructions. Advanced options are kept out of the main recording flow. Return-to-save is enabled when you configure the save position. It can be turned off in More options; ordinary recording can include the reach to Finish, which can be trimmed in review.

## Laptop review without a headset

Open `/tutorial`, expand **Advanced review and developer tools**, and choose **Load synthetic test**. It creates two visibly labelled, generated motions; it is not a human demonstration or a physical-skill lesson. Preview, scrub, listen to narration, edit instructions, trim away control-reaching gestures, reorder or delete steps, approve, finish, and export/import. Edits are disabled while AR runs. Shortening a clip's end drops its end-state photo. An imported file cannot supply trusted verification or precomputed quality claims.

**Storage:** one local draft per browser origin/device, saved in IndexedDB. Saved steps survive reload; unfinished takes and runtime diagnostics do not. A second stale tab cannot overwrite a newer draft. Download before closing if a storage error appears. Laptop and Quest storage are separate; `localhost` and `127.0.0.1` are also separate origins. Import/export transfers the recording, never its old XR world transform. Recalibrate after leaving AR or tracking-origin reset.

## Boundaries and implementation

- `public/tutorial-core.mjs`: bounded v3 format with v1/v2 migration; 25 canonical named joints per hand, metres, XYZW unit quaternions, explicit null observations; derived quality; review and finish gates; synchronized motion/audio trim; ordered geometric guidance plus explicit recording-to-recording confirmation. Maximum 12 steps, 3 minutes / 5,400 samples per step, 12,000 total samples, 48 MB JSON. One hand must have at least 80% tracked coverage. That is a recording-admission rule, **not** accuracy or proof that both hands are usable.
- `public/tutorial-guide.mjs`: WebXR sampling, two-point gravity-aligned workspace, paired ghosts, countdowns, guide cues, review and learner controls. Tracking-update gaps over 250 ms pause capture/playback. Replay does not display a sample older than 200 ms at the current playback time. Missing joints remain missing. No exact pose scoring in this tutorial mode.
- `public/tutorial-follow.mjs`: ordered local palm targets sampled when either required palm moves about 9 cm. Start radius 12 cm / hold 600 ms, subsequent radius 10 cm / hold 220 ms, final hold 500 ms. These are configurable implementation tolerances, not accuracy measurements. Missing live palms or timing gaps clear dwell; the author explicitly chooses required hands; missing required reference palms or sample gaps over 200 ms block approval and finishing with a repair message. The follower also rejects invalid references defensively. Small motions within tolerance are not distinguished.
- `public/tutorial-ui.mjs` and `tutorial-shell.mjs`: contextual headset panels plus browser Create/Follow/library navigation. The panel is world-stable and manually repositionable.
- `public/tutorial-review.mjs`: browser preview/editor and explicitly synthetic fixture; import/export; trim/review controls. It never calls a provider.
- `public/narration-core.mjs` and `narration.mjs`: optional MediaRecorder capture, bounded mono 16 kHz PCM WAV storage, duration checks, trimming and WebAudio playback following ghost pause/rate/seek. See audio details below.
- `public/tutorial-store.mjs`: an IndexedDB v2 library retains multiple tutorials and migrates the earlier current draft. Transactional revision checks prevent stale-tab overwrites. Failed replacement imports leave the current tutorial intact.
- `public/camera-snapshot.mjs` and `ar.js`: wait for a newly presented video frame, reject stopped/stalled cameras and changed sessions, then save a local JPEG. This is a **browser video timestamp**, not a native camera sensor timestamp. Photos are limited to 640 px when captured and 1280 px when imported. They are displayed as reference panels, not cloth-aligned overlays.
- `exportDiagnostics()`: bounded runtime events, step IDs, review state and tracking quality; no images or raw joint samples. Confirmations are explicitly `learner-self-confirmed`.
- `server.py`: static tutorial routes. The tutorial camera does not upload frames. Existing plushie inference and its budget protections remain separate; entering tutorial mode disables the old automatic paid checker.

Placement accepts 20–120 cm between a new origin and heading point. It preserves the recording’s metre scale; `calibration_span_m` remains compatible metadata, not a scale factor. No 3 cm matching rule remains. Two points plus gravity define a horizontal workspace; they do not locate objects, infer their dimensions, or prove correct physical alignment. Different object sizes/layouts require expert adjustment or another recording, not automatic retargeting.

## Narration and finishing details

Narration starts with the step and pauses/resumes with motion. During review and Watch again it follows the ghost playback position and speed. Guided practice holds discrete geometric targets; recorded narration is not time-warped or automatically segmented to those targets, so use Watch again to hear it. Browser start/stop timing is approximate, not a native sensor clock or word alignment. A decoded audio/motion duration difference over 500 ms is rejected; that threshold is an admission rule, not a claimed synchronization accuracy. A tracking-update stall marks narration alignment as unknown. Playback at reduced speed also lowers pitch in this prototype.

If the microphone disconnects or recording/decoding fails, motion is preserved with an explicit narration issue. Review/finishing is blocked until the expert re-records or deliberately chooses **Use text instruction** in AR / **Remove narration · use text** in the editor. Microphone denial leaves the written-instruction path available. Exiting AR, Stop, or page exit stops microphone tracks. The browser may require **Enable sound** or Replay before audio is audible.

Trim crops the PCM audio at the actual sampled motion boundaries. Imported audio must be a bounded embedded canonical PCM WAV; URLs and arbitrary codecs are rejected. The same 48 MB total export limit applies with narration. Diagnostics contain only narration presence/error metadata, never audio. Listen before approving: there is no silence detection, transcription or semantic checking of what was said.

**Finish tutorial** requires a starting-layout description, nonempty instructions, explicitly selected required hands with continuous palm samples, reviewed steps and no unresolved narration failures. The finished state is exposed only after the local write succeeds. Finishing creates a revision-bound local authoring state that survives export/import and reload. Any content edit reopens the draft. It is an expert assertion, not a signed certification or proof of physical correctness. Older v1/v2 recordings import as drafts; no audio or finish claim is invented. A v3 recording with missing/automatic (`recorded`) hand selection also loses approval/completion until the author chooses the required hands and reviews it. Existing explicit left/right/both choices remain compatible; reference gaps clear readiness without removing the recorded data.

API references: [MediaRecorder pause](https://developer.mozilla.org/en-US/docs/Web/API/MediaRecorder/pause), [audio decoding](https://developer.mozilla.org/en-US/docs/Web/API/BaseAudioContext/decodeAudioData), [WebAudio buffer playback](https://developer.mozilla.org/en-US/docs/Web/API/AudioBufferSourceNode).

## Verification

Run `sh test-all.sh` for the complete software suite using the installed environment and Chrome. It starts an isolated temporary server with provider credentials disabled. It does not install dependencies, open a real camera or call paid APIs. Individual commands:

```sh
node --test tests/*.test.mjs
.venv/bin/python -m unittest discover -s tests -q
PLAYWRIGHT_MODULE=/path/to/playwright node tests/browser-tutorial.cjs
PLAYWRIGHT_MODULE=/path/to/playwright node tests/browser-review.cjs
PLAYWRIGHT_MODULE=/path/to/playwright node tests/browser-camera-snapshot.cjs
PLAYWRIGHT_MODULE=/path/to/playwright node tests/browser-narration.cjs
```

Also run the existing `browser-hands.cjs` and `browser-ar.cjs` after shared runtime changes. Browser tests use synthetic tracking/cameras/audio tones and mocked provider routes. The narration test exercises real MediaRecorder decoding and WebAudio playback with a generated tone, without opening a physical microphone. They cover rendering, review, persistence, malformed imports, stale-tab conflicts, delayed photos, camera stalls, tracking interruptions and explicit advancement. They cannot validate Quest camera/AR concurrency, occlusion, alignment drift or teaching effectiveness.

See [the current WebXR delivery plan](../../docs/web-delivery.md) and [historical handoff](https://github.com/aidanjnn/trail/blob/40514f519a8db6b9fac3c47e223ecdc2ba474cc2/experiments/quest-browser/NATIVE-INTEGRATION-HANDOFF.md) for GitHub alignment and [META-VISION-RESEARCH.md](META-VISION-RESEARCH.md) for the next detection work.

## Holograms, forgiving zones, and clean recording endpoints

The tutorial and desktop review now render joint-driven translucent palms and thicker articulated fingers. These are procedural hands, not photorealistic skinned hand assets. Learning optionally overlays outlined live hands and palm-centre target zones. Guided practice uses the same 12 cm start / 10 cm subsequent boundary as the follower, with no exit hysteresis; the target advances only after the required dwell. In timed Watch replay, zones use 12 cm, a 300 ms dwell and 3 cm exit hysteresis. Finger posture and grasp are not graded. Missing required joints, missing target samples, hidden sessions or update gaps clear the matching state. A runtime-supplied estimated pose is not proof that a physically occluded hand is observed.

**Palm zones ON/OFF** is available in AR. Guided practice paces ordered geometric targets against the learner. Reaching them does not automatically advance to the next recorded action or verify the physical result; that requires explicit learner confirmation. Semantic task checkpoints are not inferred.

**Return to save** uses the tutorial’s configured workspace-relative save position. Create asks for it once, before workspace placement; after placement it is stored with the tutorial. Later takes never redefine it from their starting pose. **More options → Change save position** is the only deliberate reset. Legacy tutorials without it ask when entering authoring; following them does not require a save position. To use it:

1. Set the save position once with BOTH palms visible. Pale rings show where to return after every action. Start recording from the task’s current pose; it need not be the save position.
2. Demonstrate the action, moving at least one palm 15 cm from the save zone.
3. Hold both hands at the intended endpoint for about a second (800 ms within 2 cm in the detector).
4. Return BOTH hands to within 8 cm of their configured save positions, then hold about a second. Do this within six seconds of the endpoint hold.
5. The detector saves through the last endpoint hold and removes the return, including its narration. Review before approval. **Save at last hold** performs the same trim manually; **Save full take** bypasses trimming if needed.

This is a deliberate recording gesture, not inferred task completion. Leave it off for cyclic actions that naturally hold away and then return to that save zone; they can trigger it. Pauses, missing palms, and update interruptions invalidate the held endpoint. Re-establish an endpoint before clean-saving or use Save full take. The detector uses the last stationary hold, which can differ from the expert's intended end. Review remains required.

`save_position` is an optional validated v3 metadata field: `{space:"workspace", left:[x,y,z], right:[x,y,z]}` in metres. Old files omit it; exports and the local library preserve it. It is an authoring control, not a learner checkpoint. Never carry its unregistered raw world coordinates across an XR restart.

Names remain optional. Saved steps are already automatic IndexedDB drafts; export buttons are now labelled as backups. The local library retains multiple tutorials per browser origin. It does not sync between devices or to the cloud. Saved content consists of hand trajectories, optional narration and reference photos, not a camera video recording.

### Optional clean-save acceptance test

Exit AR, reload `/tutorial` at the SAME Quest origin, and re-mark the workspace. Create a tutorial, set a save position once, record two short visible actions with different starting poses, and return to the same save rings after each ending hold. Inspect the replay: it should stop before the return or button-reaching motion. Finish/review the tutorial normally. In learning, pause the ghost, bring your palms near the zones, move sideways by roughly 20–30 cm, then return. Green should clear and recover; hiding a hand should remove its live overlay and show unknown rather than a successful match. Confirm this on hardware before calling the gesture or rendering validated.

`public/tutorial-assist.mjs` contains the pure comparator/endpoint detector. `tests/tutorial-assist.test.mjs` covers false matches and accidental saves. `tests/browser-assistance.cjs` tests real renderer integration, automatic trim, recovery, hidden sessions, narration trimming and late-save rejection using synthetic poses/audio. It is part of `test-all.sh`.

### Scaling beyond one garment

Two-point placement rigidly repositions a demonstration on a horizontal workspace. Adapting to changed objects needs task-relevant landmarks or object poses, a way to update them as the task changes, and separate verification of the outcome. That is a future layer; this update does not silently stretch hand trajectories to fit new object geometry.

When a hand is hidden by an object, the recorded ghost can illustrate the action, but the learner’s hidden motion cannot be reliably graded. Future task-aware guidance should use visible entry/exit checkpoints and outcome checks. Current guided mode pauses on missing live palms and refuses reference trajectories with missing required palms. See [Meta tracking limitations](https://developers.meta.com/horizon/documentation/unity/unity-handtracking-troubleshooting-limitations/).
