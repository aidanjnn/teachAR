# Quest black screen diagnosis — PR #19

Date: 2026-09-19 (America/Toronto). Reviewed Hamza Ammar's
[PR #19](https://github.com/aidanjnn/trail/pull/19) at
`bdfb757e9062d3170597d018a32c0762378babb5`, including its
[device handoff](native-mvp-handoff.md), startup composition, rendering settings,
and the installed matching Meta XR 205.0.0 / URP 17.3.0 / OpenXR 1.18.0 sources.
The user confirms one small red dot is visible and everything else is black.

## Diagnosis

**The shell's attempt to hide the pairing panel disables the entire application
root. This is a confirmed code defect and a sufficient cause of absent Trail
camera output. It is the first correction to make before changing passthrough or
render-pipeline settings.**

The shutdown was reproduced with the locally installed Unity **6000.3.24f1 CLI**,
compiling and invoking the PR's unmodified `NativePairingPanel` and
`TutorialExperienceController` classes. At that initial diagnosis stage ADB
returned no connected devices. The subsequent repair and device work below are
separate evidence from that original editor reproduction.

## Exact failure path

1. [NativeBootstrap.cs](../apps/quest/Assets/Trail/Runtime/Platform/NativeBootstrap.cs)
   lines 24–26 create the rig under the application root and temporarily deactivate
   the rig while composing features. Line 42 attaches `NativePairingPanel` to the
   **application root**, not to the visible pairing canvas.
2. [TutorialExperienceController.cs](../apps/quest/Assets/Trail/Runtime/Shell/TutorialExperienceController.cs)
   line 59 discovers every `IDiagnosticPanel`, including that root-attached
   component. Line 75 calls `ApplyDiagnostics()` during initialization.
3. [ShellModel.cs](../apps/quest/Assets/Trail/Runtime/Shell/ShellModel.cs)
   lines 78–88 create the shell state with `DiagnosticsVisible == false`.
4. The controller's lines 210–214 call `SetPanelVisible(false)` on the pairing
   component. [NativePairingPanel.cs](../apps/quest/Assets/Trail/Runtime/Network/NativePairingPanel.cs)
   line 16 implements this as:

   ```csharp
   public void SetPanelVisible(bool visible) => gameObject.SetActive(visible);
   ```

   Here `gameObject` is the application root. The intended target is the canvas
   stored in the separate `panel` field, created at lines 40–46.
5. Activating the child rig at bootstrap line 52 cannot reactivate its parent.
   The rig can report `activeSelf == true` while `activeInHierarchy == false`.
   The camera, shell, and runtime components remain inactive.

Unity explicitly documents that activating a child does not overcome an inactive
parent, that deactivation disables components and updates, and that hierarchy
changes invoke enable/disable callbacks.
[Unity `GameObject.SetActive`](https://docs.unity3d.com/6000.3/Documentation/ScriptReference/GameObject.SetActive.html).

This explains why the application can remain Android's focused activity yet have
no active Unity camera. Focus belongs to the app/XR session; it does not establish
that the scene hierarchy is active. The shutdown also requires no exception, so
the absence of `E Unity` errors does not exonerate this path.

The setter was introduced in `1bce08d` inside this PR. Other diagnostic panel
components live on dedicated presentation objects; copying their setter into the
root-attached pairing component changed its effect materially.

## Unity CLI reproduction

The isolated checkout is `codex/quest-black-screen-diagnosis`, based on the exact
PR head. The existing open project was not edited. A temporary editor probe used
the actual shipped classes with a plain root → rig → tracking-space → camera
hierarchy. The rig began inactive, matching bootstrap composition. The probe then
initialized pairing, initialized the shell, and attempted final rig activation.

| Observation | Result |
| --- | --- |
| Default diagnostics visibility | false |
| Root active before shell initialization | true |
| Root active after shell initialization | **false** |
| Rig local state after final activation | true |
| Rig active in hierarchy after final activation | **false** |
| Camera active and enabled | **false** |
| Pairing canvas local active state | true — the wrong object was hidden |
| Control: shell initialization without a pairing component | root remains active |
| Control: restore root, hide only pairing canvas | root and camera remain active |

Unity exited **0**, meaning all diagnostic expectations above were observed.
The probe intentionally checks reproduction of the bug; this is not a passing
product regression test. No `error CS` compiler diagnostics were found.

Local evidence, excluded from Git:

- [Probe output](../artifacts/black-screen-diagnosis/probe.json)
- [Unity log](../artifacts/black-screen-diagnosis/unity-probe.log)
- [Probe source](../artifacts/black-screen-diagnosis/probe-source/BlackScreenProbe.cs)
- [Probe assembly definition](../artifacts/black-screen-diagnosis/probe-source/Trail.BlackScreenProbe.asmdef)

The executable was
`/Applications/Unity/Hub/Editor/6000.3.24f1/Unity.app/Contents/MacOS/Unity`, invoked
with `-batchmode -nographics -buildTarget Android -executeMethod BlackScreenProbe.Run`
against this checkout's `apps/quest`. `TRAIL_DIAGNOSIS_OUTPUT` selected the JSON
output path. The temporary probe assembly was moved out of `Assets` after running;
production source was unchanged during that diagnostic run. To repeat against the
original PR head, copy the archived probe directory
into `Assets/Trail/Editor/BlackScreenProbe` and invoke the same method.

This probe proves Unity hierarchy and real component-composition behavior. It
does not run the Android compositor, create a live OpenXR session, reproduce the
red dot, or measure native passthrough layer submission.

## Reassessment of the handoff's hypotheses

| Hypothesis | Evidence and priority |
| --- | --- |
| Hidden diagnostics disable the app | Confirmed by actual Unity execution; highest priority. Explains loss of both virtual content and camera activity. |
| Setting passthrough before `Awake` loses the setting | Unsupported by the matching SDK source. `isInsightPassthroughEnabled` is a normal field; initialization reads it and `Update` retries initialization. `OVRPassthroughLayer` resynchronizes overlay readiness each frame. An inactive parent prevents those frames altogether. |
| Missing passthrough OpenXR feature | Not supported by the serialized setup. Android MetaXRFeature is enabled; the matching SDK requests `XR_FB_passthrough`. The separate Unity AR Foundation camera provider is not the API used by this app. |
| Opaque eye buffer hides an underlay | A legitimate fallback investigation if the camera and layer remain active after the root fix. Current cameras use solid transparent black, as Meta documents. HDR is off and post-processing is not enabled; URP's disabled post-process alpha-output option alone does not establish opaque output. |
| Legacy foveation conflicts with RenderGraph | Does not match this configuration: Android `m_foveatedRenderingApi: 1` maps to `SRPFoveation` in OpenXR 1.18. |
| Built-in text shader causes the red dot | No supported shader defect found. Unity 6000.3.24f1's exact `DefaultResources/Font.shader` writes glyph alpha, has no RGB-only color mask, and explicitly supports stereo instancing/multiview. This does not prove APK text visibility, but it rules out the proposed missing-alpha/stereo source defects. |

Meta's prescribed eye-camera configuration is solid black with alpha zero.
[Meta passthrough tutorial](https://developers.meta.com/horizon/documentation/unity/unity-passthrough-tutorial/).
Underlay transparency and shader alpha do matter, but they address composition of
an active layer, not an inactive scene hierarchy.
[Meta troubleshooting](https://developers.meta.com/horizon/documentation/unity/unity-pt-troubleshooting/).
The font check used the
[official Unity 6000.3.24f1 built-in shader archive](https://download.unity3d.com/download_unity/4e7b9b5b6244/builtin_shaders-6000.3.24f1.zip),
not a shader from an older Unity release. No speculative shader change was made.

## What the existing device log does and does not establish

The handoff reports passthrough resume, opacity one, subsequent pause and zero
layers while the activity remains focused. That suggests lost layer submission
rather than a missing capability alone, but the excerpt is insufficient to assign
the precise native pause to this defect.

In this PR's exact startup order, the root is disabled **before the rig's first
activation**. Therefore the diagnosed startup path does not itself establish the
origin of an already-resumed layer later pausing. The excerpt needs timestamps,
PID/layer attribution and a matching APK/commit to reconcile that ordering.

The SDK does tear down an already-active passthrough auxiliary overlay when its
component is disabled, removing render callbacks and queuing native layer
destruction. That is consistent with disappearance following deactivation, but
the literal `xrPassthroughLayerPauseFB` call is beyond the managed SDK source.
Do not claim the abbreviated log proves that exact call chain.

The red dot remains unidentified. It is not reliable evidence that Trail's own
projection camera or text renderer is operating correctly.

## Smallest correction and decisive follow-up

1. Change `NativePairingPanel.SetPanelVisible` to operate on `panel.gameObject`.
   Reset pending hover/dwell/input on hide, and prevent its `Update` handler from
   processing input while the canvas is hidden. Keep the application root active.
   There is no evidence requiring a rig/prefab rewrite for this defect.
2. Add a composition regression test using the actual pairing and shell classes:
   initialization with hidden diagnostics must leave root, rig and camera active
   while the pairing canvas is hidden. Verify hide/show and pending-input reset.
   Existing tests exercise pairing input and pure shell flags independently, so
   they miss the interaction that disables the parent.
3. Run applicable native tests and build a fresh source-attributed APK. On device,
   record root/rig `activeSelf` and `activeInHierarchy`, camera
   `isActiveAndEnabled`, passthrough requested/initialized state, and timestamped
   layer events. Confirm cold launch and Settings hide/show preserve the view.
4. If the root and camera stay active but the background remains black, introduce
   a known unlit marker in front of the camera and temporarily compare passthrough
   Overlay versus Underlay. Visible Overlay with black Underlay points toward
   projection alpha/composition. If neither works, inspect live passthrough state
   and layer submission. These are diagnostic experiments, not proposed shipping
   settings. If geometry works but labels do not, isolate the text material next.

No commit, push or GitHub comment was part of the diagnosis.

## Subsequent repair

The user subsequently requested the fix. `NativePairingPanel.SetPanelVisible`
now toggles only its owned canvas and resets pending input when hidden. Its
`Update` handler ignores an inactive canvas. The application root, network
connection, camera and XR rig stay active. `NativeBootstrap` logs those three
activation states once at startup to distinguish hierarchy activation from
Android/XR focus in device logs; the message contains no session data.

The new PlayMode composition regression uses the actual shell and pairing classes
with bootstrap's root ownership and inactive-rig construction order. It failed
against the original product source with `Hiding diagnostics must not deactivate
the application root; Expected: True; But was: False`. After the fix, the full
**9/9 PlayMode** and **40/40 EditMode** suites passed on Unity 6000.3.24f1.
Keyboard coverage additionally verifies that hiding clears the entered code,
hidden controls accept no gaze input, showing permits a fresh dwell, and pausing
still clears input. These checks do not simulate native passthrough rendering.

Device/build evidence from the subsequent repair is recorded separately in
`docs/validation.md` when available. Earlier statements above about no connected
headset describe the diagnosis phase only.

## Build and installation recovery

The first corrected development APK packaged successfully, but device logs showed
it executing the obsolete `Trail Setup - Device Validation Pending` scene and
a missing `Trail.Runtime.ScaffoldStatus`, despite the checked-in `Trail.unity`
containing only `NativeBootstrap`. This build reused a Library from the older
setup checkout. Inspection of that APK established the mechanism: it contained both
`assets/bin/Data/level0` (1,152 bytes, current `Trail Native Bootstrap`) and
`assets/bin/Data/data.unity3d` (7,349,381 bytes, obsolete setup root). The player
log explicitly loaded `data.unity3d`; the stale packed archive took precedence
over the current loose scene. The clean build staging directory contains the
current loose scene and no stale packed archive. Merely finding corrected code
or a correct loose scene in an APK does not prove the player executes it.

The CLI build now force-imports and explicitly opens the on-disk scene. A build
guard requires one active bootstrap, no preplaced camera/Meta rig, and no missing
scripts. It checks the loaded scene before batch builds and the processed Android
scene. Eight editor cases cover the checked-in scene, missing/duplicate/inactive
bootstrap and active/inactive preplaced cameras. A recovery build can use
`TRAIL_CLEAN_BUILD=1 TRAIL_DEVELOPMENT_BUILD=1 pnpm quest:build` to rebuild player
data. Unity documents that [scene callbacks can be skipped for cached player
data](https://docs.unity3d.com/6000.3/Documentation/ScriptReference/Build.IProcessSceneWithReport.html),
so the explicit preflight and a one-time [clean
build](https://docs.unity3d.com/6000.3/Documentation/ScriptReference/BuildOptions.CleanBuildCache.html)
are both used for this recovery.

The installed app had a different signing key. The user authorized backing up
its data and replacing it. Internal preferences and the external files were
archived locally and verified against a second device snapshot before removal.
All restored files initially matched the backup hashes. Restoring the generated
IL2CPP directory through the ADB shell also restored it under an unsuitable
owner, preventing Unity from extracting the new runtime and leaving the headset
at room passthrough with three loading dots. Only that generated `il2cpp` cache
was removed; Unity recreated it under the new app UID and startup continued.
The tutorial directories also needed traversal/write permission within the
unchanged private, app-owned parent; the new app UID does not belong to the
external-storage group. After this scoped restore repair all three tutorial file
hashes still matched, and `NativeStorageFeature` initialized successfully. Private backups and raw logs remain ignored local
artifacts, never repository content.

The post-build guard also inspects the APK ZIP directory before writing a success
report. It rejects simultaneous packed and loose startup data, or missing/empty
startup data. Seven ZIP fixture cases exercise the accepted and rejected layouts.
The final full editor suite passes **55/55**, with the unchanged runtime's
**9/9 PlayMode** results retained.

On the Quest 3S, the corrected app then reported root, rig and camera active,
resumed passthrough, and the user confirmed **the room and Trail menu are
visible**. The original black-view regression is therefore repaired on this
headset. [Device and artifact evidence](validation.md) records the exact APK,
source patch, timings, backup recovery and remaining acceptance boundaries.
