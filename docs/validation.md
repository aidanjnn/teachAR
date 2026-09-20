# Native validation evidence

## 2026-09-19 — PR #19 black-screen repair

This run uses `codex/quest-black-screen-diagnosis`, based on PR #19 commit
`bdfb757e9062d3170597d018a32c0762378babb5`, plus the uncommitted repair. The
source patch and APK hashes are kept with the local build evidence. No commit,
push, or merge was performed. See [the diagnosis](native-black-screen-diagnosis.md)
for the failure path and rejected hypotheses.

### Toolchain and device

| Item | Observed value |
| --- | --- |
| Editor | Unity 6000.3.24f1 (`4e7b9b5b6244`), installed local CLI |
| Player | Android ARM64, IL2CPP, Development |
| Packages | Meta XR Core/Interaction/MRUK 205.0.0; OpenXR 1.18.0; XR Hands 1.7.2; URP 17.3.0 |
| Headset | Oculus Quest 3S (`panther`) |
| OS | Android 14, API 34; incremental build `3814840024700610` |
| Package | `com.trail.guide`, version 0.1.0, versionCode 1 |

### Automated evidence

- The new composition regression failed against the original pairing setter:
  hiding diagnostics made the application root inactive.
- The corrected runtime passed all **9 PlayMode** tests, including actual
  shell/pairing composition and hidden-input reset/re-entry.
- The final editor suite passed **55/55 EditMode** tests, including eight new
  startup-scene cases and seven APK-layout cases. Packed and loose layouts are
  accepted separately; mixed or missing data is rejected. The checked-in scene passes; missing, duplicated or
  inactive bootstrap and preplaced active/inactive cameras are rejected.
- The final static Quest scaffold check passed with **163 asset/folder GUIDs**;
  it is a file/GUID check, not a runtime rendering test. Patch whitespace passed.

Local XML reports (ignored artifacts):
`artifacts/quest/test-play-404e29fa-2d4b-4509-88e4-d94a0dbc3dcc/results.xml` and
`artifacts/quest/test-b6ca5968-8673-45b9-a4ad-33e3c0abb4f8/results.xml`.

### Installation and recovery evidence

The first corrected APK packaged successfully, but its device logs showed an
obsolete setup scene. It is **not** accepted as validation of the repair. The
worktree had reused an older Library. The APK contained both a current loose
`level0` and an obsolete packed `data.unity3d`; the player log loaded the latter.
Startup scene import/loading and build validation were strengthened, and the
replacement uses a clean player build.
An earlier packaging attempt also encountered an externally stopped Gradle
daemon; a task-local Gradle home resolved that failure.

Because the installed APK had a different signing certificate, the user
explicitly authorized a backup and replacement. Before uninstalling, internal
preferences and external files were snapshotted twice and all hashes matched.
The original APK and backup archives remain local under ignored
`artifacts/black-screen-fix/`. Restored content matched before launch.

The initial restore carried shell ownership into generated IL2CPP resources,
blocking extraction and producing room passthrough with three loading dots
(user report). Removing only the generated `files/il2cpp` cache allowed Unity
to regenerate it under the current app UID. Restoring the tutorial directories' original group and mode alone was not
sufficient: the new app UID is not in `ext_data_rw`, and storage initialization
reported `UnauthorizedAccessException`. The two restored, shell-owned cache
directories were given traversal/write access **inside** the unchanged app-owned
parent (`files`, mode 2770, no access for other UIDs). The app's parent directory
and Android app-storage isolation remain in place. File contents were unchanged;
all three tutorial files matched the original hashes.
No private file contents or raw logs are committed.

### Acceptance boundary

Editor tests, packaging success, a focused Android activity and compositor
statistics alone do not establish a visible Trail interface. The original
reported symptom was an otherwise black view with one small red dot. The final
correct-scene launch and wearer observation are recorded below.
This run does not establish calibration, physical transfer, learner progression,
or live-provider/voice readiness.

### Correct-scene device startup

The clean APK `build-36c19b1b-beda-49d6-af41-70ec9c52d139/Trail.apk`
(72,608,411 bytes) contains the current `Trail Native Bootstrap` loose scene and
no `data.unity3d` archive. It was installed successfully as an in-place update
after the authorized signing-key replacement.

After storage-access repair, a cold launch at device time **22:19:31** reached
`Trail XR composition: rootActive=True rigActive=True cameraActive=True` at
**22:19:39.205**. The same app PID resumed its passthrough layer at
**22:19:39.278**. There were no `E Unity` entries in that startup capture. The
initial samples included a 57/72 FPS startup frame window; these brief samples
are not a sustained performance benchmark. Android activity launch time (649 ms)
is distinct from XR composition readiness (about 8 s). The wearer subsequently confirmed: **“Yes, room and Trail menu are visible.”**
This confirms recovery from the reported black view for this launch. It does
not establish calibration, guide preload, physical transfer or a long session.

### Artifact identity and final build gate

- Headset-validated clean APK SHA-256:
  `c2a648d2b986a524a9d21e289e446cf5f8fc3a4577c90154f21ed00d779b7952`.
- After adding the editor-only APK layout guard, the final incremental Android
  ARM64/IL2CPP build also passed, including that guard:
  `artifacts/quest/build-70c94c71-d9cf-490f-a3b8-6b2e84391c0d/Trail.apk`,
  72,726,180 bytes, SHA-256
  `ac32ac66c319cbfd17aaf003fbed26f7c76465692eccdac9d8b89e23dd964fb7`.
- The installed clean build and final build have **byte-identical**
  `libil2cpp.so`, `global-metadata.dat`, and `level0`. The final editor-only
  validation change did not alter the checked runtime code or startup scene.
  The already wearer-confirmed build was left running.
- Final source patch SHA-256 (all `apps/quest` changes relative to the base
  commit above):
  `a56de6b7f902a010f3490087f0515cf7b906405639a0dce153080b4fdb5dac45`.
- Local metadata, source patch and raw device logs are in
  `artifacts/black-screen-fix/final-evidence.json`, `final-source.patch`, and
  `device-storage-repaired.log`. Backups remain outside Git.

After the user accidentally quit the app, it was relaunched successfully. The
second cold start again logged active root/rig/camera and passthrough resume,
with no `E Unity` entries in the captured startup log.

## 2026-09-19 — Point-and-pinch menu input

After confirming that the room and menu were visible, the wearer reported that
clicking a tutorial did nothing and clarified that they were pointing and
pinching. The existing shell only consumed index-tip proximity, a 600 ms hold
and withdrawal. It had no hand aim/pinch handler; this is separate from the
repaired rendering issue.

Added native Meta hand aim/pinch input for the existing text menu. The adapter
uses the existing rig tracking space, Meta's filtered pointer pose and index
pinch flag, tracked/high-confidence/valid-input checks, and excludes system
gestures. It does not supply recording joints or alter guide progression. Rays,
a target cursor, cyan hover and an input hint make the supported interaction
visible. Selection requires a fresh open-to-pinched transition; focus/tracking
loss and route changes cancel pending presses. Disabled controls remain gated,
and simultaneous hands cannot dispatch twice into a new route. Direct touch
remains available.

The pinned Meta SDK's `OVRHand.cs` supplies the pose conversion reference;
[Meta's interaction documentation](https://developers.meta.com/horizon/documentation/unity/unity-handtracking-interactions/)
describes using its filtered aim pose and pinch signal. The existing device
runtime advertises `XR_FB_hand_tracking_aim` version 2. No XR provider, rig,
package version, serialized motion contract or progression reducer changed.

Automated checks passed on the uncommitted worktree: **55 EditMode + 12 PlayMode**
tests; static scaffold **166 GUIDs**; Android ARM64/IL2CPP Development build and
APK scene/layout guards. New PlayMode tests drive the real shell through either
hand in a rotated/translated tracking space, assert visible hover and route
changes, and cover held pinches, disabled entries, focus/tracking recovery, and
simultaneous hands. Their pointer source is synthetic; they do not prove native
hand detection. The first run exposed a test observation-timing problem (the
assertion ran before LateUpdate feedback); sampling after that frame resolved
it without weakening the color assertion.

- Editor XML: `artifacts/quest/test-29ce8b2b-e7b4-42f3-ae7c-95e82cb21812/results.xml`.
- PlayMode XML: `artifacts/quest/test-play-4db48f2b-9eeb-425c-9d3b-85ba995c8347/results.xml`.
- Installed APK: `artifacts/quest/build-d877ddd6-0b22-4792-b6a7-ac692d5fb68f/Trail.apk`,
  103,295,796 bytes; SHA-256
  `7724f9d65271a77a78b8768ad4f5738b04893e5f4dc9907aa9a24f9528b4c8a8`.
- Same Quest 3S / Android 14 / firmware and Unity/package versions as above.
  In-place install preserved app data. Cold launch at **22:32:55** logged active
  root/rig/camera at **22:33:03.122**, and passthrough resume at
  **22:33:03.388**, with no Unity startup errors in the capture.
- Source patch, build/install metadata and private device log are under ignored
  `artifacts/pinch-input-fix/`. Only nonfunctional comment wording changed after
  the build.

Wearer confirmation of actual point-and-pinch navigation is pending.
