# Native toolchain setup evidence

## Current integration

The delivery branch `codex/unity-setup-integration` starts from merged `main`
`6e7b5b5`, which includes PR #5 and the shared-contract/voice workstreams. It keeps
that platform's XR/URP assets, GUIDs, single-rig bootstrap, release/development
build wrappers and XR Hands **1.7.2** pin. The older XR Hands 1.7.3 resolution and
minimal scene below belong only to the earlier scaffold.

The remaining local fixes are integrated: disabled optimized frame pacing for
WebRTC, fail-closed validation of Meta DevAgent credential fields, recovery of
an existing XR settings asset without replacing its GUID, refusal of null or
competing loaders, and protection against overwriting an APK or exporting a
Gradle project instead of packaging it. Both dependency lockfiles are retained
from main; the fresh frozen pnpm install reused 170 packages.

Validation on the integration checkout before the delivery commit:

- Fresh `pnpm install --frozen-lockfile`: passed, 170 packages reused, none downloaded.
- `pnpm check`: passed strict typechecking, 252 tests, production builds and static
  native structure validation. Existing Vite chunk-size warning remains.
- `pnpm validate:fixtures`: recording, narration and label fixtures passed.
- `E2E_PORT=3319 pnpm test:e2e --workers=1`: 6 Chromium tests passed with synthetic
  recording input, fake microphone and mock providers.
- Pure C# network policy/pairing input diagnostics passed using .NET SDK 8.0.425;
  contracts harness passed 115 corpus, binding, legacy, joint and basis checks.
- Fresh `pnpm quest:setup`: actual package import/C# compilation and setup passed.
- `pnpm quest:test`: 7 passed, 0 failed/skipped.
- `pnpm quest:test:play`: 3 passed, 0 failed/skipped (editor lifecycle/UI checks).
- `pnpm quest:build`: passed a release-mode Android ARM64/IL2CPP APK build.
  `artifacts/quest/build-81781e92-4f78-47f9-9937-64a4935fd75f/Trail.apk` is
  **69,077,802 bytes**, package `com.trail.guide` version `0.1.0`, minimum API 32,
  target/compile API 36. APK signature and ZIP integrity passed; ARM64-only,
  IL2CPP and WebRTC libraries confirmed. Build evidence records `development: false`.
  SHA-256: `136d52acaa8ab848af2a6452a144e8cba035448b698196e5b82519b8c72f26c1`.
  Generated DevAgent credential/address fields are empty and the feature is disabled.
- Retained editor-materialized URP profile/prefilter/runtime settings, Meta build
  config and the Oculus runtime preload with existing asset GUIDs. Removed only
  an empty generated StreamingAssets directory; SDK test artifacts cleaned up
  through their package's normal post-build callback. Final static check passed
  81 locally present asset/folder GUIDs; generated ignored local SDK metadata
  can make that count differ before/after import.
- All 20 direct Unity pins match the 48-package resolver lock. pnpm and UPM
  lockfiles are unchanged from the merged base.

Native tests and builds are software evidence only; no headset or live-provider
acceptance is claimed. This is a fresh checkout on the existing activated Mac,
not a new-machine license-installation test. See the
[installation guide](../README.md#install-dependencies-on-a-new-machine).

## Historical scaffold setup

September 19, 2026. Local, uncommitted work on `codex/unity-android-setup`, based
on `84152bd`. Existing README/log work was preserved. This is setup evidence,
not headset or live-provider acceptance.

| Component | Installed/resolved |
| --- | --- |
| Host | macOS 26.6.2, Apple Silicon |
| Unity Hub | 3.21.3 |
| Unity editor | 6000.3.24f1, revision 4e7b9b5b6244, ARM64 |
| License | Unity Personal activated locally after user-approved terms/sign-in |
| Android | Build Support, SDK, NDK r27c / 27.2.12479018, CMake 3.22.1 |
| Java | Temurin OpenJDK 17.0.18+8 |
| SDK tools | Build Tools 36.0.0; platform-tools 36.0.0; CLI tools 16.0 |
| SDK platforms | 34, 35, 36, 37 |
| Meta Core / Interaction / OVR integration / MRUK | 205.0.0 |
| OpenXR / XR Management / XR Hands | 1.18.0 / 4.5.4 / 1.7.3 |
| URP / uGUI / TextMeshPro | 17.3.0 / 2.0.0 / 5.0.0 |
| WebRTC / Test Framework | 3.0.0 / 1.6.0 |

### Checks

- Unity generated `apps/quest/Packages/packages-lock.json`; all direct pins agree
  with the resolved versions. No hand-written substitute lockfile was used.
- First imports identified missing Animation, Asset Bundle, Particle System and
  Physics 2D built-in modules required by Meta's code. Added exact `1.0.0` pins.
- `pnpm quest:setup`: passed actual editor import/C# compilation and Android settings.
- `pnpm quest:test`: **2 passed, 0 failed, 0 skipped**. The tests cover numeric
  coordinate reflection and invalid-pose rejection, not the unimplemented guide.
- `pnpm quest:build`: **passed** Android ARM64/IL2CPP development APK build.
  The initial successful build exposed a non-fatal Meta post-build exception
  because XR manager settings were absent. Setup now creates/preserves the
  Android XR manager and assigns exactly one OpenXR loader; the corrected build
  passed without that exception.
- Final APK after GUI input setup: `artifacts/quest/trail-scaffold-1789848334746.apk`, **118,413,600 bytes**.
  Android signature verification and ZIP integrity passed. Package ID
  `com.trail.guide`, minimum SDK 32, target/compile SDK 34, ARM64 only.
  Both `libil2cpp.so` and `libwebrtc.so` are present. A byte comparison found no
  current local DevAgent credential in the decompressed APK entries.
- SHA-256: `45f88bcba7b8fbb20adc23f6125932af5a2c34a26d3c48dba44ee4219b6e4bad`.
- Dependency/vendor import and setup warnings remain; the completed scaffold
  build does not mean Meta's full runtime project recommendations are satisfied.
- Final recheck after the XR configuration fix: 2 EditMode tests passed; tools
  typecheck, static scaffold checks, documentation links and whitespace passed.
- Rechecked after GUI Input System configuration: both EditMode tests and the
  Android build passed. All 19 direct package pins still match the 48-package
  Unity lockfile; the static scaffold check still passes 57 asset/folder GUIDs.
- Native logs and test XML are local ignored artifacts under `artifacts/quest/`.

### Historical commands

Install/activate the same editor and Android modules on a new host, then run
`pnpm quest:setup`, `pnpm quest:test`, and `pnpm quest:build` with no editor open
on this project. `UNITY_EDITOR` supports a nonstandard editor executable path.
The build produces a uniquely named development APK under `artifacts/quest/`.
Keep `Packages/packages-lock.json`, generated project settings and asset GUIDs.

The build settings select ARM64, IL2CPP, minimum Android API 32, Internet access,
linear color and disabled optimized frame pacing for the WebRTC candidate.
The verified GUI setup selects Input System Package (New) as the active input
backend; the saved Android target API is 34.
Meta's generated local DevAgent credential asset is ignored; a build callback
clears the unused credentials after Meta's callback and leaves the feature disabled.

### GUI handoff

The Mac was unlocked and the editor GUI was verified on September 19, 2026.
The window showed `Trail.unity` from this checkout in Unity 6000.3.24f1 with
Android selected. First-run Input System activation initially selected Both;
changed Active Input Handling to Input System Package (New) and restarted.
SDK setup warnings remain, and the first GUI session logged an editor
progress-status error (`Cannot get non-existing progress id 5`). After the
successful rebuild, the reopened Trail scene showed zero Console errors and
two Meta setup warnings (one required and six recommended fixes). These are
separate from C# compilation and the scaffold build. No Quest was listed by
`adb devices -l`; no headset installation or observation was performed.

### Limits

The scene remains a scaffold without a live XR rig, hand capture, calibrated
replay, progression, camera, microphone or provider integration. The Android OpenXR loader is configured;
URP pipeline/renderer assets and required Meta features still need configuration
for the actual app. No PlayMode suite, device install, headset observation or live
provider test is claimed. Native CI is not configured by this local setup.

Sources: [Unity editor release](https://unity.com/releases/editor/whats-new/6000.3.24f1),
[Hub installation CLI](https://docs.unity.com/en-us/hub/use-hub-cli),
[Meta UPM setup](https://developers.meta.com/horizon/documentation/unity/unity-package-manager/),
[WebRTC requirements](https://docs.unity3d.com/Packages/com.unity.webrtc@3.0/manual/requirements.html).
