using System;
using System.Collections.Generic;
using System.Numerics;
using Trail.Contracts;
using Trail.Motion;

namespace Trail.Tests.EditMode
{
    // Regression spec for U2 (tutorial save position) and U3 (clean take lifecycle), ported from
    // experiments/quest-browser/tests. Pure domain assertions: no Unity, XR, device or headset evidence.
    public static class RecordingFixtureAssertions
    {
        private static readonly Vector3 HomeLeft = new Vector3(-.2f, .05f, .1f), HomeRight = new Vector3(.2f, .05f, .1f);
        private static readonly Vector3 StartLeft = new Vector3(-.2f, .05f, -.3f), StartRight = new Vector3(.2f, .05f, -.3f);
        private static readonly Vector3 EndLeft = new Vector3(-.05f, .05f, -.35f), EndRight = new Vector3(.05f, .05f, -.35f);

        private static void Check(bool condition, string label) { if (!condition) throw new Exception(label); }
        private static void Near(double actual, double expected, double tolerance, string label)
        { if (!(Math.Abs(actual - expected) <= tolerance)) throw new Exception(label + " (" + actual + " vs " + expected + ")"); }
        private static void Near(Vector3 actual, Vector3 expected, string label)
        { if (Vector3.Distance(actual, expected) > .0001f) throw new Exception(label); }
        private static void Throws(Action action, string label)
        { try { action(); } catch (ArgumentException) { return; } catch (InvalidOperationException) { return; } throw new Exception(label); }

        public static void RunAll()
        {
            PalmAndValueValidation(); SavePositionSetOnceAndReused(); SavePositionRejectsBogusEvidence();
            ExplicitChangeCancelAndNewTutorial(); EndpointHoldReturnTrimsTheReturn(); OrdinaryMotionDoesNotSave();
            NarrationTrimsOnTheSameBoundary(); DwellResetsOnPauseLossAndOrigin(); PausedTimeNeverCountsAsTakeTime();
            DiscardedReplacementKeepsPreviousTake(); ExplicitStopKeepsTheFullTake(); ResumeRequiresReturnToPausedPose();
            DurationLimitKeepsASaveableTake(); TrimPreservesTrailingMarkers();
        }

        public static void PalmAndValueValidation()
        {
            Near(HandPalm.Point(Hand(new Vector3(.3f, -.2f, .4f))).Value, new Vector3(.3f, -.2f, .4f), "palm centroid of a uniform hand");
            Check(HandPalm.Point(Hand(Vector3.Zero)).Value == Vector3.Zero, "zero is a real palm coordinate, not a missing sentinel");
            Check(HandPalm.Point(MotionSamples.Missing()) == null, "missing hand has no palm point");
            Check(HandPalm.Point(null) == null, "absent hand has no palm point");
            var partial = Hand(Vector3.Zero); partial.Joints.Remove("middle-finger-phalanx-proximal");
            Check(HandPalm.Point(partial) == null, "partial hand has no palm point");
            var weighted = Hand(Vector3.Zero);
            weighted.Joints["wrist"] = new CanonicalPose(new Vector3(0, 0, -.5f), Quaternion.Identity);
            Near(HandPalm.Point(weighted).Value, new Vector3(0, 0, -.1f), "palm averages the five named joints");
            Throws(() => new SaveZone(new Vector3(float.NaN, 0, 0), Vector3.Zero), "non-finite save position rejected");
            Throws(() => new SaveZone(new Vector3(0, 40, 0), Vector3.Zero), "out-of-workspace save position rejected");
            Check(new SaveZone(HomeLeft, HomeRight).DistanceM(HomeLeft, HomeRight + new Vector3(.3f, 0, 0)) > .29f, "the farther hand decides distance");
            Throws(() => new TakeTrim(500, 500), "empty trim rejected");
            Throws(() => new TakeTrim(-1, 100), "negative trim start rejected");
            Throws(() => new TakeTrim(0, double.PositiveInfinity), "non-finite trim rejected");
            Check(new TakeTrim(0, 100).Contains(0) && !new TakeTrim(0, 100).Contains(100), "trim ranges are half-open");
            Throws(() => RecordingState.Create(" "), "blank tutorial ID rejected");
            Throws(() => new RecordingPolicy("guessed-source"), "unknown capture source rejected");
            Throws(() => new RecordingPolicy("live", homeRadiusM: .12, awayRadiusM: .1), "home band must sit inside the away band");
            Throws(() => new RecordingPolicy("live", awayRadiusM: .2, armDistanceM: .15), "away band must sit inside the arming distance");
            var defaults = new RecordingPolicy();
            Check(defaults.SaveZoneArmMs == 3000 && defaults.TakeArmMs == 3000 && defaults.MinimumTakeMs == 1200, "ported default authoring timings");
            Throws(() => RecordingDirector.Reduce(null, RecordingState.Create("t"), new RecordingInput(RecordingAction.Tick, 0)), "policy required");
        }

        public static void SavePositionSetOnceAndReused()
        {
            var r = Ready();
            var chosen = r.State.SavePosition;
            Near(chosen.LeftM, HomeLeft, "save position stored in workspace coordinates");
            Near(chosen.RightM, HomeRight, "right save position stored in workspace coordinates");
            Check(r.State.Phase == RecordingPhase.Ready, "save position capture returns to authoring");

            // Two different actions, each returning to the same configured spot.
            RunTake(r, StartLeft, StartRight, EndLeft, EndRight);
            Check(r.State.Phase == RecordingPhase.Reviewing && r.Ledger.Takes.Count == 1, "first take saved");
            Check(chosen.SamePosition(r.State.SavePosition), "recording a take never recaptures the save position");
            r.Act(RecordingAction.ApproveTake);
            Check(chosen.SamePosition(r.State.SavePosition), "review never recaptures the save position");
            RunTake(r, StartLeft + new Vector3(.15f, 0, 0), StartRight + new Vector3(.15f, 0, 0),
                EndLeft + new Vector3(0, 0, -.1f), EndRight + new Vector3(0, 0, -.1f));
            Check(r.Ledger.Takes.Count == 2, "second take saved");
            Check(chosen.SamePosition(r.State.SavePosition), "a second take reuses the same save position");
            r.Act(RecordingAction.ApproveTake);

            // Re-record, pause and resume must not silently recapture it either.
            r.Act(RecordingAction.ReRecordTake, takeIndex: 1);
            r.Hold(StartLeft, StartRight, r.Policy.TakeArmMs + 100);
            r.Hold(StartLeft, StartRight, 400);
            r.Act(RecordingAction.Pause);
            r.Resume(StartLeft, StartRight);
            r.Hold(HomeLeft, HomeRight, 2000);
            Check(chosen.SamePosition(r.State.SavePosition), "re-record, pause, resume and resting at home never recapture it");
            Check(r.Ledger.Takes.Count == 2, "resting at home without an endpoint hold saves nothing");
            r.Act(RecordingAction.DiscardTake);
            Check(chosen.SamePosition(r.State.SavePosition), "discarding a take never recaptures it");
        }

        public static void SavePositionRejectsBogusEvidence()
        {
            // Accidental dwell cannot establish one: there is no path that does not begin with the explicit request.
            var idle = new Recorder(); idle.Act(RecordingAction.Calibrated);
            idle.Hold(HomeLeft, HomeRight, 8000);
            Check(idle.State.SavePosition == null && idle.State.Phase == RecordingPhase.Idle, "holding still without asking sets nothing");
            Check(idle.Act(RecordingAction.StartTake).State.Phase == RecordingPhase.Idle, "recording is refused without a save position");

            var arming = new Recorder(new RecordingPolicy("synthetic-fixture"));
            arming.Act(RecordingAction.Calibrated); arming.Act(RecordingAction.BeginSaveZone);
            arming.Hold(HomeLeft, HomeRight, 2800);
            Check(arming.State.SavePosition == null, "the countdown must elapse before any hold counts");
            arming.Hold(HomeLeft, HomeRight, 1200);
            Check(arming.State.SavePosition != null, "a deliberate hold after the countdown sets it once");

            var missing = Choosing();
            for (var i = 0; i < 60; i++) missing.Sample(HomeLeft, null);
            Check(missing.State.SavePosition == null, "a missing right hand cannot establish a save position");
            for (var i = 0; i < 60; i++) missing.Sample(null, HomeRight);
            Check(missing.State.SavePosition == null, "a missing left hand cannot establish a save position");
            missing.Hold(HomeLeft, HomeRight, 600); missing.Sample(HomeLeft, null); missing.Hold(HomeLeft, HomeRight, 600);
            Check(missing.State.SavePosition == null, "tracking loss restarts the hold rather than crediting the span across it");
            missing.Hold(HomeLeft, HomeRight, 400);
            Check(missing.State.SavePosition != null, "an uninterrupted hold after the loss still works");

            var drifting = Choosing();
            for (var i = 0; i < 60; i++) drifting.Sample(HomeLeft + new Vector3(.03f * i, 0, 0), HomeRight);
            Check(drifting.State.SavePosition == null, "a drifting hand never settles into a save position");

            var stalled = Choosing();
            stalled.Hold(HomeLeft, HomeRight, 600); stalled.Sample(HomeLeft, HomeRight, 400); stalled.Hold(HomeLeft, HomeRight, 600);
            Check(stalled.State.SavePosition == null, "a tracking stall restarts the hold");

            var replayed = Choosing();
            replayed.Hold(HomeLeft, HomeRight, 600);
            for (var i = 0; i < 40; i++) replayed.Repeat(HomeLeft, HomeRight);
            Check(replayed.State.SavePosition == null, "duplicate timestamps and sequences earn no hold");

            var foreign = Choosing();
            for (var i = 0; i < 60; i++) foreign.Sample(HomeLeft, HomeRight, 40, "live");
            Check(foreign.State.SavePosition == null, "observations from another source earn no hold");
        }

        public static void ExplicitChangeCancelAndNewTutorial()
        {
            var r = Ready();
            var first = r.State.SavePosition;
            r.Act(RecordingAction.BeginSaveZone);
            r.Hold(StartLeft, StartRight, 600);
            r.Act(RecordingAction.CancelSaveZone);
            Check(first.SamePosition(r.State.SavePosition) && r.State.Phase == RecordingPhase.Ready, "cancel keeps the configured save position");

            r.Act(RecordingAction.BeginSaveZone);
            r.Hold(StartLeft, StartRight, r.Policy.SaveZoneArmMs + 1200);
            Check(!first.SamePosition(r.State.SavePosition), "change save position replaces it");
            Near(r.State.SavePosition.LeftM, StartLeft, "changed save position is the newly held spot");

            RunTake(r, StartLeft, StartRight, EndLeft, EndRight);
            Check(r.Ledger.Takes.Count == 1, "a take exists before the new tutorial");
            r.Act(RecordingAction.NewTutorial, tutorialId: "tutorial-2");
            Check(r.State.SavePosition == null && r.State.TakeCount == 0 && r.State.Phase == RecordingPhase.Idle, "a new tutorial clears the save position");
            Check(r.Ledger.Takes.Count == 0 && r.Ledger.PendingFrameCount == 0, "a new tutorial does not inherit the previous tutorial's takes");
            Check(r.State.TutorialId == "tutorial-2", "the new tutorial owns the state");
            Check(r.Act(RecordingAction.BeginSaveZone).State.Phase == RecordingPhase.ChoosingSaveZone, "a new tutorial asks for one again");
        }

        public static void EndpointHoldReturnTrimsTheReturn()
        {
            var r = Ready();
            r.Act(RecordingAction.StartTake);
            r.Hold(StartLeft, StartRight, r.Policy.TakeArmMs - 120);
            Check(r.State.Phase == RecordingPhase.Arming && r.Ledger.PendingFrameCount == 0,
                "reaching for the control during the countdown is never recorded");
            var cutoff = RunRecording(r, StartLeft, StartRight, EndLeft, EndRight);
            var take = r.Ledger.Takes[0];
            Check(take.TrimReason == "endpoint-hold-return", "the deliberate gesture saved the take");
            Near(take.Trim.EndMsExclusive, cutoff, .001, "the trim boundary is the held endpoint");
            Check(take.Trim.StartMs == 0, "the arming countdown already excluded the reach for the control");
            var frames = take.Recording.Frames;
            Check(frames[frames.Length - 1].TMs < cutoff, "no frame survives at or past the half-open boundary");
            Near(HandPalm.Point(frames[frames.Length - 1].Hands.Left).Value, EndLeft, "the take ends on the demonstrated endpoint");
            Check(frames[0].TMs == 0, "the take timeline starts when recording started, not when the control was pressed");
            Check(HandPalm.Point(frames[0].Hands.Left).Value.Z < -.29f, "the take begins on the demonstrated action, not at the save position");
            var homeFrames = 0;
            foreach (var frame in frames)
            {
                var palm = HandPalm.Point(frame.Hands.Left);
                if (palm.HasValue && Vector3.Distance(palm.Value, HomeLeft) < .08f) homeFrames++;
            }
            Check(homeFrames == 0, "the return gesture is trimmed off the end");
            Check(take.Recording.DurationMs == take.Trim.EndMsExclusive - take.Trim.StartMs, "duration preserves the kept timeline between samples");
            Check(r.State.EndpointCandidateMs == null && r.State.TakeMs == 0, "committing clears the take evidence");
        }

        public static void OrdinaryMotionDoesNotSave()
        {
            // Task motion that merely passes through the save zone, with no deliberate endpoint hold.
            var passing = Ready();
            passing.Act(RecordingAction.StartTake);
            passing.Hold(StartLeft, StartRight, passing.Policy.TakeArmMs + 100);
            passing.Hold(StartLeft, StartRight, 600);
            passing.Move(StartLeft, HomeLeft, StartRight, HomeRight, 10);
            passing.Hold(HomeLeft, HomeRight, 2000);
            passing.Move(HomeLeft, EndLeft, HomeRight, EndRight, 10);
            Check(passing.Ledger.Takes.Count == 0 && passing.State.Phase == RecordingPhase.Recording,
                "passing through and resting in the save zone never saves without an endpoint hold");
            Check(passing.State.EndpointCandidateMs == null, "resting inside the save zone is not an endpoint");

            // An endpoint hold followed by a brief brush past the save zone is still not a return.
            var brushed = Ready();
            brushed.Act(RecordingAction.StartTake);
            brushed.Hold(StartLeft, StartRight, brushed.Policy.TakeArmMs + 100);
            brushed.Hold(StartLeft, StartRight, 600);
            brushed.Move(StartLeft, EndLeft, StartRight, EndRight, 10);
            brushed.Hold(EndLeft, EndRight, 1000);
            Check(brushed.State.EndpointCandidateMs != null, "the deliberate endpoint hold is recognized");
            brushed.Move(EndLeft, HomeLeft, EndRight, HomeRight, 8);
            brushed.Hold(HomeLeft, HomeRight, 400);
            brushed.Move(HomeLeft, EndLeft, HomeRight, EndRight, 8);
            Check(brushed.Ledger.Takes.Count == 0, "a brief pass through the save zone is not a return-to-save");

            // Motion that stays inside the arming distance can never arm the gesture, even when it
            // sits in the band that would otherwise qualify as a still endpoint hold.
            var local = Ready();
            local.Act(RecordingAction.StartTake);
            local.Hold(HomeLeft, HomeRight, local.Policy.TakeArmMs + 100);
            var near = HomeLeft + new Vector3(.12f, 0, 0);
            var nearRight = HomeRight + new Vector3(.12f, 0, 0);
            Check(new SaveZone(HomeLeft, HomeRight).DistanceM(near, nearRight) > local.Policy.AwayRadiusM &&
                new SaveZone(HomeLeft, HomeRight).DistanceM(near, nearRight) < local.Policy.ArmDistanceM, "fixture sits in the unarmed away band");
            local.Hold(near, nearRight, 4000);
            Check(!local.State.Armed && local.State.EndpointCandidateMs == null && local.Ledger.Takes.Count == 0,
                "holding still without ever leaving the arming distance is not an endpoint");
            local.Move(near, EndLeft, nearRight, EndRight, 10);
            local.Hold(EndLeft, EndRight, 1000);
            Check(local.State.Armed && local.State.EndpointCandidateMs != null, "leaving the arming distance arms the gesture");

            // The endpoint candidate expires, so a stale hold cannot silently trim a later return.
            var stale = Ready();
            stale.Act(RecordingAction.StartTake);
            stale.Hold(StartLeft, StartRight, stale.Policy.TakeArmMs + 100);
            stale.Hold(StartLeft, StartRight, 600);
            stale.Move(StartLeft, EndLeft, StartRight, EndRight, 10);
            stale.Hold(EndLeft, EndRight, 1000);
            Check(stale.State.EndpointCandidateMs != null, "endpoint hold recognized before the wander");
            for (var i = 0; i < 180; i++) stale.Sample(Vector3.Lerp(EndLeft, StartLeft, i % 2), Vector3.Lerp(EndRight, StartRight, i % 2));
            Check(stale.State.EndpointCandidateMs == null, "a stale endpoint hold expires instead of trimming a later return");
        }

        public static void NarrationTrimsOnTheSameBoundary()
        {
            var r = Ready();
            r.PendingNarration = new AudioAsset { AssetId = "narration-raw", MimeType = "audio/wav", DurationMs = 12000,
                AudioStartOffsetMs = 0, SyncMethod = "media-recorder-start", EstimatedSyncErrorMs = 20 };
            r.TrimmedNarrationAssetId = "narration-trimmed";
            var cutoff = RunTake(r, StartLeft, StartRight, EndLeft, EndRight);
            var take = r.Ledger.Takes[0];
            Check(take.Narration != null && take.Recording.Audio != null, "narration survives the trim");
            Check(take.Narration.AssetId == "narration-trimmed", "re-clipped narration gets its own durable asset ID");
            Near(take.Narration.AudioStartOffsetMs + take.Narration.DurationMs, take.Trim.EndMsExclusive - take.Trim.StartMs,
                .001, "narration and motion end on the same take-timeline boundary");
            Near(take.NarrationSource.SourceEndMsExclusive - take.NarrationSource.SourceStartMs, take.Narration.DurationMs,
                .001, "the source clip interval matches the trimmed narration length");
            Near(take.NarrationSource.SourceEndMsExclusive, cutoff, .001, "the narration is clipped at the motion boundary");
            Check(take.NarrationSource.ClipsSource, "the narration bytes must be re-clipped");
            Check(take.Recording.Frames[take.Recording.Frames.Length - 1].TMs < take.Narration.DurationMs,
                "motion frames stay inside the shared boundary");

            // The same boundary applied with a non-zero start, directly on the trimmer.
            var whole = SyntheticRecording(2000);
            var narration = new AudioAsset { AssetId = "whole", MimeType = "audio/wav", DurationMs = 2000, AudioStartOffsetMs = 0,
                SyncMethod = "media-recorder-start", EstimatedSyncErrorMs = null };
            var middle = TakeTrimmer.Trim(whole, new TakeTrim(500, 1500), "middle", narration, "middle-audio");
            // Rebased by the shared boundary, never snapped to zero: snapping would shift motion
            // against its narration by up to one sample period.
            Check(middle.Recording.Frames[0].TMs == 20, "trimmed motion is rebased by the boundary, not snapped");
            Check(middle.Recording.DurationMs == 1000, "trimmed motion covers the kept interval");
            Near(middle.Narration.AudioStartOffsetMs, 0, .001, "narration is rebased with the motion");
            Near(middle.Narration.DurationMs, 1000, .001, "narration covers the same kept interval");
            Near(middle.NarrationSource.SourceStartMs, 500, .001, "source clip starts at the shared boundary");
            Near(middle.NarrationSource.SourceEndMsExclusive, 1500, .001, "source clip ends at the shared boundary");
            Check(middle.Recording.Markers.Length == 1 && middle.Recording.Markers[0].TMs == 500, "markers move with the same boundary");

            // Narration that starts before motion zero, and narration wholly outside the kept range.
            var early = new AudioAsset { AssetId = "early", MimeType = "audio/wav", DurationMs = 1000, AudioStartOffsetMs = -400,
                SyncMethod = "media-recorder-start", EstimatedSyncErrorMs = null };
            var clipped = TakeTrimmer.Trim(whole, new TakeTrim(0, 1200), "early-trim", early, "early-audio");
            Near(clipped.Narration.AudioStartOffsetMs, 0, .001, "narration before motion zero is clipped, never shifted");
            Near(clipped.Narration.DurationMs, 600, .001, "only the overlapping narration is kept");
            Near(clipped.NarrationSource.SourceStartMs, 400, .001, "the source clip skips the pre-roll");
            var late = new AudioAsset { AssetId = "late", MimeType = "audio/wav", DurationMs = 300, AudioStartOffsetMs = 1600,
                SyncMethod = "manual-markers", EstimatedSyncErrorMs = null };
            var dropped = TakeTrimmer.Trim(whole, new TakeTrim(0, 1200), "late-trim", late, "late-audio");
            Check(dropped.Narration == null && dropped.Recording.Audio == null && dropped.DroppedNarrationReason != null,
                "narration outside the kept interval is dropped explicitly, not stretched");
            var untouched = TakeTrimmer.Trim(whole, null, "full", narration);
            Check(untouched.Narration.AssetId == "whole" && !untouched.NarrationSource.ClipsSource, "an untrimmed take keeps its original narration asset");
            Throws(() => TakeTrimmer.Trim(whole, new TakeTrim(500, 1500), "no-id", narration), "clipped narration without a new asset ID is refused");
            Throws(() => TakeTrimmer.Trim(whole, new TakeTrim(1980, 1999), "empty", null), "a trim that keeps no motion is refused");
        }

        public static void DwellResetsOnPauseLossAndOrigin()
        {
            var paused = Held();
            Check(paused.State.EndpointCandidateMs != null && paused.State.EndpointHoldMs > 0, "endpoint evidence accrued");
            paused.Act(RecordingAction.Pause);
            Check(paused.State.EndpointCandidateMs == null && paused.State.EndpointHoldMs == 0 && paused.State.ReturnHoldMs == 0, "pause clears endpoint dwell");
            paused.Resume(EndLeft, EndRight);
            Check(paused.State.EndpointCandidateMs == null, "resume does not restore the discarded dwell");
            paused.Move(EndLeft, HomeLeft, EndRight, HomeRight, 8); paused.Hold(HomeLeft, HomeRight, 2000);
            Check(paused.Ledger.Takes.Count == 0, "a paused endpoint hold cannot save a take on return");

            var lost = Held();
            lost.Sample(null, EndRight);
            Check(lost.State.EndpointCandidateMs == null, "tracking loss clears endpoint dwell");
            lost.Hold(EndLeft, EndRight, 400);
            lost.Move(EndLeft, HomeLeft, EndRight, HomeRight, 8); lost.Hold(HomeLeft, HomeRight, 2000);
            Check(lost.Ledger.Takes.Count == 0, "an interrupted endpoint hold cannot save a take");

            var stalled = Held();
            stalled.Sample(EndLeft, EndRight, 400);
            Check(stalled.State.Phase == RecordingPhase.Paused && stalled.State.EndpointCandidateMs == null, "a sample stall pauses and clears dwell");

            var ticked = Held();
            ticked.Advance(400); ticked.Act(RecordingAction.Tick);
            Check(ticked.State.Phase == RecordingPhase.Paused, "a tracking update gap pauses the take without callbacks");

            var moved = Held();
            moved.Revision = 7; moved.Sample(EndLeft, EndRight);
            Check(moved.State.Phase == RecordingPhase.Ready && !moved.State.Calibrated && moved.Ledger.Takes.Count == 0 &&
                moved.Ledger.PendingFrameCount == 0, "an origin revision change discards the in-progress take");
            Check(moved.State.SavePosition != null, "the workspace-relative save position survives recalibration");

            var choosing = Choosing();
            choosing.Hold(HomeLeft, HomeRight, 600);
            Check(choosing.State.SaveZoneHoldMs > 0, "save position hold accrued");
            choosing.Revision = 3; choosing.Sample(HomeLeft, HomeRight);
            Check(choosing.State.SaveZoneHoldMs == 0 && choosing.State.SavePosition == null, "an origin change clears a partial save position hold");

            // Replayed and out-of-order callbacks earn no take time and add no frames.
            var replayed = Held();
            var takeMs = replayed.State.TakeMs; var buffered = replayed.Ledger.PendingFrameCount;
            for (var i = 0; i < 10; i++) replayed.Repeat(EndLeft, EndRight);
            Check(replayed.State.TakeMs == takeMs && replayed.Ledger.PendingFrameCount == buffered,
                "replayed callbacks neither advance the take clock nor add frames");
            replayed.Stale(EndLeft, EndRight, 200);
            Check(replayed.State.TakeMs == takeMs && replayed.Ledger.PendingFrameCount == buffered,
                "an out-of-order callback never rewinds the take");

            var backwards = Held();
            backwards.NowMs -= 500; backwards.Act(RecordingAction.Tick);
            Check(backwards.State.Phase == RecordingPhase.Paused && backwards.State.EndpointCandidateMs == null, "a clock discontinuity pauses and clears dwell");
        }

        public static void PausedTimeNeverCountsAsTakeTime()
        {
            var r = Ready();
            r.Act(RecordingAction.StartTake);
            r.Hold(StartLeft, StartRight, r.Policy.TakeArmMs + 100);
            r.Hold(StartLeft, StartRight, 600);
            var beforePause = r.State.TakeMs;
            var framesBefore = r.Ledger.PendingFrameCount;
            r.Act(RecordingAction.Pause);
            r.Advance(30000);
            for (var i = 0; i < 20; i++) r.Sample(StartLeft, StartRight);
            Check(r.State.TakeMs == beforePause && r.Ledger.PendingFrameCount == framesBefore, "samples while paused neither advance the take clock nor record frames");
            r.Resume(StartLeft, StartRight);
            r.Hold(StartLeft, StartRight, 600);
            Near(r.State.TakeMs, beforePause + 560, 41, "thirty paused seconds are not part of the take");
            var frames = new List<double>();
            r.Hold(StartLeft, StartRight, 200);
            Check(r.State.TakeMs < 2000, "the take clock only counts active recording");

            // The recorded timeline itself has no paused hole, so replay cannot stall through it.
            r.Move(StartLeft, EndLeft, StartRight, EndRight, 10);
            r.Hold(EndLeft, EndRight, 1000);
            r.Move(EndLeft, HomeLeft, EndRight, HomeRight, 8);
            r.Hold(HomeLeft, HomeRight, 2000);
            Check(r.Ledger.Takes.Count == 1, "the paused take still saves on a deliberate return");
            var recorded = r.Ledger.Takes[0].Recording.Frames;
            var maxGap = 0.0; var previous = 0.0;
            foreach (var frame in recorded) { frames.Add(frame.TMs); maxGap = Math.Max(maxGap, frame.TMs - previous); previous = frame.TMs; }
            Check(maxGap <= 60, "the saved timeline contains no paused hole");

            // Hold timing measured across a pause is active time, never wall time.
            var spanning = Ready();
            spanning.Act(RecordingAction.StartTake);
            spanning.Hold(StartLeft, StartRight, spanning.Policy.TakeArmMs + 100);
            spanning.Hold(StartLeft, StartRight, 600);
            spanning.Move(StartLeft, EndLeft, StartRight, EndRight, 10);
            spanning.Hold(EndLeft, EndRight, 400);
            spanning.Act(RecordingAction.Pause); spanning.Advance(20000); spanning.Resume(EndLeft, EndRight);
            spanning.Hold(EndLeft, EndRight, 400);
            Check(spanning.State.EndpointCandidateMs == null, "twenty paused seconds never complete an endpoint hold");
            spanning.Hold(EndLeft, EndRight, 600);
            Check(spanning.State.EndpointCandidateMs != null, "the endpoint hold completes on fresh active time");
        }

        public static void DiscardedReplacementKeepsPreviousTake()
        {
            var r = Ready();
            RunTake(r, StartLeft, StartRight, EndLeft, EndRight);
            r.Act(RecordingAction.ApproveTake);
            var original = r.Ledger.Takes[0];
            var originalId = original.Recording.Id; var originalFrames = original.Recording.Frames.Length;

            r.Act(RecordingAction.ReRecordTake, takeIndex: 0);
            r.Hold(StartLeft, StartRight, r.Policy.TakeArmMs + 100);
            r.Hold(StartLeft, StartRight, 600);
            r.Move(StartLeft, EndLeft, StartRight, EndRight, 10);
            Check(r.Ledger.PendingFrameCount > 0, "the replacement take is collecting frames");
            r.Act(RecordingAction.DiscardTake);
            Check(r.Ledger.Takes.Count == 1 && ReferenceEquals(r.Ledger.Takes[0], original), "a discarded replacement leaves the previous take intact");
            Check(r.Ledger.Takes[0].Recording.Id == originalId && r.Ledger.Takes[0].Recording.Frames.Length == originalFrames, "the surviving take is unchanged");
            Check(r.Ledger.PendingFrameCount == 0 && r.State.ReplaceIndex == null, "the discarded buffer is released");

            r.Act(RecordingAction.ReRecordTake, takeIndex: 0);
            RunRecording(r, StartLeft + new Vector3(0, 0, .05f), StartRight, EndLeft, EndRight);
            Check(r.Ledger.Takes.Count == 1 && r.Ledger.Takes[0].Recording.Id != originalId, "a completed replacement rewrites only that take");
            Check(r.State.LastTakeIndex == 0, "the replacement keeps its position");

            // Abandoning an armed take before any motion also leaves saved work alone.
            r.Act(RecordingAction.ApproveTake);
            r.Act(RecordingAction.StartTake); r.Act(RecordingAction.DiscardTake);
            Check(r.Ledger.Takes.Count == 1 && r.State.Phase == RecordingPhase.Ready, "an abandoned new take leaves saved takes alone");
        }

        public static void ExplicitStopKeepsTheFullTake()
        {
            // A task that naturally ends at the save position: the deliberate gesture cannot apply.
            var r = Ready();
            r.Act(RecordingAction.StartTake);
            r.Hold(StartLeft, StartRight, r.Policy.TakeArmMs + 100);
            r.Hold(StartLeft, StartRight, 600);
            r.Move(StartLeft, HomeLeft, StartRight, HomeRight, 12);
            r.Hold(HomeLeft, HomeRight, 1000);
            Check(r.Act(RecordingAction.SaveAtEndpoint).State.Phase == RecordingPhase.Recording, "saving at an endpoint that was never held is refused");
            Check(r.Ledger.Takes.Count == 0, "the refusal saved nothing");
            var pending = r.Ledger.PendingFrameCount;
            r.Act(RecordingAction.StopFullTake);
            Check(r.Ledger.Takes.Count == 1 && r.Ledger.Takes[0].TrimReason == "explicit-stop", "explicit stop stays available");
            var take = r.Ledger.Takes[0];
            Check(take.Recording.Frames.Length == pending, "explicit stop keeps every recorded frame");
            Near(HandPalm.Point(take.Recording.Frames[take.Recording.Frames.Length - 1].Hands.Left).Value, HomeLeft, "the take ends where the task ends");

            // Stop is equally available from a paused take, and a too-short take is refused outright.
            var shortTake = Ready();
            shortTake.Act(RecordingAction.StartTake);
            shortTake.Hold(StartLeft, StartRight, shortTake.Policy.TakeArmMs + 100);
            shortTake.Hold(StartLeft, StartRight, 200);
            shortTake.Act(RecordingAction.Pause);
            shortTake.Act(RecordingAction.StopFullTake);
            Check(shortTake.Ledger.Takes.Count == 0 && shortTake.State.Phase == RecordingPhase.Paused, "a take shorter than the minimum is refused, not padded");
            shortTake.Resume(StartLeft, StartRight);
            shortTake.Hold(StartLeft, StartRight, 1400);
            shortTake.Act(RecordingAction.StopFullTake);
            Check(shortTake.Ledger.Takes.Count == 1, "stop works once enough motion exists");
        }

        public static void ResumeRequiresReturnToPausedPose()
        {
            var r = Ready();
            r.Act(RecordingAction.StartTake);
            r.Hold(StartLeft, StartRight, r.Policy.TakeArmMs + 100);
            r.Hold(StartLeft, StartRight, 600);
            r.Act(RecordingAction.Pause);
            r.Resume(StartLeft + new Vector3(.4f, 0, 0), StartRight);
            Check(r.State.Phase == RecordingPhase.Paused, "resuming from a displaced pose is refused");
            r.Resume(StartLeft, null);
            Check(r.State.Phase == RecordingPhase.Paused, "resuming without both tracked hands is refused");
            r.Resume(StartLeft + new Vector3(.05f, 0, 0), StartRight);
            Check(r.State.Phase == RecordingPhase.Recording, "resuming near the paused pose is allowed");
        }

        // ---- fixtures -------------------------------------------------------------------------

        private static Recorder Choosing()
        {
            var r = new Recorder();
            r.Act(RecordingAction.Calibrated); r.Act(RecordingAction.BeginSaveZone);
            r.Advance(r.Policy.SaveZoneArmMs + 40);
            return r;
        }
        public static void DurationLimitKeepsASaveableTake()
        {
            var r = Ready(); r.Act(RecordingAction.StartTake);
            r.Hold(StartLeft, StartRight, 123000);
            Check(r.State.Phase == RecordingPhase.Reviewing && r.Ledger.Takes.Count == 1,
                "duration limit stops admission and saves exactly one take for review");
            var saved = r.Ledger.Takes[0];
            Check(saved.TrimReason == "duration-limit" && saved.Recording.DurationMs <= 120000,
                "bounded stop has explicit provenance and valid duration");
            r.Hold(StartLeft, StartRight, 500);
            Check(r.Ledger.Takes.Count == 1, "samples after limit cannot commit twice");
            var ledger = new TakeLedger(Workspace(), "synthetic-fixture");
            Check(ledger.AppendFrame(0, Hand(StartLeft), Hand(StartRight)), "first frame accepted");
            Check(ledger.AppendFrame(120000, Hand(EndLeft), Hand(EndRight)), "maximum legal timestamp accepted");
            var full = ledger.Commit(null, null, "explicit-stop", "full-maximum");
            Check(full.Recording.DurationMs == 120000 && full.Recording.Frames.Length == 2 && full.Trim == null,
                "full save retains the final timestamp without inventing an out-of-bounds trim");
        }

        public static void TrimPreservesTrailingMarkers()
        {
            var recording = SyntheticRecording(120);
            recording.DurationMs = 100;
            recording.Markers = new[] { new StepMarker { Id = "tail", TMs = 90, Kind = "step-end", Source = "operator-control" } };
            recording = ContractJson.ParseRecording(ContractJson.SerializeRecording(recording));
            foreach (var trim in new[] { new TakeTrim(0, 100), null })
            {
                var saved = TakeTrimmer.Trim(recording, trim, "trailing-marker").Recording;
                Check(saved.DurationMs == 100 && saved.Markers.Length == 1 && saved.Markers[0].TMs == 90,
                    "retained marker between last pose and end stays within the saved duration");
            }
        }

        private static Recorder Ready()
        {
            var r = Choosing();
            r.Hold(HomeLeft, HomeRight, r.Policy.SaveZoneHoldMs + 200);
            Check(r.State.SavePosition != null, "fixture save position");
            return r;
        }
        // A take paused at a recognized endpoint hold, ready for dwell-reset assertions.
        private static Recorder Held()
        {
            var r = Ready();
            r.Act(RecordingAction.StartTake);
            r.Hold(StartLeft, StartRight, r.Policy.TakeArmMs + 100);
            r.Hold(StartLeft, StartRight, 600);
            r.Move(StartLeft, EndLeft, StartRight, EndRight, 10);
            r.Hold(EndLeft, EndRight, 1000);
            Check(r.State.EndpointCandidateMs != null, "fixture endpoint hold");
            return r;
        }
        private static double RunTake(Recorder r, Vector3 startLeft, Vector3 startRight, Vector3 endLeft, Vector3 endRight)
        {
            r.Act(RecordingAction.StartTake);
            return RunRecording(r, startLeft, startRight, endLeft, endRight);
        }
        private static double RunRecording(Recorder r, Vector3 startLeft, Vector3 startRight, Vector3 endLeft, Vector3 endRight)
        {
            r.Hold(startLeft, startRight, r.Policy.TakeArmMs + 100);
            Check(r.State.Phase == RecordingPhase.Recording, "recording begins after the countdown and fresh hands");
            r.Hold(startLeft, startRight, 600);
            r.Move(startLeft, endLeft, startRight, endRight, 10);
            r.Hold(endLeft, endRight, 1000);
            var cutoff = r.State.EndpointCandidateMs;
            Check(cutoff.HasValue, "the deliberate endpoint hold is recognized");
            var home = r.State.SavePosition;
            r.Move(endLeft, home.LeftM, endRight, home.RightM, 8);
            r.Hold(home.LeftM, home.RightM, 1400);
            Check(r.State.Phase == RecordingPhase.Reviewing, "the return to the save position saved the take");
            return cutoff.Value;
        }

        private static Recording SyntheticRecording(double durationMs)
        {
            var frames = new List<MotionFrame>();
            for (var t = 0.0; t < durationMs; t += 40)
                frames.Add(new MotionFrame { TMs = t, Hands = new HandSamples { Left = Hand(new Vector3((float)(t / 10000), 0, 0)), Right = Hand(Vector3.Zero) } });
            var names = new string[JointNames.Canonical.Count];
            for (var i = 0; i < names.Length; i++) names[i] = JointNames.Canonical[i];
            return new Recording { SchemaVersion = 1, Id = "synthetic", CoordinateFrame = "workspace", Workspace = Workspace(),
                JointOrder = names, NominalSampleHz = 30, DurationMs = frames[frames.Count - 1].TMs, Frames = frames.ToArray(),
                Markers = new[] { new StepMarker { Id = "m0", TMs = 1000, Kind = "step-start", Source = "operator-control" },
                    new StepMarker { Id = "m1", TMs = 1800, Kind = "step-end", Source = "operator-control" } },
                Audio = null, Source = "synthetic-fixture" };
        }
        private static HandSample Hand(Vector3 position)
        {
            var joints = new Dictionary<string, CanonicalPose>();
            foreach (var name in JointNames.Canonical) joints.Add(name, new CanonicalPose(position, Quaternion.Identity));
            return new HandSample { Status = "valid", Joints = joints };
        }
        private static WorkspaceDefinition Workspace() => new WorkspaceDefinition { Id = "mat", Version = 1, WidthM = .5, DepthM = .35,
            LayoutId = "test", DominantHand = "right", CalibrationMethod = "three-point-index-tip-v1",
            CalibrationMarksM = new CalibrationMarks { A = Vector3.Zero, B = new Vector3(.5f, 0, 0), C = new Vector3(0, 0, -.35f), D = new Vector3(.5f, 0, -.35f) } };

        // Drives the reducer and its take buffer exactly as a runtime adapter would: supply time and
        // fresh workspace observations, apply the returned transition. No policy lives here.
        private sealed class Recorder
        {
            public readonly RecordingPolicy Policy;
            public readonly TakeLedger Ledger;
            public RecordingState State;
            public RecordingTransition Last;
            public double NowMs;
            public long Sequence;
            public int Revision;
            public AudioAsset PendingNarration;
            public string TrimmedNarrationAssetId;
            private int commits;
            public Recorder(RecordingPolicy policy = null)
            {
                Policy = policy ?? new RecordingPolicy("synthetic-fixture", saveZoneArmMs: 400, takeArmMs: 400);
                State = RecordingState.Create("tutorial-1");
                Ledger = new TakeLedger(Workspace(), "synthetic-fixture");
            }
            public void Advance(double ms) { NowMs += ms; }
            public RecordingTransition Act(RecordingAction action, ReferenceObservation observation = null, string tutorialId = null, int takeIndex = -1)
            {
                Last = RecordingDirector.Reduce(Policy, State, new RecordingInput(action, NowMs, observation, tutorialId, Revision, takeIndex));
                State = Last.State;
                if (Last.Commit != null) commits++;
                Ledger.Apply(Last, observation, "recording-" + commits, PendingNarration, TrimmedNarrationAssetId);
                return Last;
            }
            public RecordingTransition Sample(Vector3? left, Vector3? right, double stepMs = 40, string source = "synthetic-fixture")
            {
                NowMs += stepMs;
                return Act(RecordingAction.Sample, new ReferenceObservation(NowMs, ++Sequence, Revision, source,
                    left.HasValue ? Hand(left.Value) : MotionSamples.Missing(), right.HasValue ? Hand(right.Value) : MotionSamples.Missing()));
            }
            // Arrives stamped in the past while still inside the stall window.
            public RecordingTransition Stale(Vector3 left, Vector3 right, double backMs) =>
                Act(RecordingAction.Sample, new ReferenceObservation(NowMs - backMs, ++Sequence, Revision, "synthetic-fixture", Hand(left), Hand(right)));
            // Re-delivers the previous timestamp and sequence: an explicitly replayed callback.
            public RecordingTransition Repeat(Vector3 left, Vector3 right) =>
                Act(RecordingAction.Sample, new ReferenceObservation(NowMs, Sequence, Revision, "synthetic-fixture", Hand(left), Hand(right)));
            public RecordingTransition Resume(Vector3? left, Vector3? right)
            {
                NowMs += 40;
                return Act(RecordingAction.Resume, new ReferenceObservation(NowMs, ++Sequence, Revision, "synthetic-fixture",
                    left.HasValue ? Hand(left.Value) : MotionSamples.Missing(), right.HasValue ? Hand(right.Value) : MotionSamples.Missing()));
            }
            public void Hold(Vector3 left, Vector3 right, double durationMs, double stepMs = 40)
            {
                for (var t = 0.0; t < durationMs; t += stepMs)
                {
                    Sample(left, right, stepMs);
                    if (State.Phase == RecordingPhase.Reviewing) return;
                }
            }
            public void Move(Vector3 fromLeft, Vector3 toLeft, Vector3 fromRight, Vector3 toRight, int steps, double stepMs = 40)
            {
                for (var i = 1; i <= steps; i++)
                {
                    var alpha = (float)i / steps;
                    Sample(Vector3.Lerp(fromLeft, toLeft, alpha), Vector3.Lerp(fromRight, toRight, alpha), stepMs);
                    if (State.Phase == RecordingPhase.Reviewing) return;
                }
            }
        }
    }
}
