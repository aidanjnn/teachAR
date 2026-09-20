# Latest update: tutorial-scoped save position

Create now begins with setting a visible two-palm save zone once. Its workspace-relative position is preserved across recordings, local reload/export and manual workspace relocation. Each take resets only the detector’s timing/arming state. Return-to-save trims the return movement and opens review. Change save position is explicit; recordings with different starts no longer silently choose new homes.

Validation: **56 Node tests, 52 Python tests, nine browser workflows passed** with synthetic/mocked sources. The added workflow captures two takes with different starts, checks their shared save zone and clean endpoints, rejects interrupted position setup, and verifies persistence and relocation. No new Quest validation or paid API calls.

GitHub main `2a0b91c` and merged/open PRs were reviewed read-only. See [historical handoff](https://github.com/aidanjnn/trail/blob/40514f519a8db6b9fac3c47e223ecdc2ba474cc2/experiments/quest-browser/NATIVE-INTEGRATION-HANDOFF.md) for the source-based Unity assessment and next bounded port. No native code was changed or pushed.

---

# Latest update: Create / Follow experience

The local `/tutorial` now has Create / Follow navigation in both the browser and immersive panel, a multi-tutorial IndexedDB library with old-draft migration, contextual controls, generic recorded-action review, and origin/heading placement without the old 3 cm span rejection. Translation/yaw preserve recorded scale. Learner guidance waits for the start pose, follows ordered palm targets, holds on tracking loss, and requires explicit physical-result confirmation before the next recording.

Validation: 53 Node tests and 52 Python tests; eight browser workflows cover the existing modes plus the new capture/review/follow flow, differing placement spans, safe replacement discard, library migration, stale timestamps, missing tracking and no premature advancement. Browser streams/providers are synthetic or mocked. Final green-zone fixes were rerun with targeted unit and browser regressions. No paid calls, Unity installation, GitHub push or new hardware validation.

See [TUTORIAL-FOUNDATION.md](TUTORIAL-FOUNDATION.md) for current launch/test instructions and [XR-UX-NOTES.md](XR-UX-NOTES.md) for design decisions and remaining limits. Earlier dated results below describe the previous interface.

---

# Work completed while away — 19 September 2026

Stable local checkpoint, approximately 18:50 UTC. Server running on port 4321; automatic paid checks confirmed off. No paid inference requests, Unity installation, GitHub pushes or hardware acceptance claims were made during this work.

## Added and corrected

- Review workbench: paired ghost preview, scrub, 0.5×/0.75×/1× playback, editable instructions, explicit expert review, trim, delete, new tutorial, validated JSON import/export and a visibly labelled synthetic fixture.
- Learning gate: every step must be reviewed. Editing instructions clears the review checkbox. Trimming clears review and drops the result photo when the ending changes. Physical completion remains learner self-confirmation.
- Optional expert-authored fold line in AR: two fingertip countdown samples, stable-point checks, workspace-relative gold cue, review invalidation after changes. It does not detect or follow cloth.
- Recorder/replay robustness: tracking-update interruptions pause; old samples are hidden rather than held across recording gaps; stale asynchronous photos and changed sessions are rejected; paired missing observations stay missing.
- Fresh photo capture: wait for a newly presented browser video frame; reject stalled/stopped cameras and timeout; bound embedded JPEG dimensions before rendering. Browser video time is not sensor exposure time.
- Local persistence: validated drafts, atomic stale-tab conflict rejection, bounded imports, migration of the earlier prototype format and protection of the current draft on failed replacements.
- Diagnostics export: recording/review/learning events and coverage without photos or raw joint arrays. Repeated hidden frames no longer flood the event buffer.
- One command for software checks: `sh test-all.sh`.

## Tests actually run

The final `sh test-all.sh` passed:

- 38 Node tests, including incorrect advancement, delayed observations, malformed data, review invalidation, replay timing and camera freshness.
- 52 Python tests for existing vision/server/budget behavior.
- Five Chrome/Playwright workflows: original AR checker, original hand-path guide, two-hand tutorial, review editor and real browser video-frame callbacks with a synthetic camera.

Reviewed generated browser screenshots for the editor, paired ghosts, workspace fold line and HUD. Browser API routes/providers were mocked; the synthetic camera did not use a webcam. These tests do not establish Quest tracking quality, physical alignment, camera/immersive concurrency or learner success.

## Research and bounded experiment

Read current native GitHub branch heads and official Meta camera/projection/inference samples. Detailed migration boundaries are in `NATIVE-INTEGRATION-HANDOFF.md`; source-linked model/platform findings are in `META-VISION-RESEARCH.md`.

Downloaded one public, pinned Grounding DINO Tiny safetensors model into the separate `../model-spike` environment and ran it offline on a private saved Quest image. It localized all three visible plushies in the positive prompt test; CPU forward-pass times were 4.09 and 2.59 seconds. A negative-prompt test also produced false screwdriver/shirt detections at the default threshold. This is an exploratory result, not measured detection accuracy. The detector was deliberately not connected to step advancement or live ghost correction.

## Resume testing

1. Exit AR and reload `http://localhost:4321/tutorial` on Quest to load the changes. Saved steps on that origin remain in IndexedDB. Re-mark the workspace.
2. For a cable launch, run `sh launch-ar.sh tutorial` from this directory.
3. Record two short folds on the same shirt/napkin layout, review both hands, add a fold line if helpful, approve, reset the garment, and try learning at 0.5× speed.
4. Export diagnostics after the real test. Keep useful recordings via tutorial export. Check tracking loss during grasps and cue drift as the wearer moves their head.
5. On the laptop, `/tutorial` → **Load synthetic test** exercises the editor without hardware; it does not create a valid folding lesson.

Next development after that evidence: native capture-time camera-to-world validation and a held-out set of correct/wrong/occluded task images. Automatic cloth correctness and dynamic object-relative ghost remapping remain unimplemented. The current fixed-workspace, reviewed demonstration is the runnable foundation.

## Subsequent authoring completion increment

Added optional local narration and explicit tutorial finishing. Current format is v3, with v1/v2 migration to draft state. New flow: describe starting layout → record each action with hands and optional voice → trim/reorder/edit/review → Finish tutorial → export or learn.

Narration follows pause/resume and ghost playback speed. Trimming crops audio at the sampled motion boundaries. Microphone failures retain motion but require re-recording or explicit text-only recovery. Exiting stops the microphone; late audio cannot attach after session exit. A changed starting layout/order requires review again; other content edits reopen the draft. Finishing does not certify the physical result.

Latest complete `sh test-all.sh`: **44 Node tests, 52 Python tests and six browser workflows passed**. The audio browser workflow used a generated tone with real MediaRecorder/WebAudio; the final run produced 2,736.8 ms of generated motion and 2,700 ms of audio, with a separate one-second pause excluded. This is a synthetic software timing observation, not a Quest synchronization claim. No real microphone, paid provider or cloud audio service was used in tests.

Outstanding: Quest microphone/immersive compatibility and real speech timing, task teaching effectiveness, automatic transcription/segmentation, object-relative remapping, and physical-state verification. See `TUTORIAL-FOUNDATION.md` for the updated controls and limits.

## Holographic guidance and clean-save increment

User-reported hardware evidence: exiting AR, exporting/reloading and replaying worked; re-marking the two points at another location lined ghosts up with the cloth. This supports that tested calibration/replay workflow, not arbitrary garment scaling or fold correctness.

Added procedural translucent palm/finger rendering to tutorial/desktop preview; distinct live-hand outlines; optional forgiving palm zones; and opt-in endpoint-hold/return-to-start saving. Green only means position proximity, never correctness or automatic progression. Clean-save trims narration and motion together, retains review gates, and offers Save full take. Recording gestures need Quest validation and are unsuitable for cyclic actions. Autosave/optional naming/backup semantics are clearer in the refreshed page.

Software checks: 48 Node tests, 52 Python tests and seven browser workflows passed, including synthetic clean-save and green→departure→recovery tests. Inspected rendered hands, HUD and setup-page screenshots. No paid APIs or actual camera/microphone were used. The latest rendering/gesture changes are not hardware-validated.

Still missing relative to the visual concept: a smooth rigged hand asset, compact contextual AR controls, learner-paced semantic checkpoints, dynamic garment-relative retargeting, and independent object/cloth outcome verification. Current `/tutorial` supports deliberate pause/replay and manual confirmation.
