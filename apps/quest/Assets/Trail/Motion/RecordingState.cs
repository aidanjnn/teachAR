using System;
using System.Collections.Generic;
using System.Collections.ObjectModel;
using System.Numerics;

namespace Trail.Motion
{
    public enum RecordingPhase { Idle, ChoosingSaveZone, Ready, Arming, Recording, Paused, Reviewing }
    public enum RecordingAction
    {
        NewTutorial, Calibrated, OriginInvalidated, BeginSaveZone, CancelSaveZone, StartTake, ReRecordTake,
        Pause, Resume, DiscardTake, SaveAtEndpoint, StopFullTake, ApproveTake, Sample, Tick,
    }
    public enum RecordingEffectKind
    {
        SaveZoneCleared, SaveZoneCaptureStarted, SaveZoneCaptureCancelled, SaveZoneChanged, TakeArmed, TakeStarted,
        TakePaused, TakeResumed, TakeDiscarded, EndpointHoldDetected, TakeCommitted, TakeApproved,
        TrackingInvalidated, ActionRefused,
    }

    public sealed class RecordingEffect
    {
        public RecordingEffectKind Kind { get; }
        public string TutorialId { get; }
        public int TakeGeneration { get; }
        public int TakeIndex { get; }
        public double TakeMs { get; }
        public string Notice { get; }
        internal RecordingEffect(RecordingEffectKind kind, RecordingState state, string notice)
        { Kind = kind; TutorialId = state.TutorialId; TakeGeneration = state.TakeGeneration; TakeIndex = state.LastTakeIndex; TakeMs = state.TakeMs; Notice = notice; }
    }

    // What the caller must do to its take buffer. A null Trim deliberately keeps the whole take.
    public sealed class TakeCommit
    {
        public int? ReplaceIndex { get; }
        public TakeTrim Trim { get; }
        public string Reason { get; }
        internal TakeCommit(int? replaceIndex, TakeTrim trim, string reason)
        { ReplaceIndex = replaceIndex; Trim = trim; Reason = reason; }
    }

    // Workspace-space observations only: the caller registers before it reduces.
    public sealed class RecordingInput
    {
        public RecordingAction Action { get; }
        public double NowMs { get; }
        public ReferenceObservation Observation { get; }
        public string TutorialId { get; }
        public int OriginRevision { get; }
        public int TakeIndex { get; }
        public RecordingInput(RecordingAction action, double nowMs, ReferenceObservation observation = null,
            string tutorialId = null, int originRevision = 0, int takeIndex = -1)
        { Action = action; NowMs = nowMs; Observation = observation; TutorialId = tutorialId; OriginRevision = originRevision; TakeIndex = takeIndex; }
    }

    public sealed class RecordingState
    {
        public string TutorialId { get; internal set; }
        public RecordingPhase Phase { get; internal set; } = RecordingPhase.Idle;
        public SaveZone SavePosition { get; internal set; }
        public bool Calibrated { get; internal set; }
        public int OriginRevision { get; internal set; }
        public int TakeCount { get; internal set; }
        public int LastTakeIndex { get; internal set; } = -1;
        public int TakeGeneration { get; internal set; }
        public int? ReplaceIndex { get; internal set; }
        // Active take time. Arming countdowns, pauses, stalls and review never advance it.
        public double TakeMs { get; internal set; }
        public int FrameCount { get; internal set; }
        public bool Armed { get; internal set; }
        public double? EndpointCandidateMs { get; internal set; }
        public string Notice { get; internal set; } = "Choose a save position once for this tutorial.";
        public double SaveZoneHoldMs => AnchorMs < 0 ? 0 : Math.Max(0, SampleMs - AnchorMs);
        public double EndpointHoldMs => StillStartMs.HasValue ? Math.Max(0, TakeMs - StillStartMs.Value) : 0;
        public double ReturnHoldMs => ReturnStartMs.HasValue ? Math.Max(0, TakeMs - ReturnStartMs.Value) : 0;
        internal double NowMs = -1, SampleMs = -1, ArmedAtMs = -1, AnchorMs = -1, LastFrameMs = double.NegativeInfinity;
        internal long Sequence = -1;
        internal Vector3? AnchorLeft, AnchorRight, StillLeft, StillRight, PausedLeft, PausedRight, LastPalmLeft, LastPalmRight;
        internal double? StillStartMs, ReturnStartMs;
        internal RecordingPhase ReturnPhase = RecordingPhase.Idle;
        internal RecordingState Clone() => (RecordingState)MemberwiseClone();
        public static RecordingState Create(string tutorialId)
        {
            if (string.IsNullOrWhiteSpace(tutorialId) || tutorialId.Length > 128) throw new ArgumentException("Tutorial ID required.");
            return new RecordingState { TutorialId = tutorialId };
        }
    }

    public sealed class RecordingTransition
    {
        public RecordingState State { get; }
        public ReadOnlyCollection<RecordingEffect> Effects { get; }
        // Take-relative timestamp for the observation that produced this transition, when it is admitted.
        public double? AdmitFrameAtMs { get; }
        public bool DiscardPendingTake { get; }
        // A new tutorial owns no earlier takes; the buffer and the committed takes both go.
        public bool ClearCommittedTakes { get; }
        public TakeCommit Commit { get; }
        internal RecordingTransition(RecordingState state, List<RecordingEffect> effects, double? admitFrameAtMs,
            bool discardPendingTake, bool clearCommittedTakes, TakeCommit commit)
        { State = state; Effects = effects.AsReadOnly(); AdmitFrameAtMs = admitFrameAtMs; DiscardPendingTake = discardPendingTake; ClearCommittedTakes = clearCommittedTakes; Commit = commit; }
    }
}
