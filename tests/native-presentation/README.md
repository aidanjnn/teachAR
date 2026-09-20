# Native presentation diagnostic (ghost + guide display)

Run from the repository root with a .NET 8 SDK:

```sh
dotnet run --project tests/native-presentation/Presentation.csproj
```

## This is NOT Unity

`UnityEngineStub.cs` in this folder is a **hand-written stand-in** for `UnityEngine`
(`GameObject`, `Transform`, `LineRenderer`, `Material`, `Resources`, …). It exists so the
ghost and guide display logic can be exercised on a machine with **no Unity editor
installed**. It is not Unity and does not reproduce Unity's semantics for activation
hierarchy, `Destroy` timing, serialization, rendering, XR timing or IL2CPP AOT.

A green run here is **not** Unity compilation, **not** an EditMode or PlayMode test,
**not** an Android/ARM64/IL2CPP build and **not** headset evidence. Those gates are
separate and remain unmet by this project. See
[validation](../../.agents/references/validation.md) and [device checks](../../docs/device-check.md).

## What it compiles and drives

The **actual shipped sources**, not a second implementation:

- `apps/quest/Assets/Trail/Presentation/GhostPresentation.cs`
- `apps/quest/Assets/Trail/Runtime/Guide/GuideController.cs`
- the real `GuideSession`, `GuideTelemetry`, `GuideTutorialAdapter`, `Runtime/Record`,
  `Motion` and `Contracts` sources those two need — including the real `GuideReducer`.

It builds a two-hand tutorial from `fixtures/contracts` (adding a left-hand target derived
from the recording's own left wrist, so it still satisfies
`ContractValidation.ValidateTutorialRecording`), runs a genuine four-mark calibration
through `CaptureReplaySession`, and then steps the guide with a stub clock while
inspecting what the ghost was actually told to draw.

Only these MonoBehaviours are compiled. `GuideControlPanel`, `GuideInstaller` and the
platform features are deliberately excluded so this diagnostic does not break when
unrelated panels change.

## What passing proves

Deterministic software behavior for the presentation layer:

- a rig exists per side, and a two-hand step renders **both** hands rather than `Targets[0]`;
- each hand's tolerance zone uses **that target's reviewed `PositionToleranceM`**, drawn as
  two orthogonal circles of exactly that radius — never a fixed decorative value, never
  inflated, and nothing at all when the value is outside the contract;
- a hand without valid tracking is hidden **on its own**, with no zone, while the other
  hand keeps rendering — missing tracking reads as neutral, not as success or failure;
- `ClearGuideFrame`, suspension and teardown leave no stale visible ghost;
- cue frames are built and clamped **per required hand**, with a bounded lookahead that a
  hand the demonstration never tracked cannot turn into invented motion;
- the learner-facing phase label follows the reducer (Watch → Get ready → Your turn →
  Check result) and progression still comes only from `GuideReducer`.

## What passing does not prove

Nothing about real hand tracking, world-space placement, frame time, or whether two
translucent rigs and their zones are legible on a headset against a light or dark table.
The configured radius is a reviewed tolerance, not a measured accuracy claim, and a hand
inside its zone means **motion proximity only** — never grasp, assembly or a verified
physical result. Tune thresholds from actual headset measurement, never by widening a
tolerance to make something pass.
