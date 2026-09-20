using System;

namespace Trail.Runtime.Coach
{
    /// <summary>
    /// The coach's pure effect boundary: it owns the context and the reduced state, and hands an adapter the
    /// effects to execute. It never touches the guide. The headset reducer remains the sole progression
    /// authority; nothing reachable from here can start, complete, repeat or confirm a step.
    /// </summary>
    public sealed class CoachSession
    {
        /// <summary>Shown with every coach reply. Agreement from the coach is advice, not a verified physical result.</summary>
        public const string AdviceLimitation =
            "Coach advice only. It cannot complete a step, verify a grasp, or confirm that parts are really assembled.";

        public CoachContext Context { get; private set; }
        public CoachSessionState State { get; private set; }
        public event Action<CoachTransition> Transitioned;
        private bool dispatching;

        public CoachSession(CoachContext context)
        {
            if (context == null) throw new ArgumentNullException(nameof(context));
            Context = context;
            State = CoachSessionState.Create(context);
        }

        public CoachTransition Dispatch(CoachEvent input)
        {
            if (input == null) throw new ArgumentNullException(nameof(input));
            if (dispatching) throw new InvalidOperationException("Coach effects must queue events for the next update, not reenter dispatch.");
            dispatching = true;
            try
            {
                // Validate and move the context first: an unknown step throws before any state is committed.
                if (State.Mode != CoachMode.Ended)
                {
                    if (input.Kind == CoachEventKind.StepChanged) Context = Context.WithStep(input.StepId, input.StepRevision);
                    else if (input.Kind == CoachEventKind.AttemptChanged) Context = Context.WithAttempt(input.AttemptId);
                }
                var transition = CoachReducer.Reduce(State, input);
                State = transition.State; // Commit before any listener runs.
                Transitioned?.Invoke(transition);
                return transition;
            }
            finally { dispatching = false; }
        }

        public CoachTransition Connect() => Dispatch(CoachEvent.Of(CoachEventKind.ConnectRequested));
        public CoachTransition MicrophoneUnavailable() => Dispatch(CoachEvent.Of(CoachEventKind.MicrophoneUnavailable));
        public CoachTransition LiveReady() => Dispatch(CoachEvent.Of(CoachEventKind.LiveReady));
        public CoachTransition LiveFailed() => Dispatch(CoachEvent.Of(CoachEventKind.LiveFailed));
        public CoachTransition LiveClosed() => Dispatch(CoachEvent.Of(CoachEventKind.LiveClosed));
        public CoachTransition ToggleListen() => Dispatch(CoachEvent.Of(CoachEventKind.ListenToggled));
        public CoachTransition ListenTimedOut() => Dispatch(CoachEvent.Of(CoachEventKind.ListenTimeout));
        /// <summary>The guide reached another step. Reporting it never causes it; the reducer already decided it.</summary>
        public CoachTransition MoveToStep(string stepId, int stepRevision) => Dispatch(CoachEvent.StepChanged(stepId, stepRevision));
        /// <summary>Repeat started a new attempt, so replies for the previous one no longer apply.</summary>
        public CoachTransition StartAttempt(string attemptId) => Dispatch(CoachEvent.AttemptChanged(attemptId));
        public CoachTransition ContextSynced(int generation) => Dispatch(CoachEvent.ContextSynced(generation));
        public CoachTransition ContextSyncFailed(int generation) => Dispatch(CoachEvent.ContextSyncFailed(generation));
        public CoachTransition AskedText(string requestId) => Dispatch(CoachEvent.TextAsked(requestId));
        public CoachTransition AnswerArrived(CoachAnswer answer) => Dispatch(CoachEvent.AnswerReceived(answer));
        public CoachTransition Paused() => Dispatch(CoachEvent.Of(CoachEventKind.ApplicationPaused));
        public CoachTransition FocusLost() => Dispatch(CoachEvent.Of(CoachEventKind.FocusLost));
        /// <summary>The paired backend is gone. The coach says so; the loaded guide is untouched.</summary>
        public CoachTransition BackendLost() => Dispatch(CoachEvent.Of(CoachEventKind.BackendLost));
        public CoachTransition End() => Dispatch(CoachEvent.Of(CoachEventKind.Ended));

        /// <summary>The answer to show when the backend or provider cannot be reached; it only repeats loaded step text.</summary>
        public CoachAnswer Fallback(string requestId) => CoachFallback.For(Context, requestId);
    }
}
