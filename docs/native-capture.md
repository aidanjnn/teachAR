# Native capture, calibration, and replay

TRAIL-04/05 software flow and the rigid registration part of TRAIL-19. Physical
capture, independent-user transfer and Quest rendering have **not** been tested.
MRUK room/camera work belongs to the separate inspection workstream.

## Composition and operation

Requires the shared-contracts and native-platform branches. The platform creates
one OpenXR/Meta rig and passes its tracking-space transform to registered
features. `CapturePlatformFeature` registers at order 10 and calls
`CaptureFlowInstaller.Install`. It creates the fresh hand source, capture session,
separate articulated ghost prefab, and world-space control panel. Calling the
installer again returns the existing session. The guide feature can subsequently
bind its independent progression engine to the capture events.

1. Configure/build the Unity project through the native-platform setup scripts.
   Unity, Android support and device permissions are prerequisites; pnpm cannot
   validate this path. The setup needs the native-platform exact XR Hands 1.7.2
   pin and Hand Tracking OpenXR feature.
2. Prepare a rigid 50 × 35 cm mat with A near-left, B near-right, C far-left and D
   far-right. Measured mark spacing is configurable on `CaptureReplaySession`.
   Keep the origin and all ancestors at unit scale, with locomotion off.
3. Select **Calibrate / retry**. Place the right index tip on A. Use the *left*
   index tip to touch the **Sample mark** dot for 0.6 s, then withdraw the left
   hand. Keep the right tip steady for 0.4 s. Repeat B, C, then D. With
   `UseLeftHand`, hands swap roles. Buttons use fresh opposite-hand observations;
   the calibration fingertip is never asked to leave its mark to press a button.
4. The registration passes only if the edges/diagonal agree, the normal points
   up, fitting residuals stay within 2 cm and the independent D error is within
   2 cm. The panel reports D error. Rejected registration requires a retry; the
   implementation never changes scale or acceptance radii to hide error.
5. Select **Record 5 seconds** or **Record up to 120s / stop**. The session emits
   `RecordingCompleted(Recording)` with workspace-relative motion. Storage owns
   the save/upload boundary; this module does not invent a second file format.
   A source failure does not produce a fabricated live sample or synthetic hand.
6. Replay the last capture, or pass a validated stored recording to
   `LoadRecording`. Loading requires a new, independent learner registration.
   The short cyan articulated ghost uses the selected hand. **Skeleton / ghost**
   changes thickness for diagnostics. The guide can supply a checkpoint ring.
7. If the mat moves, select **Mat moved**. Recenter, tracking-space transform
   changes, source stop/disable, focus loss, suspension and headset removal
   invalidate registration, stop capture/replay and notify the guide. Resume
   requires all four marks again. Physical mat movement without a tracking
   origin change is not automatically detectable; that control is mandatory.

The initial geometry/jitter/jump thresholds require device tuning. These controls
and the transparent procedural hand are useful source implementations, not a
claim of tested headset legibility, input comfort, grasp or assembly verification.

## Public boundaries

- `HandObservationSource`: source provenance, tracking-session ID, origin
  revision and fresh `Observed(ReferenceObservation)` events. The production
  `XRHandsSource` reads only Dynamic `updatedHands`, checks per-hand update flags,
  `isTracked` and all 25 `TryGetPose` results. Only the official `OpenXR Hands`
  descriptor is admitted; Editor/non-Android runs are labeled synthetic. No
  controller/skinned mesh source.
- `ReferenceObservation`: timestamp, sequence, origin revision, source, left/right
  canonical hand samples. Missing hands remain explicit. Native XR's 26-joint
  set maps explicitly by enum name; palm is omitted, wrist retained.
- `WorkspaceCalibration.Fit`: three fit marks plus independent D; returns a proper
  rigid registration and error. `StableMarkSampler` rejects gaps, duplicates and
  unstable holds. Zero coordinates are valid.
- `CaptureReplaySession`: `WorkspaceObserved`, `CalibrationChanged`, `Invalidated`,
  `RecordingCompleted`; `Registration`, `LatestWorkspaceObservation`,
  `OriginRevision`; controls for calibration/capture/load/replay. The guide only
  consumes current workspace observations, never rendered ghost transforms.
- `CreateCaptureSidecar(persistedId, exactBytesHash)` returns the canonical native
  sidecar after a completed capture. Storage supplies its assigned ID and SHA256
  of exact stored bytes. No calibration is restored from storage.
- `GhostPresentation.ShowGuideFrame(frame, checkpoint)` / `ClearGuideFrame()`:
  display only. The native guide controls completion and step timing.

Capture takes at most 3,600 frames and 120 seconds, at up to 30 Hz. Recording
`tMs` is actual Dynamic callback receipt time minus the capture start on a shared
Stopwatch monotonic epoch. It is **not** an exposed sensor capture timestamp.
The sidecar records the epoch offset and clock tick resolution; this uncertainty
covers arithmetic clock mapping only, not unmeasured native sensor latency. No
DSP/audio or camera clock equivalence is claimed. The recorder never fills a
stall with duplicated samples. A conservative per-joint jump rejection marks a
sample missing and reacquires on the next fresh observation.

Replay interpolates between valid neighbors only when their actual time gap is
at most 100 ms. It hides missing hands, long gaps, out-of-range time and stale
trailing frames. Loading validates and copies the recording, so later caller
mutation cannot alter playback. Unity provider poses are already in Unity's
left-handed basis: the adapter reflects Z for both position and quaternion, then
applies workspace registration. Rendering applies the inverse through the same
tracking space. Per-joint local correction is explicitly identity for these
canonical reflected provider axes; procedural bones connect joint endpoints,
so no unmeasured skinned-mesh bind-pose correction is used.

## Evidence and SDK references

`dotnet run --project tests/native-capture/NativeCapture.csproj` compiles and
executes the actual pure C# domain and strict contracts. The assertions are also
Unity EditMode tests. Additional Unity runtime tests cover lifecycle invalidation,
subscriptions and the named SDK mapping; these are not console tests.

Runtime adapter/session/presentation C# compiled against actual Unity 6000.3
managed DLLs and official XR Hands 1.7.2/Core Utils 2.2.0 source using the portable
.NET compiler. Full Unity package resolution, shader/prefab import,
EditMode/PlayMode execution and Android ARM64/IL2CPP build are separate gates.
The first Unity 6000.3.24f1 attempt exited 198 without a valid license; an
externally resolved license allowed a retry to begin actual package import.
Final gate results are recorded in the task delivery log. Quest smoke tests
remain unavailable without a device. Required physical checks: fresh
five-second recording/save/reload; right/left named joints; independent novice
registration in a rotated mat and different room; fourth-mark error; occlusion,
recenter, mat movement, suspension and headset removal; no false guide progress.

API grounding: [XR Hands subsystem callbacks](https://docs.unity3d.com/Packages/com.unity.xr.hands@1.7/api/UnityEngine.XR.Hands.XRHandSubsystem.html),
[named joint IDs](https://docs.unity3d.com/Packages/com.unity.xr.hands@1.7/api/UnityEngine.XR.Hands.XRHandJointID.html),
[joint pose space](https://docs.unity.cn/Packages/com.unity.xr.hands@1.4/api/UnityEngine.XR.Hands.XRHandJoint.TryGetPose.html),
and [provider basis conversion](https://docs.unity.cn/Packages/com.unity.xr.hands@1.4/manual/hand-data/xr-hand-data-model.html).
