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
        public INarrationCapture Narration { get; set; }
        public byte[] LastNarration { get; private set; }
        public byte[] ExportedNarration { get; private set; }
        private bool narrationActive;
        private readonly System.Collections.Generic.Dictionary<string, byte[]> takeNarrations = new System.Collections.Generic.Dictionary<string, byte[]>();
        public Func<double> Clock = () => MotionClock.NowMs;
        public float WidthM = .5f;
        public float DepthM = .35f;
        public string LayoutId = "mat-50x35-v1";
        public bool UseLeftHand;
        public CalibrationRegistration Registration { get; private set; }
        public int OriginRevision => Source == null ? 0 : Source.OriginRevision;
        public ReferenceObservation LatestWorkspaceObservation { get; private set; }
        public Recording LastRecording { get; private set; }
        public TakeAuthoringMetadata LastAuthoringMetadata { get; private set; }
        public MotionFrame ReplayFrame { get; private set; }
        public string Status { get; private set; } = "Calibrate A, B, C, then independent mark D.";
        public string SourceLabel => Source == null ? "unavailable" : Source.SourceKind + ": " + Source.Availability;
        public double MarkProgress => markSampler.Progress;
        public bool IsRecording => Authoring.Phase == RecordingPhase.Arming ||
            Authoring.Phase == RecordingPhase.Recording || Authoring.Phase == RecordingPhase.Paused;
        public RecordingState Authoring { get; private set; } = RecordingState.Create(Guid.NewGuid().ToString("N"));
        public bool SavePositionSet => Authoring.SavePosition != null;
        public System.Collections.Generic.IReadOnlyList<RecordedTake> Takes => ledger == null
            ? (System.Collections.Generic.IReadOnlyList<RecordedTake>)Array.Empty<RecordedTake>() : ledger.Takes;
        public bool IsReplaying => replaying;
        public event Action<ReferenceObservation> WorkspaceObserved;
        public event Action<CalibrationRegistration, int> CalibrationChanged;
        public event Action<string, int> Invalidated;
        public event Action<Recording> RecordingCompleted;
        public event Action<RecordingTransition, ReferenceObservation> AuthoringReduced;
        private readonly StableMarkSampler markSampler = new StableMarkSampler();
        private readonly NVector3[] marks = new NVector3[4];
        private int markIndex;
        private bool collecting, replaying;
        private double lastObservationMs = -1, replayStartMs;
        private long lastSequence = -1;
        private TakeLedger ledger;
        private RecordingPolicy policy;
        private double maximumTakeMs = 120000;
        private MotionReplay replay;
        private HandObservationSource subscribedSource;
        private WorkspaceDefinition recordedWorkspace;
        private NativeCaptureSidecar captureMetadata, completedMetadata;
        private bool takeClockContinuous, completedClockContinuous;
        public double CaptureStartedMs { get; private set; }
        // Storage binds the sidecar to its exact persisted bytes/assigned ID; no competing JSON format.
        public NativeCaptureSidecar CreateCaptureSidecar(string recordingId, string recordingHash)
        {
            if (!completedClockContinuous) throw new InvalidOperationException("Paused takes require a piecewise clock mapping; the v1 native clock sidecar cannot represent them.");
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
            Reduce(RecordingAction.OriginInvalidated); replaying = false; collecting = false; markIndex = 0; markSampler.Reset();
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
                            Reduce(RecordingAction.Calibrated);
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
            Reduce(RecordingAction.Sample, LatestWorkspaceObservation);
            if (Authoring.Phase == RecordingPhase.Recording && Authoring.TakeMs >= maximumTakeMs) StopRecording();
        }
        private void Update()
        {
            BindSource();
            var now = Clock();
            if (collecting && (lastObservationMs < 0 || now - lastObservationMs > 100)) markSampler.Reset();
            if (LatestWorkspaceObservation != null && now - LatestWorkspaceObservation.TimestampMs > 100)
                LatestWorkspaceObservation = null;
            if (IsRecording || Authoring.Phase == RecordingPhase.ChoosingSaveZone) Reduce(RecordingAction.Tick);
            if (replaying)
            {
                var elapsed = now - replayStartMs;
                if (Registration == null || elapsed > replay.DurationMs) StopReplay();
                else ReplayFrame = replay.Sample(elapsed);
            }
        }
        public void RestoreAuthoring(AuthoredCapture[] takes, TakeAuthoringMetadata latest, byte[][] narration = null)
        {
            if (IsRecording || takes == null || takes.Length == 0 || latest == null)
                throw new InvalidOperationException("No saved tutorial to restore, or capture is active.");
            latest = ContractJson.ParseTakeAuthoringMetadata(ContractJson.SerializeTakeAuthoringMetadata(latest));
            var restoredState = RecordingState.Restore(latest.TutorialId,
                new SaveZone(latest.SavePosition.LeftM, latest.SavePosition.RightM), takes.Length, latest.TakeIndex);
            var first = takes[0].Recording;
            var restored = new TakeLedger(first.Workspace, first.Source);
            for (var index = 0; index < takes.Length; index++)
            {
                var take = takes[index];
                if (take.Recording.Audio != null)
                {
                    if (narration == null || narration.Length != takes.Length) throw new ArgumentException("Saved narration is unavailable.");
                    NarrationPcm.Validate(narration[index], take.Recording.Audio);
                }
                if (take.Authoring.TutorialId != latest.TutorialId) throw new ArgumentException("Mixed tutorials cannot be restored.");
                restored.Restore(take);
            }
            // Load performs the rectangular-workspace validation and invalidates registration.
            if (latest.TakeIndex < 0 || latest.TakeIndex >= takes.Length) throw new ArgumentException("Saved take index is unavailable.");
            LoadRecording(takes[latest.TakeIndex].Recording);
            ledger = restored; recordedWorkspace = first.Workspace; policy = new RecordingPolicy(first.Source);
            Authoring = restoredState;
            for (var index = 0; index < takes.Length; index++)
                if (takes[index].Recording.Audio != null) takeNarrations[takes[index].Recording.Id] = narration[index];
            LastNarration = takes[latest.TakeIndex].Recording.Audio == null ? null : narration[latest.TakeIndex];
            LastAuthoringMetadata = latest; Status = Authoring.Notice;
        }
        public void NewTutorial()
        {
            Reduce(RecordingAction.NewTutorial);
            Narration?.Discard(); narrationActive = false; takeNarrations.Clear(); LastNarration = null; ExportedNarration = null;
            ledger = null; LastRecording = null; LastAuthoringMetadata = null; completedMetadata = null; replay = null; StopReplay();
        }
        public void BeginSavePosition() => Reduce(RecordingAction.BeginSaveZone);
        public void CancelSavePosition() => Reduce(RecordingAction.CancelSaveZone);
        public void PauseRecording() => Reduce(RecordingAction.Pause);
        public void ResumeRecording() => Reduce(RecordingAction.Resume, LatestWorkspaceObservation);
        public void DiscardRecording() => Reduce(RecordingAction.DiscardTake);
        public Recording ExportTakes()
        {
            if (IsRecording) throw new InvalidOperationException("Finish or discard the current take before sending for review.");
            if (ledger == null) throw new InvalidOperationException("No saved takes to export.");
            var recordings = new System.Collections.Generic.List<Recording>();
            var waves = new System.Collections.Generic.List<byte[]>();
            foreach (var take in ledger.Takes)
            {
                recordings.Add(take.Recording); takeNarrations.TryGetValue(take.Recording.Id, out var wav); waves.Add(wav);
            }
            ExportedNarration = NarrationPcm.Join(recordings, waves);
            return ledger.Export(Guid.NewGuid().ToString("N"), ExportedNarration == null ? null : NarrationPcm.Metadata(ExportedNarration));
        }
        public void ApproveTake() => Reduce(RecordingAction.ApproveTake);
        public void ReRecordTake(int index) => BeginTake(120000, index);
        public void StartRecording(double durationMs = 120000) => BeginTake(durationMs, null);
        private void BeginTake(double durationMs, int? replaceIndex)
        {
            if (IsRecording) { Status = "Finish or discard the current take before starting another."; return; }
            if (double.IsNaN(durationMs) || double.IsInfinity(durationMs) || durationMs < 1200 || durationMs > 120000)
            { Status = "Take duration must be between 1.2 and 120 seconds."; return; }
            if (string.IsNullOrWhiteSpace(LayoutId) || LayoutId.Length > 124)
            { Status = "A layout ID of 1–124 characters is required."; return; }
            if (Registration == null || Source == null)
            { Status = "Verified calibration is required."; return; }
            if (ledger == null) ledger = new TakeLedger(MakeWorkspace(), Source.SourceKind);
            // A tutorial cannot silently change its declared workspace/source between takes.
            if (recordedWorkspace != null && (recordedWorkspace.LayoutId != LayoutId ||
                (float)recordedWorkspace.WidthM != WidthM || (float)recordedWorkspace.DepthM != DepthM ||
                recordedWorkspace.DominantHand != (UseLeftHand ? "left" : "right") || policy.Source != Source.SourceKind))
            { Status = "Start a new tutorial before changing its workspace or hand source."; return; }
            if (Narration != null)
            {
                if (!Narration.Begin()) { Status = Narration.Status; return; }
                narrationActive = true;
            }
            maximumTakeMs = durationMs;
            Reduce(replaceIndex.HasValue ? RecordingAction.ReRecordTake : RecordingAction.StartTake, takeIndex: replaceIndex ?? -1);
            if (Authoring.Phase == RecordingPhase.Arming) { recordedWorkspace = MakeWorkspace(); StopReplay(); }
            else { Narration?.Discard(); narrationActive = false; }
        }
        public void StopRecording() => Reduce(RecordingAction.StopFullTake);
        private void Reduce(RecordingAction action, ReferenceObservation observation = null, int takeIndex = -1)
        {
            if (policy == null) policy = new RecordingPolicy(Source == null ? "live" : Source.SourceKind);
            if (action == RecordingAction.NewTutorial)
            { policy = new RecordingPolicy(Source == null ? "live" : Source.SourceKind); recordedWorkspace = null; }
            var transition = RecordingDirector.Reduce(policy, Authoring, new RecordingInput(action, Clock(), observation,
                action == RecordingAction.NewTutorial ? Guid.NewGuid().ToString("N") : null, OriginRevision, takeIndex));
            try
            {
                byte[] narrationBytes = null; AudioAsset narrationAsset = null;
                if (narrationActive && observation != null && (transition.State.Phase == RecordingPhase.Recording || transition.Commit != null))
                    Narration.Align(observation.TimestampMs, transition.Commit == null ? transition.State.TakeMs : (transition.AdmitFrameAtMs ?? Authoring.TakeMs));
                if (narrationActive && transition.Commit != null)
                {
                    var start = transition.Commit.Trim?.StartMs ?? 0;
                    narrationBytes = Narration.Finish(start, ledger.PreviewDuration(transition.Commit.Trim, transition.AdmitFrameAtMs));
                    narrationAsset = NarrationPcm.Metadata(narrationBytes); narrationAsset.AudioStartOffsetMs = start;
                    narrationActive = false;
                }
                // Audio is finalized before ledger publication, so an audio failure cannot replace a saved take.
                var take = ledger == null ? null : ledger.Apply(transition, observation, transition.Commit == null ? null : Guid.NewGuid().ToString("N"), narrationAsset, "narration");
                if ((transition.DiscardPendingTake && transition.State.Phase != RecordingPhase.Arming) || transition.ClearCommittedTakes)
                { Narration?.Discard(); narrationActive = false; }
                Authoring = transition.State;
                AuthoringReduced?.Invoke(transition, observation);
                if (action != RecordingAction.Sample && action != RecordingAction.Tick || transition.Effects.Count > 0)
                    Status = Authoring.Notice;
                foreach (var effect in transition.Effects)
                    if (effect.Kind == RecordingEffectKind.TakeStarted)
                    {
                        takeClockContinuous = true;
                        CaptureStartedMs = observation.TimestampMs;
                        captureMetadata = new NativeCaptureSidecar { SchemaVersion = 1, TrackingSessionId = Source.TrackingSessionId,
                            OriginRevision = OriginRevision, Provider = Source.ProviderId, EditorVersion = Application.unityVersion,
                            SdkVersion = Source.SdkVersion, Skeleton = "openxr-26", AdapterVersion = Source.AdapterVersion,
                            Clock = new ClockMapping { Source = "native-monotonic", OffsetToMonotonicMs = CaptureStartedMs,
                                UncertaintyMs = 1000.0 / System.Diagnostics.Stopwatch.Frequency },
                            ConfidencePolicy = "all-required-joints-valid", Source = Source.SourceKind };
                    }
                foreach (var effect in transition.Effects)
                    if (effect.Kind == RecordingEffectKind.TakePaused) takeClockContinuous = false;
                if (take != null)
                {
                    LastNarration = narrationBytes;
                    if (narrationBytes != null) takeNarrations[take.Recording.Id] = narrationBytes;
                    var retained = new System.Collections.Generic.HashSet<string>(); foreach (var saved in ledger.Takes) retained.Add(saved.Recording.Id);
                    var stale = new System.Collections.Generic.List<string>(); foreach (var id in takeNarrations.Keys) if (!retained.Contains(id)) stale.Add(id);
                    foreach (var id in stale) takeNarrations.Remove(id);
                    LastRecording = take.Recording; completedMetadata = captureMetadata; completedClockContinuous = takeClockContinuous;
                    LastAuthoringMetadata = new TakeAuthoringMetadata { SchemaVersion = 1, TutorialId = Authoring.TutorialId,
                        TakeIndex = Authoring.LastTakeIndex,
                        SavePosition = new TakeAuthoringMetadataSavePosition { LeftM = Authoring.SavePosition.LeftM, RightM = Authoring.SavePosition.RightM },
                        Trim = new TakeAuthoringMetadataTrim { StartMs = take.Trim?.StartMs ?? 0, EndMsExclusive = take.Trim?.EndMsExclusive ?? (take.Recording.DurationMs + 1) },
                        TrimReason = take.TrimReason };
                    replay = new MotionReplay(LastRecording);
                    RecordingCompleted?.Invoke(LastRecording);
                }
                if (ledger != null && ledger.PendingStopReason != null && IsRecording)
                {
                    if (action != RecordingAction.StopFullTake) StopRecording();
                    else { DiscardRecording(); Status = "Capture limit reached before a saveable take. Previous takes are unchanged."; }
                }
            }
            catch (Exception error) when (error is InvalidOperationException || error is ContractException || error is ArgumentException)
            {
                // A failed finalization must not invent a saved take or overwrite the previous one.
                Narration?.Discard(); narrationActive = false;
                ledger?.DiscardPending();
                Authoring = RecordingDirector.Reduce(policy, Authoring,
                    new RecordingInput(RecordingAction.DiscardTake, Clock())).State;
                Status = "Take could not be saved: " + error.Message;
            }
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
            NewTutorial();
            LastRecording = validated; completedMetadata = null; replay = new MotionReplay(validated);
            UseLeftHand = validated.Workspace.DominantHand == "left";
            WidthM = (float)validated.Workspace.WidthM; DepthM = (float)validated.Workspace.DepthM; LayoutId = validated.Workspace.LayoutId;
        }
        public void StartReplay()
        {
            if (Registration == null || replay == null || IsRecording) { Status = "Load/capture motion and verify registration before replay."; return; }
            replayStartMs = Clock(); replaying = true; Status = "Ghost replay • " + replay.Source + ". Endpoint motion is not assembly verification.";
        }
        public void StopReplay() { replaying = false; ReplayFrame = null; }
        private WorkspaceDefinition MakeWorkspace() => new WorkspaceDefinition { Id = "mat-" + LayoutId, Version = 1,
            WidthM = WidthM, DepthM = DepthM, LayoutId = LayoutId, DominantHand = UseLeftHand ? "left" : "right",
            CalibrationMethod = "three-point-index-tip-v1", CalibrationMarksM = new CalibrationMarks {
                A = NVector3.Zero, B = new NVector3(WidthM, 0, 0), C = new NVector3(0, 0, -DepthM), D = new NVector3(WidthM, 0, -DepthM) } };
    }
}
