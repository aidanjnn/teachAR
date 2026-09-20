# Capture and calibration domain fixtures

Run `dotnet run --project tests/native-capture/NativeCapture.csproj` with .NET 8.
The project compiles the actual Unity-independent Contracts and Motion sources;
it does not substitute a second TypeScript implementation. No NuGet packages.
The same assertions are called by Unity EditMode tests. Outputs stay ignored.

Covers known basis results, rotated-room rigid transfer, position/orientation
round trips, mirrored/degenerate/scaled/held-out failures, stable median holds,
tracking gaps and duplicate samples, capture bounds/origin revisions, explicit
missing samples, immutable replay input, actual timestamp interpolation and no
bridging/extrapolation across gaps. `CaptureRuntime` Unity tests additionally
exercise lifecycle subscriptions, calibration/capture/replay invalidation and
SDK enum mapping. Those require Unity and do not run in this console harness.

`RecordingFixtureAssertions` covers the authoring lifecycle (handoff U2/U3)
against the same real sources: the tutorial save position set once behind an
explicit request and a countdown, reused by every take and never recaptured by
re-record/pause/review; missing tracking, stalls, drift, replayed callbacks and
foreign sources unable to establish one; explicit change/cancel and new-tutorial
clearing; deliberate endpoint-hold to return-to-save detection with the return
gesture trimmed off; motion, markers and narration trimmed on one half-open
boundary; dwell cleared by pause, tracking loss, clock discontinuity and origin
revision changes; paused wall time excluded from both the take clock and the
saved timeline; a discarded replacement leaving the previous take intact; and
explicit Stop for tasks that naturally end at the save position. These are pure
domain assertions. They prove no Unity compilation, tracking quality, gesture
ergonomics or physical result; the ported thresholds still need headset tuning.

`dotnet build tests/native-capture/UnityCompile.csproj -p:UnityManagedDir=... -p:XRHandsAssembly=...`
checks the actual runtime/adapter/presentation source against real Unity and
XR Hands assemblies. Set the engine directory to the installed editor's
`Contents/Resources/Scripting/Managed/UnityEngine`. Use its resolved XR Hands
assembly, or compile the official XR Hands 1.7.2 and Core Utils 2.2.0 runtime
sources with the real editor/template Collections, Mathematics, Burst and Input
System DLLs. The latter was used during delivery with OpenXR package-conditional
provider code excluded: all consumed hand API types are real SDK source, no
stubs. This checks C# API compatibility only, not the full Unity asmdef/import,
OpenXR provider, shader, prefab, license or IL2CPP pipeline. Third-party binaries
and downloaded source are not committed.

`node tests/native-capture/run-unity.mjs` and the same command with `--play-mode`
run actual Unity tests in generated isolated projects under ignored artifacts.
The runner copies and SHA256-records the production Contracts/Motion/Record/XR
sources and tests. It uses the real XR Hands package and editor; no SDK or pose
success stubs are substituted. The lifecycle test explicitly injects a synthetic
hand source. This avoids importing unrelated Meta sample media while exercising
source behavior. Full project import, shader/prefab validation, platform rig and
Android/IL2CPP remain separate gates. The runner records a nonempty passing XML
result or fails; source hashes accompany each result.

## Native export through desktop review

With Node 22, pnpm dependencies/shared builds and .NET 8 available, run:

```sh
pnpm build:shared
pnpm exec tsx tests/native-capture/export-roundtrip.ts
```

This runs the actual C# ledger to export three synthetic actions with stable start
and end holds. It sends that portable recording through the real authenticated
byte-upload, compile, review and finalize routes, then verifies repository restart.
It removes its temporary files. The explicit review labels are synthetic/manual;
this does not test narrated authoring, a model provider, Quest capture or a learner.
