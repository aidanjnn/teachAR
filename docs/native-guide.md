# Local guide progression

TRAIL-06/07 software runs in pure C# `Trail.Motion` and the native `Trail.Guide`
assembly. Unity is the sole learner progression authority. Desktop/server consumers
receive read-only `GuideEvent` telemetry; they cannot drive this reducer.
Snapshots publish on phase/revision changes and at a 100 ms heartbeat.

`GuidePlatformFeature` registers after the capture feature (order 20 after 10).
It binds `CaptureReplaySession.WorkspaceObserved`, calibration/invalidation events,
and the separate `GhostPresentation`. `GuideController.Preload` accepts a ready
canonical tutorial, canonical recording, independently verified recording hash,
paired session ID, and an explicit synthetic diagnostic flag (false by default).
It copies and validates the tutorial/recording and requires fresh independent
learner calibration. The open, loaded flow has no backend dependency. The storage
workstream owns verified download/cache and telemetry transport. A cold offline
launch is not demonstrated by this implementation.

The flow is preload → calibrate → show expert segment → start gate → ordered gates
→ checkpoint dwell → next segment/complete. Runtime demonstration playback uses
original recording timestamps and missing-hand gaps. The ghost's local path
projection/search and two-sample visual lookahead never supply completion evidence.
One active ghost is displayed, while both hands are required for a two-hand step.

Start requires 200 ms by default (or the reviewed tutorial's value). Overlapping
start/end regions require the visible local Start control. Each active hand earns
its own reviewed gates in order. All active hands must match the endpoint together;
inactive-hand loss is irrelevant. Orientation is optional. Pinch/open tutorials
fail native preload with a clear error until a tested gesture adapter exists.
The software does not silently ignore those constraints.

Only increasing observation timestamps/sequences from the calibrated source and
origin revision earn time. Frame credit is capped at 50 ms; stalls over 100 ms,
invalid active hands, clock reversal and wrist jumps over 0.5 m clear partial
start/gate/end dwell. Tracking reacquisition needs 200 ms of fresh consecutive
samples. Completed gates survive hand loss; partial gate/end evidence does not.
Thresholds remain initial software values requiring headset tuning.

Pause clears evidence and increments step revision. Resume reacquires tracking.
Focus/suspension, origin changes and moved-mat invalidation require calibration
and a new attempt. Repeat creates a new attempt/revision and shows the same step.
Completion effects are emitted once per run/step/attempt, with the completed step's
identity captured before advancing. Automatic evidence says **Movement checkpoint
reached.** It does not verify grasp, attachment, hidden properties or full trajectory.
Explicit user-confirmed steps never auto-complete and retain their distinct visible
mode/evidence. Confirmation requires Guiding or Holding after active-hand tracking
has been reacquired; it cannot bypass tracking loss, pause, calibration or the
initial start gate.

`RebindTelemetrySession(pairedSessionId)` publishes the complete current snapshot
after re-pairing. The same server session keeps its increasing event sequence;
a new server session starts a new envelope sequence. Run/step/attempt, calibration,
progress and run-relative time are preserved. The transport owns cancellation of
old-session requests; it never needs to reload or reset the guide to reconnect.

World-space fingertip controls expose Start, Repeat, Pause, Resume and I completed
this step. Activation requires 600 ms of fresh fingertip contact with the dot, then
withdrawal. Public controller methods permit a future platform interaction binding.
Their size, placement and usability are unverified on the headset. Guide controls
queue actions to the next Update; effect callbacks must not reenter the session.
Capture recording pauses learner progression.

`PauseForInspection()` is the synchronous main-thread exception to queued UI
controls: it pauses, clears dwell and returns/publishes the exact shared `GuideEvent`
snapshot after committing the paused state. Inspection can send this acknowledgment
and use `GuideTelemetry.Context(Session)`. Calling it during preload/calibration or
a completed run fails. Resume/repeat/advance/recalibration revise the context. No
visual assessment API can complete or resume this guide. Voice is owned separately.

Run software checks from the repository root:

```sh
dotnet run --project tests/guide-harness/GuideHarness.csproj
pnpm check
pnpm validate:fixtures
E2E_PORT=3105 pnpm test:e2e
pnpm quest:test
pnpm quest:test:play
pnpm quest:build
```

The dependency-free .NET harness compiles contracts, domain and runtime adapters
as separate assemblies, executes 24 synthetic adversarial scenarios and one bound
shared recording/tutorial → rotated calibration → projection → guide → strict
telemetry integration. A golden phase trace is stored in
`fixtures/guide/expected-integration-phases.txt`; a synthetic multi-step diagnostic
prints the entire transition/effect order. Unity EditMode reuses the core scenario
source, and an injected native lifecycle test exercises the real controller/capture
event path including inspection pause and reset. These checks do not establish Unity/SDK import, Android/IL2CPP behavior,
real hands, physical LEGO transfer or human completion. Final software evidence on 2026-09-19: Unity 6000.3.24f1 compiled the actual
project and passed 13/13 EditMode and 5/5 PlayMode tests. PlayMode covers the real
controller/capture event wiring, pause acknowledgment, same/new server-session
re-pairing, completion, Repeat and invalidation using explicitly synthetic data.
The final C# source is commit `1ed9659`; later dependency merges/documentation
preserve those guide sources. Full workspace validation passed 157 tests and
production builds; isolated Chromium regression passed all three scenarios.

The parent assigned the combined Android ARM64/IL2CPP build to the integration
workstream after all feature revisions land. This PR makes no standalone APK,
provider, Quest tracking, physical LEGO transfer or human acceptance claim.
Headset control placement/readability and actual simultaneous device behavior
still need validation. Native test XML/logs remain in ignored `artifacts/quest`;
editor-generated platform settings were archived there rather than committed
outside their owner's branch.
