using System;
using System.Collections.Generic;
using System.Linq;
using System.Reflection;
using Trail.Runtime.Coach;

namespace Trail.Tests.Coach
{
    /// <summary>
    /// Exercises the real pure coach session layer with plain .NET. Everything here is deterministic software
    /// behaviour: it proves no microphone permission, no WebRTC session, no provider, no Unity compilation and
    /// nothing at all about a headset.
    /// </summary>
    public static class CoachScenarios
    {
        public static int Checks { get; private set; }
        private static readonly string[] StepIds = { "seg-1", "seg-2", "seg-3" };

        public static int RunAll()
        {
            var scenarios = new Action[]
            {
                SilencesTheMicrophoneBeforeConnecting,
                ReleasesTheMicrophoneOnEveryExitPath,
                NeverListensWhileTheStepContextIsUnacknowledged,
                DiscardsSupersededReplies,
                DropsALateReplyAfterTheSessionExits,
                BackendLossLeavesTheGuideUsable,
                NoEffectCanAdvanceTheGuide,
                NoCredentialSurfaceExists,
                ContextValidationIsHard,
                TerminalStateStaysTerminal,
                InvariantsHoldAcrossTheEventSpace,
            };
            foreach (var scenario in scenarios) scenario();
            return scenarios.Length;
        }

        // ---- scenarios ------------------------------------------------------------------------------------

        /// <summary>Regression for 99d1547: the device must be open and silent before an offer can exist.</summary>
        private static void SilencesTheMicrophoneBeforeConnecting()
        {
            var session = new CoachSession(Context());
            var connect = session.Connect();
            Check(connect.Effects.Count == 2, "connecting emits exactly two effects");
            Check(connect.Effects[0].Kind == CoachEffectKind.AcquireMicrophoneMuted, "the device is acquired first");
            Check(connect.Effects[1].Kind == CoachEffectKind.OpenTransport, "the transport opens only after that");
            Check(connect.State.MicrophoneHeld && !connect.State.MicrophoneCapturing, "the device is held silent while connecting");
            Check(!connect.Has(CoachEffectKind.EnableMicrophoneCapture), "connecting never enables capture");
            var ready = session.LiveReady();
            Check(ready.Has(CoachEffectKind.DisableMicrophoneCapture), "a ready session re-asserts the mute");
            Check(!ready.State.MicrophoneCapturing, "a ready session is still silent");
            Check(session.ToggleListen().State.MicrophoneCapturing, "only an explicit ask opens the microphone");
        }

        /// <summary>Regression for 6477ebb and f2ce6c1: no exit may leave the capture device open.</summary>
        private static void ReleasesTheMicrophoneOnEveryExitPath()
        {
            var exits = new[]
            {
                CoachEventKind.LiveClosed, CoachEventKind.LiveFailed, CoachEventKind.MicrophoneUnavailable,
                CoachEventKind.ApplicationPaused, CoachEventKind.FocusLost, CoachEventKind.BackendLost, CoachEventKind.Ended,
            };
            foreach (var exit in exits)
                foreach (var start in new Func<CoachSession>[] { Connecting, Live, Listening })
                {
                    var session = start();
                    var held = session.State.MicrophoneHeld;
                    var transition = session.Dispatch(CoachEvent.Of(exit));
                    Check(held, exit + " test starts from a session that really holds the device");
                    Check(transition.Has(CoachEffectKind.ReleaseMicrophoneAndTransport), exit + " releases the microphone and transport");
                    Check(!transition.State.MicrophoneHeld, exit + " leaves no device held");
                    Check(!transition.State.MicrophoneCapturing, exit + " leaves nothing capturing");
                }
            // A failed context push is also an exit: the model may still hold the previous step.
            var live = Live();
            live.MoveToStep("seg-2", 2);
            var failed = live.ContextSyncFailed(live.State.ContextGeneration);
            Check(failed.Has(CoachEffectKind.ReleaseMicrophoneAndTransport), "a failed step push releases the device");
            Check(!failed.State.MicrophoneHeld && failed.State.Mode == CoachMode.Text, "a failed step push ends live coaching");
            // Ending a session that never acquired anything still tells the adapter to release.
            var idle = new CoachSession(Context());
            Check(idle.End().Has(CoachEffectKind.ReleaseMicrophoneAndTransport), "ending an idle session still sweeps the device");
        }

        private static void NeverListensWhileTheStepContextIsUnacknowledged()
        {
            var session = Live();
            var moved = session.MoveToStep("seg-2", 2);
            Check(moved.State.Sync == CoachSync.Pending, "a step change leaves the context unacknowledged");
            Check(moved.Has(CoachEffectKind.InvalidateLiveOutput), "output for the previous step is invalidated");
            Check(moved.Has(CoachEffectKind.SendStepContext), "fresh step context is pushed");
            var refused = session.ToggleListen();
            Check(refused.State.Mode == CoachMode.Live, "the microphone stays shut while the push is unacknowledged");
            Check(!refused.State.MicrophoneCapturing, "no capture starts on an unacknowledged step");
            Check(session.ContextSynced(session.State.ContextGeneration - 1).State.Sync == CoachSync.Pending, "a stale ack is ignored");
            Check(session.ContextSynced(session.State.ContextGeneration).State.Sync == CoachSync.Idle, "the current ack clears the gate");
            Check(session.ToggleListen().State.MicrophoneCapturing, "listening resumes once the step is acknowledged");
            // A change while still connecting is remembered and pushed on ready, not lost.
            var connecting = Connecting();
            connecting.MoveToStep("seg-3", 4);
            Check(connecting.State.ContextDirty, "a change during connect is remembered");
            var ready = connecting.LiveReady();
            Check(ready.Has(CoachEffectKind.SendStepContext) && ready.State.Sync == CoachSync.Pending, "the remembered change is pushed on ready");
        }

        private static void DiscardsSupersededReplies()
        {
            var cases = new (string Label, Func<CoachSession, CoachAnswer> Build, CoachDropReason Reason)[]
            {
                ("another run", s => Answer(s, s.State.PendingRequestId, runId: "run-2"), CoachDropReason.StaleRun),
                ("another tutorial", s => Answer(s, s.State.PendingRequestId, tutorialId: "tut-2"), CoachDropReason.StaleTutorial),
                ("another tutorial revision", s => Answer(s, s.State.PendingRequestId, tutorialRevision: 4), CoachDropReason.StaleTutorial),
                ("another attempt", s => Answer(s, s.State.PendingRequestId, attemptId: "step-0:attempt-9"), CoachDropReason.StaleAttempt),
                ("another step", s => Answer(s, s.State.PendingRequestId, stepId: "seg-3"), CoachDropReason.StaleStep),
                ("another step revision", s => Answer(s, s.State.PendingRequestId, stepRevision: 7), CoachDropReason.StaleStep),
                ("a request nobody made", s => Answer(s, "req-unknown"), CoachDropReason.UnknownRequest),
            };
            foreach (var testCase in cases)
            {
                var session = Live();
                session.AskedText("req-1");
                var transition = session.AnswerArrived(testCase.Build(session));
                Check(!transition.Has(CoachEffectKind.EmitAnswer), "a reply for " + testCase.Label + " is never surfaced");
                Check(transition.Effects.Count == 1 && transition.Effects[0].Kind == CoachEffectKind.DropAnswer,
                    "a reply for " + testCase.Label + " produces exactly one drop");
                Check(transition.Effects[0].Drop == testCase.Reason, "a reply for " + testCase.Label + " is dropped as " + testCase.Reason);
            }
            // A matching reply is surfaced once, and a replay of it is refused.
            var accepted = Live();
            accepted.AskedText("req-2");
            var good = accepted.AnswerArrived(Answer(accepted, "req-2"));
            Check(good.Has(CoachEffectKind.EmitAnswer), "the current reply is surfaced");
            Check(good.State.PendingRequestId == null, "surfacing clears the pending request");
            accepted.AskedText("req-2");
            var replay = accepted.AnswerArrived(Answer(accepted, "req-2"));
            Check(replay.Effects[0].Drop == CoachDropReason.Duplicate, "a replayed reply is dropped as a duplicate");
            // Stepping away after asking makes the in-flight reply stale even though it names the old step.
            var moved = Live();
            moved.AskedText("req-3");
            var pendingAnswer = Answer(moved, "req-3");
            moved.MoveToStep("seg-2", 2);
            var late = moved.AnswerArrived(pendingAnswer);
            Check(late.Effects[0].Drop == CoachDropReason.UnknownRequest, "a step change cancels the outstanding request outright");
        }

        private static void DropsALateReplyAfterTheSessionExits()
        {
            foreach (var exit in new[] { CoachEventKind.ApplicationPaused, CoachEventKind.FocusLost, CoachEventKind.BackendLost })
            {
                var session = Live();
                session.AskedText("req-late");
                var answer = Answer(session, "req-late");
                session.Dispatch(CoachEvent.Of(exit));
                var transition = session.AnswerArrived(answer);
                Check(!transition.Has(CoachEffectKind.EmitAnswer), "a reply arriving after " + exit + " is never surfaced");
                Check(transition.Effects[0].Drop == CoachDropReason.UnknownRequest, "a reply arriving after " + exit + " has no owner");
            }
            var ended = Live();
            ended.AskedText("req-gone");
            var pending = Answer(ended, "req-gone");
            ended.End();
            var afterEnd = ended.AnswerArrived(pending);
            Check(afterEnd.Effects.Count == 1 && afterEnd.Effects[0].Drop == CoachDropReason.SessionEnded,
                "a reply arriving after the session ended is dropped as ended");
            Check(afterEnd.State.Mode == CoachMode.Ended, "a late reply cannot revive an ended session");
        }

        private static void BackendLossLeavesTheGuideUsable()
        {
            var session = Live();
            var lost = session.BackendLost();
            Check(lost.State.Mode == CoachMode.Unavailable, "backend loss is reported as unavailable, not as a working coach");
            Check(!lost.State.BackendAvailable, "backend availability is explicit state");
            Check(lost.State.Notice == CoachNotice.BackendUnavailable, "the learner is told the coach is unavailable");
            Check(lost.State.Notice.Contains("guide continues"), "the notice says the loaded guide continues");
            Check(lost.Has(CoachEffectKind.ReleaseMicrophoneAndTransport), "backend loss releases the device");
            Check(lost.Effects.Count == 1, "backend loss produces no other effect at all");
            // Loaded guidance survives: the fallback answer only repeats already-loaded, reviewed step text.
            var fallback = session.Fallback("req-offline");
            Check(fallback.Source == "fallback" && fallback.Model == null, "the offline answer keeps fallback provenance");
            Check(fallback.Answer.StartsWith("Place the base. "), "the offline answer repeats the loaded step text");
            Check(fallback.StepId == session.Context.CurrentStepId && fallback.StepRevision == session.Context.StepRevision,
                "the offline answer is stamped with the current step");
            Check(session.Connect().State.Mode == CoachMode.Connecting, "the coach can be retried once the backend returns");
            Check(session.State.BackendAvailable, "retrying clears the unavailable marker");
        }

        /// <summary>The headset reducer is the sole progression authority; the coach has no vocabulary for progress.</summary>
        private static void NoEffectCanAdvanceTheGuide()
        {
            var expected = new[]
            {
                "AcquireMicrophoneMuted", "DisableMicrophoneCapture", "DropAnswer", "EmitAnswer", "EnableMicrophoneCapture",
                "InvalidateLiveOutput", "OpenTransport", "ReleaseMicrophoneAndTransport", "SendStepContext",
            };
            var actual = Enum.GetNames(typeof(CoachEffectKind)).OrderBy(name => name, StringComparer.Ordinal).ToArray();
            Check(actual.SequenceEqual(expected), "the coach effect vocabulary is exactly the nine non-progression effects");
            var banned = new[] { "complete", "checkpoint", "advance", "progress", "start", "repeat", "confirm", "dwell", "gate", "pass" };
            foreach (var name in actual)
                foreach (var word in banned)
                    Check(name.IndexOf(word, StringComparison.OrdinalIgnoreCase) < 0, "effect " + name + " does not speak of " + word);

            // Compile-level proof: the pure layer cannot even name a guide, motion, contract or engine type.
            var assembly = typeof(CoachSession).Assembly;
            var referenced = assembly.GetReferencedAssemblies().Select(name => name.Name).ToArray();
            foreach (var forbidden in new[] { "UnityEngine", "UnityEngine.CoreModule", "UnityEditor", "Trail.Motion", "Trail.Contracts", "Trail.Runtime", "Trail.Guide" })
                Check(!referenced.Contains(forbidden), "the pure coach layer does not reference " + forbidden);
            foreach (var type in assembly.GetExportedTypes()) CheckNoForeignSurface(type);

            // A reply can only ever produce a surface or a drop, in every mode the session can reach.
            foreach (var start in new Func<CoachSession>[] { Idle, Connecting, Live, Listening, TextOnly, Unavailable })
            {
                var session = start();
                session.AskedText("req-any");
                var transition = session.AnswerArrived(Answer(session, "req-any"));
                foreach (var effect in transition.Effects)
                    Check(effect.Kind == CoachEffectKind.EmitAnswer || effect.Kind == CoachEffectKind.DropAnswer,
                        "a reply in mode " + session.State.Mode + " produces only answer effects");
            }
        }

        private static void NoCredentialSurfaceExists()
        {
            var secretish = new[] { "token", "secret", "bearer", "credential", "apikey", "password", "authorization" };
            var assembly = typeof(CoachSession).Assembly;
            foreach (var type in assembly.GetExportedTypes())
            {
                CheckNames(type.Name, secretish, "type");
                foreach (var member in type.GetMembers(BindingFlags.Public | BindingFlags.Instance | BindingFlags.Static | BindingFlags.DeclaredOnly))
                {
                    CheckNames(member.Name, secretish, "member " + type.Name + "." + member.Name);
                    var method = member as MethodBase;
                    if (method == null) continue;
                    foreach (var parameter in method.GetParameters())
                        CheckNames(parameter.Name, secretish, "parameter of " + type.Name + "." + member.Name);
                }
            }
            // Nothing the client encodes can carry a credential; the bearer token lives only in the transport header.
            var fakeToken = new string('t', 43);
            var context = Context();
            var bodies = new[]
            {
                CoachJson.SessionRequest("v=0\r\no=- 1 1 IN IP4 127.0.0.1\r\na=ice-ufrag:" + fakeToken + "\r\n", context),
                CoachJson.StepUpdate(3, context),
                CoachJson.TextRequest("req-1", context, "Which way does the support face?"),
                CoachLiveEvents.Mute(1), CoachLiveEvents.Unmute(2), CoachLiveEvents.Close(3),
            };
            foreach (var body in bodies)
                foreach (var word in secretish)
                    Check(body.IndexOf(word, StringComparison.OrdinalIgnoreCase) < 0, "an encoded coach body never names a " + word);
            // Learner-facing text is a fixed vocabulary, so no identifier, question or SDP can leak through it.
            foreach (var notice in CoachNotice.All)
                Check(notice.IndexOf("run-", StringComparison.Ordinal) < 0 && notice.IndexOf("v=0", StringComparison.Ordinal) < 0,
                    "notice text carries no identifier or SDP");
            Check(CoachSession.AdviceLimitation.Contains("cannot complete a step"), "the limitation states the coach cannot complete a step");
        }

        private static void ContextValidationIsHard()
        {
            var steps = new[]
            {
                new CoachStepRef("seg-1", "Place the base", "Slide the base into the center of the mat."),
                new CoachStepRef("seg-2", "Insert the support", "Drop the tall support into the base slot."),
            };
            Rejects(() => new CoachContext("tut-1", 3, "run-1", "a-1", "Frame", steps, "seg-9", 1), "a current step outside the approved list");
            Rejects(() => new CoachContext("tut-1", -1, "run-1", "a-1", "Frame", steps, "seg-1", 1), "a negative tutorial revision");
            Rejects(() => new CoachContext("tut-1", 3, "", "a-1", "Frame", steps, "seg-1", 1), "an empty run ID");
            Rejects(() => new CoachContext("tut-1", 3, "run-1", "a-1", "Frame", new[] { steps[0], steps[0] }, "seg-1", 1), "duplicate step IDs");
            Rejects(() => new CoachContext("tut-1", 3, "run-1", "a-1", "Frame", new CoachStepRef[0], "seg-1", 1), "an empty step list");
            Rejects(() => new CoachStepRef("seg-1", new string('t', 61), "Fine."), "an over-long step title");
            Rejects(() => new CoachStepRef("seg-1", "Fine", new string('i', 241)), "an over-long instruction");
            Rejects(() => new CoachStepRef("seg-1", "Bad\ttitle", "Fine."), "a control character in a title");
            Rejects(() => new CoachContext("tut-1", 3, "run-1", "a-1", "Frame", steps, "seg-1", 1, new string('n', 501)), "over-long layout notes");
            Rejects(() => CoachEvent.StepChanged("seg-1", -1), "a negative step revision on a step change");
            Rejects(() => CoachEvent.Of(CoachEventKind.StepChanged), "a data-carrying event built without its data");
            var context = Context();
            Rejects(() => context.WithStep("seg-9", 1), "moving the context to a step the tutorial does not hold");
            Check(context.WithStep("seg-2", 5).StepRevision == 5, "moving to an approved step keeps the revision given");
            Check(context.WithAttempt("step-0:attempt-2").CurrentStepId == context.CurrentStepId, "a new attempt keeps the same step");
            Check(context.Steps.Count == 3 && context.CurrentStep.Title == "Place the base", "the context exposes the approved step text");
            Rejects(() => new CoachSession(null), "a session without a context");
            Rejects(() => new CoachAnswer("r", "run-1", "tut-1", 3, "seg-1", 1, "a-1", "Fine.", true, "invented", null), "an invented answer provenance");
            Rejects(() => new CoachAnswer("r", "run-1", "tut-1", 3, "seg-1", 1, "a-1", new string('a', 601), true, "model", null), "an over-long answer");
        }

        private static void TerminalStateStaysTerminal()
        {
            foreach (var kind in Enum.GetValues(typeof(CoachEventKind)).Cast<CoachEventKind>())
            {
                var session = Listening();
                session.End();
                var before = Describe(session.State);
                var input = kind == CoachEventKind.StepChanged ? CoachEvent.StepChanged("seg-2", 2)
                    : kind == CoachEventKind.AttemptChanged ? CoachEvent.AttemptChanged("step-0:attempt-4")
                    : kind == CoachEventKind.ContextSynced ? CoachEvent.ContextSynced(0)
                    : kind == CoachEventKind.ContextSyncFailed ? CoachEvent.ContextSyncFailed(0)
                    : kind == CoachEventKind.TextAsked ? CoachEvent.TextAsked("req-x")
                    : kind == CoachEventKind.AnswerReceived ? CoachEvent.AnswerReceived(Answer(session, "req-x"))
                    : CoachEvent.Of(kind);
                var transition = session.Dispatch(input);
                Check(Describe(transition.State) == before, kind + " cannot change an ended coach session");
                Check(!transition.Has(CoachEffectKind.AcquireMicrophoneMuted), kind + " cannot reopen the device after the end");
                Check(!transition.Has(CoachEffectKind.EmitAnswer), kind + " cannot surface anything after the end");
            }
        }

        /// <summary>A deterministic walk of the whole event space, checking the safety invariants on every transition.</summary>
        private static void InvariantsHoldAcrossTheEventSpace()
        {
            var session = new CoachSession(Context());
            var seed = 20260919;
            var visited = new HashSet<string>(StringComparer.Ordinal);
            for (var step = 0; step < 20000; step++)
            {
                seed = (int)(((long)seed * 1103515245 + 12345) & 0x7fffffff);
                var before = session.State;
                var input = Roll(session, seed);
                var transition = session.Dispatch(input);
                CheckInvariants(before, transition, input);
                visited.Add(transition.State.Mode + "/" + transition.State.Sync + "/" + transition.State.MicrophoneHeld);
                // Restart occasionally so the walk keeps covering the pre-connect states too.
                if (step % 617 == 0) session = new CoachSession(Context());
            }
            foreach (var mode in new[] { CoachMode.Idle, CoachMode.Connecting, CoachMode.Live, CoachMode.Listening, CoachMode.Text, CoachMode.Unavailable })
                Check(visited.Any(entry => entry.StartsWith(mode + "/", StringComparison.Ordinal)), "the walk reached mode " + mode);
        }

        // ---- invariants -----------------------------------------------------------------------------------

        private static void CheckInvariants(CoachSessionState before, CoachTransition transition, CoachEvent input)
        {
            var after = transition.State;
            var effects = transition.Effects;
            Check(!after.MicrophoneCapturing || after.MicrophoneHeld, "capture implies a held device");
            Check(!after.MicrophoneCapturing || after.Mode == CoachMode.Listening, "only a listening coach captures");
            Check(!(after.Mode == CoachMode.Idle || after.Mode == CoachMode.Text || after.Mode == CoachMode.Unavailable || after.Mode == CoachMode.Ended)
                || !after.MicrophoneHeld, "no released or terminal mode holds the device");
            if (before.MicrophoneHeld && !after.MicrophoneHeld)
                Check(transition.Has(CoachEffectKind.ReleaseMicrophoneAndTransport), "losing the device always emits a release");
            if (transition.Has(CoachEffectKind.ReleaseMicrophoneAndTransport))
                Check(!after.MicrophoneHeld && !after.MicrophoneCapturing, "a release leaves nothing held or capturing");
            if (!before.MicrophoneHeld && after.MicrophoneHeld)
            {
                Check(transition.Has(CoachEffectKind.AcquireMicrophoneMuted), "acquiring the device always emits an acquire");
                Check(!after.MicrophoneCapturing, "a freshly acquired device never captures");
                Check(!transition.Has(CoachEffectKind.EnableMicrophoneCapture), "acquiring and enabling never happen together");
            }
            var acquire = IndexOf(effects, CoachEffectKind.AcquireMicrophoneMuted);
            var open = IndexOf(effects, CoachEffectKind.OpenTransport);
            if (open >= 0) Check(acquire >= 0 && acquire < open, "the transport never opens before the device is silenced");
            Check(after.Mode != CoachMode.Listening || after.Sync == CoachSync.Idle, "listening never overlaps an unacknowledged step");
            Check(CoachNotice.All.Contains(after.Notice), "the notice comes from the fixed learner-facing vocabulary");
            Check(after.ContextGeneration >= before.ContextGeneration, "the context generation never goes backwards");
            var context = IndexOf(effects, CoachEffectKind.SendStepContext);
            if (context >= 0)
            {
                Check(effects[context].Generation == after.ContextGeneration, "a step push reports the current generation");
                Check(after.Sync == CoachSync.Pending, "a step push leaves the context unacknowledged");
            }
            var emits = effects.Count(effect => effect.Kind == CoachEffectKind.EmitAnswer);
            var drops = effects.Count(effect => effect.Kind == CoachEffectKind.DropAnswer);
            Check(emits + drops <= 1, "a transition resolves at most one reply");
            Check(emits + drops == 0 || input.Kind == CoachEventKind.AnswerReceived, "only a reply event resolves a reply");
            if (emits == 1)
            {
                var answer = effects.First(effect => effect.Kind == CoachEffectKind.EmitAnswer).Answer;
                Check(answer.RunId == after.RunId && answer.TutorialId == after.TutorialId && answer.TutorialRevision == after.TutorialRevision,
                    "a surfaced reply matches the current run and tutorial");
                Check(answer.StepId == after.StepId && answer.StepRevision == after.StepRevision && answer.AttemptId == after.AttemptId,
                    "a surfaced reply matches the current step and attempt");
                Check(after.SeenRequestIds.Contains(answer.RequestId), "a surfaced reply is remembered so it cannot be replayed");
            }
            Check(after.SeenRequestIds.Count <= 50, "the remembered request list stays bounded");
            Check(after.PendingRequestId == null || input.Kind == CoachEventKind.TextAsked || after.PendingRequestId == before.PendingRequestId,
                "only asking creates an outstanding request");
        }

        // ---- fixtures and helpers -------------------------------------------------------------------------

        private static CoachContext Context(string runId = "run-1", string attemptId = "step-0:attempt-1", string stepId = "seg-1", int stepRevision = 1) =>
            new CoachContext("tut-1", 3, runId, attemptId, "Build the frame", new[]
            {
                new CoachStepRef("seg-1", "Place the base", "Slide the base from its outline into the center of the mat."),
                new CoachStepRef("seg-2", "Insert the support", "Drop the tall support straight down into the base slot."),
                new CoachStepRef("seg-3", "Add the crosspiece and cap", "Lay the crosspiece across the support, then press the cap on."),
            }, stepId, stepRevision);

        private static CoachSession Idle() => new CoachSession(Context());
        private static CoachSession Connecting() { var session = Idle(); session.Connect(); return session; }
        private static CoachSession Live() { var session = Connecting(); session.LiveReady(); return session; }
        private static CoachSession Listening() { var session = Live(); session.ToggleListen(); return session; }
        private static CoachSession TextOnly() { var session = Live(); session.LiveClosed(); return session; }
        private static CoachSession Unavailable() { var session = Live(); session.BackendLost(); return session; }

        private static CoachAnswer Answer(CoachSession session, string requestId, string runId = null, string tutorialId = null,
            int tutorialRevision = -1, string stepId = null, int stepRevision = -1, string attemptId = null) =>
            new CoachAnswer(requestId ?? "req-none", runId ?? session.State.RunId, tutorialId ?? session.State.TutorialId,
                tutorialRevision < 0 ? session.State.TutorialRevision : tutorialRevision, stepId ?? session.State.StepId,
                stepRevision < 0 ? session.State.StepRevision : stepRevision, attemptId ?? session.State.AttemptId,
                "Line the base up with its outline before you press down.", true, "model", "gpt-live");

        private static CoachEvent Roll(CoachSession session, int seed)
        {
            var state = session.State;
            switch (seed % 17)
            {
                case 0: return CoachEvent.Of(CoachEventKind.ConnectRequested);
                case 1: return CoachEvent.Of(CoachEventKind.LiveReady);
                case 2: return CoachEvent.Of(CoachEventKind.LiveFailed);
                case 3: return CoachEvent.Of(CoachEventKind.LiveClosed);
                case 4: return CoachEvent.Of(CoachEventKind.ListenToggled);
                case 5: return CoachEvent.Of(CoachEventKind.ListenTimeout);
                case 6: return CoachEvent.StepChanged(StepIds[(seed / 15) % StepIds.Length], (seed / 3) % 6);
                case 7: return CoachEvent.AttemptChanged("step-0:attempt-" + (1 + (seed / 7) % 5));
                case 8: return CoachEvent.ContextSynced(Math.Max(0, state.ContextGeneration - (seed % 2)));
                case 9: return CoachEvent.ContextSyncFailed(Math.Max(0, state.ContextGeneration - (seed % 2)));
                case 10: return CoachEvent.TextAsked("req-" + (seed % 97));
                case 11: return CoachEvent.AnswerReceived(Answer(session, state.PendingRequestId ?? "req-" + (seed % 97)));
                case 12: return CoachEvent.AnswerReceived(Answer(session, state.PendingRequestId, stepRevision: (seed / 11) % 6));
                case 13: return CoachEvent.Of(CoachEventKind.MicrophoneUnavailable);
                case 14: return CoachEvent.Of(CoachEventKind.ApplicationPaused);
                case 15: return CoachEvent.Of(CoachEventKind.FocusLost);
                default: return CoachEvent.Of(CoachEventKind.BackendLost);
            }
        }

        private static string Describe(CoachSessionState state) =>
            state.Mode + "|" + state.Sync + "|" + state.MicrophoneHeld + "|" + state.MicrophoneCapturing + "|" + state.LiveClosed + "|" +
            state.BackendAvailable + "|" + state.ContextGeneration + "|" + state.ContextDirty + "|" + state.StepId + "|" + state.StepRevision + "|" +
            state.AttemptId + "|" + (state.PendingRequestId ?? "-") + "|" + state.Notice + "|" + state.SeenRequestIds.Count;

        private static int IndexOf(IReadOnlyList<CoachEffect> effects, CoachEffectKind kind)
        {
            for (var i = 0; i < effects.Count; i++) if (effects[i].Kind == kind) return i;
            return -1;
        }

        private static void CheckNames(string name, string[] banned, string what)
        {
            foreach (var word in banned)
                Check(name.IndexOf(word, StringComparison.OrdinalIgnoreCase) < 0, what + " does not name a " + word);
        }

        /// <summary>No public coach member may expose a type from outside System and the coach namespace.</summary>
        private static void CheckNoForeignSurface(Type type)
        {
            foreach (var method in type.GetMethods(BindingFlags.Public | BindingFlags.Instance | BindingFlags.Static | BindingFlags.DeclaredOnly))
            {
                CheckLocal(method.ReturnType, type.Name + "." + method.Name);
                foreach (var parameter in method.GetParameters()) CheckLocal(parameter.ParameterType, type.Name + "." + method.Name);
            }
            foreach (var constructor in type.GetConstructors())
                foreach (var parameter in constructor.GetParameters()) CheckLocal(parameter.ParameterType, type.Name + " constructor");
            foreach (var field in type.GetFields(BindingFlags.Public | BindingFlags.Instance | BindingFlags.Static | BindingFlags.DeclaredOnly))
                CheckLocal(field.FieldType, type.Name + "." + field.Name);
        }
        private static void CheckLocal(Type type, string what)
        {
            if (type.IsGenericType) foreach (var argument in type.GetGenericArguments()) CheckLocal(argument, what);
            if (type.HasElementType) CheckLocal(type.GetElementType(), what);
            var space = type.Namespace ?? "";
            Check(space == "Trail.Runtime.Coach" || space == "System" || space.StartsWith("System.", StringComparison.Ordinal),
                what + " exposes only coach and System types (saw " + space + ")");
        }

        private static void Check(bool condition, string what)
        {
            Checks++;
            if (!condition) throw new Exception("FAILED: " + what);
        }
        private static void Rejects(Action action, string what)
        {
            Checks++;
            try { action(); }
            catch (ArgumentException) { return; }
            throw new Exception("FAILED: expected a rejection for " + what);
        }
    }
}
