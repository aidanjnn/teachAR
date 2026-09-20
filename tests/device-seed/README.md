# Seed a headset's private tutorial cache

Builds a ready tutorial directory using the **actual** `PrivateTutorialCache` and
contract validation, so the headset accepts it without a server, without pairing and
without any network access at all.

```sh
dotnet run --project tests/device-seed/Seed.csproj -- <staging-dir> [tutorial-guid]
adb push <staging-dir>/trail-cache \
  /sdcard/Android/data/com.trail.guide/files/trail-cache
```

The seeded guide is built from `fixtures/contracts/`, whose recording carries
`source: "synthetic-fixture"`. The headset labels this expert motion as a synthetic
diagnostic. The learner source is selected independently from the bound hand provider:
native hands on Quest, synthetic input in Editor. **It is not a human demonstration and
teaches no physical task.** Use it to exercise navigation, calibration, ghost rendering
and learner progression, never as evidence that authoring or physical transfer works.
