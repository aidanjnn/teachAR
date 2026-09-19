using System;
using System.Collections.Generic;
using System.Collections.ObjectModel;
using Trail.Contracts;

namespace Trail.Motion
{
    public enum GuideAction { Preloaded, Calibrated, DemonstrationFinished, ExplicitStart, Sample, Tick, Pause, Resume, Repeat, ReferenceReset, Confirm }
    public enum GuideEffectKind { ShowDemonstration, StopFeedback, RevisionChanged, MovementCheckpointReached, UserConfirmed }
    public sealed class GuideEffect
    {
        public GuideEffectKind Kind { get; }
        public string RunId { get; }
        public string StepId { get; }
        public string AttemptId { get; }
        public int StepRevision { get; }
        public GuideSource Source { get; }
        internal GuideEffect(GuideEffectKind kind, GuideState state, GuideDefinition definition)
        { Kind = kind; RunId = state.RunId; StepId = definition.Steps[state.StepIndex].Id; AttemptId = state.AttemptId; StepRevision = state.StepRevision; Source = definition.Source; }
    }
    public sealed class GuideObservation
    {
        public double SampleTimeMs { get; }
        public long Sequence { get; }
        public int OriginRevision { get; }
        public string TrackingSessionId { get; }
        public GuideSource Source { get; }
        public CanonicalPose? Left { get; }
        public CanonicalPose? Right { get; }
        public GuideGesture LeftGesture { get; }
        public GuideGesture RightGesture { get; }
        public GuideObservation(double sampleTimeMs, long sequence, int originRevision, string trackingSessionId,
            GuideSource source, CanonicalPose? left, CanonicalPose? right,
            GuideGesture leftGesture = GuideGesture.Any, GuideGesture rightGesture = GuideGesture.Any)
        { SampleTimeMs = sampleTimeMs; Sequence = sequence; OriginRevision = originRevision; TrackingSessionId = trackingSessionId; Source = source; Left = left; Right = right; LeftGesture = leftGesture; RightGesture = rightGesture; }
        public CanonicalPose? Pose(GuideHand hand) => hand == GuideHand.Left ? Left : Right;
        public GuideGesture Gesture(GuideHand hand) => hand == GuideHand.Left ? LeftGesture : RightGesture;
    }
    public sealed class GuideInput
    {
        public GuideAction Action { get; }
        public double NowMs { get; }
        public GuideObservation Observation { get; }
        public string TrackingSessionId { get; }
        public int OriginRevision { get; }
        public GuideInput(GuideAction action, double nowMs, GuideObservation observation = null,
            string trackingSessionId = null, int originRevision = 0)
        { Action = action; NowMs = nowMs; Observation = observation; TrackingSessionId = trackingSessionId; OriginRevision = originRevision; }
    }
    public sealed class GuideState
    {
        public string RunId { get; internal set; }
        public GuidePhase Phase { get; internal set; } = GuidePhase.Preload;
        public int StepIndex { get; internal set; }
        public int Attempt { get; internal set; } = 1;
        public string AttemptId => "step-" + StepIndex + ":attempt-" + Attempt;
        public int StepRevision { get; internal set; } = 1;
        public double DwellMs { get; internal set; }
        public double StartDwellMs { get; internal set; }
        public double ReacquisitionMs { get; internal set; }
        public string Notice { get; internal set; } = "Preload the guide.";
        public bool Calibrated { get; internal set; }
        public bool LeftTracked => Previous?.Left.HasValue == true;
        public bool RightTracked => Previous?.Right.HasValue == true;
        public bool CompletionEmitted { get; internal set; }
        public string TrackingSessionId { get; internal set; }
        public int OriginRevision { get; internal set; }
        public ReadOnlyCollection<int> PassedGates => Array.AsReadOnly((int[])GateIndices.Clone());
        public ReadOnlyCollection<int> CueProgress => Array.AsReadOnly((int[])CueIndices.Clone());
        internal int[] GateIndices = new int[2];
        internal int[] CueIndices = new int[2];
        internal double[] GateDwell = new double[2];
        internal bool[] GateMatching = new bool[2];
        internal bool StartMatching, EndMatching;
        internal double NowMs = -1, SampleMs = -1;
        internal long Sequence = -1;
        internal GuideObservation Previous;
        internal GuidePhase ResumePhase = GuidePhase.WaitingStart;
        internal GuideState Clone()
        {
            var copy = (GuideState)MemberwiseClone();
            copy.GateIndices = (int[])GateIndices.Clone(); copy.CueIndices = (int[])CueIndices.Clone();
            copy.GateDwell = (double[])GateDwell.Clone(); copy.GateMatching = (bool[])GateMatching.Clone();
            return copy;
        }
        public static GuideState Create(string runId)
        { if (string.IsNullOrWhiteSpace(runId) || runId.Length > 128) throw new ArgumentException("Run ID required."); return new GuideState { RunId = runId }; }
    }
    public sealed class GuideTransition
    {
        public GuideState State { get; }
        public ReadOnlyCollection<GuideEffect> Effects { get; }
        internal GuideTransition(GuideState state, List<GuideEffect> effects) { State = state; Effects = effects.AsReadOnly(); }
    }
}
