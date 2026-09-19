# Trail native project scaffold

Open this directory as the Unity project. This is a **source scaffold**, not a
working Quest application. Unity is not installed on the current development
machine; the editor has not imported, resolved, compiled or built these files.
The user requested project files first, without a Unity installation.

## Candidate toolchain

| Component | Checked-in candidate |
| --- | --- |
| Unity editor | 6000.3.24f1, revision 4e7b9b5b6244 |
| Meta Core / Interaction / OVR integration / MRUK | 205.0.0 |
| Unity OpenXR / XR Management | 1.18.0 / 4.5.4 |
| URP / uGUI | 17.3.0 / 2.0.0 |
| Unity WebRTC | 3.0.0 |
| Unity Test Framework | 1.4.6 |

These are initial exact pins, **not a validated combined package set**. Unity's
[release entry](https://unity.com/releases/editor/whats-new/6000.3.24f1) and
[URP 6.3 manual](https://docs.unity3d.com/6000.3/Documentation/Manual/com.unity.render-pipelines.universal.html)
identify the editor/rendering line. Meta packages were checked against its
[official registry](https://npm.developer.oculus.com/); OpenXR, management,
WebRTC and test versions against Unity's registry. Core/Interaction/MRUK share
one Meta release. See [Meta UPM setup](https://developers.meta.com/horizon/documentation/unity/unity-package-manager/)
and [WebRTC requirements](https://docs.unity3d.com/Packages/com.unity.webrtc@3.0/manual/requirements.html).

`Packages/manifest.json` configures Meta's scoped registry and direct pins.
There is deliberately no invented `packages-lock.json`: generate it on the first
successful Unity resolution, inspect transitive compatibility (including
TMP/uGUI), then commit it. URP is editor-coupled. Do not use npm/pnpm to install
UPM packages or upgrade pins until the import result identifies a reason.

## What exists

- Pure `Trail.Contracts` and `Trail.Motion` assembly boundaries, canonical joint
  names and a numeric coordinate-basis conversion with EditMode test sources.
  Full recording DTO parsing, native joint mapping and runtime matching are pending.
- Runtime and presentation assembly boundaries, ownership folders and a minimal
  `Trail.unity` scene containing an explicit scaffold-status component.
- Stable `.meta` GUIDs, visible metadata/Force Text settings and scene build entry.
- An editor setup action for Android application identity, ARM64/IL2CPP and linear
  color. The default application ID is `com.trail.guide` for local development.
- Repository scripts for static checks, editor setup and EditMode execution.

The scene has **no camera rig, passthrough, hand provider, URP asset, ghost, mic or
network adapter** yet. It must not be presented as a working MR scene. No APK
build wrapper is provided until the runtime scene/configuration is ready.

## First editor session

1. Install the pinned editor through Unity Hub separately, with Android Build
   Support, Android SDK/NDK and OpenJDK; activate the editor using your account.
2. Add this directory in Hub. First opening it downloads/resolves the UPM
   dependencies; obtain any required Meta asset entitlements if resolution asks.
3. Resolve compile/package errors before recording compatibility. Review generated
   settings and commit the UPM lock. Preserve the existing asset GUIDs.
4. Run **Trail → Apply Android scaffold settings** or `pnpm quest:setup` from
   repository root with a closed editor. Switch to the Android build target.
5. Create/assign URP pipeline assets; enable the Android OpenXR loader and required
   Meta features through Project Settings/Meta Project Setup Tool. Do not enable
   the deprecated Oculus XR provider. Add one Meta rig with locomotion disabled.
6. Implement the named OpenXR 26→25 hand adapter, separate recorded ghost and
   session-origin invalidation. Add permissions/camera/voice through their owners.
7. Run EditMode checks, then build/install a standalone APK and collect real-device
   evidence using [the pending gate](../../docs/device-check.md).

From repository root:

```sh
pnpm check:quest-scaffold  # static files/metadata only; no Unity needed
pnpm quest:setup          # requires installed, activated pinned editor
pnpm quest:test           # actual EditMode tests; fails if editor/results absent
```

Set `UNITY_EDITOR` to the Unity executable if it is installed outside the default
macOS Hub directory. Reports go to ignored `artifacts/quest`. These scripts do
not download an editor or fabricate passing results. Do not run batch commands
against a project already open in the editor.
