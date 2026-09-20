using System;

namespace Trail.Runtime.Coach
{
    /// <summary>
    /// A coach reply, stamped with the exact guide identity it was produced for. Advice only: nothing here can
    /// complete a step, verify a grasp or prove an assembly property the headset cannot observe.
    /// </summary>
    public sealed class CoachAnswer
    {
        public string RequestId { get; }
        public string RunId { get; }
        public string TutorialId { get; }
        public int TutorialRevision { get; }
        public string StepId { get; }
        public int StepRevision { get; }
        public string AttemptId { get; }
        public string Answer { get; }
        public bool Grounded { get; }
        /// <summary>"model" or "fallback"; provenance survives to the learner-facing surface.</summary>
        public string Source { get; }
        public string Model { get; }

        public CoachAnswer(string requestId, string runId, string tutorialId, int tutorialRevision, string stepId,
            int stepRevision, string attemptId, string answer, bool grounded, string source, string model)
        {
            RequestId = CoachBounds.Id(requestId, "request ID");
            RunId = CoachBounds.Id(runId, "run ID");
            TutorialId = CoachBounds.Id(tutorialId, "tutorial ID");
            TutorialRevision = CoachBounds.Revision(tutorialRevision, "tutorial revision");
            StepId = CoachBounds.Id(stepId, "step ID");
            StepRevision = CoachBounds.Revision(stepRevision, "step revision");
            AttemptId = CoachBounds.Id(attemptId, "attempt ID");
            Answer = CoachBounds.Prose(answer, 1, CoachBounds.MaxAnswer, "answer");
            if (source != "model" && source != "fallback") throw new ArgumentException("Coach answer provenance must be model or fallback.");
            Source = source;
            Model = model == null ? null : CoachBounds.Line(model, 1, CoachBounds.MaxShortName, "model name");
            Grounded = grounded;
        }
    }

    /// <summary>What the paired server returned for an accepted live session. The bearer token stays in the transport and never lands here.</summary>
    public sealed class CoachSessionGrant
    {
        public string SessionId { get; }
        /// <summary>Provider answer SDP. Applied once by the adapter; never logged, stored or surfaced.</summary>
        public string AnswerSdp { get; }
        public string LiveModel { get; }
        public CoachSessionGrant(string sessionId, string answerSdp, string liveModel)
        {
            SessionId = CoachBounds.SessionId(sessionId);
            AnswerSdp = CoachBounds.Prose(answerSdp, 1, CoachBounds.MaxSdp, "answer SDP");
            LiveModel = CoachBounds.Line(liveModel, 1, CoachBounds.MaxShortName, "live model name");
        }
    }

    /// <summary>The server's refusal codes. Only the code crosses into the UI; server prose is never echoed to the learner.</summary>
    public static class CoachFailure
    {
        public static readonly string[] Codes = {
            "live_unavailable", "provider_unavailable", "payload_too_large", "unsupported_media_type", "invalid_request",
            "unauthorized", "forbidden", "unknown_tutorial", "stale_tutorial", "unknown_session", "stale_update",
        };
        public static bool Known(string code)
        {
            if (code == null) return false;
            foreach (var known in Codes) if (known == code) return true;
            return false;
        }
    }

    /// <summary>
    /// The answer used when the backend or provider cannot be reached. It only repeats the reviewed step text
    /// already loaded on the headset, so losing the coach never blocks a loaded guide.
    /// </summary>
    public static class CoachFallback
    {
        public static CoachAnswer For(CoachContext context, string requestId)
        {
            if (context == null) throw new ArgumentNullException(nameof(context));
            var step = context.CurrentStep;
            var text = step.Title + ". " + step.Instruction;
            if (text.Length > CoachBounds.MaxAnswer) text = text.Substring(0, CoachBounds.MaxAnswer);
            return new CoachAnswer(requestId, context.RunId, context.TutorialId, context.TutorialRevision,
                context.CurrentStepId, context.StepRevision, context.AttemptId, text, true, "fallback", null);
        }
    }
}
