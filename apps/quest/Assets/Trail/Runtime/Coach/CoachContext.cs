using System;
using System.Collections.Generic;
using System.Collections.ObjectModel;

namespace Trail.Runtime.Coach
{
    /// <summary>Wire limits mirrored from packages/contracts/src/voice.ts so both ends refuse the same payloads.</summary>
    internal static class CoachBounds
    {
        internal const int MaxId = 128;
        internal const int MaxShortName = 128;
        internal const int MaxContextTitle = 120;
        internal const int MaxStepTitle = 60;
        internal const int MaxInstruction = 240;
        internal const int MaxLayoutNotes = 500;
        internal const int MaxQuestion = 500;
        internal const int MaxAnswer = 600;
        internal const int MaxSdp = 64 * 1024;
        internal const int MaxSteps = 128;
        internal const int MaxRevision = 2147483647;
        private const char Delete = (char)127;

        internal static string Id(string value, string what) => Line(value, 1, MaxId, what);
        /// <summary>Single-line text: identifiers, titles and instructions carry no control characters at all.</summary>
        internal static string Line(string value, int min, int max, string what)
        {
            if (value == null || value.Length < min || value.Length > max) throw new ArgumentException("Coach " + what + " is missing or out of range.");
            foreach (char c in value) if (c < ' ' || c == Delete) throw new ArgumentException("Coach " + what + " contains a control character.");
            return value;
        }
        /// <summary>Free text: answers, questions, notes and SDP keep tab/CR/LF and nothing else below space.</summary>
        internal static string Prose(string value, int min, int max, string what)
        {
            if (value == null || value.Length < min || value.Length > max) throw new ArgumentException("Coach " + what + " is missing or out of range.");
            foreach (char c in value)
                if ((c < ' ' && c != '\t' && c != '\r' && c != '\n') || c == Delete) throw new ArgumentException("Coach " + what + " contains a control character.");
            return value;
        }
        internal static int Revision(int value, string what)
        {
            if (value < 0 || value > MaxRevision) throw new ArgumentException("Coach " + what + " is out of range.");
            return value;
        }
        /// <summary>Session IDs are pasted into a URL path; accept only the server's own route grammar.</summary>
        internal static string SessionId(string value)
        {
            if (value == null || value.Length < 1 || value.Length > MaxShortName) throw new ArgumentException("Coach session ID is missing or out of range.");
            foreach (char c in value)
                if (!((c >= 'A' && c <= 'Z') || (c >= 'a' && c <= 'z') || (c >= '0' && c <= '9') || c == '_' || c == '-'))
                    throw new ArgumentException("Coach session ID has a character that is not URL-safe.");
            return value;
        }
    }

    /// <summary>One reviewed step the coach may quote. The coach never invents steps and never reorders them.</summary>
    public sealed class CoachStepRef
    {
        public string Id { get; }
        public string Title { get; }
        public string Instruction { get; }
        public CoachStepRef(string id, string title, string instruction)
        {
            Id = CoachBounds.Id(id, "step ID");
            Title = CoachBounds.Line(title, 1, CoachBounds.MaxStepTitle, "step title");
            Instruction = CoachBounds.Line(instruction, 1, CoachBounds.MaxInstruction, "step instruction");
        }
    }

    /// <summary>
    /// Immutable coach identity plus the approved step text. Pure: no engine, transport, clock, file or provider type.
    /// The headset reducer owns progression; this only tells the coach which step the learner already reached.
    /// </summary>
    public sealed class CoachContext
    {
        public string TutorialId { get; }
        public int TutorialRevision { get; }
        public string RunId { get; }
        public string AttemptId { get; }
        public string Title { get; }
        public ReadOnlyCollection<CoachStepRef> Steps { get; }
        public string CurrentStepId { get; }
        public int StepRevision { get; }
        public string LayoutNotes { get; }

        public CoachContext(string tutorialId, int tutorialRevision, string runId, string attemptId, string title,
            IEnumerable<CoachStepRef> steps, string currentStepId, int stepRevision, string layoutNotes = null)
        {
            TutorialId = CoachBounds.Id(tutorialId, "tutorial ID");
            TutorialRevision = CoachBounds.Revision(tutorialRevision, "tutorial revision");
            RunId = CoachBounds.Id(runId, "run ID");
            AttemptId = CoachBounds.Id(attemptId, "attempt ID");
            Title = CoachBounds.Line(title, 1, CoachBounds.MaxContextTitle, "tutorial title");
            CurrentStepId = CoachBounds.Id(currentStepId, "current step ID");
            StepRevision = CoachBounds.Revision(stepRevision, "step revision");
            LayoutNotes = layoutNotes == null ? null : CoachBounds.Prose(layoutNotes, 1, CoachBounds.MaxLayoutNotes, "layout notes");
            if (steps == null) throw new ArgumentNullException(nameof(steps));
            var list = new List<CoachStepRef>();
            foreach (var step in steps)
            {
                if (step == null) throw new ArgumentException("Coach steps must not be null.");
                foreach (var seen in list) if (seen.Id == step.Id) throw new ArgumentException("Coach step IDs must be unique.");
                list.Add(step);
            }
            if (list.Count < 1 || list.Count > CoachBounds.MaxSteps) throw new ArgumentException("A coach context needs 1..128 steps.");
            Steps = list.AsReadOnly();
            if (IndexOf(currentStepId) < 0) throw new ArgumentException("The current step must be one of the approved steps.");
        }

        public int IndexOf(string stepId)
        {
            for (var i = 0; i < Steps.Count; i++) if (Steps[i].Id == stepId) return i;
            return -1;
        }
        public CoachStepRef CurrentStep => Steps[IndexOf(CurrentStepId)];
        public bool Contains(string stepId) => IndexOf(stepId) >= 0;
        /// <summary>Same run and tutorial revision. A different one is another conversation, not an update.</summary>
        public bool SameRun(CoachContext other) =>
            other != null && other.RunId == RunId && other.TutorialId == TutorialId && other.TutorialRevision == TutorialRevision;
        public CoachContext WithStep(string stepId, int stepRevision) =>
            new CoachContext(TutorialId, TutorialRevision, RunId, AttemptId, Title, Steps, stepId, stepRevision, LayoutNotes);
        public CoachContext WithAttempt(string attemptId) =>
            new CoachContext(TutorialId, TutorialRevision, RunId, attemptId, Title, Steps, CurrentStepId, StepRevision, LayoutNotes);
    }
}
