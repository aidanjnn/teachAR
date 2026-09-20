using System;
using System.Collections.Generic;
using Trail.Contracts;
using Trail.Runtime.Guide;
using Trail.Runtime.Network;
using Trail.Runtime.Record;
using UnityEngine;

namespace Trail.Runtime.Coach
{
    /// <summary>
    /// Thin effect executor for the pure CoachSession. It owns the three things the pure layer must not: the
    /// microphone, the live transport handle and the paired HTTP calls. It makes no coaching decision of its
    /// own, and it calls no guide action -- the headset reducer alone starts, completes and repeats steps.
    ///
    /// Production transport and microphone implementations remain deferred (see ICoachTransport).
    /// </summary>
    [DisallowMultipleComponent]
    public sealed class NativeVoiceCoach : MonoBehaviour
    {
        public NativeApiConnection Connection;
        public GuideController Guide;
        [SerializeField] private int listenTimeoutMs = 10000;
        [SerializeField] private int connectTimeoutMs = 15000;
        /// <summary>Injected by the installer. No production implementation exists in this repository yet.</summary>
        public ICoachTransport Transport { get; set; }
        public ICoachMicrophone Microphone { get; set; }
        public CoachSession Session { get; private set; }
        public Func<double> Clock { get; set; } = () => MotionClock.NowMs;
        public string Status { get; private set; } = "Pair as learner and preload a reviewed guide before coaching.";
        /// <summary>Always shown with an answer. Coach agreement is advice, never a completion event.</summary>
        public string Limitation => CoachSession.AdviceLimitation;
        public CoachAnswer LastAnswer { get; private set; }
        public bool CanListen => Session != null && Session.State.Mode == CoachMode.Live && Session.State.Sync == CoachSync.Idle;
        public event Action<CoachAnswer> AnswerAccepted;
        public event Action<CoachDropReason> AnswerDropped;
        /// <summary>Refusal code only. Server prose is parsed away so nothing untrusted reaches the learner.</summary>
        public event Action<string> Refused;

        private readonly Queue<CoachEvent> pending = new Queue<CoachEvent>();
        private string liveSessionId;
        private long generation;
        private int eventSequence;
        private double listenDeadline, connectDeadline;
        private bool outputGateClosed;
        private bool subscribed;
        private bool releasing;
        private GuideContextRef bound;

        /// <summary>
        /// Binds a coach conversation to the guide's current identity. The step text comes from the reviewed
        /// tutorial the caller already loaded; the coach never invents or reorders steps.
        /// </summary>
        public void Prepare(CoachContext context)
        {
            if (context == null) throw new ArgumentNullException(nameof(context));
            if (Guide == null || Guide.Session == null) throw new InvalidOperationException("Preload a guide before preparing the coach.");
            var guide = GuideTelemetry.Context(Guide.Session);
            if (context.RunId != guide.RunId || context.TutorialId != guide.TutorialId || context.TutorialRevision != guide.TutorialRevision ||
                context.CurrentStepId != guide.StepId || context.StepRevision != guide.StepRevision || context.AttemptId != guide.AttemptId)
                throw new ArgumentException("The coach context must start from the guide's current identity.");
            foreach (var step in Guide.Session.Definition.Steps)
                if (!context.Contains(step.Id)) throw new ArgumentException("The coach context is missing a step of the loaded guide.");
            EndSession(null);
            Session = new CoachSession(context);
            Session.Transitioned += Execute;
            bound = guide;
            Status = Session.State.Notice;
        }

        public void Connect() => Raise(CoachEvent.Of(CoachEventKind.ConnectRequested));
        public void ToggleListen() => Raise(CoachEvent.Of(CoachEventKind.ListenToggled));

        /// <summary>Text question path. It keeps working when live audio does not, and falls back to loaded step text.</summary>
        public void AskText(string question)
        {
            if (Session == null || Session.State.Mode == CoachMode.Ended) return;
            var context = Session.Context;
            var requestId = Guid.NewGuid().ToString("N");
            string body;
            try { body = CoachJson.TextRequest(requestId, context, question); }
            catch (ArgumentException) { Status = "That question is too long or holds characters the coach cannot send."; return; }
            Raise(CoachEvent.TextAsked(requestId));
            if (Connection == null || Connection.State != ConnectionState.Ready)
            { Raise(CoachEvent.AnswerReceived(CoachFallback.For(context, requestId))); return; }
            Connection.Request("POST", "/api/coach", body, (status, response) =>
            {
                if (Session == null) return;
                CoachAnswer answer;
                if (status != 200) { Refuse(status, response); answer = CoachFallback.For(context, requestId); }
                else
                {
                    try { answer = CoachJson.ParseAnswer(response); }
                    catch (ArgumentException) { answer = CoachFallback.For(context, requestId); }
                }
                Raise(CoachEvent.AnswerReceived(answer));
            });
        }

        /// <summary>
        /// Called by the transport when learner speech arrives. It re-arms the listen timeout and reopens coach
        /// audio, but only once the server has acknowledged the current step; until then the model may still
        /// be answering the previous one.
        /// </summary>
        public void NotifyLearnerSpoke()
        {
            if (Session == null) return;
            listenDeadline = Clock() + listenTimeoutMs;
            if (!outputGateClosed || Session.State.Sync != CoachSync.Idle) return;
            outputGateClosed = false;
            if (Transport != null) Transport.SetOutputMuted(false);
        }

        public void NotifyLiveClosed() => Raise(CoachEvent.Of(CoachEventKind.LiveClosed));

        private void Update()
        {
            Bind();
            if (Session == null) return;
            Watch();
            Drain();
            if (Session == null) return;
            var now = Clock();
            if (Session.State.Mode == CoachMode.Connecting && now > connectDeadline) Raise(CoachEvent.Of(CoachEventKind.LiveFailed));
            else if (Session.State.Mode == CoachMode.Listening && now > listenDeadline) Raise(CoachEvent.Of(CoachEventKind.ListenTimeout));
            Drain();
        }

        /// <summary>Effects queue their follow-ups; the pure session refuses reentrant dispatch, exactly like the guide.</summary>
        private void Drain()
        {
            var guard = 0;
            while (Session != null && pending.Count > 0 && guard++ < 32) Session.Dispatch(pending.Dequeue());
        }
        private void Raise(CoachEvent input) { if (Session != null && pending.Count < 32) pending.Enqueue(input); }

        /// <summary>Reads the guide; never writes to it. A changed run or revision ends the conversation instead of reusing it.</summary>
        private void Watch()
        {
            if (Guide == null || Guide.Session == null || bound == null) return;
            var current = GuideTelemetry.Context(Guide.Session);
            if (current.RunId != bound.RunId || current.TutorialId != bound.TutorialId || current.TutorialRevision != bound.TutorialRevision)
            { EndSession("The guide changed run or revision. Prepare the coach again for it."); return; }
            if (!Session.Context.Contains(current.StepId))
            { EndSession("The guide moved to a step this coach context does not hold."); return; }
            // Invalidate before queued replies, never behind them. Watch runs outside dispatch.
            if (current.AttemptId != bound.AttemptId || current.StepId != bound.StepId || current.StepRevision != bound.StepRevision)
                LastAnswer = null;
            if (current.AttemptId != bound.AttemptId) Session.Dispatch(CoachEvent.AttemptChanged(current.AttemptId));
            if (current.StepId != bound.StepId || current.StepRevision != bound.StepRevision)
                Session.Dispatch(CoachEvent.StepChanged(current.StepId, current.StepRevision));
            bound = current;
        }

        private void Execute(CoachTransition transition)
        {
            foreach (var effect in transition.Effects)
            {
                switch (effect.Kind)
                {
                    case CoachEffectKind.AcquireMicrophoneMuted:
                        outputGateClosed = false;
                        if (Transport != null) Transport.SetOutputMuted(false);
                        if (Microphone == null || !Microphone.AcquireMuted()) Raise(CoachEvent.Of(CoachEventKind.MicrophoneUnavailable));
                        break;
                    case CoachEffectKind.OpenTransport:
                        // Only reached with a device that opened silent; a failed acquire already queued its exit.
                        if (Microphone != null && Microphone.Held && !Microphone.Capturing) OpenLive();
                        break;
                    case CoachEffectKind.EnableMicrophoneCapture:
                        if (Microphone != null) Microphone.SetCapturing(true);
                        Send(CoachLiveEvents.Unmute(++eventSequence));
                        listenDeadline = Clock() + listenTimeoutMs;
                        break;
                    case CoachEffectKind.DisableMicrophoneCapture:
                        // Local backstop first: the track stops whether or not the server accepts the event.
                        if (Microphone != null) Microphone.SetCapturing(false);
                        Send(CoachLiveEvents.Mute(++eventSequence));
                        break;
                    case CoachEffectKind.SendStepContext:
                        ReportStep(effect.Generation);
                        break;
                    case CoachEffectKind.InvalidateLiveOutput:
                        outputGateClosed = true;
                        if (Transport != null) Transport.SetOutputMuted(true);
                        break;
                    case CoachEffectKind.ReleaseMicrophoneAndTransport:
                        ReleaseLive();
                        break;
                    case CoachEffectKind.EmitAnswer:
                        LastAnswer = effect.Answer;
                        if (AnswerAccepted != null) AnswerAccepted(effect.Answer);
                        break;
                    case CoachEffectKind.DropAnswer:
                        if (AnswerDropped != null) AnswerDropped(effect.Drop);
                        break;
                }
            }
            Status = transition.State.Notice;
        }

        private void OpenLive()
        {
            if (Connection == null || Connection.State != ConnectionState.Ready || Transport == null)
            { Raise(CoachEvent.Of(CoachEventKind.LiveFailed)); return; }
            var current = ++generation;
            connectDeadline = Clock() + connectTimeoutMs;
            Transport.CreateOffer(offer =>
            {
                if (!Active(current)) return;
                string body;
                try { body = CoachJson.SessionRequest(offer, Session.Context); }
                catch (ArgumentException) { Raise(CoachEvent.Of(CoachEventKind.LiveFailed)); return; }
                Connection.Request("POST", "/api/live/sessions", body, (status, response) =>
                {
                    if (!Active(current)) return;
                    if (status != 201) { Refuse(status, response); Raise(CoachEvent.Of(CoachEventKind.LiveFailed)); return; }
                    CoachSessionGrant grant;
                    try { grant = CoachJson.ParseSessionGrant(response); }
                    catch (ArgumentException) { Raise(CoachEvent.Of(CoachEventKind.LiveFailed)); return; }
                    liveSessionId = grant.SessionId;
                    Transport.AcceptAnswer(grant.AnswerSdp,
                        () => { if (Active(current)) Raise(CoachEvent.Of(CoachEventKind.LiveReady)); },
                        () => { if (Active(current)) Raise(CoachEvent.Of(CoachEventKind.LiveFailed)); });
                });
            }, () => { if (Active(current)) Raise(CoachEvent.Of(CoachEventKind.LiveFailed)); });
        }

        /// <summary>The server composes and pushes the wording on its trusted channel; this only names the step and waits for the ack.</summary>
        private void ReportStep(int contextGeneration)
        {
            if (Session == null) return;
            if (Connection == null || Connection.State != ConnectionState.Ready || liveSessionId == null)
            { Raise(CoachEvent.ContextSyncFailed(contextGeneration)); return; }
            var current = generation;
            string body;
            try { body = CoachJson.StepUpdate(contextGeneration, Session.Context); }
            catch (ArgumentException) { Raise(CoachEvent.ContextSyncFailed(contextGeneration)); return; }
            // The grant parser already restricted the ID to the server's own URL-safe route grammar.
            Connection.Request("POST", "/api/live/sessions/" + liveSessionId + "/step", body, (status, _) =>
            {
                if (!Active(current)) return;
                Raise(status == 204 ? CoachEvent.ContextSynced(contextGeneration) : CoachEvent.ContextSyncFailed(contextGeneration));
            });
        }

        private bool Active(long current) => Session != null && current == generation && Session.State.Mode != CoachMode.Ended;

        private void Send(string clientEventJson)
        {
            if (Transport == null) return;
            try { Transport.Send(clientEventJson); }
            catch (Exception) { Status = "The coach channel dropped a control message."; }
        }

        /// <summary>Every exit path ends here. The microphone is freed first, before anything that can fail.</summary>
        private void ReleaseLive()
        {
            if (releasing) return;
            releasing = true;
            try
            {
                generation++;
                listenDeadline = 0; connectDeadline = 0;
                if (Microphone != null) Microphone.Release();
                if (Transport != null)
                {
                    if (Transport.Open) { try { Transport.Send(CoachLiveEvents.Close(++eventSequence)); } catch (Exception) { /* already closed */ } }
                    // The audio sink outlives this conversation; never leave it muted for the next one.
                    Transport.SetOutputMuted(false);
                    Transport.Close();
                }
                outputGateClosed = false;
                var id = liveSessionId;
                liveSessionId = null;
                if (id != null && Connection != null && Connection.State == ConnectionState.Ready)
                    Connection.Request("DELETE", "/api/live/sessions/" + id, null, (_, __) => { });
            }
            finally { releasing = false; }
        }

        private void Refuse(long status, string response)
        {
            var code = status == 0 ? "provider_unavailable" : CoachJson.ParseFailureCode(response);
            if (Refused != null) Refused(code);
            // 403 means this paired role may never use the coach routes, so retrying cannot help; say unavailable
            // rather than fail silently. 401 never reaches here: the transport revokes its own epoch first.
            if (status == 403) Raise(CoachEvent.Of(CoachEventKind.BackendLost));
        }

        private void EndSession(string status)
        {
            LastAnswer = null;
            var active = Session;
            if (active != null)
            {
                pending.Clear();
                active.End();
                active.Transitioned -= Execute;
            }
            Session = null;
            pending.Clear();
            bound = null;
            ReleaseLive();
            if (status != null) Status = status;
        }

        /// <summary>Pause and focus loss cannot wait for the next frame: the microphone is freed in this callback.</summary>
        private void Suspend(CoachEventKind kind)
        {
            pending.Clear();
            if (Session != null) Session.Dispatch(CoachEvent.Of(kind));
            else ReleaseLive();
        }

        public void Bind()
        {
            if (Connection == null || subscribed) return;
            Connection.SessionInvalidated += OnConnectionInvalidated;
            subscribed = true;
        }
        private void OnConnectionInvalidated()
        {
            // The loaded guide is untouched by this; only the coach becomes explicitly unavailable.
            // Request can revoke pairing synchronously from inside an effect. Release now,
            // but let the current dispatch unwind before reducing the invalidation.
            LastAnswer = null;
            pending.Clear();
            ReleaseLive();
            Raise(CoachEvent.Of(CoachEventKind.BackendLost));
        }
        private void OnEnable() => Bind();
        private void OnApplicationPause(bool paused) { if (paused) Suspend(CoachEventKind.ApplicationPaused); }
        private void OnApplicationFocus(bool focused) { if (!focused) Suspend(CoachEventKind.FocusLost); }
        private void OnDisable() => EndSession(null);
        private void OnDestroy()
        {
            EndSession(null);
            if (Connection != null && subscribed) { Connection.SessionInvalidated -= OnConnectionInvalidated; subscribed = false; }
        }
    }
}
