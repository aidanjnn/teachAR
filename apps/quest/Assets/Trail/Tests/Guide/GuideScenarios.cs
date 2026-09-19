using System;
using System.Collections.Generic;
using System.Linq;
using System.Numerics;
using Trail.Contracts;
using Trail.Motion;
using Trail.Runtime.Guide;

namespace Trail.Tests.Guide
{
    public static class GuideScenarios
    {
        private static CanonicalPose Pose(float x) => new CanonicalPose(new Vector3(x, 0, 0), Quaternion.Identity);
        private static GuideDefinition Definition(int steps = 1, bool gates = false, bool both = false, GuideCompletionMode? mode = null)
        {
            return new GuideDefinition("synthetic-tutorial", 1, Enumerable.Range(1, steps).Select(i => new GuideStep("step-" + i, "Move the lightweight practice part.",
                (both ? new[] { GuideHand.Left, GuideHand.Right } : new[] { GuideHand.Left }).Select(hand => new GuideTarget(hand, Pose(0), Pose(.4f),
                    gates ? new[] { new GuideGate(new Vector3(.15f, 0, 0), .03), new GuideGate(new Vector3(.3f, 0, 0), .03) } : null,
                    Enumerable.Range(0, 41).Select(n => new Vector3(n / 100f, 0, 0)))),
                mode ?? (gates ? GuideCompletionMode.PathAndPose : GuideCompletionMode.PoseMatch))), GuideSource.SyntheticDiagnostic);
        }
        private static void Equal<T>(T expected, T actual, string why)
        { if (!EqualityComparer<T>.Default.Equals(expected, actual)) throw new Exception(why + ": expected " + expected + ", got " + actual); }
        private static void True(bool condition, string why) { if (!condition) throw new Exception(why); }
        private sealed class Rig
        {
            internal readonly GuideSession Session;
            internal readonly List<GuideEffect> Effects = new List<GuideEffect>();
            internal readonly List<string> Phases = new List<string>();
            internal double Now;
            internal long Sequence;
            internal GuideState State => Session.State;
            internal Rig(GuideDefinition definition = null)
            {
                Session = new GuideSession(definition ?? Definition(), "synthetic-run");
                Session.Transitioned += t => { Effects.AddRange(t.Effects); if (Phases.LastOrDefault() != t.State.Phase.ToString()) Phases.Add(t.State.Phase.ToString()); };
                Act(GuideAction.Preloaded);
                Act(GuideAction.Calibrated);
            }
            internal void Act(GuideAction action) => Session.Dispatch(new GuideInput(action, Now, trackingSessionId: "synthetic-session", originRevision: 1));
            internal void Sample(float? left, float? right = null, double delta = 50, GuideSource source = GuideSource.SyntheticDiagnostic)
            {
                Now += delta;
                Session.Dispatch(new GuideInput(GuideAction.Sample, Now, new GuideObservation(Now, ++Sequence, 1, "synthetic-session", source, left.HasValue ? Pose(left.Value) : (CanonicalPose?)null, right.HasValue ? Pose(right.Value) : (CanonicalPose?)null)));
            }
            internal void Hold(float? left, int count, float? right = null) { for (var i = 0; i < count; i++) Sample(left, right); }
            internal void Arm(bool both = false)
            { Act(GuideAction.DemonstrationFinished); Hold(0, 5, both ? 0 : (float?)null); Equal(GuidePhase.Guiding, State.Phase, "start arms"); }
            internal int Completions => Effects.Count(e => e.Kind == GuideEffectKind.MovementCheckpointReached || e.Kind == GuideEffectKind.UserConfirmed);
        }
        public static int RunAll()
        {
            var tests = new Action[] { FullSlowLearner, OrderedGates, InactiveHandLoss, ActiveLossDuringDwell, StaleAndOutOfOrder, StallAndCreditCap,
                PauseResumeReset, RepeatExactlyOnce, BackendIndependentMultiStep, UserConfirmed, TwoHands, ShowingCannotComplete, BadPoseAndJump,
                SourceIsolation, ImmutablePreviousState, OrientationAndCue, ReacquisitionCannotBorrowDwell, OverlapRequiresStart, InvalidDefinitions, ZeroDwellStillRequiresMatch, ManualOcclusion, OriginChangeWhileShowing, ClockRollback, EffectIdentityOrder };
            foreach (var test in tests) { test(); }
            return tests.Length;
        }
        private static void FullSlowLearner()
        {
            var r = new Rig(); r.Arm(); r.Hold(.1f, 1000); Equal(0, r.Completions, "slow learner never timed out or auto-advanced");
            r.Hold(.4f, 10); Equal(GuidePhase.Holding, r.State.Phase, "first matching sample earns no past time");
            r.Hold(.4f, 1); Equal(1, r.Completions, "500ms continuous dwell"); Equal(GuidePhase.Complete, r.State.Phase, "complete");
        }
        private static void OrderedGates()
        {
            var r = new Rig(Definition(gates: true)); r.Arm(); r.Hold(.3f, 8); r.Hold(.4f, 12);
            Equal(0, r.Completions, "skipped gate blocks endpoint"); Equal(0, r.State.PassedGates[0], "second gate not credited first");
            r.Hold(.15f, 3); Equal(1, r.State.PassedGates[0], "first gate");
            r.Hold(null, 1); r.Hold(.3f, 5); Equal(1, r.State.PassedGates[0], "reacquisition preserves only completed gates");
            r.Hold(.3f, 3); Equal(2, r.State.PassedGates[0], "next gate needs fresh dwell"); r.Hold(.4f, 11); Equal(1, r.Completions, "ordered completion");
        }
        private static void InactiveHandLoss() { var r = new Rig(); r.Arm(); r.Hold(.4f, 11); Equal(1, r.Completions, "absent inactive right hand is irrelevant"); }
        private static void ActiveLossDuringDwell()
        {
            var r = new Rig(); r.Arm(); r.Hold(.4f, 8); r.Sample(null); Equal(GuidePhase.TrackingLost, r.State.Phase, "active loss"); Equal(0d, r.State.DwellMs, "clear dwell");
            r.Hold(.4f, 5); Equal(GuidePhase.Guiding, r.State.Phase, "reacquire for 200ms"); r.Hold(.4f, 10); Equal(0, r.Completions, "fresh dwell needed"); r.Hold(.4f, 1); Equal(1, r.Completions, "fresh completion");
        }
        private static void StaleAndOutOfOrder()
        {
            foreach (var type in new[] { "old", "duplicate", "future", "sequence" })
            {
                var r = new Rig(); r.Arm(); r.Hold(.4f, 8); var sample = type == "old" ? r.Now - 101 : type == "future" ? r.Now + 1 : type == "sequence" ? r.Now + 50 : r.Now;
                r.Session.Dispatch(new GuideInput(GuideAction.Sample, r.Now + (type == "sequence" ? 50 : 0), new GuideObservation(sample, type == "sequence" ? 0 : r.Sequence, 1, "synthetic-session", GuideSource.SyntheticDiagnostic, Pose(.4f), null)));
                Equal(GuidePhase.TrackingLost, r.State.Phase, type + " sample rejected"); Equal(0d, r.State.DwellMs, type + " clears dwell"); Equal(0, r.Completions, type + " no completion");
            }
        }
        private static void StallAndCreditCap()
        {
            var r = new Rig(); r.Arm(); r.Hold(.4f, 6); r.Sample(.4f, delta: 101); Equal(GuidePhase.TrackingLost, r.State.Phase, "stall resets");
            var capped = new Rig(); capped.Arm(); capped.Sample(.4f); for (var i = 0; i < 5; i++) capped.Sample(.4f, delta: 90);
            Equal(250d, capped.State.DwellMs, "credit capped to 50ms"); capped.Now += 101; capped.Act(GuideAction.Tick); Equal(0d, capped.State.DwellMs, "no-frame watchdog");
        }
        private static void PauseResumeReset()
        {
            var r = new Rig(); r.Arm(); r.Hold(.4f, 8); var revision = r.State.StepRevision; r.Act(GuideAction.Pause); r.Now += 10000; r.Hold(.4f, 20);
            Equal(GuidePhase.Paused, r.State.Phase, "paused samples ignored"); Equal(0, r.Completions, "pause never completes"); r.Act(GuideAction.Resume);
            r.Hold(.4f, 5); Equal(GuidePhase.Guiding, r.State.Phase, "resume reacquisition"); True(r.State.StepRevision > revision, "revision invalidates stale effects");
            r.Act(GuideAction.ReferenceReset); Equal(GuidePhase.Calibrate, r.State.Phase, "reset calibration"); r.Hold(.4f, 20); Equal(0, r.Completions, "reset cannot complete");
            r.Act(GuideAction.Calibrated); Equal(GuidePhase.Showing, r.State.Phase, "recalibration requires demonstration/start");
        }
        private static void RepeatExactlyOnce()
        {
            var r = new Rig(); r.Arm(); r.Hold(.4f, 30); Equal(1, r.Completions, "completion idempotent"); var first = r.Effects.Single(e => e.Kind == GuideEffectKind.MovementCheckpointReached);
            r.Act(GuideAction.Repeat); r.Arm(); r.Hold(.4f, 11); Equal(2, r.Completions, "repeat permits new completion");
            var second = r.Effects.Last(e => e.Kind == GuideEffectKind.MovementCheckpointReached); True(first.AttemptId != second.AttemptId && first.StepRevision < second.StepRevision, "new attempt and revision");
        }
        private static void BackendIndependentMultiStep()
        {
            var r = new Rig(Definition(3)); for (var i = 0; i < 3; i++) { r.Arm(); r.Hold(.4f, 11); }
            Equal(3, r.Completions, "all steps complete without backend or network"); Equal(GuidePhase.Complete, r.State.Phase, "multi complete");
            Equal(3, r.Effects.Count(e => e.Kind == GuideEffectKind.ShowDemonstration), "one demo effect per step");
            Equal(3, r.Effects.Where(e => e.Kind == GuideEffectKind.MovementCheckpointReached).Select(e => e.StepId).Distinct().Count(), "each step identity retained");
        }
        private static void UserConfirmed()
        {
            var r = new Rig(Definition(mode: GuideCompletionMode.UserConfirmed)); r.Act(GuideAction.Confirm); Equal(0, r.Completions, "no confirmation during showing"); r.Arm(); r.Hold(.4f, 50);
            Equal(0, r.Completions, "user mode no automatic substitute"); r.Act(GuideAction.Confirm); Equal(1, r.Completions, "explicit confirmation");
            Equal(GuideEffectKind.UserConfirmed, r.Effects.First(e => e.Kind == GuideEffectKind.UserConfirmed).Kind, "distinct provenance");
            var automatic = new Rig(); automatic.Arm(); automatic.Act(GuideAction.Confirm); Equal(0, automatic.Completions, "automatic mode cannot be bypassed");
        }
        private static void TwoHands() { var r = new Rig(Definition(both: true)); r.Arm(true); r.Hold(.4f, 6, .4f); r.Sample(.4f); Equal(GuidePhase.TrackingLost, r.State.Phase, "both active requires both"); }
        private static void ShowingCannotComplete() { var r = new Rig(); r.Hold(.4f, 30); Equal(GuidePhase.Showing, r.State.Phase, "showing no evidence"); r.Act(GuideAction.DemonstrationFinished); r.Hold(.4f, 30); Equal(GuidePhase.WaitingStart, r.State.Phase, "end before start blocked"); }
        private static void BadPoseAndJump()
        {
            var r = new Rig(); r.Arm(); r.Sample(0); r.Sample(2); Equal(GuidePhase.TrackingLost, r.State.Phase, "jump clears evidence");
            var invalid = new Rig(); invalid.Arm(); invalid.Now += 50; invalid.Session.Dispatch(new GuideInput(GuideAction.Sample, invalid.Now,
                new GuideObservation(invalid.Now, ++invalid.Sequence, 1, "synthetic-session", GuideSource.SyntheticDiagnostic, default(CanonicalPose), null)));
            Equal(GuidePhase.TrackingLost, invalid.State.Phase, "default nonnormalized pose rejected");
        }
        private static void SourceIsolation() { var r = new Rig(); r.Arm(); r.Sample(.4f, source: GuideSource.NativeHands); Equal(GuidePhase.TrackingLost, r.State.Phase, "cannot mix diagnostic/native evidence"); }
        private static void ImmutablePreviousState() { var r = new Rig(); r.Arm(); var before = r.State; r.Hold(.4f, 5); Equal(GuidePhase.Guiding, before.Phase, "previous state unchanged"); Equal(0d, before.DwellMs, "previous dwell unchanged"); }
        private static void OrientationAndCue()
        {
            var turn = new CanonicalPose(Vector3.Zero, Quaternion.CreateFromAxisAngle(Vector3.UnitY, (float)Math.PI));
            True(!GuideMatcher.Matches(turn, Pose(0), .05, .5), "orientation rejects opposite"); True(GuideMatcher.Matches(turn, Pose(0), .05), "orientation disabled");
            var r = new Rig(Definition(gates: true)); r.Arm(); r.Hold(.4f, 50); Equal(0, r.State.PassedGates[0], "cue never proves gate"); True(r.State.CueProgress[0] > 0, "cue moves independently");
        }
        private static void ReacquisitionCannotBorrowDwell() { var r = new Rig(); r.Arm(); r.Sample(null); r.Hold(.4f, 5); Equal(0d, r.State.DwellMs, "recovery not endpoint dwell"); }
        private static void OverlapRequiresStart()
        {
            var d = new GuideDefinition("overlap", 1, new[] { new GuideStep("s", "", new[] { new GuideTarget(GuideHand.Left, Pose(0), Pose(0)) }) }, GuideSource.SyntheticDiagnostic);
            var r = new Rig(d); r.Act(GuideAction.DemonstrationFinished); r.Hold(0, 30); Equal(GuidePhase.WaitingStart, r.State.Phase, "overlap requires control"); r.Act(GuideAction.ExplicitStart); r.Hold(0, 5); Equal(GuidePhase.Guiding, r.State.Phase, "explicit start still reacquires");
        }
        private static void InvalidDefinitions()
        {
            var rejected = false; try { new GuideGate(Vector3.Zero, double.NaN); } catch (ArgumentException) { rejected = true; } True(rejected, "NaN threshold rejected");
        }

        private static void ZeroDwellStillRequiresMatch()
        {
            var d = new GuideDefinition("zero-dwell", 0, new[] { new GuideStep("s", "", new[] { new GuideTarget(GuideHand.Left, Pose(0), Pose(.4f)) }, dwellMs: 0, startDwellMs: 0) }, GuideSource.SyntheticDiagnostic);
            var r = new Rig(d); r.Act(GuideAction.DemonstrationFinished); r.Sample(.4f); Equal(GuidePhase.WaitingStart, r.State.Phase, "zero start dwell still needs start pose");
            r.Sample(0); Equal(GuidePhase.Guiding, r.State.Phase, "zero dwell matching start"); r.Sample(.2f); Equal(0, r.Completions, "zero endpoint dwell still needs endpoint"); r.Sample(.4f); Equal(1, r.Completions, "zero matching dwell");
        }
        private static void ManualOcclusion()
        {
            var r = new Rig(Definition(mode: GuideCompletionMode.UserConfirmed)); r.Arm(); r.Sample(null); r.Act(GuideAction.Confirm);
            Equal(1, r.Completions, "explicit manual completion supports occluded actions");
            var paused = new Rig(Definition(mode: GuideCompletionMode.UserConfirmed)); paused.Arm(); paused.Act(GuideAction.Pause); paused.Act(GuideAction.Confirm); Equal(0, paused.Completions, "manual cannot bypass pause");
        }
        private static void OriginChangeWhileShowing()
        {
            var r = new Rig(); r.Now += 50; r.Session.Dispatch(new GuideInput(GuideAction.Sample, r.Now,
                new GuideObservation(r.Now, 1, 2, "synthetic-session", GuideSource.SyntheticDiagnostic, Pose(0), null)));
            Equal(GuidePhase.Calibrate, r.State.Phase, "origin mismatch invalidates even during showing");
        }
        private static void ClockRollback()
        {
            var r = new Rig(); r.Arm(); r.Hold(.4f, 8); r.Session.Dispatch(new GuideInput(GuideAction.Tick, r.Now - 1));
            Equal(GuidePhase.TrackingLost, r.State.Phase, "rollback clears evidence"); Equal(0d, r.State.DwellMs, "rollback no credit");
        }
        private static void EffectIdentityOrder()
        {
            var r = new Rig(Definition(2)); r.Arm(); r.Hold(.4f, 11);
            var completion = r.Effects.FindIndex(e => e.Kind == GuideEffectKind.MovementCheckpointReached);
            True(completion >= 0 && r.Effects[completion].StepId == "step-1", "completion captures old step identity");
            True(r.Effects.Skip(completion + 1).Any(e => e.Kind == GuideEffectKind.ShowDemonstration && e.StepId == "step-2"), "next demo follows completion");
        }
        public static string DiagnosticTrace()
        {
            var r = new Rig(Definition(2, gates: true));
            for (var i = 0; i < 2; i++) { r.Arm(); r.Hold(.15f, 3); r.Hold(.3f, 3); r.Hold(.4f, 11); }
            return "Synthetic multi-step phases: " + string.Join(" -> ", r.Phases) + "\nEffects: " + string.Join(", ", r.Effects.Select(e => e.Kind + "[" + e.StepId + "/" + e.AttemptId + "]"));
        }
    }
}
