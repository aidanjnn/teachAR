# Quest Browser acceptance checklist

This is an unexecuted checklist for the WebXR foundation. Start with
[setup](../apps/webxr/README.md); software tests do not complete these items.

Record revision (and dirty worktree changes), Quest model, OS/browser versions,
server origin/port, input permissions, scenario, observed results and timings in
`docs/validation.md` when real evidence exists. Never commit personal media.

1. Start `pnpm dev`, authorize USB debugging and run `pnpm quest:open`. Confirm
   the tutor loads and real tracked hands are available in AR.
2. Create a fresh safe task with multiple steps. Place the workspace and save
   position. Record, pause/resume, finish manually and by return gesture. Inspect
   automatic trimming; approve only after review.
3. Save, exit AR, reload, replay, export/import and reopen from the library.
   Confirm narration/photo behavior separately when enabled. Storage errors
   must never appear as successful saves.
4. A learner independently places the tutorial in another location at original
   scale with the same object geometry/layout. Watch the initial demonstration without following. Verify ready waits for
   starting hands, then practice follows ordered learner movement and automatically
   previews the next step. Move off path and try stationary overlapping regions.
5. Hide an active hand, stall/focus away, pause, repeat and re-enter AR. No stale
   sample completes movement. Re-entry requires current placement. Discard late
   camera/audio results from previous attempts.
6. Disconnect optional backend/AI after loading. Continue local guidance and
   confirm unavailable assistance is explicit. This does not test cold offline launch.
7. Repeat three times, then observe a non-builder without step-by-step coaching.
   The final “Movements finished” message must leave physical results unverified;
   automatic transitions must not create learner confirmations. Record actual
   task completion separately.
8. For later coach integration, test real voice interruption and concurrent
   microphone, camera and hands. Confirm current source-labelled frames, changing
   feedback for wrong/obscured views, cancellation and stale-result rejection.
   Record live provider and latency evidence separately.

Remaining product limits: palm gates do not verify grasp/contact/finger quality,
workspace placement does not retarget differently sized objects, passthrough is
not camera access, and a successful run is not general assembly verification.
