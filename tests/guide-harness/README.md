# Native guide diagnostic

Run from the repository root with a .NET 8 SDK:

```sh
dotnet run --project tests/guide-harness/GuideHarness.csproj
```

This compiles the **actual C#** reducer, matcher and runtime session, and executes
synthetic observations through their full transition/effect path. It needs no
NuGet packages, browser, server, Unity editor, provider or headset. Outputs go to
ignored `artifacts/guide-harness`. The same scenario source runs as Unity EditMode
tests when the project's editor/dependencies are available.

Every run explicitly labels its source `SyntheticDiagnostic`. Passing these tests
proves deterministic software behavior, not native tracking, physical transfer,
Unity import, Android/IL2CPP compilation or usable headset controls.
