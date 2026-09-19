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
