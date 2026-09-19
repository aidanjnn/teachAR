using System;
using Trail.Contracts;
using Trail.Motion;
using Trail.Runtime.Guide;
using Trail.Runtime.Network;
using UnityEngine;

namespace Trail.Runtime.Scene
{
    /// <summary>Non-voice inspection: explicit Check pauses locally, acknowledges identity, captures and returns advice.</summary>
    public sealed class SceneInspectionController : MonoBehaviour
    {
        public SceneCaptureController CameraSource;
        public GuideController Guide;
        public NativeApiConnection Connection;
        public string Status { get; private set; } = "Camera transmission requires Enable camera; Check sends one image.";
        public InspectionResult Findings { get; private set; }
        public event Action<InspectionResult> FindingsAccepted; // PR3 hook: speak only while IsCurrent remains true.
        private string appSessionId;
        private int epoch;
        private long generation;
        private GuideContextRef context;
        private InspectionCapture capture;
        private double startedAt;
        private double observationAt;
        private bool pending;
        private bool checkQueued;
        private static double Now => Time.realtimeSinceStartupAsDouble * 1000;

        public void Bind()
        {
            CameraSource.Captured += OnFrame;
            CameraSource.Unavailable += OnCameraUnavailable;
            Connection.SessionInvalidated += OnConnectionInvalidated;
        }
        public void CheckPlacement() { checkQueued = true; }
        private void Update()
        {
            if (checkQueued) { checkQueued = false; Begin(); }
            if (pending && (Now - startedAt > 8000 || !IsCurrent(context) || (capture != null && !CameraSource.SourceHealthy)))
                Unavailable("Inspection expired or source changed; Retry or Resume.");
            if (Findings != null && !IsCurrent(context)) { Findings = null; Status = "Inspection invalidated by guide change."; }
        }
        private void Begin()
        {
            Cancel();
            if (Guide == null || Guide.Session == null || Connection == null || Connection.State != ConnectionState.Ready || Connection.Role != "learner")
            { Status = "Pair as learner and load a calibrated guide first."; return; }
            if (!CameraSource.ReadyForCapture) { Status = "Enable the camera and wait for a fresh feed."; return; }
            GuideEvent paused;
            try { paused = Guide.PauseForInspection(); }
            catch { Status = "Guide cannot pause for inspection yet."; return; }
            context = new GuideContextRef { RunId = paused.RunId, TutorialId = paused.State.TutorialId,
                TutorialRevision = paused.State.TutorialRevision, StepId = paused.State.StepId,
                StepRevision = paused.State.StepRevision, AttemptId = paused.State.AttemptId };
            pending = true; startedAt = Now; var current = ++generation; var requestEpoch = ++epoch;
            Status = "Checking placement — guide paused. Resume remains your choice.";
            // Explicit ACK ensures the main server has this paused generation before issuing a nonce.
            Connection.Request("POST", "/api/guide-events", ContractJson.SerializeGuideEvent(paused), (status, _) => {
                if (!Active(current)) return;
                // A newer telemetry sequence may win the race. Start still requires the server to
                // prove the exact same paused identity before it can issue any capture nonce.
                if (status != 204 && status != 409) { Unavailable("Pause acknowledgement unavailable; Retry or Resume."); return; }
                Connection.Request("POST", "/api/inspection-sessions", ContractJson.SerializeGuideContextRef(context), (leaseStatus, leaseBody) => {
                    if (!Active(current)) return;
                    if (leaseStatus != 200) { Unavailable("Inspection session unavailable; Retry or Resume."); return; }
                    try { appSessionId = ContractJson.ParseInspectionSession(leaseBody); }
                    catch { Unavailable("Invalid inspection session; Retry or Resume."); return; }
                    var start = ContractJson.SerializeInspectionStart(context, appSessionId, 1, requestEpoch,
                        "Does the visible placement match this reviewed step?", CameraSource.SourceSessionId, CameraSource.SourceFrameSequence);
                    Connection.Request("POST", "/api/inspections", start, (startStatus, body) => {
                        if (!Active(current)) return;
                        if (startStatus != 200) { Unavailable("Inspection unavailable; verify reviewed references, then Retry or Resume."); return; }
                        try {
                            var next = ContractJson.ParseInspectionCapture(body);
                            if (next.Request.LiveSessionId != appSessionId || next.Request.SessionGeneration != 1 || next.Request.RequestEpoch != requestEpoch ||
                                next.SourceSessionId != CameraSource.SourceSessionId || !Same(next.Request, context)) throw new ContractException("Stale capture request");
                            capture = next; CameraSource.RequestFrame(next.CaptureNonce);
                        } catch { Unavailable("Camera request invalid or camera unavailable; Retry or Resume."); }
                    });
                });
            });
        }
        private void OnFrame(CapturedSceneFrame frame)
        {
            if (!pending || capture == null || frame.Ticket.Nonce != capture.CaptureNonce || !IsCurrent(context)) return;
            var current = generation; observationAt = frame.Ticket.DeliveredAtMs;
            try {
                var body = ContractJson.SerializeInspectionUpload(capture, frame.Ticket.SourceSessionId, frame.Ticket.SourceFrameSequence,
                    Now - frame.Ticket.DeliveredAtMs, frame.Jpeg, frame.Width, frame.Height, frame.Sha256);
                Connection.Request("POST", "/api/scene-observations", body, (status, response) => {
                    if (!Active(current)) return;
                    if (Now - observationAt > 5000) { Unavailable("Checked view is too old; Retry captures a fresh view."); return; }
                    if (status != 200) { Unavailable("Visual advice unavailable; Retry captures a new view, or Resume."); return; }
                    try {
                        var result = ContractJson.ParseInspectionResult(response);
                        if (result.Request.RequestId != capture.Request.RequestId || result.Request.RequestEpoch != epoch ||
                            result.Request.LiveSessionId != appSessionId || result.Request.SessionGeneration != 1 ||
                            !Same(result.Request, context) || result.ObservationId == null ||
                            string.Join("|", result.ReferenceIds) != string.Join("|", capture.Request.ReferenceIds)) throw new ContractException("Stale result");
                        Findings = result; pending = false;
                        Status = (result.Provenance == "mock" ? "SYNTHETIC MOCK: " : "Checked snapshot: ") + result.Assessment.Feedback + "\n" + result.Assessment.Limitation + "\nResume or Repeat when ready.";
                        FindingsAccepted?.Invoke(result);
                    } catch { Unavailable("Invalid visual findings; Retry or Resume."); }
                });
            } catch { Unavailable("Frame became stale before upload; Retry or Resume."); }
        }
        public bool IsCurrent(GuideContextRef expected)
        {
            if (expected == null || Guide == null || Guide.Session == null || Connection == null || Connection.State != ConnectionState.Ready) return false;
            var state = Guide.Session.State;
            return state.Phase == GuidePhase.Paused && state.Calibrated && Same(GuideTelemetry.Context(Guide.Session), expected);
        }
        private static bool Same(GuideContextRef a, GuideContextRef b) => a != null && b != null && a.RunId == b.RunId && a.TutorialId == b.TutorialId &&
            a.TutorialRevision == b.TutorialRevision && a.StepId == b.StepId && a.StepRevision == b.StepRevision && a.AttemptId == b.AttemptId;
        private static bool Same(InspectionRequest a, GuideContextRef b) => a != null && b != null && a.RunId == b.RunId && a.TutorialId == b.TutorialId &&
            a.TutorialRevision == b.TutorialRevision && a.StepId == b.StepId && a.StepRevision == b.StepRevision && a.AttemptId == b.AttemptId;
        private bool Active(long current) => pending && current == generation && IsCurrent(context) && Now - startedAt <= 8000 &&
            (capture == null || (CameraSource.SourceSessionId == capture.SourceSessionId && CameraSource.SourceHealthy));
        public void Cancel()
        {
            generation++; pending = false; Findings = null; Status = "Inspection cancelled. Resume remains your choice.";
            if (capture != null && Connection != null && Connection.State == ConnectionState.Ready)
                Connection.Request("DELETE", "/api/inspections/" + Uri.EscapeDataString(capture.Request.RequestId) + "?epoch=" + capture.Request.RequestEpoch, null, (_, __) => { });
            capture = null; if (CameraSource != null) CameraSource.Cancel();
        }
        private void Unavailable(string message) { Cancel(); Status = message; }
        private void OnCameraUnavailable(string _) { if (pending) Unavailable("Camera unavailable; Retry or Resume."); }
        private void OnConnectionInvalidated() { Cancel(); appSessionId = null; epoch = 0; Status = "Connection unavailable; guide remains paused until Resume."; }
        private void OnDisable() { Cancel(); }
        private void OnDestroy()
        {
            if (CameraSource != null) { CameraSource.Captured -= OnFrame; CameraSource.Unavailable -= OnCameraUnavailable; }
            if (Connection != null) Connection.SessionInvalidated -= OnConnectionInvalidated;
        }
    }
}
