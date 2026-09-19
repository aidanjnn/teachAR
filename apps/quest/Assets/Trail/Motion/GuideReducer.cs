using System;
using System.Collections.Generic;
using System.Linq;
using System.Numerics;

namespace Trail.Motion
{
    // Pure input/time-driven reducer. No clocks, timers, device APIs, callbacks or I/O.
    public static class GuideReducer
    {
        public const double StallMs = 100, MaximumCreditMs = 50, ReacquisitionMs = 200;
        public static GuideTransition Reduce(GuideDefinition definition, GuideState previous, GuideInput input)
        {
            if (definition == null || previous == null || input == null) throw new ArgumentNullException();
            var effects = new List<GuideEffect>();
            var s = previous.Clone();
            void Emit(GuideEffectKind kind) => effects.Add(new GuideEffect(kind, s, definition));
            void Revision() { s.StepRevision++; Emit(GuideEffectKind.RevisionChanged); }
            void Show()
            {
                ClearEvidence(s); s.GateIndices = new int[2]; s.CueIndices = new int[2]; s.CompletionEmitted = false;
                s.Phase = GuidePhase.Showing; s.Notice = "Watch the demonstration."; Emit(GuideEffectKind.ShowDemonstration);
            }
            void Reset()
            {
                ClearEvidence(s); s.Calibrated = false; s.Attempt++; Revision();
                s.Phase = GuidePhase.Calibrate; s.Notice = "Recalibrate the workspace."; Emit(GuideEffectKind.StopFeedback);
            }
            void Complete(bool confirmed)
            {
                if (s.CompletionEmitted) return;
                s.CompletionEmitted = true;
                Emit(confirmed ? GuideEffectKind.UserConfirmed : GuideEffectKind.MovementCheckpointReached);
                s.Notice = confirmed ? "Step completed by user confirmation." : "Movement checkpoint reached.";
                ClearEvidence(s); Emit(GuideEffectKind.StopFeedback);
                if (s.StepIndex + 1 == definition.Steps.Count) { s.Phase = GuidePhase.Complete; Revision(); }
                else { s.StepIndex++; s.Attempt = 1; Revision(); Show(); }
            }
            // Bad caller time never earns dwell or moves the monotonic watermark backwards.
            if (!GuideValidation.Finite(input.NowMs) || input.NowMs < 0 || input.NowMs < s.NowMs)
            {
                if (Active(s.Phase)) LoseTracking(s, effects, definition, "Clock discontinuity; reacquire tracking.");
                return new GuideTransition(s, effects);
            }
            s.NowMs = input.NowMs;
            var step = definition.Steps[s.StepIndex];
            switch (input.Action)
            {
                case GuideAction.Preloaded:
                    if (s.Phase == GuidePhase.Preload) { s.Phase = GuidePhase.Calibrate; s.Notice = "Calibrate the workspace."; }
                    break;
                case GuideAction.Calibrated:
                    if (s.Phase != GuidePhase.Calibrate || string.IsNullOrWhiteSpace(input.TrackingSessionId) || input.OriginRevision < 0) break;
                    s.Calibrated = true; s.TrackingSessionId = input.TrackingSessionId; s.OriginRevision = input.OriginRevision;
                    s.SampleMs = -1; s.Sequence = -1; Revision(); Show(); break;
                case GuideAction.ReferenceReset:
                    if (s.Phase != GuidePhase.Preload) Reset(); break;
                case GuideAction.Pause:
                    if (s.Phase == GuidePhase.Paused || s.Phase == GuidePhase.Preload || s.Phase == GuidePhase.Calibrate || s.Phase == GuidePhase.Complete) break;
                    s.ResumePhase = s.Phase == GuidePhase.TrackingLost ? s.ResumePhase : (s.Phase == GuidePhase.Holding ? GuidePhase.Guiding : s.Phase);
                    ClearEvidence(s); s.Phase = GuidePhase.Paused; s.Notice = "Paused. Resume when ready."; Revision(); Emit(GuideEffectKind.StopFeedback); break;
                case GuideAction.Resume:
                    if (s.Phase != GuidePhase.Paused) break;
                    Revision();
                    if (s.ResumePhase == GuidePhase.Showing) Show();
                    else { s.Phase = GuidePhase.TrackingLost; s.Notice = "Reacquiring tracking."; ClearEvidence(s); }
                    break;
                case GuideAction.Repeat:
                    if (!s.Calibrated || s.Phase == GuidePhase.Preload || s.Phase == GuidePhase.Calibrate) break;
                    s.Attempt++; Revision(); Emit(GuideEffectKind.StopFeedback); Show(); break;
                case GuideAction.DemonstrationFinished:
                    if (s.Phase == GuidePhase.Showing) { ClearEvidence(s); s.Phase = GuidePhase.WaitingStart; s.Notice = step.RequiresExplicitStart ? "Use Start when ready." : "Hold the demonstrated start pose."; }
                    break;
                case GuideAction.ExplicitStart:
                    if (s.Phase == GuidePhase.WaitingStart && step.RequiresExplicitStart)
                    { ClearEvidence(s); s.Phase = GuidePhase.TrackingLost; s.ResumePhase = GuidePhase.Guiding; s.Notice = "Reacquiring tracking before guiding."; }
                    break;
                case GuideAction.Confirm:
                    if (step.CompletionMode == GuideCompletionMode.UserConfirmed && (s.Phase == GuidePhase.Guiding || s.Phase == GuidePhase.Holding)) Complete(true);
                    break;
                case GuideAction.Tick:
                    if (Active(s.Phase) && (s.SampleMs < 0 || s.NowMs - s.SampleMs > StallMs)) LoseTracking(s, effects, definition, "Tracking stalled; reacquire active hands.");
                    break;
                case GuideAction.Sample:
                    var o = input.Observation;
                    if (s.Calibrated && o != null && (o.TrackingSessionId != s.TrackingSessionId || o.OriginRevision != s.OriginRevision)) { Reset(); break; }
                    if (!Active(s.Phase)) break;
                    if (o == null || o.Source != definition.Source || !GuideValidation.Finite(o.SampleTimeMs) || o.SampleTimeMs < 0 || o.Sequence < 0 ||
                        o.SampleTimeMs > s.NowMs || s.NowMs - o.SampleTimeMs > StallMs || o.SampleTimeMs <= s.SampleMs || o.Sequence <= s.Sequence)
                    { LoseTracking(s, effects, definition, "Fresh hand samples required."); break; }
                    var delta = s.SampleMs < 0 ? 0 : o.SampleTimeMs - s.SampleMs;
                    var stalled = s.Previous != null && delta > StallMs;
                    s.SampleMs = o.SampleTimeMs; s.Sequence = o.Sequence;
                    var valid = step.Targets.All(t => GuideValidation.ValidPose(o.Pose(t.Hand)));
                    if (valid && s.Previous != null && !stalled)
                        valid = step.Targets.All(t => !s.Previous.Pose(t.Hand).HasValue || Vector3.Distance(o.Pose(t.Hand).Value.PositionM, s.Previous.Pose(t.Hand).Value.PositionM) <= .5f);
                    if (!valid || stalled)
                    { LoseTracking(s, effects, definition, valid ? "Tracking stalled; reacquire active hands." : "Active hand tracking unavailable."); break; }
                    var credit = s.Previous == null ? 0 : Math.Min(MaximumCreditMs, delta);
                    s.Previous = o;
                    if (s.Phase == GuidePhase.TrackingLost)
                    {
                        s.ReacquisitionMs += credit;
                        if (s.ReacquisitionMs >= ReacquisitionMs)
                        { s.Phase = s.ResumePhase; ClearEvidence(s); s.Notice = "Tracking reacquired; continue with fresh evidence."; }
                        break;
                    }
                    if (s.Phase == GuidePhase.WaitingStart)
                    {
                        if (step.RequiresExplicitStart) break;
                        var matches = step.Targets.All(t => GuideMatcher.Matches(o.Pose(t.Hand).Value, t.Start, .07, t.OrientationToleranceRad));
                        s.StartDwellMs = matches ? (s.StartMatching ? s.StartDwellMs + credit : 0) : 0;
                        s.StartMatching = matches;
                        if (matches && s.StartDwellMs >= step.StartDwellMs) { ClearEvidence(s); s.Phase = GuidePhase.Guiding; s.Notice = "Follow the movement at your pace."; }
                        break;
                    }
                    for (var i = 0; i < step.Targets.Count; i++)
                    {
                        var t = step.Targets[i]; var pose = o.Pose(t.Hand).Value;
                        s.CueIndices[i] = GuideMatcher.CueIndex(t, pose.PositionM, s.CueIndices[i]);
                        if (step.CompletionMode != GuideCompletionMode.PathAndPose || s.GateIndices[i] >= t.Gates.Count) continue;
                        var gate = t.Gates[s.GateIndices[i]];
                        var matches = Vector3.Distance(pose.PositionM, gate.PositionM) <= gate.ToleranceM;
                        s.GateDwell[i] = matches ? (s.GateMatching[i] ? s.GateDwell[i] + credit : 0) : 0;
                        s.GateMatching[i] = matches;
                        if (matches && s.GateDwell[i] >= gate.DwellMs) { s.GateIndices[i]++; s.GateDwell[i] = 0; s.GateMatching[i] = false; }
                    }
                    if (step.CompletionMode == GuideCompletionMode.UserConfirmed) { s.Notice = "User-confirmed mode: select I completed this step."; break; }
                    var gatesPassed = step.CompletionMode != GuideCompletionMode.PathAndPose || step.Targets.Select((t, i) => s.GateIndices[i] == t.Gates.Count).All(x => x);
                    var endpoint = gatesPassed && step.Targets.All(t => GuideMatcher.Matches(o.Pose(t.Hand).Value, t.Checkpoint, t.PositionToleranceM, t.OrientationToleranceRad) &&
                        (t.Gesture == GuideGesture.Any || o.Gesture(t.Hand) == t.Gesture));
                    s.DwellMs = endpoint ? (s.EndMatching ? s.DwellMs + credit : 0) : 0; s.EndMatching = endpoint;
                    s.Phase = endpoint ? GuidePhase.Holding : GuidePhase.Guiding;
                    s.Notice = endpoint ? "Hold the movement checkpoint." : "Follow the movement at your pace.";
                    if (endpoint && s.DwellMs >= step.DwellMs) Complete(false);
                    break;
            }
            return new GuideTransition(s, effects);
        }
        private static bool Active(GuidePhase phase) => phase == GuidePhase.WaitingStart || phase == GuidePhase.Guiding || phase == GuidePhase.Holding || phase == GuidePhase.TrackingLost;
        private static void ClearEvidence(GuideState s)
        {
            s.DwellMs = 0; s.StartDwellMs = 0; s.ReacquisitionMs = 0; s.Previous = null;
            s.StartMatching = false; s.EndMatching = false; Array.Clear(s.GateDwell, 0, 2); Array.Clear(s.GateMatching, 0, 2);
        }
        private static void LoseTracking(GuideState s, List<GuideEffect> effects, GuideDefinition d, string notice)
        {
            if (s.Phase != GuidePhase.TrackingLost) { s.ResumePhase = s.Phase == GuidePhase.Holding ? GuidePhase.Guiding : s.Phase; effects.Add(new GuideEffect(GuideEffectKind.StopFeedback, s, d)); }
            ClearEvidence(s); s.Phase = GuidePhase.TrackingLost; s.Notice = notice;
        }
    }
}
