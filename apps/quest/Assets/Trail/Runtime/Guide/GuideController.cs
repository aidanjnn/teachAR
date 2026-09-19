using System;
using System.Collections.Generic;
using System.Linq;
using Trail.Contracts;
using Trail.Motion;
using Trail.Presentation;
using Trail.Runtime.Record;
using UnityEngine;

namespace Trail.Runtime.Guide
{
    // One native guide owner. UI invokes local actions; observers receive telemetry only.
    public sealed class GuideController : MonoBehaviour
    {
        public CaptureReplaySession Capture;
        public GhostPresentation Ghost;
        public GuideSession Session { get; private set; }
        public string Status { get; private set; } = "Preload a reviewed tutorial to guide.";
        public string LastCompletion { get; private set; } = "";
        public event Action<GuideEvent> Telemetry;
        public event Action<GuideTransition> Transitioned;
        private CaptureReplaySession subscribed;
        private Tutorial tutorial;
        private Recording recording;
        private MotionReplay replay;
        private GuideTelemetry telemetry;
        private double demoStartedMs, lastSnapshotMs;
        private int demoRevision;
        private readonly Queue<GuideAction> actions = new Queue<GuideAction>();
        private List<int> cueFrames;
        private void OnEnable() => Bind();
        public void Bind()
        {
            if (Capture == subscribed) return;
            Unbind(); subscribed = Capture;
            if (subscribed == null) return;
            subscribed.WorkspaceObserved += Observe;
            subscribed.CalibrationChanged += Calibrated;
            subscribed.Invalidated += Invalidated;
        }
        private void Unbind()
        {
            if (subscribed == null) return;
            subscribed.WorkspaceObserved -= Observe; subscribed.CalibrationChanged -= Calibrated; subscribed.Invalidated -= Invalidated; subscribed = null;
        }
        public void Preload(Tutorial readyTutorial, Recording sourceRecording, string verifiedRecordingHash, string pairedSessionId, bool syntheticDiagnostic = false)
        {
            if (Capture == null || Ghost == null) throw new InvalidOperationException("Capture and ghost must be bound before preload.");
            // Clone at the trust boundary: caller DTO mutations cannot change an in-progress guide.
            var loadedTutorial = ContractJson.ParseTutorial(ContractJson.SerializeTutorial(readyTutorial));
            var loadedRecording = ContractJson.ParseRecording(ContractJson.SerializeRecording(sourceRecording));
            var definition = GuideTutorialAdapter.Create(loadedTutorial, loadedRecording, verifiedRecordingHash,
                syntheticDiagnostic ? GuideSource.SyntheticDiagnostic : GuideSource.NativeHands);
            if (definition.Steps.Any(s => s.Targets.Any(t => t.Gesture != GuideGesture.Any)))
                throw new NotSupportedException("Pinch/open matcher needs a device-validated gesture adapter. Review this tutorial with gesture any.");
            if (Session != null) Session.Transitioned -= OnTransition;
            Ghost.ClearGuideFrame(); actions.Clear(); LastCompletion = "";
            tutorial = loadedTutorial; recording = loadedRecording; replay = new MotionReplay(recording);
            Session = new GuideSession(definition, Guid.NewGuid().ToString("N"));
            telemetry = new GuideTelemetry(pairedSessionId, MotionClock.NowMs);
            Session.Transitioned += OnTransition;
            Session.Dispatch(new GuideInput(GuideAction.Preloaded, MotionClock.NowMs));
            Bind();
            Capture.LoadRecording(recording); // Requires the learner's independent calibration.
            Status = "Preloaded locally. Calibrate the learner workspace.";
        }
        private void Calibrated(CalibrationRegistration registration, int revision)
        {
            if (Session == null || registration == null || Capture.Source == null) return;
            Session.Dispatch(new GuideInput(GuideAction.Calibrated, MotionClock.NowMs, trackingSessionId: Capture.Source.TrackingSessionId, originRevision: revision));
        }
        private void Invalidated(string reason, int revision)
        {
            actions.Clear(); Ghost?.ClearGuideFrame();
            if (Session != null) Session.Invalidate(MotionClock.NowMs);
        }
        private void Observe(ReferenceObservation observation)
        {
            if (Session == null || Capture.Source == null) return;
            if (Capture.IsRecording) { Session.Pause(MotionClock.NowMs); return; }
            var source = observation.Source == "live" ? GuideSource.NativeHands : GuideSource.SyntheticDiagnostic;
            Session.Dispatch(new GuideInput(GuideAction.Sample, MotionClock.NowMs,
                new GuideObservation(observation.TimestampMs, observation.Sequence, observation.OriginRevision, Capture.Source.TrackingSessionId, source,
                    Wrist(observation.Left), Wrist(observation.Right))));
        }
        private static CanonicalPose? Wrist(HandSample hand) => hand != null && hand.Status == "valid" && hand.Joints != null && hand.Joints.TryGetValue("wrist", out var pose) ? pose : (CanonicalPose?)null;
        // Inspection calls this on the main thread, outside Transitioned callbacks.
        // The returned event is the exact locally paused acknowledgment, using the shared sequence.
        public GuideEvent PauseForInspection()
        {
            if (Session == null || Session.State.Phase == GuidePhase.Preload || Session.State.Phase == GuidePhase.Calibrate || Session.State.Phase == GuidePhase.Complete)
                throw new InvalidOperationException("An active calibrated guide is required for inspection.");
            actions.Clear();
            var now = MotionClock.NowMs;
            Session.Pause(now);
            var acknowledgment = telemetry.SnapshotEvent(Session, now);
            Publish(acknowledgment);
            return acknowledgment;
        }
        public void StartStep() => Queue(GuideAction.ExplicitStart);
        public void Repeat() => Queue(GuideAction.Repeat);
        public void Pause() => Queue(GuideAction.Pause);
        public void Resume() => Queue(GuideAction.Resume);
        public void ConfirmStep() => Queue(GuideAction.Confirm);
        private void Queue(GuideAction action) { if (Session != null && actions.Count < 16) actions.Enqueue(action); }
        private void Update()
        {
            Bind(); if (Session == null) return;
            var now = MotionClock.NowMs;
            while (actions.Count > 0) Session.Dispatch(new GuideInput(actions.Dequeue(), now));
            if (Capture.IsRecording) Session.Pause(now);
            Session.Dispatch(new GuideInput(GuideAction.Tick, now));
            var state = Session.State; var step = tutorial.Steps[state.StepIndex];
            if (state.Phase == GuidePhase.Showing)
            {
                var startMs = recording.Frames[step.StartFrame].TMs;
                var endMs = recording.Frames[step.EndFrameExclusive - 1].TMs;
                var positionMs = startMs + Math.Max(0, now - demoStartedMs);
                if (positionMs >= endMs && state.StepRevision == demoRevision)
                    Session.Dispatch(new GuideInput(GuideAction.DemonstrationFinished, now));
                else Ghost.ShowGuideFrame(replay.Sample(positionMs), step.Targets[0].CheckpointPose);
            }
            else if (state.Phase == GuidePhase.WaitingStart)
                Ghost.ShowGuideFrame(recording.Frames[step.StartFrame], step.Targets[0].CheckpointPose);
            else if (state.Phase == GuidePhase.Guiding || state.Phase == GuidePhase.Holding)
            {
                // Bounded visual lookahead; never feeds back into observations or gates.
                var index = cueFrames[Math.Min(cueFrames.Count - 1, state.CueProgress[0] + 2)];
                Ghost.ShowGuideFrame(recording.Frames[index], step.Targets[0].CheckpointPose);
            }
            else Ghost.ClearGuideFrame();
            if (now - lastSnapshotMs >= 100) { lastSnapshotMs = now; Publish(telemetry.SnapshotEvent(Session, now)); }
        }
        private void OnTransition(GuideTransition transition)
        {
            Status = transition.State.Notice;
            foreach (var effect in transition.Effects)
            {
                if (effect.Kind == GuideEffectKind.StopFeedback) Ghost.ClearGuideFrame();
                if (effect.Kind == GuideEffectKind.ShowDemonstration)
                {
                    Capture.StopReplay(); demoStartedMs = MotionClock.NowMs; demoRevision = transition.State.StepRevision;
                    var step = tutorial.Steps[transition.State.StepIndex]; Capture.UseLeftHand = step.Targets[0].Side == "left";
                    cueFrames = Enumerable.Range(step.StartFrame, step.EndFrameExclusive - step.StartFrame)
                        .Where(i => (Capture.UseLeftHand ? recording.Frames[i].Hands.Left : recording.Frames[i].Hands.Right).Status == "valid").ToList();
                }
                if (effect.Kind == GuideEffectKind.MovementCheckpointReached || effect.Kind == GuideEffectKind.UserConfirmed)
                    {
                    LastCompletion = effect.Kind == GuideEffectKind.UserConfirmed ? "Step completed by user confirmation." : "Movement checkpoint reached.";
                    Publish(telemetry.CompletionEvent(Session, effect, MotionClock.NowMs));
                }
            }
            if (Transitioned != null)
                foreach (Action<GuideTransition> listener in Transitioned.GetInvocationList())
                    try { listener(transition); } catch (Exception) { Debug.LogWarning("Trail guide observer unavailable."); }
        }
        private void Publish(GuideEvent guideEvent)
        {
            // A disconnected/misbehaving optional observer cannot stop local progression.
            if (Telemetry == null) return;
            foreach (Action<GuideEvent> listener in Telemetry.GetInvocationList())
                try { listener(guideEvent); } catch (Exception) { Debug.LogWarning("Trail guide telemetry observer unavailable."); }
        }
        private void Suspend()
        {
            actions.Clear(); Ghost?.ClearGuideFrame();
            if (Session != null) Session.Invalidate(MotionClock.NowMs);
        }
        private void OnApplicationPause(bool paused) { if (paused) Suspend(); }
        private void OnApplicationFocus(bool focused) { if (!focused) Suspend(); }
        private void OnDisable() { Suspend(); Unbind(); }
        private void OnDestroy() { if (Session != null) Session.Transitioned -= OnTransition; }
    }
}
