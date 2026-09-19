using System;
using Trail.Motion;

namespace Trail.Runtime.Guide
{
    // Runtime effect boundary. An open, preloaded guide has no backend dependency.
    public sealed class GuideSession
    {
        public GuideDefinition Definition { get; }
        public GuideState State { get; private set; }
        public event Action<GuideTransition> Transitioned;
        private bool dispatching;
        public GuideSession(GuideDefinition definition, string runId)
        { Definition = definition ?? throw new ArgumentNullException(nameof(definition)); State = GuideState.Create(runId); }
        public GuideTransition Dispatch(GuideInput input)
        {
            if (dispatching) throw new InvalidOperationException("Guide effects must queue actions for the next update, not reenter dispatch.");
            dispatching = true;
            try
            {
                var transition = GuideReducer.Reduce(Definition, State, input);
                State = transition.State; // Commit before executing any effect.
                Transitioned?.Invoke(transition);
                return transition;
            }
            finally { dispatching = false; }
        }
        public void Pause(double nowMs) => Dispatch(new GuideInput(GuideAction.Pause, nowMs));
        public void Resume(double nowMs) => Dispatch(new GuideInput(GuideAction.Resume, nowMs));
        public void Repeat(double nowMs) => Dispatch(new GuideInput(GuideAction.Repeat, nowMs));
        public void Invalidate(double nowMs) => Dispatch(new GuideInput(GuideAction.ReferenceReset, nowMs));
    }
}
