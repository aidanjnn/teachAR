# Trail Quest platform

This project now contains the Android setup/build path, a single OpenXR/Meta
passthrough bootstrap, and a scoped native API connection. **Unity import,
compilation, APK build, and headset operation remain unverified** because the pinned editor
currently stops at license activation (exit 198). This branch supplies the
platform foundation; capture, guide, scene interpretation and storage are
separate feature branches. Voice remains separately owned.

## Exact proposed toolchain

| Component | Pin |
| --- | --- |
| Unity editor | 6000.3.24f1, revision 4e7b9b5b6244 |
| Meta Core / Interaction / OVR integration / MRUK | 205.0.0 |
| Unity OpenXR / XR Management / XR Hands | 1.18.0 / 4.5.4 / 1.7.2 |
| URP / uGUI | 17.3.0 / 2.0.0 |
| Unity WebRTC / Test Framework | 3.0.0 / 1.4.6 |

These are exact proposed pins, not a tested combined package set. The official
Meta Core 205 package itself requires XR Hands 1.7.2. Setup uses APIs inspected in
those exact Core/OpenXR/Management/Hands package sources. References:
[Meta registry](https://npm.developer.oculus.com/com.meta.xr.sdk.core/205.0.0),
[Unity registry](https://packages.unity.com/com.unity.xr.openxr),
[Meta camera rig](https://developers.meta.com/horizon/documentation/unity/unity-ovrcamerarig/),
[passthrough](https://developers.meta.com/horizon/documentation/unity/unity-passthrough-tutorial/),
[editor release](https://unity.com/releases/editor/whats-new/6000.3.24f1), and
[WebRTC requirements](https://docs.unity3d.com/Packages/com.unity.webrtc@3.0/manual/requirements.html).

There is no fabricated UPM lock. The first successful editor resolution must
produce `Packages/packages-lock.json`; review and commit it together with generated
XR/URP/Meta settings and their `.meta` files. Preserve existing GUIDs. Package or
editor incompatibility is a failed gate, not permission to silently alter pins.

## Reproduce setup and build

Install/activate the pinned editor separately with Android Build Support,
SDK/NDK and OpenJDK. Set `UNITY_EDITOR` to its executable if outside the normal
macOS Hub path. Close the interactive editor before batch commands.

```sh
pnpm quest:setup
pnpm quest:test          # actual nonempty passing EditMode report required
pnpm quest:test:play     # actual nonempty passing PlayMode report required
pnpm quest:build         # release APK; HTTPS only
TRAIL_DEVELOPMENT_BUILD=1 pnpm quest:build  # USB-loopback development APK
```

Each invocation gets a unique ignored `artifacts/quest/<action>-<id>` directory,
log and test/build report. Build requires an actual APK and success report
matching the pinned editor, Android, ARM64 and IL2CPP. Missing editor, activation,
UPM lock, tests or build artifacts fails. `TRAIL_ANDROID_VERSION_CODE` optionally
sets a positive version code (default 1). Application ID is `com.trail.guide`.
The wrapper selects Android before script compilation to avoid the wrong platform
symbols. Setup generates URP assets, enables a single OpenXR loader, the Meta XR,
Meta Quest, Hand Tracking Subsystem and Oculus Touch input-profile features,
Vulkan, linear color and a
HandsOnly/required-passthrough Android manifest. Check Meta Project Setup Tool
and permissions on the actual resolved project before hardware acceptance.

The checked-in `Trail.unity` runs `NativeBootstrap`: it waits for OpenXR, refuses
an existing competing rig/camera, creates one `OVRCameraRig` with Stage origin,
transparent camera and passthrough underlay, disables app-requested recentering,
and supplies its `trackingSpace` to
feature assemblies. It does not create controller/synthetic hand data or
locomotion. Features register a concrete installer through `PlatformFeatures`
before scene load, then implement `IPlatformFeature.Initialize(PlatformContext)`.
This preserves assembly ownership without runtime reflection or guessed types.
The Touch profile satisfies Meta Core OVRInput setup requirements; it does not
provide recorded hand samples or spawn controller visuals. Tasks compose capture at order 10, guide 20, scene 30 and storage/UI 40. A missing
feature is not represented as successful hardware capability.

## Pair and reach the API

Server composition is delivered by the authoring/storage branch; reusable auth
and routes are in `apps/server/src/auth`. See [pairing setup](../../docs/pairing.md).
Configure `NativeApiConnection` with the exact HTTPS origin, then `Pair(code)`.
It retains a role/session bearer only in memory, attaches it to every request,
rejects redirects/traversal, bounds concurrency/body sizes and returns status 0
for transport failure. Re-pair after expiry, focus loss, pause or restart.
`SessionInvalidated` lets transport consumers cancel their work; a preloaded guide
may continue locally without granting the server progression authority.

For an explicitly enabled loopback development server and development APK:

```sh
adb reverse tcp:3401 tcp:3401
```

Use `Configure("http://127.0.0.1:3401", true)` and a fresh code; this exception is
rejected by release builds. Untethered operation requires valid HTTPS reachable
from the Quest. No certificate-validation bypass is supplied. Install the actual
APK printed by the wrapper with `adb install -r <absolute-apk-path>` and launch
`com.trail.guide` from the Quest. No installation occurred during development.

## Evidence boundaries

`pnpm check:quest-scaffold` checks metadata and source boundaries only.
`dotnet run --project tests/native-network/Network.csproj` executes actual pure C#
URL/token/expiry policy tests. `dotnet build tests/native-network/UnityCompile.csproj`
compiles the network adapter against installed Unity managed assemblies (set
`-p:UnityManagedPath=...` on other installations), without loading Unity or proving
IL2CPP compatibility. PlayMode sources cover native connection lifecycle,
but cannot count as passing until Unity executes them. WebSocket/HTTP server tests
exercise real server authorization. None establishes tracking, simultaneous
hands/audio/camera, physical calibration/transfer, APK networking or usable XR UI.
Use [device checks](../../docs/device-check.md) and record actual hardware evidence
in `docs/validation.md` when it exists.
