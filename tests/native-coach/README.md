# Native coach diagnostic

Run from the repository root with a .NET 8 SDK:

```sh
dotnet run --project tests/native-coach/CoachHarness.csproj
dotnet run --project tests/native-coach/AdapterHarness.csproj
```

This compiles the **actual C#** pure coach session layer from
`apps/quest/Assets/Trail/Runtime/Coach/` and runs the real reducer, wire encoder and strict
parser. `CoachPure.csproj` deliberately references nothing -- no Unity, Meta, `Trail.Contracts`
or `Trail.Motion` -- so a successful build is itself the purity proof. Outputs go to the
ignored `artifacts/native-coach` directory.

## What this proves

Deterministic software behaviour of the coach state machine and its wire boundary: microphone
acquire/release ordering on every exit path, step/attempt/revision staleness rules, the closed
effect vocabulary, and strict rejection of malformed or oversized coach payloads.

## What this does not prove

Nothing about Unity compilation, an APK, microphone permission, a real WebRTC peer connection,
a GPT Live session, audio quality, or a headset. `NativeVoiceCoach.cs` is a `MonoBehaviour`
and is compiled separately by `AdapterHarness` against the actual pure guide and coach
sources, with small engine/HTTP/audio boundary stubs. Its regression cases reject queued
old-step replies, clear displayed answers on Repeat/Prepare, and safely handle synchronous
pairing expiry during connect and context synchronization. These stubs do not validate Unity
lifecycle delivery or native audio. `ICoachTransport` has no production implementation here.
