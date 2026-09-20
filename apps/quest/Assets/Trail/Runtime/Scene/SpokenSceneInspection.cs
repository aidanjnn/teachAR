using System;
using System.Globalization;
using Trail.Contracts;
using Trail.Runtime.Coach;
using Trail.Runtime.Guide;
using UnityEngine;

namespace Trail.Runtime.Scene
{
    /// <summary>Explicit spoken Check -> fresh camera inspection -> server-owned Live commentary.</summary>
    [DisallowMultipleComponent]
    public sealed class SpokenSceneInspection : MonoBehaviour
    {
        public NativeVoiceCoach Coach;
        public SceneInspectionController Inspection;
        public string Status { get; private set; } = "Say ‘check my placement’ with the camera enabled.";
        private bool subscribed, queuedStart, supersedingSpeech, stopping;
        private string liveSession, candidate, waitingQuestion;
        private int liveGeneration;
        private long epoch;
        private double candidateAfter, connectUntil;
        private GuideContextRef expected;
        private CoachSession ownedSession;
        public Func<double> Clock { get; set; } = () => Time.realtimeSinceStartupAsDouble;
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
                // Stop obsolete speech immediately, but retain the mic long enough to receive the
                // whole replacement command. Never reopen this peer's output after this point.
                supersedingSpeech = true;
                Coach.SilenceInspectionOutput();
                Inspection.Cancel();
            }
            candidate = SpokenInspectionIntent.IsCheck(transcript) || SpokenInspectionIntent.IsCancel(transcript) ? transcript : null;
            candidateAfter = Clock() + .45;
        }
        private void DispatchCommand(string transcript)
        {
            Coach.ClearLearnerTranscript();
            if (SpokenInspectionIntent.IsCancel(transcript)) { supersedingSpeech = false; Inspection.Cancel(); return; }
            if (!VoiceReady || !Coach.ListeningRequested || string.IsNullOrEmpty(Coach.LiveSessionId))
            { RecoverConversation(); return; }
            if (Inspection.CameraSource == null || !Inspection.CameraSource.ReadyForCapture)
            { RecoverConversation(); Status = "Enable the camera before asking for a placement check."; return; }
            try
            {
                Inspection.Guide.PauseForInspection();
                expected = GuideTelemetry.Context(Inspection.Guide.Session);
            }
            catch { RecoverConversation(); Status = "Load and calibrate a guide before checking placement."; return; }
            if (!Coach.BeginInspectionConversation()) { RecoverConversation(); return; }
            supersedingSpeech = false;
            ownedSession = Coach.Session;
            waitingQuestion = transcript;
            connectUntil = Clock() + 20;
            Status = "Preparing a fresh voice response; guide paused. Resume cancels the check.";
        }
        private void OnStarted()
        {
            if (!queuedStart || !VoiceReady || string.IsNullOrEmpty(Coach.LiveSessionId)) return;
            queuedStart = false;
            liveSession = Coach.LiveSessionId;
            liveGeneration = Coach.SessionGeneration;
            ownedSession = Coach.Session;
            epoch++;
        }
        private bool Current() => liveSession != null && VoiceReady && Coach.Session == ownedSession &&
            Coach.LiveSessionId == liveSession && Coach.SessionGeneration == liveGeneration;
        private void OnFindings(InspectionResult result)
        {
            if (!Current() || !Inspection.FindingsCurrent(result)) return;
            var current = epoch;
            var body = "{\"requestEpoch\":" + result.Request.RequestEpoch.ToString(CultureInfo.InvariantCulture) +
                ",\"liveSessionId\":\"" + liveSession + "\",\"generation\":" + liveGeneration.ToString(CultureInfo.InvariantCulture) + "}";
            // This new peer received no learner audio before acceptance. Open before dispatch to avoid
            // clipping fast commentary, and restore only the user's existing listening intent.
            Coach.AllowInspectionOutput();
            Inspection.Connection.Request("POST", "/api/inspections/" + Uri.EscapeDataString(result.Request.RequestId) + "/speak", body,
                (status, _) => {
                    if (current != epoch || !Current()) return;
                    if (!Inspection.FindingsCurrent(result)) { Inspection.Cancel(); return; }
                    if (status != 204) Inspection.Cancel();
                    Status = status == 204 ? "Visual findings sent. Say ‘check again’ for a fresh view, or Resume." :
                        "Voice delivery unavailable; read the checked snapshot, then Retry or Resume.";
                });
        }
        private void Update()
        {
            if (liveSession != null && !Current()) Inspection.Cancel();
            if (ownedSession != null && Coach.Session != ownedSession)
            {
                // Explicit End, focus loss, provider failure or another Start owns the new lifecycle.
                ownedSession = null; waitingQuestion = null; queuedStart = false; supersedingSpeech = false; candidate = null;
            }
            if (queuedStart && !Inspection.IsBusy) { queuedStart = false; RecoverConversation(); }
            if (waitingQuestion != null)
            {
                if (!Inspection.IsCurrent(expected) || Coach.Session == null || Clock() > connectUntil)
                { waitingQuestion = null; queuedStart = false; RecoverConversation(); }
                else if (VoiceReady && !string.IsNullOrEmpty(Coach.LiveSessionId))
                {
                    var question = waitingQuestion; waitingQuestion = null; queuedStart = true;
                    Inspection.CheckPlacement(question);
                }
            }
            if ((candidate != null || supersedingSpeech) && Clock() >= candidateAfter)
            {
                var command = candidate; candidate = null;
                if (command != null && VoiceReady && Coach.ListeningRequested) DispatchCommand(command);
                else RecoverConversation();
            }
        }
        private void OnInvalidated()
        {
            epoch++; liveSession = null;
            if (queuedStart || supersedingSpeech) return;
            waitingQuestion = null;
            RecoverConversation();
        }
        private void RecoverConversation()
        {
            liveSession = null; candidate = null; waitingQuestion = null; supersedingSpeech = false; queuedStart = false;
            var owned = ownedSession; ownedSession = null;
            if (Coach == null || owned == null || Coach.Session != owned) return;
            // One attempt only. Never resurrect End/mute/focus loss, and never resume guidance.
            if (!stopping && Coach.RecoverInspectionConversation())
                Status = "Voice reconnecting with the old snapshot discarded. Say ‘check again’ when ready.";
            else { Coach.InvalidateOutput(); Status = "Check ended. Voice remains stopped or muted."; }
        }
        private void OnDisable()
        {
            stopping = true;
            if (Inspection != null && ownedSession != null) Inspection.Cancel();
            RecoverConversation();
        }
        private void OnEnable() { stopping = false; }
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
