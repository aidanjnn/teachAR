using System;
using System.Globalization;
using Trail.Contracts;
using Trail.Runtime.Coach;
using Trail.Runtime.Guide;
using UnityEngine;

namespace Trail.Runtime.Scene
{
    /// <summary>Explicit spoken Check -> fresh camera inspection -> server-owned Live commentary.
    /// Speech delivery is requested, never treated as playback acknowledgement or guide completion.</summary>
    [DisallowMultipleComponent]
    public sealed class SpokenSceneInspection : MonoBehaviour
    {
        public NativeVoiceCoach Coach;
        public SceneInspectionController Inspection;
        public string Status { get; private set; } = "Say ‘check my placement’ with the camera enabled.";
        private bool subscribed;
        private string liveSession;
        private int liveGeneration;
        private long epoch;
        private string candidate;
        private double candidateAfter;
        private GuideContextRef expected;
        private string waitingQuestion;
        private double connectUntil;
        private bool queuedStart;
        private bool VoiceReady => Coach != null && Coach.Session != null && Coach.Session.State.Sync == CoachSync.Idle &&
            (Coach.Session.State.Mode == CoachMode.Live || Coach.Session.State.Mode == CoachMode.Listening);

        public void Bind()
        {
            if (subscribed || Coach == null || Inspection == null) return;
            subscribed = true;
            Coach.LearnerTranscriptReceived += OnTranscript;
            Inspection.InspectionStarted += OnStarted;
            Inspection.FindingsAccepted += OnFindings;
            Inspection.Invalidated += OnInvalidated;
        }
        private void OnTranscript(string transcript)
        {
            if (liveSession != null)
            {
                // After explicit Unmute, any new question supersedes the checked snapshot and its audio.
                candidate = null; Inspection.Cancel(); return;
            }
            // Live has no completed-turn event. Wait briefly for suffixes (e.g. "... tomorrow")
            // instead of treating a matching intermediate fragment as final user intent.
            candidate = SpokenInspectionIntent.IsCheck(transcript) || SpokenInspectionIntent.IsCancel(transcript) ? transcript : null;
            candidateAfter = Time.realtimeSinceStartupAsDouble + .45;
        }
        private void DispatchCommand(string transcript)
        {
            Coach.ClearLearnerTranscript();
            if (SpokenInspectionIntent.IsCancel(transcript)) { Inspection.Cancel(); return; }
            if (liveSession != null)
            {
                // A prior request may already have buffered speech. End that generation before reuse.
                Inspection.Cancel();
                Status = "Previous check cancelled. Restart voice before asking for a fresh check.";
                return;
            }
            if (!VoiceReady || string.IsNullOrEmpty(Coach.LiveSessionId)) return;
            if (Inspection.CameraSource == null || !Inspection.CameraSource.ReadyForCapture)
            { Status = "Enable the camera before asking for a placement check."; return; }
            try
            {
                Inspection.Guide.PauseForInspection();
                expected = GuideTelemetry.Context(Inspection.Guide.Session);
            }
            catch { Status = "Load and calibrate a guide before checking placement."; return; }
            // Never reopen audio containing the original question's ungrounded answer.
            // Start a silent fresh conversation before capturing, so reconnect latency cannot age the image.
            if (!Coach.BeginInspectionConversation()) return;
            waitingQuestion = transcript;
            connectUntil = Time.realtimeSinceStartupAsDouble + 20;
            Status = "Preparing a fresh voice response; guide paused. Resume cancels the check.";
        }
        private void OnStarted()
        {
            if (!queuedStart || Coach == null || !VoiceReady || string.IsNullOrEmpty(Coach.LiveSessionId)) return;
            queuedStart = false;
            liveSession = Coach.LiveSessionId;
            liveGeneration = Coach.SessionGeneration;
            epoch++;
        }
        private bool Current() => liveSession != null && Coach != null && VoiceReady &&
            Coach.LiveSessionId == liveSession && Coach.SessionGeneration == liveGeneration;
        private void OnFindings(InspectionResult result)
        {
            if (!Current() || !Inspection.FindingsCurrent(result)) return;
            var current = epoch;
            // IDs from the strict server grant parser are URL-safe. Findings prose never crosses this boundary.
            var body = "{\"requestEpoch\":" + result.Request.RequestEpoch.ToString(CultureInfo.InvariantCulture) +
                ",\"liveSessionId\":\"" + liveSession + "\",\"generation\":" + liveGeneration.ToString(CultureInfo.InvariantCulture) + "}";
            // This peer has received no learner audio; only accepted findings can now produce speech.
            // Open before dispatch so fast commentary audio is not clipped while HTTP acknowledgement returns.
            Coach.AllowInspectionOutput();
            Inspection.Connection.Request("POST", "/api/inspections/" + Uri.EscapeDataString(result.Request.RequestId) + "/speak", body,
                (status, _) => {
                    if (current != epoch || !Current()) return;
                    if (!Inspection.FindingsCurrent(result)) { Inspection.Cancel(); return; }
                    if (status != 204) { liveSession = null; Coach.InvalidateOutput(); }
                    Status = status == 204 ? "Visual findings sent to voice. Resume remains your choice." :
                        "Voice delivery unavailable; read the checked snapshot, then Retry or Resume.";
                });
        }
        private void Update()
        {
            if (liveSession != null && !Current()) Inspection.Cancel();
            if (queuedStart && !Inspection.IsBusy)
            {
                queuedStart = false; Coach.InvalidateOutput();
                Status = "Camera check could not start. Retry voice or Resume.";
            }
            if (waitingQuestion != null)
            {
                if (!Inspection.IsCurrent(expected) || Coach.Session == null || Time.realtimeSinceStartupAsDouble > connectUntil)
                {
                    waitingQuestion = null; queuedStart = false; Coach.InvalidateOutput();
                    Status = "Voice check unavailable or cancelled. Retry voice or Resume.";
                }
                else if (VoiceReady && !string.IsNullOrEmpty(Coach.LiveSessionId))
                {
                    var question = waitingQuestion; waitingQuestion = null; queuedStart = true;
                    Inspection.CheckPlacement(question);
                }
            }
            if (candidate != null && Time.realtimeSinceStartupAsDouble >= candidateAfter)
            {
                var command = candidate; candidate = null;
                if (VoiceReady) DispatchCommand(command);
            }
        }
        private void OnInvalidated()
        {
            epoch++;
            if (waitingQuestion != null)
            { waitingQuestion = null; Coach.InvalidateOutput(); }
            if (liveSession == null) return;
            liveSession = null;
            // A context acknowledgement cannot prove previously queued audio is gone.
            Coach.InvalidateOutput();
            Status = "Check ended. Restart voice to discard old audio before another conversation.";
        }
        private void OnDisable()
        {
            candidate = null;
            if ((liveSession != null || waitingQuestion != null || queuedStart) && Inspection != null) Inspection.Cancel();
            if (queuedStart && Coach != null) Coach.InvalidateOutput();
            queuedStart = false;
        }
        private void OnDestroy()
        {
            if (!subscribed) return;
            if (Coach != null) Coach.LearnerTranscriptReceived -= OnTranscript;
            if (Inspection != null)
            {
                Inspection.InspectionStarted -= OnStarted;
                Inspection.FindingsAccepted -= OnFindings;
                Inspection.Invalidated -= OnInvalidated;
            }
            subscribed = false;
        }
    }
}
