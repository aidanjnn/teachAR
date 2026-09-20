using System;
using System.Collections.Generic;
using System.Collections.ObjectModel;

namespace Trail.Runtime.Coach
{
    public enum CoachMode
    {
        /// <summary>No coach has been asked for. The guide runs exactly the same.</summary>
        Idle,
        Connecting,
        Live,
        /// <summary>The microphone is capturing. Only this mode may capture.</summary>
        Listening,
        /// <summary>No live audio; text answers still work.</summary>
        Text,
        /// <summary>The backend is gone. The coach says so instead of pretending.</summary>
        Unavailable,
        /// <summary>Terminal. Reached on dispose, disable or destroy.</summary>
        Ended,
    }

    public enum CoachSync { Idle, Pending }

    public enum CoachEventKind
    {
        ConnectRequested, MicrophoneUnavailable, LiveReady, LiveFailed, LiveClosed,
        ListenToggled, ListenTimeout, StepChanged, AttemptChanged,
        ContextSynced, ContextSyncFailed, TextAsked, AnswerReceived,
        ApplicationPaused, FocusLost, BackendLost, Ended,
    }

    /// <summary>
    /// The complete effect vocabulary of the coach. There is deliberately no effect that starts, completes,
    /// repeats or confirms a step: the headset reducer is the only progression authority, and a coach reply
    /// is advice. Adding a progression effect here is a contract break, and the harness asserts this list.
    /// </summary>
    public enum CoachEffectKind
    {
        /// <summary>Open the capture device with capture disabled. Always emitted before OpenTransport.</summary>
        AcquireMicrophoneMuted,
        OpenTransport,
        EnableMicrophoneCapture,
        DisableMicrophoneCapture,
        /// <summary>Ask the server to push fresh step context; the server owns the wording on its trusted channel.</summary>
        SendStepContext,
        /// <summary>Spoken output for a step the learner has left: mute playback and mark captions stale.</summary>
        InvalidateLiveOutput,
        /// <summary>Stop and release the microphone and close the transport. Emitted on every exit path.</summary>
        ReleaseMicrophoneAndTransport,
        EmitAnswer,
        DropAnswer,
    }

    public enum CoachDropReason { StaleRun, StaleTutorial, StaleAttempt, StaleStep, UnknownRequest, Duplicate, SessionEnded }

    /// <summary>Learner-facing text. Fixed strings only: no identifier, question, SDP, token or server prose is ever placed here.</summary>
    public static class CoachNotice
    {
        public const string Idle = "Coach idle. Your guide runs without it.";
        public const string Connecting = "Connecting the coach. Your guide continues meanwhile.";
        public const string Connected = "Coach connected. It advises; your movement still decides progress.";
        public const string Listening = "Coach listening. Ask your question.";
        public const string TextOnly = "Coach voice unavailable. Text answers still work.";
        public const string MicrophoneUnavailable = "Microphone unavailable. Text answers still work.";
        public const string Released = "Coach released. Your loaded guide continues.";
        public const string BackendUnavailable = "Coach unavailable. Your loaded guide continues.";
        public const string Ended = "Coach session ended.";
        public static readonly string[] All = { Idle, Connecting, Connected, Listening, TextOnly, MicrophoneUnavailable, Released, BackendUnavailable, Ended };
    }

    public sealed class CoachEvent
    {
        public CoachEventKind Kind { get; }
        public string StepId { get; }
        public int StepRevision { get; }
        public string AttemptId { get; }
        public string RequestId { get; }
        public int Generation { get; }
        public CoachAnswer Answer { get; }
        private CoachEvent(CoachEventKind kind, string stepId = null, int stepRevision = 0, string attemptId = null,
            string requestId = null, int generation = 0, CoachAnswer answer = null)
        { Kind = kind; StepId = stepId; StepRevision = stepRevision; AttemptId = attemptId; RequestId = requestId; Generation = generation; Answer = answer; }

        public static CoachEvent Of(CoachEventKind kind)
        {
            switch (kind)
            {
                case CoachEventKind.StepChanged:
                case CoachEventKind.AttemptChanged:
                case CoachEventKind.ContextSynced:
                case CoachEventKind.ContextSyncFailed:
                case CoachEventKind.TextAsked:
                case CoachEventKind.AnswerReceived:
                    throw new ArgumentException("This coach event carries required data; use its own factory.");
                default: return new CoachEvent(kind);
            }
        }
        public static CoachEvent StepChanged(string stepId, int stepRevision) =>
            new CoachEvent(CoachEventKind.StepChanged, CoachBounds.Id(stepId, "step ID"), CoachBounds.Revision(stepRevision, "step revision"));
        public static CoachEvent AttemptChanged(string attemptId) =>
            new CoachEvent(CoachEventKind.AttemptChanged, attemptId: CoachBounds.Id(attemptId, "attempt ID"));
        public static CoachEvent ContextSynced(int generation) =>
            new CoachEvent(CoachEventKind.ContextSynced, generation: CoachBounds.Revision(generation, "context generation"));
        public static CoachEvent ContextSyncFailed(int generation) =>
            new CoachEvent(CoachEventKind.ContextSyncFailed, generation: CoachBounds.Revision(generation, "context generation"));
        public static CoachEvent TextAsked(string requestId) =>
            new CoachEvent(CoachEventKind.TextAsked, requestId: CoachBounds.Id(requestId, "request ID"));
        public static CoachEvent AnswerReceived(CoachAnswer answer) =>
            new CoachEvent(CoachEventKind.AnswerReceived, answer: answer ?? throw new ArgumentNullException(nameof(answer)));
    }

    public sealed class CoachEffect
    {
        public CoachEffectKind Kind { get; }
        public CoachAnswer Answer { get; }
        public CoachDropReason Drop { get; }
        /// <summary>The context generation SendStepContext must report; the server rejects anything older.</summary>
        public int Generation { get; }
        private CoachEffect(CoachEffectKind kind, CoachAnswer answer, CoachDropReason drop, int generation)
        { Kind = kind; Answer = answer; Drop = drop; Generation = generation; }
        internal static CoachEffect Of(CoachEffectKind kind) => new CoachEffect(kind, null, CoachDropReason.UnknownRequest, 0);
        internal static CoachEffect StepContext(int generation) => new CoachEffect(CoachEffectKind.SendStepContext, null, CoachDropReason.UnknownRequest, generation);
        internal static CoachEffect Emit(CoachAnswer answer) => new CoachEffect(CoachEffectKind.EmitAnswer, answer, CoachDropReason.UnknownRequest, 0);
        internal static CoachEffect Dropped(CoachDropReason reason) => new CoachEffect(CoachEffectKind.DropAnswer, null, reason, 0);
    }

    public sealed class CoachTransition
    {
        public CoachSessionState State { get; }
        public ReadOnlyCollection<CoachEffect> Effects { get; }
        internal CoachTransition(CoachSessionState state, List<CoachEffect> effects) { State = state; Effects = effects.AsReadOnly(); }
        public bool Has(CoachEffectKind kind)
        {
            foreach (var effect in Effects) if (effect.Kind == kind) return true;
            return false;
        }
    }

    /// <summary>
    /// The whole coach decision surface. Pure: it takes an event and returns the next state plus effects for an
    /// adapter to execute. It holds no microphone, socket, timer, file or credential, and it cannot move the guide.
    /// </summary>
    public sealed class CoachSessionState
    {
        public CoachMode Mode { get; internal set; } = CoachMode.Idle;
        /// <summary>A live session existed and then ended; answers continue in text mode.</summary>
        public bool LiveClosed { get; internal set; }
        public string RunId { get; internal set; }
        public string TutorialId { get; internal set; }
        public int TutorialRevision { get; internal set; }
        public string AttemptId { get; internal set; }
        public string StepId { get; internal set; }
        public int StepRevision { get; internal set; }
        /// <summary>Increases on every step or attempt change; the server orders live context updates by it.</summary>
        public int ContextGeneration { get; internal set; }
        public CoachSync Sync { get; internal set; } = CoachSync.Idle;
        /// <summary>The step or attempt changed while the session was still connecting; resync on ready.</summary>
        public bool ContextDirty { get; internal set; }
        public string PendingRequestId { get; internal set; }
        /// <summary>The capture device is open. Must be false in every terminal and released state.</summary>
        public bool MicrophoneHeld { get; internal set; }
        /// <summary>The capture device is actually sending audio. Only ever true in Listening.</summary>
        public bool MicrophoneCapturing { get; internal set; }
        public bool BackendAvailable { get; internal set; } = true;
        public string Notice { get; internal set; } = CoachNotice.Idle;
        public ReadOnlyCollection<string> SeenRequestIds => Array.AsReadOnly((string[])seen.Clone());
        internal string[] seen = Array.Empty<string>();

        internal CoachSessionState Clone()
        {
            var copy = (CoachSessionState)MemberwiseClone();
            copy.seen = (string[])seen.Clone();
            return copy;
        }
        internal bool HasSeen(string requestId)
        {
            foreach (var id in seen) if (id == requestId) return true;
            return false;
        }
        public static CoachSessionState Create(CoachContext context)
        {
            if (context == null) throw new ArgumentNullException(nameof(context));
            return new CoachSessionState
            {
                RunId = context.RunId, TutorialId = context.TutorialId, TutorialRevision = context.TutorialRevision,
                AttemptId = context.AttemptId, StepId = context.CurrentStepId, StepRevision = context.StepRevision,
            };
        }
    }

    public static class CoachReducer
    {
        internal const int SeenLimit = 50;

        public static CoachTransition Reduce(CoachSessionState state, CoachEvent input)
        {
            if (state == null) throw new ArgumentNullException(nameof(state));
            if (input == null) throw new ArgumentNullException(nameof(input));
            var next = state.Clone();
            var effects = new List<CoachEffect>();
            // Terminal. A reply that arrives after the session ended is named and dropped, never surfaced.
            if (state.Mode == CoachMode.Ended)
            {
                if (input.Kind == CoachEventKind.AnswerReceived) effects.Add(CoachEffect.Dropped(CoachDropReason.SessionEnded));
                return new CoachTransition(next, effects);
            }
            switch (input.Kind)
            {
                case CoachEventKind.ConnectRequested:
                    if (state.Mode != CoachMode.Idle && state.Mode != CoachMode.Text && state.Mode != CoachMode.Unavailable) break;
                    next.Mode = CoachMode.Connecting; next.ContextDirty = false; next.Sync = CoachSync.Idle;
                    next.BackendAvailable = true; next.LiveClosed = false;
                    next.MicrophoneHeld = true; next.MicrophoneCapturing = false;
                    next.Notice = CoachNotice.Connecting;
                    // Order is the guarantee: the device is opened silent before any offer exists.
                    effects.Add(CoachEffect.Of(CoachEffectKind.AcquireMicrophoneMuted));
                    effects.Add(CoachEffect.Of(CoachEffectKind.OpenTransport));
                    break;

                case CoachEventKind.MicrophoneUnavailable:
                    if (state.Mode == CoachMode.Idle) break;
                    Release(next, effects, CoachMode.Text, CoachNotice.MicrophoneUnavailable);
                    break;

                case CoachEventKind.LiveReady:
                    // A late ready after the channel already closed must not revive a dead session.
                    if (state.Mode != CoachMode.Connecting) break;
                    next.Mode = CoachMode.Live; next.LiveClosed = false; next.MicrophoneCapturing = false;
                    next.Notice = CoachNotice.Connected;
                    effects.Add(CoachEffect.Of(CoachEffectKind.DisableMicrophoneCapture));
                    if (state.ContextDirty)
                    {
                        next.ContextDirty = false; next.Sync = CoachSync.Pending;
                        effects.Add(CoachEffect.Of(CoachEffectKind.InvalidateLiveOutput));
                        effects.Add(CoachEffect.StepContext(next.ContextGeneration));
                    }
                    break;

                case CoachEventKind.LiveFailed:
                    if (!Livey(state.Mode)) break;
                    Release(next, effects, CoachMode.Text, CoachNotice.TextOnly);
                    break;

                case CoachEventKind.LiveClosed:
                    if (!Livey(state.Mode)) break;
                    next.LiveClosed = true;
                    Release(next, effects, CoachMode.Text, CoachNotice.TextOnly);
                    break;

                case CoachEventKind.ListenToggled:
                    // Never open the microphone while the model may still hold the previous step.
                    if (state.Mode == CoachMode.Live && state.Sync == CoachSync.Idle)
                    {
                        next.Mode = CoachMode.Listening; next.MicrophoneCapturing = true; next.Notice = CoachNotice.Listening;
                        effects.Add(CoachEffect.Of(CoachEffectKind.EnableMicrophoneCapture));
                    }
                    else if (state.Mode == CoachMode.Listening) StopListening(next, effects);
                    break;

                case CoachEventKind.ListenTimeout:
                    if (state.Mode == CoachMode.Listening) StopListening(next, effects);
                    break;

                case CoachEventKind.StepChanged:
                    next.StepId = input.StepId; next.StepRevision = input.StepRevision;
                    ContextChanged(state, next, effects);
                    break;

                case CoachEventKind.AttemptChanged:
                    next.AttemptId = input.AttemptId;
                    ContextChanged(state, next, effects);
                    break;

                case CoachEventKind.ContextSynced:
                    if (state.Sync == CoachSync.Pending && input.Generation == state.ContextGeneration) next.Sync = CoachSync.Idle;
                    break;

                case CoachEventKind.ContextSyncFailed:
                    // A late failure for an older generation is noise; only the current one can end live coaching.
                    if (input.Generation != state.ContextGeneration || !(state.Mode == CoachMode.Live || state.Mode == CoachMode.Listening)) break;
                    next.LiveClosed = true;
                    Release(next, effects, CoachMode.Text, CoachNotice.TextOnly);
                    break;

                case CoachEventKind.TextAsked:
                    next.PendingRequestId = input.RequestId;
                    break;

                case CoachEventKind.AnswerReceived:
                    Answer(state, next, effects, input.Answer);
                    break;

                case CoachEventKind.ApplicationPaused:
                case CoachEventKind.FocusLost:
                    // Focus or foreground loss cannot leave a hot microphone behind, and an in-flight reply no longer has an owner.
                    next.PendingRequestId = null;
                    if (Livey(state.Mode)) next.LiveClosed = true;
                    Release(next, effects, state.Mode == CoachMode.Idle ? CoachMode.Idle : CoachMode.Text,
                        state.Mode == CoachMode.Idle ? CoachNotice.Idle : CoachNotice.Released);
                    break;

                case CoachEventKind.BackendLost:
                    next.PendingRequestId = null; next.BackendAvailable = false;
                    if (Livey(state.Mode)) next.LiveClosed = true;
                    Release(next, effects, CoachMode.Unavailable, CoachNotice.BackendUnavailable);
                    break;

                case CoachEventKind.Ended:
                    next.PendingRequestId = null;
                    Release(next, effects, CoachMode.Ended, CoachNotice.Ended);
                    break;
            }
            return new CoachTransition(next, effects);
        }

        private static bool Livey(CoachMode mode) => mode == CoachMode.Connecting || mode == CoachMode.Live || mode == CoachMode.Listening;

        /// <summary>Every exit path funnels through here, so the microphone can never stay open past it.</summary>
        private static void Release(CoachSessionState next, List<CoachEffect> effects, CoachMode mode, string notice)
        {
            next.Mode = mode; next.Sync = CoachSync.Idle; next.ContextDirty = false;
            next.MicrophoneHeld = false; next.MicrophoneCapturing = false; next.Notice = notice;
            effects.Add(CoachEffect.Of(CoachEffectKind.ReleaseMicrophoneAndTransport));
        }

        private static void StopListening(CoachSessionState next, List<CoachEffect> effects)
        {
            next.Mode = CoachMode.Live; next.MicrophoneCapturing = false; next.Notice = CoachNotice.Connected;
            effects.Add(CoachEffect.Of(CoachEffectKind.DisableMicrophoneCapture));
        }

        /// <summary>Step and attempt changes share one shape: in-flight answers go stale and a live session needs fresh context.</summary>
        private static void ContextChanged(CoachSessionState state, CoachSessionState next, List<CoachEffect> effects)
        {
            next.PendingRequestId = null;
            next.ContextGeneration = state.ContextGeneration + 1;
            if (state.Mode == CoachMode.Listening)
            {
                next.Mode = CoachMode.Live; next.MicrophoneCapturing = false; next.Sync = CoachSync.Pending; next.Notice = CoachNotice.Connected;
                effects.Add(CoachEffect.Of(CoachEffectKind.DisableMicrophoneCapture));
                effects.Add(CoachEffect.Of(CoachEffectKind.InvalidateLiveOutput));
                effects.Add(CoachEffect.StepContext(next.ContextGeneration));
            }
            else if (state.Mode == CoachMode.Live)
            {
                next.Sync = CoachSync.Pending;
                effects.Add(CoachEffect.Of(CoachEffectKind.InvalidateLiveOutput));
                effects.Add(CoachEffect.StepContext(next.ContextGeneration));
            }
            else if (state.Mode == CoachMode.Connecting) next.ContextDirty = true;
        }

        private static void Answer(CoachSessionState state, CoachSessionState next, List<CoachEffect> effects, CoachAnswer answer)
        {
            if (answer.RunId != state.RunId) { effects.Add(CoachEffect.Dropped(CoachDropReason.StaleRun)); return; }
            if (answer.TutorialId != state.TutorialId || answer.TutorialRevision != state.TutorialRevision)
            { effects.Add(CoachEffect.Dropped(CoachDropReason.StaleTutorial)); return; }
            if (state.HasSeen(answer.RequestId)) { effects.Add(CoachEffect.Dropped(CoachDropReason.Duplicate)); return; }
            // A null pending request covers every exit path: nothing asked for is still outstanding.
            if (answer.RequestId != state.PendingRequestId) { effects.Add(CoachEffect.Dropped(CoachDropReason.UnknownRequest)); return; }
            next.PendingRequestId = null;
            if (answer.AttemptId != state.AttemptId) { effects.Add(CoachEffect.Dropped(CoachDropReason.StaleAttempt)); return; }
            if (answer.StepId != state.StepId || answer.StepRevision != state.StepRevision)
            { effects.Add(CoachEffect.Dropped(CoachDropReason.StaleStep)); return; }
            var kept = new List<string>(state.seen) { answer.RequestId };
            if (kept.Count > SeenLimit) kept.RemoveRange(0, kept.Count - SeenLimit);
            next.seen = kept.ToArray();
            effects.Add(CoachEffect.Emit(answer));
        }
    }
}
