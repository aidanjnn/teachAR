# Native shell diagnostic

Run from the repository root with a .NET 8 SDK:

```sh
dotnet run --project tests/native-shell/Shell.csproj
```

This compiles the **actual C#** `ShellInteraction` and `ShellModel` sources from
`apps/quest/Assets/Trail/Runtime/Shell/` and drives them through synthetic touch
samples and route/condition combinations. It needs no NuGet packages, browser,
server, Unity editor, provider or headset. Outputs go to ignored
`artifacts/native-shell`.

Passing these checks proves deterministic software behavior for the Create/Follow
routing rules and the unified touch/hold/withdraw confirm model. It proves nothing
about native tracking, world-space layout, legibility on a headset, Unity import,
Android/IL2CPP compilation or whether a learner can actually use the panel.
`TutorialExperienceController` is a MonoBehaviour and is NOT covered here.

The guide-confirmation regression runs the actual `GuideSession`/`GuideReducer` with
a left-only user-confirmed step. Losing the right hand that armed Confirm must not
complete it; reacquiring, holding again and visibly withdrawing still works. The
shell also cancels invalid/nonfinite owner samples and prevents hand takeover.
