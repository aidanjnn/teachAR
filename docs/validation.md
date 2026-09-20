# Native validation evidence

## 2026-09-19 — PR #19 black-screen repair

This run uses `codex/quest-black-screen-diagnosis`, based on PR #19 commit
`bdfb757e9062d3170597d018a32c0762378babb5`, plus the uncommitted repair. The
source patch and APK hashes are kept with the local build evidence. At that
stage, no commit, push, or merge had been performed; the later PR delivery is
recorded separately below. See [the diagnosis](native-black-screen-diagnosis.md)
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

## 2026-09-19 — Combined PR #19 delivery checks

The user requested publication to existing PR #19. Commit
`d05b5279cef8fda9744ff879e30264001a886ec3` combines this task's repair/input commit
`24ae6de` with the PR's newer review-fix commit `de74ae7`. Both histories are
preserved. Pairing visibility retains the review fix's component disabling and
hover reset, plus the repair's entered-code reset and inactive-canvas guard.
All code inputs below match that combined commit; only documentation changed
subsequently. Unity's generated whitespace/empty-field changes were inspected
and restored after the checks.

Fresh automated results:

- `pnpm check`: strict typechecks, **352/352 tests in 32 files**, production builds,
  and **166** static native GUID checks passed.
- `pnpm validate:fixtures`: passed. `pnpm test:e2e`: **7/7** Chromium workflows
  passed with synthetic inputs and mocked providers.
- Unity 6000.3.24f1 CLI: **57/57 EditMode** and **13/13 PlayMode** passed. XML reports
  are `artifacts/quest/test-1263f4aa-60c2-423d-aa18-6565f9ff18dd/results.xml` and
  `artifacts/quest/test-play-ab039bdb-f525-4a5c-9884-ddadbe1a049c/results.xml`.
- Android ARM64/IL2CPP Development build passed, including startup-scene and APK
  data-layout guards. APK:
  `artifacts/quest/build-a6506903-459d-4add-9059-a6d47e19433b/Trail.apk`,
  **103,293,737 bytes**, SHA-256
  `d2516039d8a585663d3090147926a7ec37295f1b740e690bc6901b997cc07f61`.
  Its current loose startup scene is present and no packed `data.unity3d` exists.
- Delivery logs and nonprivate metadata remain local under
  `artifacts/pr19-delivery-*`. Document links and patch whitespace passed.

The combined APK has **not** been installed or tested on the headset. The earlier
wearer-confirmed rendering recovery and subsequent installed pinch APK remain
attributed to their exact pre-integration source patches above. Actual wearer
confirmation of point-and-pinch navigation is still pending. No new live-provider
or physical-transfer evidence is claimed. Earlier prototype, .NET and mutation
results retain their own recorded revisions; they were not rerun in this delivery.


## 2026-09-19 — Live cast smoke test and menu/touch repair

**Observed before the change:** Quest 3S, Android 14, package `com.trail.guide`
0.1.0 (versionCode 1), installed at 22:32:54 local device time. ADB SHA-256 of
its installed APK was
`7724f9d65271a77a78b8768ad4f5738b04893e5f4dc9907aa9a24f9528b4c8a8`, matching the
previously documented pinch build. Live iPhone Mirroring screenshots showed
passthrough, the Trail Home menu, the unpaired notice and calibration warning.
The wearer reported the menu was distant/angled and could not be touched. A
later cast frame showed the menu oblique and far to the left. No successful
selection, recording or guide run was observed on that build in this session.
Private cast screenshots remain outside Git.

**Repair source:** uncommitted changes on `codex/menu-touch-smoke`, based on
`f0c9797`. The shell places its panel 0.5 m in front of the first tracked head
pose, 0.2 m below eye level, with yaw facing the wearer; it stays stationary until
focus/pause recovery. Near touch now takes priority over ray selection and uses
the label width rather than only its center point. Cyan/green holding feedback
and pull-back instructions expose the existing 600 ms hold/withdraw gesture.
This does not change motion coordinates, workspace calibration, hand validity,
recording or guide progression.

Automated checks on that source:

- `dotnet run --project tests/native-shell/Shell.csproj`: **214** checks passed,
  including rotated label-edge touch, row gaps and out-of-bounds rejection.
- Unity **15/15 PlayMode**, including direct touch while a pointer aims at the
  menu, plus head-relative placement, stationary interaction and focus recovery:
  `artifacts/quest/test-play-c1a9e372-3b3e-4572-85c3-2253e3ce2e27/results.xml`.
- Unity **57/57 EditMode**:
  `artifacts/quest/test-da17590c-383e-4f65-937d-498dd3c49d88/results.xml`.
- `pnpm check:quest-scaffold`: **166** GUIDs passed.
- Editor: **6000.3.24f1**; native package versions unchanged from PR #19.

The tests use synthetic input and do not establish real hand-touch success.

Android ARM64/IL2CPP Development build passed, including scene/data-layout guards:
`artifacts/quest/build-7e175561-6f01-4590-823e-351a1fab42d6/Trail.apk`,
114,631,272 bytes; SHA-256
`c7d49db19f4f4433e6c1d4096cf5f891a1fdebf060e43875256368f47e8d751e`.
The exact source diff is retained locally at
`artifacts/menu-touch-smoke/source.patch`. Generated Unity settings changes were
inspected and restored; the development build applied the existing setup script.

The initial in-place install was rejected with `INSTALL_FAILED_UPDATE_INCOMPATIBLE`.
The installed APK and this Mac's debug keystore have different certificate
fingerprints. No uninstall was performed during diagnosis. Private backups of
internal files/preferences and external application files were verified by
reading each archive and hashing its contents (1 internal file and 9 external
files); the original installed APK is retained for rollback. Reinstall and
restoration were submitted for user confirmation. The fixed APK is not yet
validated on the headset.


**First repaired build on device:** the user authorized reinstall/restore.
Internal and external file contents matched their pre-uninstall SHA-256
manifests after restoration. The first launch stalled because the restored
`il2cpp` runtime-cache directory was shell-owned. Removed only that generated
cache so Unity could recreate it; the tutorial cache and preferences were kept.
The relaunch at 23:12:07 reached active root/rig/camera at **23:12:16.655**.
Live cast showed passthrough and the new near, front-facing menu. The wearer
then reported Create opens, and a cast screenshot independently showed the
Create route. This is device confirmation of the repaired navigation, not a
recording, calibration or tutorial-follow pass.

The nearer view exposed long notices and disabled reasons extending beyond the
view. A subsequent iteration wraps notices and renders disabled reasons beneath
their labels. The wearer also requested free panel movement toward/away like a
normal app; the next iteration adds a pinch-and-drag Move panel handle. Those
follow-up source changes are not included in the first repaired APK above.


**Move-panel iteration checks:** 16/16 PlayMode tests passed in
`artifacts/quest/test-play-af38dda0-dc69-4533-bba9-88d1c3f3c534/results.xml`;
57/57 EditMode passed in
`artifacts/quest/test-b49e190f-afe8-44c9-98ef-f5cef9ae84ef/results.xml`.
The new drag regression uses either hand in a rotated tracking space, verifies
forward/back and sideways translation, release persistence, and cancellation
without resuming a held pinch after tracking loss. Existing pointer focus,
held-pinch, simultaneous-hand and direct-touch regressions also pass. The exact
source diff is retained at `artifacts/menu-touch-smoke/move-panel-source.patch`.
Static native scaffold checks passed (169 GUIDs while Unity build-generated assets
were present). The unchanged pure-shell
inputs retain their prior 214-check result.


**Move-panel APK:** Android ARM64/IL2CPP Development build succeeded:
`artifacts/quest/build-f3d703a4-2910-449b-bf2d-b4451791edc0/Trail.apk`,
114,628,906 bytes; SHA-256
`a29d9748ab3a588d39a14dd47d1c248089dbad99fba6bbc147d4b1e2c6e657eb`.
An in-place update succeeded and the installed APK hash matched. Startup logged
active root/rig/camera at **23:21:38.557** with no captured `E Unity` entries.
Generated settings changes were inspected and restored after the build.

iPhone Mirroring subsequently reported the phone was in use. A direct ADB
screenshot showed the Quest system's “Finding position in room” dialog, so
physical dragging confirmation is pending tracking recovery and wearer input.
Do not count the synthetic drag tests as device acceptance. The earlier wearer
confirmation that Create opens belongs to the preceding repair APK, not this
new hash. Calibration, fresh recording, library playback and complete learner
flows remain unverified in this smoke-test session.


**Placement recovery finding:** the wearer reported seeing only room/system UI
rather than the new move handle. A direct headset screenshot after relaunch
showed a clipped, oblique fragment of the panel at the far-right edge. The build
contained the move-handle strings and the installed hash was verified; this was
not an old-APK installation. Initial placement could run on a pose sampled
before the headset was worn or its eye anchors/reference space had settled.

The next repair keeps the panel hidden until the head is tracked and, where
reported, worn, and waits 0.5 s across multiple ready frames before taking the
current head pose. The first test run correctly flagged the previous composition
test's immediate-visibility assumption; it now checks that the root and camera
remain active while the panel waits, and that the panel appears after placement.
The full **17/17 PlayMode** suite passed:
`artifacts/quest/test-play-bd74fb51-97c2-48ff-a520-712eec3c3d52/results.xml`.
Exact source: `artifacts/menu-touch-smoke/settled-placement-source.patch`.
Physical movement remains unconfirmed; another build/install follows.


**Settled-placement APK:** 57/57 EditMode passed in
`artifacts/quest/test-6972c62d-be07-4eca-8735-3d2e431c0c4b/results.xml`.
The Android ARM64/IL2CPP Development build passed and installed in place:
`artifacts/quest/build-9e1efdc0-b04c-4a3a-b09c-11c93dba0cc2/Trail.apk`,
114,634,526 bytes; SHA-256
`f90bed6494159b0a278ebef447e73bfabc9b1c98597c69dc0740bc6f8ecc301f`.
Startup logged active root/rig/camera at **23:31:43.306**. A direct headset
screenshot then showed the front-facing Trail Home menu, wrapped local-mode
notice and the **Move panel / Pinch and hold to drag** handle clearly visible
above the title. No `E Unity` entries appeared in the captured startup log.
This verifies display of the updated UI. Wearer confirmation of physical
forward/back dragging is still pending.


**Wearer acceptance:** after the settled-placement APK above was installed, the
wearer answered the forward/back drag check with “yes it moves now.” Physical
panel movement is confirmed on Quest 3S. Release persistence and tracking-loss
behavior have automated coverage but were not separately described by the wearer.
A subsequent captured Unity/AndroidRuntime error-log query returned no entries.
Full calibration, recording, playback and learner completion remain unverified
in this smoke-test session.
