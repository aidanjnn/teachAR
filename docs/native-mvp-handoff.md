# Native MVP integration — handoff

Branch `codex/native-mvp-integration`. Originally written 2026-09-19 while the
Quest 3S view was black. **That rendering defect is now repaired:** the wearer
confirmed the room and Trail menu are visible. See the
[diagnosis](native-black-screen-diagnosis.md) and [validation record](validation.md)
for the root-deactivation fix, build-cache recovery and exact tested APKs.
Point-and-pinch menu input is implemented; actual wearer confirmation is pending.
The remaining capture, calibration, progression and voice gaps below still apply.

## How to reproduce the current state

Toolchain on the machine this was done on (all installed during that session):

```sh
export PATH="/opt/homebrew/opt/node@22/bin:$PATH"   # repo needs Node 22, default was v26
export PATH="$HOME/.dotnet:$PATH"                   # .NET SDK 8.0.425, user-local
# Unity 6000.3.24f1 (changeset 4e7b9b5b6244) + Android Build Support, Unity Personal licence
```

```sh
pnpm quest:setup            # package resolve + compile
pnpm quest:test             # EditMode    40/40
pnpm quest:test:play        # PlayMode     8/8
TRAIL_DEVELOPMENT_BUILD=1 pnpm quest:build
adb install -r artifacts/quest/build-*/Trail.apk

# Put a followable guide on the device with no server and no pairing:
dotnet run --project tests/device-seed/Seed.csproj -- /tmp/seed
adb shell mkdir -p /sdcard/Android/data/com.trail.guide/files/trail-cache/<key>
for f in /tmp/seed/trail-cache/<key>/*; do
  adb push "$f" /sdcard/Android/data/com.trail.guide/files/trail-cache/<key>/$(basename $f)
done
```

`adb push` of a *directory* into that path silently creates an empty directory and then
fails with `failed to read copy response: EOF`. Push the files individually.

## Resolved issue 1 — black headset view (original investigation)

The observations and hypotheses below describe the original failing build.
The subsequent repair and wearer-confirmed recovery are recorded in
[validation.md](validation.md); they supersede this section's original diagnosis.

The app starts, composes cleanly, reaches `XR_SESSION_STATE_FOCUSED`, and is the
`topResumedActivity`. Hand tracking is granted and active. There are no `E Unity`
errors. The display is nevertheless black, with a single small red/pink dot per eye
that has correct stereo disparity.

Passthrough starts correctly and is then torn down **while the app still has focus**:

```
xrPassthroughLayerResumeFB  — Layer 1000 is being resumed
setStyle: Layer 1000, textureOpacityFactor=0
setStyle: Layer 1000, textureOpacityFactor=1      <- fully on
xrPassthroughLayerPauseFB   — Layer 1000 is being paused
ProcessPTProxyLayers: removing 1 layers because no matching active layers were found
MIXEDREALITY: PassthroughApiManager: PT is: ON  numLayers: 0
```

So the compositor has passthrough enabled globally, but the app stops submitting its
layer. `numLayers: 0` is the consequence, not the cause.

An earlier reading of this blamed focus loss. That was wrong: the later capture shows
the pause happening while `topResumedActivity` is Trail and the session state is
`FOCUSED`. Do not re-derive that conclusion.

Prime suspect is `Runtime/Platform/NativeBootstrap.cs`, which builds the rig at runtime
while it is deactivated:

```csharp
rigRoot.SetActive(false);
var rig = rigRoot.AddComponent<OVRCameraRig>();
rig.EnsureGameObjectIntegrity();
var ovr = rigRoot.GetComponent<OVRManager>() ?? rigRoot.AddComponent<OVRManager>();
ovr.isInsightPassthroughEnabled = true;
rigRoot.AddComponent<OVRPassthroughLayer>().overlayType = OVROverlay.OverlayType.Underlay;
foreach (var camera in rigRoot.GetComponentsInChildren<Camera>(true))
{ camera.clearFlags = CameraClearFlags.SolidColor; camera.backgroundColor = Color.clear; ... }
// ... features initialize ...
rigRoot.SetActive(true);
```

**Subsequent PR #19 review finding:** `NativePairingPanel` lives on the application
root, but its new `SetPanelVisible(false)` called `gameObject.SetActive(false)`.
The shell calls that during initialization, disabling the root and its rig. The
PR #19 correction changes visibility to the pairing canvas
and disables only the panel's input component. A regression test checks the actual
root/camera activation and connection lifetime. The subsequent corrected APK
resumed passthrough and the wearer confirmed the room and menu were visible.
The hypotheses below predate that finding and device confirmation.

Hypotheses recorded at handoff:

1. **`OVRManager` / `OVRPassthroughLayer` added while the GameObject is inactive.**
   Their `Awake`/`OnEnable` run only at `SetActive(true)`, after `isInsightPassthroughEnabled`
   was set on an uninitialised instance. Meta's supported path is an `OVRCameraRig`
   prefab present in the scene. Test by building the rig while active, or by placing a
   prefab in `Trail.unity` and having the bootstrap adopt it.
2. **Eye-buffer alpha.** An underlay only shows where the app's colour buffer is
   transparent. URP is the active pipeline (`m_CustomRenderPipeline` is set in
   `ProjectSettings/GraphicsSettings.asset`). Confirm the URP camera background really
   reaches the compositor with alpha 0; `Camera.backgroundColor = Color.clear` on the
   raw camera is the built-in-pipeline idiom and may not be sufficient under URP.
3. **OpenXR passthrough feature not enabled.** `Assets/XR/Settings/OpenXR Package
   Settings.asset` has several features with `m_enabled: 0`. The names were not read.
   Verify the Meta passthrough feature is among the enabled ones.

Useful commands:

```sh
adb logcat -d | grep -iE "PassthroughLayerResume|PassthroughLayerPause|textureOpacityFactor|numLayers"
adb shell dumpsys activity activities | grep topResumedActivity
adb exec-out screencap -p > shot.png       # stereo pair, 3664x1920
```

## Open issue 2 — world-space text may not render under URP

Unconfirmed, but it would explain the red dots. Three panels build `TextMesh` and
assign the **built-in** font material:

- `Presentation/CaptureControlPanel.cs:45`
- `Runtime/Guide/GuideControlPanel.cs:35`
- `Runtime/Shell/TutorialExperienceController.cs:85`

```csharp
child.GetComponent<MeshRenderer>().sharedMaterial = text.font.material;
```

`Font.material` uses the built-in `GUI/Text Shader`, which does not render under URP and
normally falls back to magenta. The two capture/guide panels predate this branch, so if
this is real it has never worked on device and was never caught, because the `N0` device
baseline was never run.

Against the hypothesis: the dots are far too small to be full-size magenta text quads.
Something else may be going on. Settle it by rendering one label with a known-good URP
unlit material before changing all three.

Note `Presentation/Resources/TrailGhost.shader` already declares
`Tags { "RenderPipeline"="UniversalPipeline" }`, so it is the right template for a
`TrailText` shader if one is needed.

## Open issue 3 — USB-loopback HTTP is blocked, so native pairing cannot complete

`DevelopmentPairing` (see below) reads its handoff correctly — the file is consumed and
deleted — but the request never leaves the headset. The APK ships:

```xml
<base-config cleartextTrafficPermitted="false" />
```

Three attempts failed and are recorded so they are not repeated:

1. `Assets/Plugins/Android/res/` — Unity 6 removed it outright:
   *"Providing Android resources in Assets/Plugins/Android/res was removed."*
2. `Assets/Plugins/Android/AndroidManifest.xml` — this **replaces** Unity's entire
   `unityLibrary` manifest rather than merging. A minimal stub removed the launcher
   activity that Meta's OVR injection attaches to, producing
   *"Missing 'name' key attribute on element activity"*. Doing this properly means
   deriving the full manifest from Unity's generated one, which freezes Meta's
   injections.
3. `PlayerSettings.insecureHttpOption = AlwaysAllowed` in `ProjectSetup.BuildAndroid`,
   with `AssetDatabase.SaveAssets()` before the build. The build log confirms
   `insecureHttpOption=AlwaysAllowed (development=True)` was applied, and Unity **still**
   emitted `cleartextTrafficPermitted="false"`. That setting evidently gates only
   Unity's own `UnityWebRequest` check, not Android's platform policy.

The code from attempt 3 is retained because it is correct in intent and harmless. It is
not a solution. This is why the offline seeding path exists.

## Open issue 4 — nothing on device turns a recording into a ready tutorial

`PrivateTutorialCache.StoreReady` has exactly one caller: the network download inside
`NativeStorageFeature.PreloadSelected`. Segmentation lives behind the server's
author-gated `POST /api/tutorial-jobs`. So a never-paired headset starts with an empty
library, and first acquisition still needs one server round trip.

Local-first is complete for any guide **already on the device**: it enumerates,
preloads, calibrates and follows with no server, no pairing and no role, permanently.
Closing the authoring half needs an on-device segmentation and review path, which
touches the "reviewed before ready" invariant and must not be slipped in quietly.

## What is on the branch

13 commits from `ae04160` (merge of Zain's browser reference) through `f71b230`.

| Area | State |
| --- | --- |
| Zain's browser tutor merged, CI blocker fixed | verified, suite green twice |
| U1 Create/Follow shell (`Trail.Shell`) | logic verified; on-device rendering unproven |
| U2/U3 save position + clean trim (`Motion/`) | logic verified; **not wired into `CaptureReplaySession`** |
| U4/U5 two-hand ghost + honest tolerance | compiles, 36 stub checks; visually unproven |
| Native voice coach (`Trail.Coach`) | session layer verified; **transport and microphone are unimplemented interfaces** |
| Local-first storage, no pairing needed | verified in editor; on-device unproven |
| Offline device seeding (`tests/device-seed`) | verified on host, pushed to device |

### Automated evidence

All of the following passed on this branch:

- `pnpm check` — typecheck, 352 tests in 32 files, builds, 163 scaffold GUIDs
- `pnpm validate:fixtures`, `pnpm test:e2e` 7/7 Chromium
- Prototype suite: 9 browser workflows, 56 Node, 52 Python — twice
- `pnpm quest:test` 40/40 EditMode, `pnpm quest:test:play` 8/8 PlayMode, on 6000.3.24f1
- Seven .NET harnesses compiling the **actual** shipped sources: capture/calibration and
  save-position/take-lifecycle (139 assertions), 24 guide scenarios, 151 contract checks,
  native URL/pairing policy, 199 shell checks, 36 presentation checks, 11 coach scenarios
- Mutation passes: 14 caught on the recording reducer, 4 caught through the real Unity
  editor on local storage, 3 caught on the coach session layer

Release APK previously built at 69,334,490 bytes
(`sha256 85710f31d24e424ff1abdedb2d5a5ebb830add656a5775a6601ec89bb6d845e9`),
`com.trail.guide 0.1.0`, ARM64/IL2CPP, `native-code: 'arm64-v8a'`, including
`libwebrtc.so`. Development APK is ~114 MB.

### Device evidence

Quest 3S `3487C10J21030Z`, Horizon OS on Android 14 / SDK 34. The APK installs,
launches, composes without error, reaches `XR_SESSION_STATE_FOCUSED`, initialises hand
tracking, and cold-starts to first frame in about 9 seconds. **It renders black.**
Nothing about calibration, ghost legibility, following, frame time or voice is verified.

## Decisions worth preserving

- **Pairing gates only what leaves the device.** Recording, reviewing and following are
  local, per `AGENTS.md:135` ("loaded guidance survives loss of AI/backend"). Publishing
  still requires a paired author — local authoring is not role escalation, publishing is.
- **`Trail.Shell` needed its own assembly.** `Trail.Guide` already references
  `Trail.Presentation`, so a shell in Presentation reaching `GuideController` would close
  an assembly cycle.
- **One confirm model everywhere**: touch, hold, withdraw. Capture used to confirm on
  withdrawal while guide and storage fired on dwell alone.
- **The ghost draws the reviewed tolerance**, not a decorative radius. Tune the reviewed
  tolerance on hardware and let the ring follow; never tune the ring to look right.
- **`ShowGuideFrame` was deleted, not kept as a convenience.** It was what made
  rendering only `Targets[0]` easy to write.
- **Unity 6000.3.24f1 is pinned deliberately.** `docs/plan.md:163,191`: `com.unity.webrtc`
  3.0.0 documents Unity 6000.3, and voice is a required target. All 47 packages resolved
  at their pinned versions, so the pin holds.
- `NativeBootstrap` now names the failing feature and exception type on composition
  failure — type names only, never messages, since networking callbacks may carry a token.

## Pre-existing bugs found by running on hardware

Both predate this branch (`git log -L` attributes them to PRs 7 and 11), and both were
invisible to 41 passing editor tests because those construct components directly and
never exercise `NativeBootstrap`'s real composition order against a deactivated rig.

- `GuidePlatformFeature` looked up capture and ghost without `includeInactive`, got null,
  threw, and left the entire rig deactivated. **The app had never started on a headset.**
- `NativeStorageFeature` had the same defect silently: its capture reference was null and
  the `RecordingCompleted` subscription was skipped behind an `if (Capture != null)`
  guard, so captures would have appeared to work while nothing was saved.

## Remaining work, roughly in order

1. Fix issue 1. Nothing else can be demonstrated until the headset renders.
2. Settle issue 2 with one label before touching all three panels.
3. Wire `RecordingDirector`/`TakeLedger` into `CaptureReplaySession`, then assign the
   shell's `SavePositionSet` / `SetSavePosition` / `ChangeSavePosition` / `DiscardTake`
   hooks, which are intentionally unassigned so Create truthfully blocks recording.
4. Add a PlayMode test that drives `NativeBootstrap`'s real composition order. Both
   pre-existing bugs above would have been caught by it.
5. Add a two-hand PlayMode test. The core of U4 is natively untested.
6. Implement `ICoachTransport` / `ICoachMicrophone`. `com.unity.webrtc 3.0.0` is pinned
   and `libwebrtc.so` already ships in the APK, so this is buildable now. Note
   `android.permission.RECORD_AUDIO` is correctly absent until a real
   `UnityEngine.Microphone` user exists.
7. Tolerance tuning on hardware. Native start radius is 7 cm and target tolerance 5 cm,
   against 12 cm and 10 cm that felt usable in the browser reference. These are code
   defaults, not measurements, and are the likely source of the "abnormally precise"
   feeling. Tune on device; never widen silently to pass a demo.
8. Unmodelled flow steps from the proven browser flow: starting-layout description,
   origin/direction with placement preview, in-headset approve and save, "watch again",
   and a "move panel" control.

## Sponsor tracks

`docs/plan.md:1100-1111` already scopes both, with requirements worth reading before
starting. Sentry needs **two products beyond error monitoring** (the plan picks Tracing
and Logs) and *"one concrete defect found or improved using those tools"* — installing an
SDK is explicitly insufficient. Keep capture data and transcripts out of telemetry.
Huawei OMNI Live needs raw speech, a recent Quest camera image and tutorial context
contributing to **one** interaction, plus the actual model id, endpoint, schema and
credits from the sponsor; AR rendering is not model vision. `.env.example` already
carries `OMNI_*` and `SENTRY_*` placeholders.
