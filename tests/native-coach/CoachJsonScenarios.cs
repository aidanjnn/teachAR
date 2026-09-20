using System;
using System.Linq;
using Trail.Runtime.Coach;

namespace Trail.Tests.Coach
{
    /// <summary>Strict-parsing and encoding checks for the coach wire boundary. Pure string work; no server is contacted.</summary>
    public static class CoachJsonScenarios
    {
        public static int Checks { get; private set; }
        private const string Grant = "{\"schemaVersion\":1,\"sessionId\":\"sess_A-1\",\"sdp\":\"v=0\\r\\na=recvonly\\r\\n\",\"liveModel\":\"gpt-live\"}";
        private const string AnswerJson = "{\"schemaVersion\":1,\"requestId\":\"req-1\",\"runId\":\"run-1\",\"tutorialId\":\"tut-1\"," +
            "\"tutorialRevision\":3,\"stepId\":\"seg-1\",\"stepRevision\":1,\"attemptId\":\"step-0:attempt-1\"," +
            "\"answer\":\"Line the base up with its outline.\",\"grounded\":true,\"source\":\"model\",\"model\":\"gpt-live\"}";

        public static int RunAll()
        {
            var scenarios = new Action[] { EncodesBoundedRequests, ParsesGrantsStrictly, ParsesAnswersStrictly, ReportsOnlyRefusalCodes, EncodesTheAllowedLiveEvents };
            foreach (var scenario in scenarios) scenario();
            return scenarios.Length;
        }

        private static void EncodesBoundedRequests()
        {
            var context = Fixture();
            var body = CoachJson.SessionRequest("v=0\r\no=- 1 1 IN IP4 127.0.0.1\r\n", context);
            Check(body.All(c => c >= ' '), "no raw control character survives encoding");
            Check(body.Contains("\\u000d\\u000a"), "CRLF inside SDP is escaped, not emitted raw");
            Check(body.StartsWith("{\"schemaVersion\":1,\"sdp\":\"", StringComparison.Ordinal), "the session request leads with its schema version");
            Check(body.Contains("\"steps\":[{\"id\":\"seg-1\""), "the approved step list travels with the request");
            Check(body.Contains("\"currentStepId\":\"seg-1\"") && body.Contains("\"stepRevision\":1"), "the current step and revision travel with the request");
            Check(!body.Contains("layoutNotes"), "an absent optional field is omitted rather than sent as null");
            Check(CoachJson.SessionRequest("v=0\r\n", WithNotes()).Contains("\"layoutNotes\":\"Mat on the left.\""), "layout notes are sent when present");

            var update = CoachJson.StepUpdate(4, context);
            Check(update == "{\"schemaVersion\":1,\"generation\":4,\"currentStepId\":\"seg-1\",\"stepRevision\":1,\"attemptId\":\"step-0:attempt-1\"}",
                "the step update names only the step, revision, attempt and generation");
            Check(!update.Contains("instruction"), "the step update does not resend tutorial text the server already holds");

            var text = CoachJson.TextRequest("req-1", context, "Which way does the support face?");
            Check(text.Contains("\"requestId\":\"req-1\"") && text.Contains("\"question\":\"Which way does the support face?\""), "the text request carries its ID and question");
            Check(CoachJson.TextRequest("req-1", context, "He said \"left\"\\right").Contains("\\\"left\\\"\\\\right"), "quotes and backslashes in a question are escaped");

            Rejects(() => CoachJson.SessionRequest(new string('s', 64 * 1024 + 1), context), "an over-long offer SDP");
            Rejects(() => CoachJson.SessionRequest("", context), "an empty offer SDP");
            Rejects(() => CoachJson.TextRequest("req-1", context, new string('q', 501)), "an over-long question");
            Rejects(() => CoachJson.TextRequest(new string('r', 129), context, "Fine?"), "an over-long request ID");
            Rejects(() => CoachJson.StepUpdate(-1, context), "a negative context generation");
            Rejects(() => CoachLiveEvents.Mute(-1), "a negative live event sequence");
        }

        private static void ParsesGrantsStrictly()
        {
            var grant = CoachJson.ParseSessionGrant(Grant);
            Check(grant.SessionId == "sess_A-1" && grant.LiveModel == "gpt-live", "a valid grant yields its session and model");
            Check(grant.AnswerSdp == "v=0\r\na=recvonly\r\n", "the answer SDP is decoded, escapes and all");
            Rejects(() => CoachJson.ParseSessionGrant(Grant.Replace("sess_A-1", "../../etc")), "a session ID that could escape its URL path");
            Rejects(() => CoachJson.ParseSessionGrant(Grant.Replace("sess_A-1", "a/b")), "a session ID with a path separator");
            Rejects(() => CoachJson.ParseSessionGrant(Grant.Replace("\"schemaVersion\":1", "\"schemaVersion\":2")), "an unsupported schema version");
            Rejects(() => CoachJson.ParseSessionGrant(Grant.Replace("}", ",\"extra\":1}")), "an unexpected extra property");
            Rejects(() => CoachJson.ParseSessionGrant(Grant.Replace("\"liveModel\":\"gpt-live\"", "\"liveModel\":\"gpt-live\",\"liveModel\":\"other\"")), "a duplicated property");
            Rejects(() => CoachJson.ParseSessionGrant(Grant + "{}"), "trailing input after the object");
            Rejects(() => CoachJson.ParseSessionGrant("{\"schemaVersion\":1,\"sessionId\":{\"a\":1},\"sdp\":\"v=0\",\"liveModel\":\"m\"}"), "a nested object where a scalar belongs");
            Rejects(() => CoachJson.ParseSessionGrant("{\"schemaVersion\":1,\"sessionId\":[\"a\"],\"sdp\":\"v=0\",\"liveModel\":\"m\"}"), "an array where a scalar belongs");
            Rejects(() => CoachJson.ParseSessionGrant(null), "a missing body");
            Rejects(() => CoachJson.ParseSessionGrant(""), "an empty body");
            Rejects(() => CoachJson.ParseSessionGrant("{\"schemaVersion\":1,\"sessionId\":\"s\",\"sdp\":\"" + new string('x', 64 * 1024 + 1) + "\",\"liveModel\":\"m\"}"), "an over-long answer SDP");
        }

        private static void ParsesAnswersStrictly()
        {
            var answer = CoachJson.ParseAnswer(AnswerJson);
            Check(answer.RequestId == "req-1" && answer.RunId == "run-1" && answer.StepId == "seg-1", "a valid answer keeps its identity");
            Check(answer.Source == "model" && answer.Model == "gpt-live" && answer.Grounded, "a valid answer keeps its provenance");
            Check(CoachJson.ParseAnswer(AnswerJson.Replace("\"model\":\"gpt-live\"", "\"model\":null")).Model == null, "a null model name is accepted");
            Rejects(() => CoachJson.ParseAnswer(AnswerJson.Replace("\"source\":\"model\"", "\"source\":\"guessed\"")), "an invented provenance");
            Rejects(() => CoachJson.ParseAnswer(AnswerJson.Replace("\"stepRevision\":1", "\"stepRevision\":1.5")), "a fractional revision");
            Rejects(() => CoachJson.ParseAnswer(AnswerJson.Replace("\"stepRevision\":1", "\"stepRevision\":-1")), "a negative revision");
            Rejects(() => CoachJson.ParseAnswer(AnswerJson.Replace("\"grounded\":true", "\"grounded\":\"true\"")), "a string where a boolean belongs");
            Rejects(() => CoachJson.ParseAnswer(AnswerJson.Replace(",\"model\":\"gpt-live\"", "")), "a missing property");
            Rejects(() => CoachJson.ParseAnswer(AnswerJson.Replace("Line the base up with its outline.", new string('a', 601))), "an over-long answer");
            Rejects(() => CoachJson.ParseAnswer(AnswerJson.Replace("Line the base up with its outline.", "bad\\u0007text")), "an escaped control character in an answer");
            Rejects(() => CoachJson.ParseAnswer(AnswerJson.Replace("\"requestId\":\"req-1\"", "\"requestId\":\"\"")), "an empty request ID");
            Rejects(() => CoachJson.ParseAnswer("not json"), "a body that is not an object");
        }

        private static void ReportsOnlyRefusalCodes()
        {
            var refusal = "{\"error\":\"live_unavailable\",\"message\":\"Upstream key rejected for account acct_12345\"}";
            var code = CoachJson.ParseFailureCode(refusal);
            Check(code == "live_unavailable", "a known refusal code is reported");
            Check(!code.Contains("acct_12345"), "server prose never leaves the parser");
            Check(CoachJson.ParseFailureCode("{\"error\":\"made_up\",\"message\":\"x\"}") == "provider_unavailable", "an unknown code degrades to provider_unavailable");
            Check(CoachJson.ParseFailureCode("garbage") == "provider_unavailable", "an unreadable refusal degrades to provider_unavailable");
            Check(CoachJson.ParseFailureCode(null) == "provider_unavailable", "a missing refusal body degrades to provider_unavailable");
            Check(CoachFailure.Known("unauthorized") && !CoachFailure.Known("elevated"), "the refusal code list is closed");
        }

        private static void EncodesTheAllowedLiveEvents()
        {
            Check(CoachLiveEvents.Mute(1) == "{\"type\":\"session.input_audio.mute\",\"event_id\":\"mute-1\"}", "the mute event matches the live protocol");
            Check(CoachLiveEvents.Unmute(2) == "{\"type\":\"session.input_audio.unmute\",\"event_id\":\"unmute-2\"}", "the unmute event matches the live protocol");
            Check(CoachLiveEvents.Close(3) == "{\"type\":\"session.close\",\"event_id\":\"close-3\"}", "the close event matches the live protocol");
            foreach (var body in new[] { CoachLiveEvents.Mute(1), CoachLiveEvents.Unmute(2), CoachLiveEvents.Close(3) })
                foreach (var word in new[] { "response", "conversation", "item", "function" })
                    Check(!body.Contains(word), "a coach client event cannot drive model output or tools (" + word + ")");
        }

        private static CoachContext Fixture() =>
            new CoachContext("tut-1", 3, "run-1", "step-0:attempt-1", "Build the frame", new[]
            {
                new CoachStepRef("seg-1", "Place the base", "Slide the base into the center of the mat."),
                new CoachStepRef("seg-2", "Insert the support", "Drop the tall support into the base slot."),
            }, "seg-1", 1);
        private static CoachContext WithNotes() =>
            new CoachContext("tut-1", 3, "run-1", "step-0:attempt-1", "Build the frame", new[]
            {
                new CoachStepRef("seg-1", "Place the base", "Slide the base into the center of the mat."),
            }, "seg-1", 1, "Mat on the left.");

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
