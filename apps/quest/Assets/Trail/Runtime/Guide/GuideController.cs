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
        public Func<double> Clock { get; set; } = () => MotionClock.NowMs;
        public GhostPresentation Ghost;
        public GuideSession Session { get; private set; }
        public string Status { get; private set; } = "Preload a reviewed tutorial to guide.";
        public string LastCompletion { get; private set; } = "";
        public string ExpertSource => recording?.Source ?? "not loaded";
        // Learner-facing stage derived from the reducer's phase. Display only: it never advances a step.
        public string PhaseLabel => Label(Session == null ? GuidePhase.Preload : Session.State.Phase);
        public event Action<GuideEvent> Telemetry;
        public event Action<GuideTransition> Transitioned;
        private CaptureReplaySession subscribed;
        private Tutorial tutorial;
        private Recording recording;
        private MotionReplay replay;
        private GuideTelemetry telemetry;
        private double demoStartedMs, lastSnapshotMs;
        private int demoRevision;
        private GuidePhase? publishedPhase;
        private int publishedRevision = -1;
        private readonly Queue<GuideAction> actions = new Queue<GuideAction>();
        private readonly List<GhostGuideHand> ghostHands = new List<GhostGuideHand>(2);
        private List<int>[] cueFrames;
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
        public void Preload(Tutorial readyTutorial, Recording sourceRecording, string verifiedRecordingHash, string pairedSessionId)
        {
            if (Capture == null || Capture.Source == null || Ghost == null) throw new InvalidOperationException("Capture, hand source and ghost must be bound before preload.");
            // Clone at the trust boundary: caller DTO mutations cannot change an in-progress guide.
            var loadedTutorial = ContractJson.ParseTutorial(ContractJson.SerializeTutorial(readyTutorial));
            var loadedRecording = ContractJson.ParseRecording(ContractJson.SerializeRecording(sourceRecording));
            // The source gate describes the learner's bound input, not the expert recording.
            // A synthetic expert may be followed with native hands without relabelling its provenance.
            var definition = GuideTutorialAdapter.Create(loadedTutorial, loadedRecording, verifiedRecordingHash,
                Capture.Source.SourceKind == "live" ? GuideSource.NativeHands : GuideSource.SyntheticDiagnostic);
            if (definition.Steps.Any(s => s.Targets.Any(t => t.Gesture != GuideGesture.Any)))
                throw new NotSupportedException("Pinch/open matcher needs a device-validated gesture adapter. Review this tutorial with gesture any.");
            if (Session != null) Session.Transitioned -= OnTransition;
            Ghost.ClearGuideFrame(); actions.Clear(); cueFrames = null; LastCompletion = ""; publishedPhase = null; publishedRevision = -1;
            tutorial = loadedTutorial; recording = loadedRecording; replay = new MotionReplay(recording);
            Session = new GuideSession(definition, Guid.NewGuid().ToString("N"));
            telemetry = new GuideTelemetry(pairedSessionId, Clock());
            Session.Transitioned += OnTransition;
            Bind();
            Capture.LoadRecording(recording); // Requires the learner's independent calibration; its own invalidation is absorbed by the Preload phase.
            Session.Dispatch(new GuideInput(GuideAction.Preloaded, Clock()));
            Status = "Preloaded locally. Calibrate the learner workspace.";
        }
        private void Calibrated(CalibrationRegistration registration, int revision)
        {
            if (Session == null || registration == null || Capture.Source == null) return;
            Session.Dispatch(new GuideInput(GuideAction.Calibrated, Clock(), trackingSessionId: Capture.Source.TrackingSessionId, originRevision: revision));
        }
        private void Invalidated(string reason, int revision)
        {
            actions.Clear(); Ghost?.ClearGuideFrame();
            if (Session != null) Session.Invalidate(Clock());
        }
        private void Observe(ReferenceObservation observation)
        {
            if (Session == null || Capture.Source == null) return;
            if (Capture.IsRecording) { Session.Pause(Clock()); return; }
            var source = observation.Source == "live" ? GuideSource.NativeHands : GuideSource.SyntheticDiagnostic;
            Session.Dispatch(new GuideInput(GuideAction.Sample, Clock(),
                new GuideObservation(observation.TimestampMs, observation.Sequence, observation.OriginRevision, Capture.Source.TrackingSessionId, source,
                    Wrist(observation.Left), Wrist(observation.Right))));
        }
        private static CanonicalPose? Wrist(HandSample hand) => hand != null && hand.Status == "valid" && hand.Joints != null && hand.Joints.TryGetValue("wrist", out var pose) ? pose : (CanonicalPose?)null;
        // Re-pairing changes transport identity only. An open guide survives backend restarts.
        public void RebindTelemetrySession(string pairedSessionId)
        {
            if (Session == null || telemetry == null) return;
            telemetry.RebindSession(pairedSessionId);
            lastSnapshotMs = Clock();
            Publish(telemetry.SnapshotEvent(Session, lastSnapshotMs));
        }
        // Inspection calls this on the main thread, outside Transitioned callbacks.
        // The returned event is the exact locally paused acknowledgment, using the shared sequence.
        public GuideEvent PauseForInspection()
        {
            if (Session == null || Session.State.Phase == GuidePhase.Preload || Session.State.Phase == GuidePhase.Calibrate || Session.State.Phase == GuidePhase.Complete)
                throw new InvalidOperationException("An active calibrated guide is required for inspection.");
            actions.Clear();
            var now = Clock();
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
            var now = Clock();
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
                else ShowStep(step, replay.Sample(positionMs), null);
            }
            else if (state.Phase == GuidePhase.WaitingStart) ShowStep(step, recording.Frames[step.StartFrame], null);
            else if (state.Phase == GuidePhase.Guiding || state.Phase == GuidePhase.Holding) ShowStep(step, null, state.CueProgress);
            else Ghost.ClearGuideFrame();
            if (now - lastSnapshotMs >= 100) { lastSnapshotMs = now; Publish(telemetry.SnapshotEvent(Session, now)); }
        }
        // One ghost frame per required hand: a shared demonstration frame, or each hand's own cue frame.
        // Presentation only; the reducer alone decides progression from fresh observations.
        private void ShowStep(TutorialStep step, MotionFrame shared, IReadOnlyList<int> cueProgress)
        {
            ghostHands.Clear();
            for (var i = 0; i < step.Targets.Length; i++)
            {
                var target = step.Targets[i];
                ghostHands.Add(new GhostGuideHand(target.Side, cueProgress == null ? shared : recording.Frames[CueFrame(step, cueProgress, i)],
                    target.CheckpointPose, target.PositionToleranceM));
            }
            Ghost.ShowGuideHands(ghostHands);
        }
        // Bounded visual lookahead; never feeds back into observations or gates. A hand the demonstration
        // never tracked falls back to the start frame, where it stays hidden rather than inventing motion.
        private int CueFrame(TutorialStep step, IReadOnlyList<int> cueProgress, int target)
        {
            var frames = cueFrames == null || target >= cueFrames.Length ? null : cueFrames[target];
            return frames == null || frames.Count == 0 ? step.StartFrame : frames[Math.Min(frames.Count - 1, cueProgress[target] + 2)];
        }
        private static string Label(GuidePhase phase)
        {
            switch (phase)
            {
                case GuidePhase.Showing: return "Watch";
                case GuidePhase.WaitingStart: return "Get ready";
                case GuidePhase.Guiding: case GuidePhase.Holding: return "Your turn";
                case GuidePhase.TrackingLost: return "Reacquiring";
                case GuidePhase.Paused: return "Paused";
                case GuidePhase.Complete: return "Check result";
                case GuidePhase.Calibrate: return "Calibrate";
                default: return "Preload";
            }
        }
        private void OnTransition(GuideTransition transition)
        {
            Status = Label(transition.State.Phase) + " • " + transition.State.Notice;
            foreach (var effect in transition.Effects)
            {
                if (effect.Kind == GuideEffectKind.StopFeedback) Ghost.ClearGuideFrame();
                if (effect.Kind == GuideEffectKind.ShowDemonstration)
                {
                    Capture.StopReplay(); demoStartedMs = Clock(); demoRevision = transition.State.StepRevision;
                    var step = tutorial.Steps[transition.State.StepIndex];
                    cueFrames = step.Targets.Select(target => Enumerable.Range(step.StartFrame, step.EndFrameExclusive - step.StartFrame)
                        .Where(i => (target.Side == "left" ? recording.Frames[i].Hands.Left : recording.Frames[i].Hands.Right).Status == "valid").ToList()).ToArray();
                }
                if (effect.Kind == GuideEffectKind.MovementCheckpointReached || effect.Kind == GuideEffectKind.UserConfirmed)
                    {
                    LastCompletion = effect.Kind == GuideEffectKind.UserConfirmed ? "Step completed by user confirmation." : "Movement checkpoint reached.";
                    Publish(telemetry.CompletionEvent(Session, effect, Clock()));
                }
            }
            if (publishedPhase != transition.State.Phase || publishedRevision != transition.State.StepRevision)
            {
                publishedPhase = transition.State.Phase; publishedRevision = transition.State.StepRevision;
                lastSnapshotMs = Clock(); Publish(telemetry.SnapshotEvent(Session, lastSnapshotMs));
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
            if (Session != null) Session.Invalidate(Clock());
        }
        private void OnApplicationPause(bool paused) { if (paused) Suspend(); }
        private void OnApplicationFocus(bool focused) { if (!focused) Suspend(); }
        private void OnDisable() { Suspend(); Unbind(); }
        private void OnDestroy() { if (Session != null) Session.Transitioned -= OnTransition; }
    }
}
