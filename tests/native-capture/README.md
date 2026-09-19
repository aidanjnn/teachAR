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
