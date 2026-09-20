# How this connects to Understudy

This tester supplies **checkpoint observations and corrective instructions**.
It does not record or position ghost hands. Vision recognition and hand guidance
need separate data paths so API latency cannot stall rendering or move an overlay.

## Working now

- Local camera transport, reference capture, manually labeled toy identities.
- Free SIFT checker and optional manually triggered OpenAI image observation.
- Corrective instructions derived in code from observed vs expected occupants.
- Frame IDs, reference revisions, frame ages, request IDs, token/cost estimates.
- Stale setup rejection and a tested two-observation checkpoint evidence gate.
- No automatic progression. `checkpoint.automatic_advance` is always false.

The AI prompt is deliberately specific to the three plushies. A general task
would need a configured object vocabulary, per-step expected state, and examples;
changing narration alone does not make it a universal assembly verifier.

## Exact next Quest interfaces

1. **Capture:** keep `POST /api/frame` for sampled camera JPEGs. Associate each
   frame ID with camera capture time and Quest reference-space identity. Current
   tester timestamps laptop receipt; production must propagate capture timestamps
   and synchronize clocks. Never use network receipt time as motion timing.
2. **Demonstration recording (not implemented):** record hand-joint positions AND
   orientations, validity flags, handedness and timestamps in a workspace coordinate
   frame. Save the workspace-to-XR transform separately. Invalid tracking should
   pause recording or flag gaps rather than manufacture joints.
3. **Step definition (not implemented):** each step needs `task_id`, `step_id`,
   `revision`, an instruction, reference images, expected object state, and a
   reference to the recorded hand-motion interval. Preserve a stable ID across
   model requests. Do not let a model invent meter coordinates from camera pixels.
4. **Ghost renderer (not implemented):** load that recorded motion and transform
   it into the current Quest workspace. Render every XR frame locally. Recalibration
   and tracking loss must pause guidance. Camera-based plushie matching is not the
   workspace calibration required for accurate hand overlays.
5. **Verifier:** `POST /api/ai/check` checks one captured image with the current
   three-object reference. Fetch `/api/ai/status` first and send its `token` in
   `X-Tester-Token`. Call manually from the local debug interface, or use the bounded server Auto AI scheduler through `/api/ai/auto`. No key
   belongs in Quest JavaScript. The free alternative is `POST /api/check`.
6. **Step controller (future):** adapt `CheckpointGate.observe(context, frame_id,
   captured, now, verdict)` with context `(session_id, task_id, step_id, revision)`.
   Two distinct fresh passing observations are only *candidate* evidence. Require
   current local pose/tracking validity too. An unknown/failure clears the streak;
   repeats, out-of-order results and changed context cannot advance a prior step.
   The tester's 12-second AI evidence window is for slow snapshot inspection, not
   a safe physical motion-control latency. Tune freshness for the actual task.
7. **Instructions:** use code-derived `message` for coarse placement correction.
   Show `unknown` when evidence is missing. Local browser speech can read the
   message after a user gesture; deduplicate feedback before enabling hands-free
   automatic polling. Neither speech nor ghost-hand playback is implemented here.

Example response fields (illustrative, not measured output):

```json
{
  "frame_id": 42,
  "revision": 3,
  "verdict": "fail",
  "slots": [{"slot":"A","expected":"goose","observed":"square","status":"wrong"}],
  "checkpoint": {
    "schema_version": 1,
    "task_id": "plushie-arrangement",
    "step_id": "arrange",
    "evidence_candidate": false,
    "automatic_advance": false,
    "needs_live_pose_gate": true
  }
}
```

## Demo acceptance test

Use real Quest captures, not only synthetic or edited photos. Check correct and
all five wrong permutations from front, left, right, and a higher view. Add missing
toy, covered label, hand occlusion, and unreadable-image cases. Record truth,
reported result, elapsed time, and cost. Count **wrong arrangements accepted**
separately from uncertain results. A few successes do not establish a numerical
accuracy rate. Keep AI only if its measured benefit justifies latency.

Keep the first end-to-end task at coarse placement. Precise LEGO mating, applied
force, a tightened screw, or unseen component engagement cannot be verified by
this arrangement checker.

## Implemented headset HUD (local tester)

`/ar` now integrates a MediaDevices camera sender with a Three.js immersive-ar
session. `public/ar.js` owns capture/session lifecycle, per-eye panel rendering,
target-ray button selection, and optional speech. `public/ar-state.mjs` owns
freshness display and the isolated swap-test sequence; it has Node regression
tests. It is not the eventual physical tutorial advancement engine.

The HUD reads `/api/ai/status`: `capture` contains revision, frame ID, source,
reference readiness and camera age; `latest` contains verdict/message, slots,
frame ID, revision and server-computed `age_ms`. It polls without paying. The
existing `/api/ai/auto` and `/api/ai/check` routes are the only paid controls and
retain their token, budget and cooldown checks. No model credentials enter XR.

To move this into TeachAR, port `ar-state.mjs` into the guide package, adapt the
status/command transport to the integrated server, and render the panel in the
repo's existing Three.js scene. Keep capture and rendering in the same Quest
page; avoid launching an independent background camera tab. No spatial hand
recording, calibration, destination tracking or automatic tutorial advancement
is implemented by this HUD milestone. The original integration contract above
still governs those next features.

## Local hand-guidance integration

`/hands` shares the AR/camera shell in `public/ar.js`. `hand-guide.mjs` reads
named joints using `XRFrame.getJointPose` from the selected `XRInputSource.hand`,
always in the same reference space used for rendering. It owns session-scoped
workspace registration, capture, ghost skeletons, arrows, controls and event logs.

`motion-core.mjs` is independent of Three.js, networking and the browser. It
contains workspace transforms, recording validation and ordered wrist-path
progression. Exported records contain joint names, positions/orientations/radii
or nulls, timestamps, handedness, workspace basis, quality and event history.

For TeachAR: XR owns the reader/renderer/session lifecycle; motion owns the pure
follower and tuning; integration maps these records to the versioned shared
contract. Retain missing samples and session/reset invalidation. Verification
keeps the image verdict separate from motion completion; an attempt ID rejects
late responses after a new following run or cleared workspace. The hand mode
never enables the paid periodic scheduler. Hardware performance remains to test.
