using System;
using System.Collections.Generic;
using System.IO;
using Trail.Contracts;
using Trail.Motion;
using Trail.Runtime.Network;
using Trail.Runtime.Platform;
using Trail.Runtime.Record;
using Trail.Runtime.Storage;
using UnityEngine;

namespace Trail.Runtime.Scene
{
    /// <summary>Opt-in author endpoint images. Capture candidates are private and never automatically approved.</summary>
    public sealed class ExpertReferenceCapture : MonoBehaviour, IPlatformFeature
    {
        public int Order => 110;
        public bool CaptureEnabled { get; private set; }
        public string Status { get; private set; } = "Expert endpoint photos off. Enable camera, then opt in before recording.";
        private CaptureReplaySession capture;
        private SceneCaptureController cameraSource;
        private NativeStorageFeature storage;
        private NativeApiConnection connection;
        private PrivateExpertReferenceStore files;
        private readonly ExpertReferenceSamples samples = new ExpertReferenceSamples();
        private string nonce;
        private double requestAt, nextRequestAt;
        private Recording committed;
        private double trimStart, trimEnd;
        private Recording uploadRecording;
        private string uploadHash;
        private string[] uploadTakeIds;
        private int uploadGeneration;
        private bool uploading;
        private static double Now => Time.realtimeSinceStartupAsDouble * 1000;
        [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.BeforeSceneLoad)]
        private static void Register() => PlatformFeatures.Register("expert-reference-capture", root => root.AddComponent<ExpertReferenceCapture>());
        public void Initialize(PlatformContext context)
        {
            capture = context.Root.GetComponentInChildren<CaptureReplaySession>(true);
            cameraSource = context.Root.GetComponentInChildren<SceneCaptureController>(true);
            storage = context.Root.GetComponentInChildren<NativeStorageFeature>(true);
            connection = context.Connection;
            if (capture == null || cameraSource == null || storage == null) throw new InvalidOperationException("Expert images need capture, camera and storage.");
            files = new PrivateExpertReferenceStore(Application.persistentDataPath);
            capture.AuthoringReduced += OnReduced;
            capture.RecordingCompleted += OnCommitted;
            cameraSource.Captured += OnFrame;
            cameraSource.Unavailable += OnUnavailable;
            storage.RecordingUploaded += OnUploaded;
            connection.SessionInvalidated += ConnectionLost;
        }
        public void ToggleCapture()
        {
            CaptureEnabled = !CaptureEnabled;
            if (!CaptureEnabled) ClearPending();
            Status = CaptureEnabled ? "Expert endpoint photos enabled. Hold the finished pose; only kept take frames become review candidates." : "Expert endpoint photos off.";
        }
        private void ClearPending()
        {
            if (nonce != null && cameraSource != null) cameraSource.Cancel();
            nonce = null; samples.Clear(); committed = null; nextRequestAt = 0;
        }
        private void OnReduced(RecordingTransition transition, ReferenceObservation observation)
        {
            if (transition.ClearCommittedTakes || transition.DiscardPendingTake) ClearPending();
            foreach (var effect in transition.Effects)
                if (effect.Kind == RecordingEffectKind.TakeArmed) ClearPending();
            if (!CaptureEnabled) return;
            if (transition.AdmitFrameAtMs.HasValue && observation != null)
            {
                // MotionClock uses Stopwatch's origin; camera delivery uses Unity startup time.
                // Bracket the paired reads so a scheduling stall cannot masquerade as fresh alignment.
                var before = Now;
                var motionNow = capture.Clock();
                var after = Now;
                if (after >= before && after - before <= 5 &&
                    ExpertReferenceSamples.TryMapMotionTime(observation.TimestampMs, motionNow, (before + after) / 2, out var deliveredSample))
                    samples.Admit(transition.AdmitFrameAtMs.Value, deliveredSample);
            }
            // Only stable endpoint samples; no frame from the return-to-save gesture is requested.
            if (transition.State.Phase != RecordingPhase.Recording || !transition.State.EndpointCandidateMs.HasValue ||
                Math.Abs(transition.State.EndpointCandidateMs.Value - transition.State.TakeMs) > .001 ||
                nonce != null || Now < nextRequestAt || !cameraSource.ReadyForCapture ||
                (connection.State == ConnectionState.Ready && connection.Role != "author")) return;
            nonce = Guid.NewGuid().ToString("N"); requestAt = Now; nextRequestAt = Now + 200;
            try { cameraSource.RequestFrame(nonce); }
            catch { nonce = null; Status = "Endpoint photo unavailable; recording continues without a visual candidate."; }
        }
        private void OnFrame(CapturedSceneFrame frame)
        {
            if (nonce == null || frame.Ticket.Nonce != nonce || !CaptureEnabled) return;
            nonce = null;
            var candidate = new ExpertReferenceCandidate { Jpeg = (byte[])frame.Jpeg.Clone(), Width = frame.Width, Height = frame.Height,
                Sha256 = frame.Sha256, DeliveredAtMs = frame.Ticket.DeliveredAtMs, SensorTimestampTicks = frame.Ticket.SensorTimestampTicks,
                SourceSessionId = frame.Ticket.SourceSessionId, SourceFrameSequence = frame.Ticket.SourceFrameSequence };
            if (!samples.Add(candidate)) { Status = "Photo had no nearby admitted motion frame; it was discarded."; return; }
            PersistCandidate();
        }
        private void OnCommitted(Recording recording)
        {
            if (!CaptureEnabled || capture.LastAuthoringMetadata == null) return;
            committed = recording;
            trimStart = capture.LastAuthoringMetadata.Trim.StartMs;
            trimEnd = capture.LastAuthoringMetadata.Trim.EndMsExclusive;
            PersistCandidate();
        }
        private void PersistCandidate()
        {
            if (committed == null) return;
            var selected = samples.Select(committed, trimStart, trimEnd, out var index);
            if (selected == null) { Status = "Take saved without a near-endpoint photo. Motion remains available for review."; return; }
            try { files.Save(committed, selected, index); Status = "Endpoint photo saved privately for manual desktop review (delivery-aligned timing)."; }
            catch (Exception) { Status = "Endpoint photo could not be saved; motion recording is unaffected."; }
        }
        private void OnUploaded(Recording recording, string hash, string[] takeIds)
        {
            uploadGeneration++; uploading = false;
            uploadRecording = recording; uploadHash = hash; uploadTakeIds = (string[])takeIds.Clone();
            RetryUpload();
        }
        public void RetryUpload()
        {
            if (uploading || uploadRecording == null || uploadTakeIds == null || uploadTakeIds.Length == 0 ||
                connection.State != ConnectionState.Ready || connection.Role != "author") return;
            var generation = ++uploadGeneration;
            var recording = uploadRecording; var hash = uploadHash; var ids = uploadTakeIds;
            uploading = true;
            Action<int> next = null;
            next = takeIndex => {
                if (generation != uploadGeneration) return;
                if (takeIndex >= ids.Length) { uploading = false; Status = "Available endpoint photos uploaded as unapproved review candidates."; return; }
                PrivateExpertReference candidate; int index;
                try
                {
                    candidate = files.Load(ids[takeIndex]);
                    if (candidate == null) { next(takeIndex + 1); return; }
                    index = ExpertReferenceUploadIndex.Resolve(recording, takeIndex, candidate.frameIndex, candidate.frameCount, candidate.frameTimeMs);
                    if (files.WasUploaded(recording.Id, index, candidate.sha256)) { next(takeIndex + 1); return; }
                }
                catch (Exception) { uploading = false; Status = "Reference identity did not match the exported take; candidate was not uploaded."; return; }
                // All strings originate from local UUID/hash validators or fixed MIME/source constants.
                var body = "{\"recordingId\":\"" + recording.Id + "\",\"recordingHash\":\"" + hash + "\",\"frameIndex\":" + index +
                    ",\"source\":\"quest-camera\",\"image\":{\"mimeType\":\"image/jpeg\",\"dataBase64\":\"" + candidate.jpegBase64 +
                    "\",\"sha256\":\"" + candidate.sha256 + "\",\"width\":" + candidate.width + ",\"height\":" + candidate.height + "}}";
                connection.Request("POST", "/api/reference-images", body, (status, _) => {
                    if (generation != uploadGeneration) return;
                    if (status != 200 && status != 201) { uploading = false; Status = "Candidate upload interrupted. Use Retry expert photo upload after pairing as author."; return; }
                    try { files.MarkUploaded(recording.Id, index, candidate.sha256); }
                    catch (IOException) { uploading = false; Status = "Candidate accepted but receipt could not be saved; desktop review can inspect it."; return; }
                    next(takeIndex + 1);
                });
            };
            next(0);
        }
        private void Update()
        {
            if (nonce != null && Now - requestAt > 2000) { cameraSource.Cancel(); nonce = null; }
        }
        private void OnUnavailable(string _) { if (nonce != null) { nonce = null; Status = "Camera unavailable; expert recording continues without photos."; } }
        private void ConnectionLost() { uploadGeneration++; uploading = false; }
        private void OnDisable() { ClearPending(); ConnectionLost(); }
        private void OnDestroy()
        {
            if (capture != null) { capture.AuthoringReduced -= OnReduced; capture.RecordingCompleted -= OnCommitted; }
            if (cameraSource != null) { cameraSource.Captured -= OnFrame; cameraSource.Unavailable -= OnUnavailable; }
            if (storage != null) storage.RecordingUploaded -= OnUploaded;
            if (connection != null) connection.SessionInvalidated -= ConnectionLost;
        }
    }
    public static class ExpertReferenceUploadIndex
    {
        public static int Resolve(Recording recording, int takeIndex, int frameIndex, int frameCount, double frameTimeMs)
        {
            StepMarker start = null, end = null;
            foreach (var marker in recording.Markers)
            {
                if (marker.Id == "take-" + takeIndex + "-start") start = marker;
                if (marker.Id == "take-" + takeIndex + "-end") end = marker;
            }
            if (double.IsNaN(frameTimeMs) || double.IsInfinity(frameTimeMs) || frameTimeMs < 0 || start == null || end == null || frameIndex < 0 || frameIndex >= frameCount) throw new ArgumentException("Take boundaries missing.");
            var first = -1; var count = 0;
            for (var i = 0; i < recording.Frames.Length; i++)
                if (recording.Frames[i].TMs >= start.TMs && recording.Frames[i].TMs <= end.TMs)
                { if (first < 0) first = i; count++; }
            if (count != frameCount || first < 0 || Math.Abs(recording.Frames[first + frameIndex].TMs - start.TMs - frameTimeMs) > .001)
                throw new ArgumentException("Candidate does not belong to the exported take frames.");
            return first + frameIndex;
        }
    }
}
