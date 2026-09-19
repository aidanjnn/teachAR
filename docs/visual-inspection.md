# Visual inspection integration and device diagnostic

This implements the non-voice TRAIL-17 path and TRAIL-20 service. It does not certify
physical assembly or implement voice PR #3. Every image result is snapshot advice.

## Dependency and composition order

1. `codex/shared-contracts`: canonical section-6 TS/C# types and strict parsing.
2. `codex/native-platform`: authenticated native transport, feature registry,
   MRUK package pin and sharp dependency.
3. `codex/capture-calibration-replay` and `codex/local-guide-progression`: real hand
   source, calibrated guide, shared telemetry sequence and `PauseForInspection`.
4. `codex/visual-inspection`: vision process, main route/coordinator factories,
   delegated transport contracts and native Scene feature.
5. `codex/tutorial-authoring-storage`: final main-server composition,
   reviewed immutable image reference resolver, authoritative relay snapshots and
   acknowledged `POST /api/guide-events`.

No feature copies the voice branch. After merge, task6 registers
`registerInspectionRoutes(app, {authorizeLearner, coordinator})`; coordinator needs
`resolveReferences(context)` and `isCurrent(sessionId,context)`. The latter requires
an exact, fresh, connected, paused, calibrated native snapshot. Relay updates call
`guideChanged(sessionId)` and disconnect/revocation call `invalidate(sessionId)`.
The resolver must require a ready immutable tutorial and its reviewed references;
caller-supplied URLs and paths never enter the vision service.

Native transport contracts are strict JSON. `InspectionCapture` includes the exact
canonical request plus a nonce, source session, minimum sequence and remaining
budgets. Source sensor timestamps remain local identity/diagnostic values; elapsed
ages use monotonic local clocks. No cross-device clock subtraction occurs.

## Diagnostic procedure after compatible Unity setup

1. Start authenticated main/vision processes. Pair the headset as learner over
   HTTPS or the explicitly configured USB loopback development path. Finalize a
   tutorial with reviewed real expert images, then preload and calibrate normally.
2. Enable camera from the world-space panel. Permission denial, unsupported hardware,
   unavailable feed and stalled frames must remain visible. Resume from focus loss
   requires explicit camera enable and network re-pairing.
3. Touch Check placement for 600ms using a fresh native index-tip sample. The guide
   pauses and clears dwell. Confirm the acknowledgment arrives before nonce capture.
4. Check a correct-looking arrangement, wrong placement and obscured connection.
   Record observation/request IDs and timings without media in logs. Confirm that
   feedback changes with the fresh view and states limits for hidden properties.
5. Move a part and Retry. Confirm a newer source frame/request; never reuse a
   verdict. During a delayed request, Resume/Repeat/recalibrate/background and verify
   no late caption is accepted. Camera readback buffers must release on completion.
6. Kill vision during a request. Main/local guide remain usable, inspection becomes
   unavailable and Resume remains explicit. Restart vision and Retry with a new view.
7. Voice owner later hooks accepted findings to its tested audio generation policy;
   hearing evidence-grounded output on Quest remains a separate required test.

The service defaults to an unavailable mock. Real provider mode must be explicitly
configured with server-only credentials and an image-capable model; this branch's
smoke tests do not make paid calls. Do not substitute synthetic images for physical
LEGO trials or standalone Quest source validation.

## Validation boundary

Automated TypeScript checks, real-process mock integration and portable pure C#
tests are recorded in the task's PR/log. Unity editor 6000.3.24f1 was installed
externally during the workstreams. Licensing later resolved; the first real compile
identified missing Meta SDK built-in module dependencies, repaired by the platform
branch. Final editor results are recorded in the PR/log. Android Build Support is
absent. No Android/IL2CPP build, actual camera capture, OpenAI response or
camera-to-spoken-feedback proof is claimed.

Source frame alignment needs particular attention: MRUK queues a native texture
update before the feature's LateUpdate command buffer. The command buffer copies
only that source texture to owned storage and reads it asynchronously. Check the
sensor timestamp against resulting pixels on the actual headset; .NET tests prove
request/sequence/lifecycle policy, not GPU or sensor behavior.
