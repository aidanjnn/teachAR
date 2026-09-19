using System;
using Trail.Contracts;
using Trail.Motion;

namespace Trail.Runtime.Guide
{
    // Produces shared read-only spectator events; no transport and no inbound control path.
    public sealed class GuideTelemetry
    {
        private string sessionId;
        private readonly double runStartMs;
        private long sequence;
        public GuideTelemetry(string sessionId, double runStartMs)
        {
            if (string.IsNullOrWhiteSpace(sessionId) || sessionId.Length > 128 || double.IsNaN(runStartMs) || double.IsInfinity(runStartMs) || runStartMs < 0) throw new ArgumentException("Session and monotonic run start required.");
            this.sessionId = sessionId; this.runStartMs = runStartMs;
        }
        public void RebindSession(string pairedSessionId)
        {
            if (string.IsNullOrWhiteSpace(pairedSessionId) || pairedSessionId.Length > 128) throw new ArgumentException("Paired session ID required.");
            if (pairedSessionId == sessionId) return;
            sessionId = pairedSessionId; sequence = 0;
        }
        public static GuideContextRef Context(GuideSession session) => new GuideContextRef { RunId = session.State.RunId, TutorialId = session.Definition.TutorialId,
            TutorialRevision = session.Definition.TutorialRevision, StepId = session.Definition.Steps[session.State.StepIndex].Id, StepRevision = session.State.StepRevision, AttemptId = session.State.AttemptId };
        public static GuideSnapshot Snapshot(GuideSession session)
        {
            var s = session.State; var step = session.Definition.Steps[s.StepIndex];
            var gates = s.PassedGates; var cues = s.CueProgress; var next = new NextGateByHand(); var progress = 0d;
            for (var i = 0; i < step.Targets.Count; i++)
            {
                if (step.Targets[i].Hand == GuideHand.Left) next.Left = gates[i]; else next.Right = gates[i];
                progress += (double)cues[i] / (step.Targets[i].CuePath.Count - 1);
            }
            return new GuideSnapshot { Phase = Phase(s.Phase), TutorialId = session.Definition.TutorialId, TutorialRevision = session.Definition.TutorialRevision,
                StepId = step.Id, StepRevision = s.StepRevision, AttemptId = s.AttemptId, DwellProgress = step.DwellMs == 0 ? 0 : Math.Min(1, s.DwellMs / step.DwellMs),
                PathProgress = progress / step.Targets.Count, NextGateByHand = next, CalibrationValid = s.Calibrated,
                Tracking = new HandTracking { Left = s.LeftTracked ? "valid" : "missing", Right = s.RightTracked ? "valid" : "missing" } };
        }
        public GuideEvent SnapshotEvent(GuideSession session, double nowMs) { var e = Envelope(session.State.RunId, nowMs); e.Type = "snapshot"; e.State = Snapshot(session); return e; }
        public GuideEvent CompletionEvent(GuideSession session, GuideEffect effect, double nowMs)
        {
            if (effect.Kind != GuideEffectKind.MovementCheckpointReached && effect.Kind != GuideEffectKind.UserConfirmed) throw new ArgumentException("Expected completion effect.");
            var e = Envelope(effect.RunId, nowMs); e.Type = "step-completed"; e.StepId = effect.StepId; e.AttemptId = effect.AttemptId;
            var step = System.Linq.Enumerable.First(session.Definition.Steps, s => s.Id == effect.StepId);
            e.Evidence = effect.Kind == GuideEffectKind.UserConfirmed ? "user-confirmed" : step.CompletionMode == GuideCompletionMode.PathAndPose ? "path-and-pose" : "pose-match";
            return e;
        }
        private GuideEvent Envelope(string runId, double nowMs)
        {
            if (double.IsNaN(nowMs) || double.IsInfinity(nowMs) || nowMs < runStartMs) throw new ArgumentException("Invalid monotonic event time.");
            return new GuideEvent { SchemaVersion = 1, SessionId = sessionId, RunId = runId, Seq = sequence++, TMs = nowMs - runStartMs };
        }
        private static string Phase(GuidePhase phase)
        {
            switch (phase)
            {
                case GuidePhase.Preload: return "preloading";
                case GuidePhase.Calibrate: return "calibrating";
                case GuidePhase.WaitingStart: return "waiting-start";
                case GuidePhase.TrackingLost: return "tracking-lost";
                default: return phase.ToString().ToLowerInvariant();
            }
        }
    }
}
