# Post-#19 Quest integration checkpoint

Base: `bdfb757`, isolated worktree branch `codex/recording-integration`.
This is an implementation checkpoint, **not a usable-Quest or learner acceptance signoff**.
PR #19 through `de74ae7` is merged into this branch; physical rendering remains unverified.

## Latest software checkpoint

`3e11b8e` is pushed to `codex/recording-integration`, including the merged PR #19
follow-up. Automated evidence: 389 tests/33 files, strict typechecks and production
builds, 175 C# contract checks, synthetic native narration/export round trips,
72/72 Unity EditMode, 26/26 PlayMode and 8/8 Chromium workflows. Android SDK
compilation plus 30 synthetic audio lifecycle checks cover the new capture bridge.

Release APK: `artifacts/quest/build-385a862a-a262-4c2b-b23d-ec5b9bcd0d2e/Trail.apk`;
69,723,468 bytes; Unity 6000.3.24f1, ARM64/IL2CPP.
SHA-256: `d1fcfafe8e994ff56888e1a7d30ea31b3b90440ac3c0b27bf8f89c9a3dbe501f`.
The APK contains the Java audio bridge and ARM64 WebRTC library. A matching local
APK/source/runbook package is in `artifacts/demo/3e11b8e`; no real tutorial or
backup video is represented as available. Hosted CI does not trigger on this
non-main branch push; the checks above ran locally.

Headset acceptance remains open. The procedural hand presentation is still a
fallback; an authored hand asset/rig, headset layout-view presentation and MRUK
feasibility evaluation remain follow-up scope alongside the physical trials.

## Published checkpoint

`528f1b0` is pushed to `codex/recording-integration`. The following evidence first
covered that checkpoint; follow-through results are recorded below.

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
| Narrated authoring | Implemented WAV capture/trimming/upload, transcript-to-motion authoring and reviewed endpoint/start images need fresh narrated device evidence. Synthetic proof uses disclosed mock/manual labels. |
| Native conversation | Actual provider/Quest speech, interruption, acoustic echo handling and simultaneous hands/XR. Android session-bound AEC is implemented; device capability and effectiveness remain unverified. |
| Camera-to-speech | Real correct/wrong/obscured/adjusted Quest scenes and heard responses. Commands use explicit English phrases; repeated checks restore prior listening intent. |
| Spatial guidance | Independent cross-room calibration with held-out error, both-hand legibility, slow following, tracking recovery and asset/presentation work. |
| Spectator | Verified action/ghost view, casting/audio and reconnect trials. |
| Acceptance/package | Two task families, three consecutive runs, a non-builder completion, reproducible tested APK/server/tutorial, runbook and backup video. |

The next physical milestone remains one fresh recording, desktop-reviewed tutorial,
and an independent learner completing one step on a visibly working Quest. Synthetic
exports and injected media tests do not satisfy that milestone.

## Follow-through after publication

- Native PCM16 WAV narration now follows active take time, excludes pauses and
  endpoint-return trims, persists atomically with each take, joins takes with the
  same motion offsets and uploads before motion finalization. Clock drift beyond
  100 ms or missing microphone history refuses the pending take; device timing
  and acoustic behavior still need measurement.
- The server validates actual WAV headers/samples/duration and durable hashes,
  transcribes finalized audio, labels the actual compiled segments, validates
  narration citations and applies labels to a draft. Provider failure retains a
  manual-review draft. Desktop review plays audio and shows per-step transcript;
  mock fixture transcripts are explicitly disclosed.
- Opt-in endpoint photos retain only candidates aligned to an admitted kept
  motion frame. Candidates persist privately and upload against the exact exported
  recording/frame map. Desktop preview and explicit approval connect them to a
  reviewed step. The camera timing sidecar says delivery-aligned-unverified.
- Repeated spoken placement checks restore prior listening intent and replace
  stale peers, while respecting Mute, End, focus loss and backend invalidation.
- Spectator now supports an operator-selected cast beside progress, including
  stopped-stream detection and reconnect controls. Browser synthetic-stream tests
  do not prove actual Quest casting or audio.
- PR #19 advanced to `de74ae7`; its duration-limit, trim-tail and lifecycle fixes
  were merged in `1d844a5` and passed native tests and an ARM64 build.

- Starting-layout capture now requests one frame at the first kept action sample,
  rejects late/moving/trimmed candidates, and persists it separately from endpoint
  photos. Desktop approval binds the image/notes to the tutorial revision; learner
  setup reloads approved ready layouts. C#/TypeScript contracts cover the sidecar.
- Android voice now uses a real AudioRecord session and attaches Android AEC,
  reporting unavailable/failed effects and requiring headphones in that case.
  A shared microphone lease prevents concurrent narration/coaching ownership.
- World-space TextMesh controls use an owned URP font-atlas material with stereo
  support and dynamic atlas updates; actual headset readability is unverified.
- A ready-tutorial export tool validates and packages only the selected recording,
  narration, reviewed images and tutorial, excluding pairings and credentials.

The user confirmed no Quest is available. Physical usability, camera clock accuracy,
acoustic echo/interruption behavior and learner acceptance remain unverified.
See `end-to-end-runbook.md` for the complete physical acceptance sequence.
