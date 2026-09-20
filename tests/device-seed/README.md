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
`source: "synthetic-fixture"`. The runtime therefore preloads it as a synthetic
diagnostic and labels it as such in the headset. **It is not a human demonstration and
teaches no physical task.** Use it to exercise navigation, calibration, ghost rendering
and learner progression, never as evidence that authoring or physical transfer works.
