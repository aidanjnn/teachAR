using System;
using System.Collections.Generic;
using System.Numerics;

namespace Trail.Motion
{
    // Pure authoring reducer for U2 (tutorial save position) and U3 (clean take lifecycle).
    // No clocks, timers, device APIs, callbacks, I/O or static mutable state: the caller supplies
    // the time and the fresh workspace-space observation, exactly as GuideReducer does. This never
    // judges a learner and never completes a guide step.
    public static class RecordingDirector
    {
        public static RecordingTransition Reduce(RecordingPolicy policy, RecordingState previous, RecordingInput input)
        {
            if (policy == null || previous == null || input == null) throw new ArgumentNullException();
            var effects = new List<RecordingEffect>();
            var s = previous.Clone();
            double? admit = null; var discard = false; var clear = false; TakeCommit commit = null;
            void Emit(RecordingEffectKind kind, string notice) { s.Notice = notice; effects.Add(new RecordingEffect(kind, s, notice)); }
            void Refuse(string notice) { s.Notice = notice; effects.Add(new RecordingEffect(RecordingEffectKind.ActionRefused, s, notice)); }
            void ClearAnchor() { s.AnchorLeft = null; s.AnchorRight = null; s.AnchorMs = -1; }
            void ClearEndpoint() { s.StillLeft = null; s.StillRight = null; s.StillStartMs = null; s.ReturnStartMs = null; s.EndpointCandidateMs = null; }
            void ResetTake()
            {
                s.TakeMs = 0; s.FrameCount = 0; s.Armed = false; s.LastFrameMs = double.NegativeInfinity;
                s.SampleMs = -1; s.Sequence = -1;
                s.PausedLeft = null; s.PausedRight = null; s.LastPalmLeft = null; s.LastPalmRight = null;
                ClearEndpoint();
            }
            bool InTake() => s.Phase == RecordingPhase.Arming || s.Phase == RecordingPhase.Recording || s.Phase == RecordingPhase.Paused;
            RecordingPhase Resting() => s.SavePosition == null ? RecordingPhase.Idle : RecordingPhase.Ready;
            void PauseTake(string notice)
            {
                s.PausedLeft = s.LastPalmLeft; s.PausedRight = s.LastPalmRight;
                ClearEndpoint(); s.SampleMs = -1; s.Phase = RecordingPhase.Paused;
                Emit(RecordingEffectKind.TakePaused, notice);
            }
            void Abandon(string notice)
            {
                discard = true; s.ReplaceIndex = null;
                Emit(RecordingEffectKind.TakeDiscarded, notice);
                s.TakeGeneration++; ResetTake(); s.Phase = Resting();
            }
            void CommitTake(TakeTrim trim, string reason)
            {
                // A take that never produced consecutive fresh motion is not saveable, trimmed or not.
                if (s.FrameCount < 2 || s.TakeMs < policy.MinimumTakeMs)
                { Refuse("Record more of the action before saving this take."); return; }
                commit = new TakeCommit(s.ReplaceIndex, trim, reason);
                s.LastTakeIndex = s.ReplaceIndex ?? s.TakeCount;
                if (!s.ReplaceIndex.HasValue) s.TakeCount++;
                Emit(RecordingEffectKind.TakeCommitted, trim == null
                    ? "Full take saved. Review it before approving; motion proximity is not a verified physical result."
                    : "Take saved at the held endpoint; the return to the save position was trimmed off.");
                s.ReplaceIndex = null; s.TakeGeneration++; ResetTake(); s.Phase = RecordingPhase.Reviewing;
            }
            void Invalidate(string notice)
            {
                s.Calibrated = false;
                if (InTake()) Abandon("Tracking origin invalidated; the in-progress take was discarded. Saved takes are unchanged.");
                ClearAnchor(); ClearEndpoint(); s.SampleMs = -1; s.Sequence = -1;
                s.Phase = s.Phase == RecordingPhase.ChoosingSaveZone ? s.ReturnPhase : Resting();
                Emit(RecordingEffectKind.TrackingInvalidated, notice);
            }

            // Bad caller time never earns dwell and never moves the monotonic watermark backwards.
            if (!GuideValidation.Finite(input.NowMs) || input.NowMs < 0 || input.NowMs < s.NowMs)
            {
                if (s.Phase == RecordingPhase.Recording) PauseTake("Clock discontinuity; recording paused.");
                else if (s.Phase == RecordingPhase.ChoosingSaveZone) ClearAnchor();
                return new RecordingTransition(s, effects, admit, discard, clear, commit);
            }
            s.NowMs = input.NowMs;
            switch (input.Action)
            {
                case RecordingAction.NewTutorial:
                    if (string.IsNullOrWhiteSpace(input.TutorialId) || input.TutorialId.Length > 128)
                    { Refuse("A tutorial ID of 1-128 characters is required."); break; }
                    discard = true; clear = true;
                    s.TutorialId = input.TutorialId; s.SavePosition = null; s.TakeCount = 0; s.LastTakeIndex = -1;
                    s.ReplaceIndex = null; s.TakeGeneration++; ResetTake(); ClearAnchor();
                    s.Phase = RecordingPhase.Idle; s.ReturnPhase = RecordingPhase.Idle;
                    Emit(RecordingEffectKind.SaveZoneCleared, "New tutorial. Choose a save position once before recording.");
                    break;
                case RecordingAction.Calibrated:
                    if (input.OriginRevision < 0) { Refuse("A non-negative origin revision is required."); break; }
                    if (InTake()) Abandon("Workspace re-registered; the in-progress take was discarded. Saved takes are unchanged.");
                    s.Calibrated = true; s.OriginRevision = input.OriginRevision;
                    s.SampleMs = -1; s.Sequence = -1; ClearAnchor(); ClearEndpoint();
                    // The save position is workspace-relative, so re-registering the same mat keeps it.
                    if (s.Phase == RecordingPhase.ChoosingSaveZone) s.ArmedAtMs = s.NowMs;
                    else s.Phase = Resting();
                    s.Notice = s.SavePosition == null
                        ? "Workspace registered. Choose a save position once for this tutorial."
                        : "Workspace registered. The tutorial save position moved with the workspace.";
                    break;
                case RecordingAction.OriginInvalidated:
                    Invalidate("Recalibrate the workspace before recording. The tutorial save position is kept in workspace coordinates.");
                    break;
                case RecordingAction.BeginSaveZone:
                    if (InTake()) { Refuse("Finish or discard the current take before changing the save position."); break; }
                    if (s.Phase != RecordingPhase.ChoosingSaveZone) s.ReturnPhase = s.Phase;
                    s.Phase = RecordingPhase.ChoosingSaveZone; s.ArmedAtMs = s.NowMs;
                    ClearAnchor(); s.SampleMs = -1; s.Sequence = -1;
                    Emit(RecordingEffectKind.SaveZoneCaptureStarted, "Rest both hands away from the action, then hold still. This spot is reused by every take.");
                    break;
                case RecordingAction.CancelSaveZone:
                    if (s.Phase != RecordingPhase.ChoosingSaveZone) { Refuse("No save position capture is active."); break; }
                    ClearAnchor();
                    s.Phase = s.ReturnPhase == RecordingPhase.ChoosingSaveZone ? Resting() : s.ReturnPhase;
                    Emit(RecordingEffectKind.SaveZoneCaptureCancelled, s.SavePosition == null
                        ? "Cancelled. Choose a save position before recording."
                        : "Cancelled. The configured save position is unchanged.");
                    break;
                case RecordingAction.StartTake:
                case RecordingAction.ReRecordTake:
                {
                    if (s.Phase != RecordingPhase.Ready && s.Phase != RecordingPhase.Reviewing)
                    { Refuse("Finish or discard the current take before starting another."); break; }
                    if (!s.Calibrated) { Refuse("Register the workspace before recording."); break; }
                    if (s.SavePosition == null) { Refuse("Choose the tutorial save position before recording."); break; }
                    var replace = input.Action == RecordingAction.ReRecordTake;
                    if (replace && (input.TakeIndex < 0 || input.TakeIndex >= s.TakeCount))
                    { Refuse("Choose an existing take to re-record."); break; }
                    if (!replace && s.TakeCount >= policy.MaximumTakes)
                    { Refuse("This tutorial already holds the maximum number of takes."); break; }
                    discard = true; ResetTake();
                    s.ReplaceIndex = replace ? (int?)input.TakeIndex : null;
                    s.TakeGeneration++; s.ArmedAtMs = s.NowMs; s.Phase = RecordingPhase.Arming;
                    // Nothing is recorded during the countdown, so reaching for the control stays out of the take.
                    Emit(RecordingEffectKind.TakeArmed, "Recording starts once both hands are in position; move away from the controls.");
                    break;
                }
                case RecordingAction.Pause:
                    if (s.Phase != RecordingPhase.Recording) { Refuse("Recording is not active."); break; }
                    PauseTake("Paused. Return both tracked hands to their paused positions before resuming.");
                    break;
                case RecordingAction.Resume:
                {
                    if (s.Phase != RecordingPhase.Paused) { Refuse("Recording is not paused."); break; }
                    var resumed = input.Observation;
                    if (!Fresh(policy, s, resumed)) { Refuse("Fresh hand tracking is required before resuming."); break; }
                    if (!Returned(policy, s.PausedLeft, HandPalm.Point(resumed.Left)) ||
                        !Returned(policy, s.PausedRight, HandPalm.Point(resumed.Right)))
                    { Refuse("Return both tracked hands near their paused positions before resuming."); break; }
                    s.SampleMs = -1; s.Phase = RecordingPhase.Recording; ClearEndpoint();
                    Emit(RecordingEffectKind.TakeResumed, "Recording resumed. Paused time is not part of this take.");
                    break;
                }
                case RecordingAction.DiscardTake:
                    if (!InTake()) { Refuse("No take is in progress."); break; }
                    Abandon("Take discarded. Previously saved takes are unchanged.");
                    break;
                case RecordingAction.SaveAtEndpoint:
                    if (s.Phase != RecordingPhase.Recording && s.Phase != RecordingPhase.Paused)
                    { Refuse("No take is recording."); break; }
                    if (!s.EndpointCandidateMs.HasValue)
                    { Refuse("Hold the finished pose away from the save position, or choose Stop to keep the full take."); break; }
                    CommitTake(new TakeTrim(0, s.EndpointCandidateMs.Value), "endpoint-hold");
                    break;
                case RecordingAction.StopFullTake:
                    if (s.Phase != RecordingPhase.Recording && s.Phase != RecordingPhase.Paused)
                    { Refuse("No take is recording."); break; }
                    CommitTake(null, "explicit-stop");
                    break;
                case RecordingAction.ApproveTake:
                    if (s.Phase != RecordingPhase.Reviewing) { Refuse("No take is awaiting review."); break; }
                    s.Phase = RecordingPhase.Ready;
                    Emit(RecordingEffectKind.TakeApproved, "Take approved. Record the next action from the same save position.");
                    break;
                case RecordingAction.Tick:
                    if (s.Phase == RecordingPhase.Recording && (s.SampleMs < 0 || s.NowMs - s.SampleMs > policy.StallMs))
                        PauseTake("Tracking updates stalled; recording paused. Resume when both hands are back in position.");
                    else if (s.Phase == RecordingPhase.ChoosingSaveZone && s.AnchorMs >= 0 && s.NowMs - s.SampleMs > policy.StallMs)
                        ClearAnchor();
                    break;
                case RecordingAction.Sample:
                {
                    var o = input.Observation;
                    if (s.Calibrated && o != null && o.OriginRevision != s.OriginRevision)
                    { Invalidate("Tracking origin changed; recalibrate the workspace before recording."); break; }
                    if (s.Phase != RecordingPhase.ChoosingSaveZone && s.Phase != RecordingPhase.Arming && s.Phase != RecordingPhase.Recording) break;
                    if (!Fresh(policy, s, o)) { ClearAnchor(); ClearEndpoint(); break; }
                    var delta = s.SampleMs < 0 ? 0 : o.TimestampMs - s.SampleMs;
                    if (s.SampleMs >= 0 && delta > policy.StallMs)
                    {
                        if (s.Phase == RecordingPhase.Recording)
                        { s.SampleMs = o.TimestampMs; s.Sequence = o.Sequence; PauseTake("Tracking updates stalled; recording paused."); break; }
                        ClearAnchor();
                    }
                    s.SampleMs = o.TimestampMs; s.Sequence = o.Sequence;
                    var left = HandPalm.Point(o.Left); var right = HandPalm.Point(o.Right);
                    if (s.Phase == RecordingPhase.ChoosingSaveZone)
                    {
                        // The explicit request plus this countdown is what stops accidental dwell from
                        // silently becoming a tutorial-wide save position.
                        if (s.NowMs - s.ArmedAtMs < policy.SaveZoneArmMs) { ClearAnchor(); break; }
                        if (!left.HasValue || !right.HasValue)
                        { ClearAnchor(); s.Notice = "Both hands must be visible in their resting spot."; break; }
                        if (!s.AnchorLeft.HasValue ||
                            Vector3.Distance(left.Value, s.AnchorLeft.Value) > policy.SaveZoneJitterM ||
                            Vector3.Distance(right.Value, s.AnchorRight.Value) > policy.SaveZoneJitterM)
                        { s.AnchorLeft = left; s.AnchorRight = right; s.AnchorMs = o.TimestampMs; break; }
                        if (o.TimestampMs - s.AnchorMs < policy.SaveZoneHoldMs) break;
                        s.SavePosition = new SaveZone(s.AnchorLeft.Value, s.AnchorRight.Value);
                        ClearAnchor();
                        s.Phase = s.ReturnPhase == RecordingPhase.ChoosingSaveZone || s.ReturnPhase == RecordingPhase.Idle
                            ? RecordingPhase.Ready : s.ReturnPhase;
                        Emit(RecordingEffectKind.SaveZoneChanged, "Save position set for this tutorial. Return both hands here after each action.");
                        break;
                    }
                    if (s.Phase == RecordingPhase.Arming)
                    {
                        if (s.NowMs - s.ArmedAtMs < policy.TakeArmMs) break;
                        if (!left.HasValue || !right.HasValue) { s.Notice = "Show both hands to begin recording."; break; }
                        s.Phase = RecordingPhase.Recording; s.TakeMs = 0; s.FrameCount = 0;
                        s.LastFrameMs = double.NegativeInfinity; s.Armed = false; ClearEndpoint();
                        Emit(RecordingEffectKind.TakeStarted, "Recording. Hold the starting pose briefly, perform the action, hold the finished pose, then return both hands to the save position.");
                    }
                    else s.TakeMs += delta;
                    if (s.TakeMs - s.LastFrameMs >= policy.FramePeriodMs)
                    { admit = s.TakeMs; s.LastFrameMs = s.TakeMs; s.FrameCount++; }
                    s.LastPalmLeft = left; s.LastPalmRight = right;
                    // A missing hand stays missing in the take; it simply cannot earn endpoint evidence.
                    if (!left.HasValue || !right.HasValue) { ClearEndpoint(); break; }
                    var distance = s.SavePosition.DistanceM(left.Value, right.Value);
                    if (distance > policy.ArmDistanceM) s.Armed = true;
                    if (!s.Armed) break;
                    var atHome = distance < policy.HomeRadiusM;
                    if (!atHome && distance > policy.AwayRadiusM)
                    {
                        if (!s.StillLeft.HasValue ||
                            Vector3.Distance(left.Value, s.StillLeft.Value) > policy.EndpointJitterM ||
                            Vector3.Distance(right.Value, s.StillRight.Value) > policy.EndpointJitterM)
                        { s.StillLeft = left; s.StillRight = right; s.StillStartMs = s.TakeMs; }
                        else if (s.TakeMs - s.StillStartMs.Value >= policy.EndpointStillMs && s.TakeMs >= policy.MinimumTakeMs)
                        {
                            var first = !s.EndpointCandidateMs.HasValue;
                            s.EndpointCandidateMs = s.TakeMs;
                            if (first) Emit(RecordingEffectKind.EndpointHoldDetected, "Endpoint held. Return both hands to the save position to save this take.");
                        }
                    }
                    else { s.StillLeft = null; s.StillRight = null; s.StillStartMs = null; }
                    if (s.EndpointCandidateMs.HasValue && s.TakeMs - s.EndpointCandidateMs.Value > policy.EndpointExpiryMs)
                        s.EndpointCandidateMs = null;
                    if (atHome && s.EndpointCandidateMs.HasValue)
                    {
                        if (!s.ReturnStartMs.HasValue) s.ReturnStartMs = s.TakeMs;
                        if (s.TakeMs - s.ReturnStartMs.Value >= policy.ReturnHoldMs)
                            CommitTake(new TakeTrim(0, s.EndpointCandidateMs.Value), "endpoint-hold-return");
                    }
                    else s.ReturnStartMs = null;
                    break;
                }
            }
            return new RecordingTransition(s, effects, admit, discard, clear, commit);
        }

        // Only consecutive fresh samples from the declared source count. Duplicates, replays,
        // future stamps and stale callbacks earn nothing.
        private static bool Fresh(RecordingPolicy policy, RecordingState s, ReferenceObservation o) =>
            o != null && o.Source == policy.Source && GuideValidation.Finite(o.TimestampMs) && o.TimestampMs >= 0 &&
            o.Sequence > s.Sequence && o.TimestampMs > s.SampleMs &&
            o.TimestampMs <= s.NowMs && s.NowMs - o.TimestampMs <= policy.StallMs;

        // A hand that was already untracked when the take paused places no constraint on resuming.
        private static bool Returned(RecordingPolicy policy, Vector3? paused, Vector3? live) =>
            !paused.HasValue || (live.HasValue && Vector3.Distance(paused.Value, live.Value) <= policy.ResumeRadiusM);
    }
}
