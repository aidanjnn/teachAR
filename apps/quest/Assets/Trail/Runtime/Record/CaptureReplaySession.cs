using System;
using Trail.Contracts;
using Trail.Motion;
using UnityEngine;
using NVector3 = System.Numerics.Vector3;

namespace Trail.Runtime.Record
{
    public sealed class CaptureReplaySession : MonoBehaviour
    {
        public HandObservationSource Source;
        public Func<double> Clock = () => MotionClock.NowMs;
        public float WidthM = .5f;
        public float DepthM = .35f;
        public string LayoutId = "mat-50x35-v1";
        public bool UseLeftHand;
        public CalibrationRegistration Registration { get; private set; }
        public int OriginRevision => Source == null ? 0 : Source.OriginRevision;
        public ReferenceObservation LatestWorkspaceObservation { get; private set; }
        public Recording LastRecording { get; private set; }
        public MotionFrame ReplayFrame { get; private set; }
        public string Status { get; private set; } = "Calibrate A, B, C, then independent mark D.";
        public string SourceLabel => Source == null ? "unavailable" : Source.SourceKind + ": " + Source.Availability;
        public double MarkProgress => markSampler.Progress;
        public bool IsRecording => capture != null;
        public bool IsReplaying => replaying;
        public event Action<ReferenceObservation> WorkspaceObserved;
        public event Action<CalibrationRegistration, int> CalibrationChanged;
        public event Action<string, int> Invalidated;
        public event Action<Recording> RecordingCompleted;
        private readonly StableMarkSampler markSampler = new StableMarkSampler();
        private readonly NVector3[] marks = new NVector3[4];
        private int markIndex;
        private bool collecting, replaying;
        private double lastObservationMs = -1, replayStartMs;
        private long lastSequence = -1;
        private MotionCapture capture;
        private MotionReplay replay;
        private HandObservationSource subscribedSource;
        private WorkspaceDefinition recordedWorkspace;
        private NativeCaptureSidecar captureMetadata, completedMetadata;
        public double CaptureStartedMs { get; private set; }
        // Storage binds the sidecar to its exact persisted bytes/assigned ID; no competing JSON format.
        public NativeCaptureSidecar CreateCaptureSidecar(string recordingId, string recordingHash)
        {
            if (completedMetadata == null) throw new InvalidOperationException("No completed native capture metadata.");
            completedMetadata.RecordingId = recordingId; completedMetadata.RecordingHash = recordingHash;
            return ContractJson.ParseNativeCaptureSidecar(ContractJson.SerializeNativeCaptureSidecar(completedMetadata));
        }

        private void OnEnable() => BindSource();
        public void BindSource()
        {
            if (subscribedSource == Source) return;
            if (subscribedSource != null) Invalidate("Hand source changed");
            Unbind(); subscribedSource = Source;
            if (subscribedSource == null) return;
            subscribedSource.Observed += Observe;
            subscribedSource.OriginInvalidated += HandleInvalidation;
        }
        private void Unbind()
        {
            if (subscribedSource != null) { subscribedSource.Observed -= Observe; subscribedSource.OriginInvalidated -= HandleInvalidation; }
            subscribedSource = null;
        }
        private void OnDisable() { Invalidate("Capture session disabled"); Unbind(); }
        private void OnApplicationPause(bool paused) { if (paused) Invalidate("Application suspended"); }
        private void OnApplicationFocus(bool focused) { if (!focused) Invalidate("Application lost focus"); }
        public void Invalidate(string reason)
        {
            if (Source != null)
            {
                Source.Invalidate(reason);
                if (Source != subscribedSource) HandleInvalidation(reason, Source.OriginRevision);
            }
            else HandleInvalidation(reason, 0);
        }
        private void HandleInvalidation(string reason, int revision)
        {
            Registration = null; LatestWorkspaceObservation = null; ReplayFrame = null;
            capture = null; replaying = false; collecting = false; markIndex = 0; markSampler.Reset();
            lastObservationMs = -1; lastSequence = -1;
            Status = reason + ". Recalibrate before capture or replay.";
            Invalidated?.Invoke(reason, revision);
        }
        public void BeginCalibration()
        {
            Invalidate("New registration");
            Status = "Touch A near-left with index tip, then select Sample mark. Hold still for 0.4 s.";
        }
        public void BeginMark()
        {
            if (markIndex >= 4 || Source == null || Source.TrackingSpace == null) return;
            collecting = true; markSampler.Reset(); Status = "Hold index tip on mark " + "ABCD"[markIndex] + ".";
        }
        private void Observe(ReferenceObservation observation)
        {
            if (Source == null || observation.OriginRevision != OriginRevision || observation.Sequence <= lastSequence ||
                observation.TimestampMs <= lastObservationMs || observation.TimestampMs > Clock() + 1 || Clock() - observation.TimestampMs > 100) return;
            lastSequence = observation.Sequence; lastObservationMs = observation.TimestampMs;
            if (collecting)
            {
                var hand = UseLeftHand ? observation.Left : observation.Right;
                NVector3? tip = hand.Status == "valid" && hand.Joints.TryGetValue("index-finger-tip", out var pose) ? pose.PositionM : (NVector3?)null;
                if (markSampler.Push(observation.TimestampMs, tip, out var point))
                {
                    marks[markIndex++] = point; collecting = false; markSampler.Reset();
                    if (markIndex < 4) Status = "Move to " + "ABCD"[markIndex] + "; select Sample mark. D is verification only.";
                    else
                    {
                        try
                        {
                            Registration = WorkspaceCalibration.Fit(WidthM, DepthM, marks[0], marks[1], marks[2], marks[3], NVector3.UnitY);
                            Status = "Registered. Independent D error: " + (Registration.HeldOutErrorM * 100).ToString("F1") + " cm.";
                            CalibrationChanged?.Invoke(Registration, OriginRevision);
                        }
                        catch (ArgumentException error) { Invalidate(error.Message); }
                    }
                }
            }
            if (Registration == null) return;
            var frame = MotionSamples.ToWorkspace(observation, Registration.ReferenceFromWorkspace);
            LatestWorkspaceObservation = new ReferenceObservation(observation.TimestampMs, observation.Sequence, OriginRevision,
                observation.Source, frame.Hands.Left, frame.Hands.Right);
            WorkspaceObserved?.Invoke(LatestWorkspaceObservation);
            if (capture != null)
            {
                capture.Append(observation);
                if (capture.IsFinished) StopRecording();
            }
        }
        private void Update()
        {
            BindSource();
            var now = Clock();
            if (collecting && (lastObservationMs < 0 || now - lastObservationMs > 100)) markSampler.Reset();
            if (LatestWorkspaceObservation != null && now - LatestWorkspaceObservation.TimestampMs > 100)
                LatestWorkspaceObservation = null;
            if (capture != null) { capture.Tick(now); if (capture.IsFinished) StopRecording(); }
            if (replaying)
            {
                var elapsed = now - replayStartMs;
                if (Registration == null || elapsed > replay.DurationMs) StopReplay();
                else ReplayFrame = replay.Sample(elapsed);
            }
        }
        public void StartRecording(double durationMs = 5000)
        {
            if (capture != null) { Status = "Recording is already active; stop before starting another capture."; return; }
            if (string.IsNullOrWhiteSpace(LayoutId) || LayoutId.Length > 124)
            { Status = "A layout ID of 1–124 characters is required."; return; }
            if (Registration == null || Source == null || LatestWorkspaceObservation == null ||
                Clock() - LatestWorkspaceObservation.TimestampMs > 100 ||
                (UseLeftHand ? LatestWorkspaceObservation.Left : LatestWorkspaceObservation.Right).Status != "valid")
            { Status = "Fresh hands and verified calibration are required."; return; }
            StopReplay();
            recordedWorkspace = MakeWorkspace();
            CaptureStartedMs = Clock();
            captureMetadata = new NativeCaptureSidecar { SchemaVersion = 1, TrackingSessionId = Source.TrackingSessionId,
                OriginRevision = OriginRevision, Provider = Source.ProviderId, EditorVersion = Application.unityVersion,
                SdkVersion = Source.SdkVersion, Skeleton = "openxr-26", AdapterVersion = Source.AdapterVersion,
                Clock = new ClockMapping { Source = "native-monotonic", OffsetToMonotonicMs = CaptureStartedMs, UncertaintyMs = 1000.0 / System.Diagnostics.Stopwatch.Frequency },
                ConfidencePolicy = "all-required-joints-valid", Source = Source.SourceKind };
            capture = new MotionCapture(CaptureStartedMs, durationMs, OriginRevision, Registration.ReferenceFromWorkspace, Source.SourceKind);
            Status = "Recording " + Source.SourceKind + " motion; tracking gaps remain explicit.";
        }
        public void StopRecording()
        {
            if (capture == null) return;
            var completed = capture; capture = null;
            try
            {
                LastRecording = completed.Finish(Guid.NewGuid().ToString("N"), recordedWorkspace, Clock());
                replay = new MotionReplay(LastRecording); completedMetadata = captureMetadata;
                Status = "Captured " + LastRecording.Frames.Length + " frames" + (completed.StopReason == null ? "" : " (" + completed.StopReason + ")") + ". Save through the recording store, or Replay.";
                RecordingCompleted?.Invoke(LastRecording);
            }
            catch (Exception error) when (error is InvalidOperationException || error is ContractException || error is ArgumentException) { Status = "Capture could not be finalized: " + error.Message; }
        }
        public void LoadRecording(Recording recording)
        {
            var validated = ContractJson.ParseRecording(ContractJson.SerializeRecording(recording));
            var workspace = validated.Workspace;
            var expectedB = new NVector3((float)workspace.WidthM, 0, 0);
            var expectedC = new NVector3(0, 0, -(float)workspace.DepthM);
            if (NVector3.Distance(workspace.CalibrationMarksM.A, NVector3.Zero) > .00001f ||
                NVector3.Distance(workspace.CalibrationMarksM.B, expectedB) > .00001f ||
                NVector3.Distance(workspace.CalibrationMarksM.C, expectedC) > .00001f ||
                NVector3.Distance(workspace.CalibrationMarksM.D, expectedB + expectedC) > .00001f)
                throw new ArgumentException("This calibration flow requires the declared rectangular A/B/C/D mat geometry.");
            Invalidate("Loaded tutorial requires independent learner registration");
            LastRecording = validated; completedMetadata = null; replay = new MotionReplay(validated);
            WidthM = (float)validated.Workspace.WidthM; DepthM = (float)validated.Workspace.DepthM; LayoutId = validated.Workspace.LayoutId;
        }
        public void StartReplay()
        {
            if (Registration == null || replay == null || capture != null) { Status = "Load/capture motion and verify registration before replay."; return; }
            replayStartMs = Clock(); replaying = true; Status = "Ghost replay • " + replay.Source + ". Endpoint motion is not assembly verification.";
        }
        public void StopReplay() { replaying = false; ReplayFrame = null; }
        private WorkspaceDefinition MakeWorkspace() => new WorkspaceDefinition { Id = "mat-" + LayoutId, Version = 1,
            WidthM = WidthM, DepthM = DepthM, LayoutId = LayoutId, DominantHand = UseLeftHand ? "left" : "right",
            CalibrationMethod = "three-point-index-tip-v1", CalibrationMarksM = new CalibrationMarks {
                A = NVector3.Zero, B = new NVector3(WidthM, 0, 0), C = new NVector3(0, 0, -DepthM), D = new NVector3(WidthM, 0, -DepthM) } };
    }
}
