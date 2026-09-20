# Post-#19 Quest integration checkpoint

Base: `bdfb757`, isolated worktree branch `codex/recording-integration`.
This is an implementation checkpoint, **not a usable-Quest or learner acceptance signoff**.
PR #19's rendering/bootstrap work remains a dependency.

## Implemented here

- Capture now executes `RecordingDirector`/`TakeLedger`. The shell exposes stable
  save-position setup/change/cancel, record, pause/resume, replacement and discard.
  Countdown and paused time are excluded; automatic endpoint-return completion
  trims the return gesture. Explicit Stop preserves the whole take for review.
- Committed actions and versioned save-position/trim metadata save atomically,
  restore after restart and retain prior takes when a replacement is discarded.
  Restoring never restores calibration. Legacy motion files still import.
- Submission exports every saved action with explicit step markers, validating
  aggregate frame/duration limits. Desktop review and publication remain required.
- Native microphone and pinned Unity WebRTC adapters mount through a platform
  feature. Start, Mute/Unmute, End and captions are present; listening stays active
  after Start. Permission, connection, focus and stale-context cleanup are covered
  with injected media tests. No provider key moves to the headset.
- Explicit spoken placement requests connect fresh camera inspection to
  server-owned spoken findings. A fresh muted peer prevents an earlier generic
  answer from surviving into inspection speech. Dispatch checks pairing, request,
  run/tutorial/step/attempt, generation and freshness; guidance alone progresses.

## Validation

Automated checks below cover the implementation checkpoint on `codex/recording-integration` (before its commit; code inputs are unchanged):

- `pnpm check`: 373 tests in 32 files, typechecks, builds and native scaffold check.
- Pinned Unity 6000.3.24f1: EditMode 53/53; PlayMode 17/17.
- Synthetic C# export → authenticated byte upload → three-step draft → explicit
  review → ready tutorial → repository restart passes via
  `pnpm exec tsx tests/native-capture/export-roundtrip.ts`.
- Shared strict C#/Zod fixtures exercise authoring versions, trim intervals,
  save-position bounds and legacy compatibility.
- Android release ARM64/IL2CPP APK built successfully (69,647,210 bytes), including
  `RECORD_AUDIO`, hand-tracking and headset-camera permissions. Build:
  `artifacts/quest/build-16574c00-03a1-44b3-8e10-76be0594ac00/Trail.apk`.
- Final Chromium workflows: 7/7 passed using `pnpm exec playwright test --workers=1`
  after Unity exited. Static scaffold: 173 GUIDs. Patch whitespace check passes.
- Pure C# checks: 163 contracts, 225 shell checks and 36 presentation checks,
  plus capture/take lifecycle and native-to-server export checks.
- APK SHA-256: `baef222a1eb84ce6468c8de03e5c10b0f7d6ad5eba53b9c8334ed72c3574bc55`.

An initial integrated voice test exposed a test-clock reset defect, which was
fixed; final counts above are passing runs. The first combined browser run stalled
on fake microphone acquisition while Unity was running. The isolated three-test
voice rerun passed after Unity stopped. Final browser testing is sequenced after
native tooling; no production check was weakened.

## Still required

| Deliverable | Remaining work/evidence |
| --- | --- |
| Usable Quest | PR #19 rendering/passthrough, readable controls, connection and real bootstrap/device regression. This APK has not been installed by this task. |
| Recording | Fresh expert capture, real return trimming, pause/replacement trials and UI placement on the headset. Confirm stable start/end holds needed by compilation. |
| Narrated authoring | Native synchronized WAV capture, piecewise audio clock mapping, actual byte trimming/upload, transcript-to-motion labels, reviewed expert/start-layout images. Labels in the integration proof are manual/fallback. Local authoring metadata is not yet uploaded to the server. |
| Native conversation | Actual provider/Quest speech, interruption, acoustic echo handling and simultaneous hands/XR. Unity's custom AudioSource microphone path does not establish platform AEC. |
| Camera-to-speech | Real correct/wrong/obscured/adjusted Quest scenes and heard responses. Commands currently use explicit English phrases; adjusted checks require Resume/Cancel, Start voice, then another placement command. |
| Spatial guidance | Independent cross-room calibration with held-out error, both-hand legibility, slow following, tracking recovery and asset/presentation work. |
| Spectator | Verified action/ghost view, casting/audio and reconnect trials. |
| Acceptance/package | Two task families, three consecutive runs, a non-builder completion, reproducible tested APK/server/tutorial, runbook and backup video. |

The next physical milestone remains one fresh recording, desktop-reviewed tutorial,
and an independent learner completing one step on a visibly working Quest. Synthetic
exports and injected media tests do not satisfy that milestone.
