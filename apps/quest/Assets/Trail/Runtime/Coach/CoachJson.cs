using System;
using System.Collections.Generic;
using System.Globalization;
using System.Text;

namespace Trail.Runtime.Coach
{
    /// <summary>
    /// Strict, bounded coach wire encoding. Deliberately tiny: the coach responses are flat, so nesting, arrays,
    /// repeated keys, unknown keys and trailing input are refused rather than merged. Trail.Contracts keeps its
    /// own JSON grammar internal to that assembly, so this boundary validates itself instead of widening it.
    /// Pure: no engine, transport, file or provider type, and no credential ever reaches this encoder.
    /// </summary>
    public static class CoachJson
    {
        private const int MaxResponse = 128 * 1024;
        private const char Delete = (char)127;

        // ---- outbound -------------------------------------------------------------------------------------

        /// <summary>POST /api/live/sessions. The bearer token travels in the transport header, never in this body.</summary>
        public static string SessionRequest(string offerSdp, CoachContext context)
        {
            if (context == null) throw new ArgumentNullException(nameof(context));
            CoachBounds.Prose(offerSdp, 1, CoachBounds.MaxSdp, "offer SDP");
            var b = new StringBuilder();
            b.Append("{\"schemaVersion\":1,");
            Member(b, "sdp", offerSdp); b.Append(',');
            b.Append("\"context\":"); Context(b, context);
            b.Append('}');
            return b.ToString();
        }

        /// <summary>POST /api/live/sessions/{id}/step. The server composes the wording; the client only names the step.</summary>
        public static string StepUpdate(int generation, CoachContext context)
        {
            if (context == null) throw new ArgumentNullException(nameof(context));
            CoachBounds.Revision(generation, "context generation");
            var b = new StringBuilder();
            b.Append("{\"schemaVersion\":1,");
            Member(b, "generation", generation); b.Append(',');
            Member(b, "currentStepId", context.CurrentStepId); b.Append(',');
            Member(b, "stepRevision", context.StepRevision); b.Append(',');
            Member(b, "attemptId", context.AttemptId);
            b.Append('}');
            return b.ToString();
        }

        /// <summary>POST /api/coach, the text path that keeps working when live audio does not.</summary>
        public static string TextRequest(string requestId, CoachContext context, string question)
        {
            if (context == null) throw new ArgumentNullException(nameof(context));
            CoachBounds.Id(requestId, "request ID");
            CoachBounds.Prose(question, 1, CoachBounds.MaxQuestion, "question");
            var b = new StringBuilder();
            b.Append("{\"schemaVersion\":1,");
            Member(b, "requestId", requestId); b.Append(',');
            b.Append("\"context\":"); Context(b, context); b.Append(',');
            Member(b, "question", question);
            b.Append('}');
            return b.ToString();
        }

        private static void Context(StringBuilder b, CoachContext context)
        {
            b.Append('{');
            Member(b, "tutorialId", context.TutorialId); b.Append(',');
            Member(b, "tutorialRevision", context.TutorialRevision); b.Append(',');
            Member(b, "runId", context.RunId); b.Append(',');
            Member(b, "attemptId", context.AttemptId); b.Append(',');
            Member(b, "title", context.Title); b.Append(',');
            b.Append("\"steps\":[");
            for (var i = 0; i < context.Steps.Count; i++)
            {
                if (i > 0) b.Append(',');
                var step = context.Steps[i];
                b.Append('{');
                Member(b, "id", step.Id); b.Append(',');
                Member(b, "title", step.Title); b.Append(',');
                Member(b, "instruction", step.Instruction);
                b.Append('}');
            }
            b.Append("],");
            Member(b, "currentStepId", context.CurrentStepId); b.Append(',');
            Member(b, "stepRevision", context.StepRevision);
            if (context.LayoutNotes != null) { b.Append(','); Member(b, "layoutNotes", context.LayoutNotes); }
            b.Append('}');
        }

        private static void Member(StringBuilder b, string key, string value) { Text(b, key); b.Append(':'); Text(b, value); }
        private static void Member(StringBuilder b, string key, int value) { Text(b, key); b.Append(':'); b.Append(value.ToString(CultureInfo.InvariantCulture)); }
        private static void Text(StringBuilder b, string value)
        {
            b.Append('"');
            foreach (char c in value)
            {
                if (c == '"' || c == '\\') b.Append('\\').Append(c);
                else if (c < ' ' || c == Delete || char.IsSurrogate(c)) b.Append("\\u").Append(((int)c).ToString("x4", CultureInfo.InvariantCulture));
                else b.Append(c);
            }
            b.Append('"');
        }

        // ---- inbound --------------------------------------------------------------------------------------

        public static CoachSessionGrant ParseSessionGrant(string json)
        {
            var map = Flat(json, MaxResponse, "live session response");
            Exact(map, "live session response", "schemaVersion", "sessionId", "sdp", "liveModel");
            Version(map, "live session response");
            return new CoachSessionGrant(Str(map, "sessionId", "live session response"),
                Str(map, "sdp", "live session response"), Str(map, "liveModel", "live session response"));
        }

        public static CoachAnswer ParseAnswer(string json)
        {
            var map = Flat(json, 8 * 1024, "coach answer");
            Exact(map, "coach answer", "schemaVersion", "requestId", "runId", "tutorialId", "tutorialRevision",
                "stepId", "stepRevision", "attemptId", "answer", "grounded", "source", "model");
            Version(map, "coach answer");
            return new CoachAnswer(
                Str(map, "requestId", "coach answer"), Str(map, "runId", "coach answer"), Str(map, "tutorialId", "coach answer"),
                Int(map, "tutorialRevision", "coach answer"), Str(map, "stepId", "coach answer"), Int(map, "stepRevision", "coach answer"),
                Str(map, "attemptId", "coach answer"), Str(map, "answer", "coach answer"), Bool(map, "grounded", "coach answer"),
                Str(map, "source", "coach answer"), StrOrNull(map, "model", "coach answer"));
        }

        /// <summary>Returns only the refusal code. Server prose is deliberately dropped so nothing untrusted reaches the learner.</summary>
        public static string ParseFailureCode(string json)
        {
            try
            {
                var map = Flat(json, 4 * 1024, "coach refusal");
                Exact(map, "coach refusal", "error", "message");
                var code = Str(map, "error", "coach refusal");
                return CoachFailure.Known(code) ? code : "provider_unavailable";
            }
            catch (ArgumentException) { return "provider_unavailable"; }
        }

        private static void Version(Dictionary<string, object> map, string what)
        {
            if (Int(map, "schemaVersion", what) != 1) throw new ArgumentException("Coach " + what + " has an unsupported schema version.");
        }
        private static void Exact(Dictionary<string, object> map, string what, params string[] keys)
        {
            if (map.Count != keys.Length) throw new ArgumentException("Coach " + what + " has unexpected properties.");
            foreach (var key in keys) if (!map.ContainsKey(key)) throw new ArgumentException("Coach " + what + " is missing " + key + ".");
        }
        private static string Str(Dictionary<string, object> map, string key, string what)
        {
            var text = map[key] as string;
            if (text == null) throw new ArgumentException("Coach " + what + " property " + key + " must be a string.");
            return text;
        }
        private static string StrOrNull(Dictionary<string, object> map, string key, string what)
        {
            if (map[key] == null) return null;
            return Str(map, key, what);
        }
        private static bool Bool(Dictionary<string, object> map, string key, string what)
        {
            if (!(map[key] is bool)) throw new ArgumentException("Coach " + what + " property " + key + " must be a boolean.");
            return (bool)map[key];
        }
        private static int Int(Dictionary<string, object> map, string key, string what)
        {
            if (!(map[key] is double)) throw new ArgumentException("Coach " + what + " property " + key + " must be a number.");
            var value = (double)map[key];
            if (double.IsNaN(value) || double.IsInfinity(value) || Math.Floor(value) != value || value < 0 || value > CoachBounds.MaxRevision)
                throw new ArgumentException("Coach " + what + " property " + key + " is out of range.");
            return (int)value;
        }

        /// <summary>Flat object of scalars. Nested objects and arrays are refused outright: no coach response has any.</summary>
        private static Dictionary<string, object> Flat(string json, int maxChars, string what)
        {
            if (json == null || json.Length == 0 || json.Length > maxChars) throw new ArgumentException("Coach " + what + " is missing or too large.");
            var cursor = 0;
            var map = new Dictionary<string, object>(StringComparer.Ordinal);
            Space(json, ref cursor);
            Expect(json, ref cursor, '{', what);
            Space(json, ref cursor);
            if (Peek(json, cursor) == '}') cursor++;
            else
                while (true)
                {
                    Space(json, ref cursor);
                    var key = ReadString(json, ref cursor, what);
                    if (map.ContainsKey(key)) throw new ArgumentException("Coach " + what + " repeats property " + key + ".");
                    Space(json, ref cursor);
                    Expect(json, ref cursor, ':', what);
                    map.Add(key, ReadScalar(json, ref cursor, what));
                    Space(json, ref cursor);
                    var c = Peek(json, cursor);
                    if (c == ',') { cursor++; continue; }
                    if (c == '}') { cursor++; break; }
                    throw new ArgumentException("Coach " + what + " is malformed.");
                }
            Space(json, ref cursor);
            if (cursor != json.Length) throw new ArgumentException("Coach " + what + " has trailing input.");
            return map;
        }
        private static char Peek(string json, int cursor) => cursor < json.Length ? json[cursor] : '\0';
        private static void Space(string json, ref int cursor)
        {
            while (cursor < json.Length && (json[cursor] == ' ' || json[cursor] == '\t' || json[cursor] == '\r' || json[cursor] == '\n')) cursor++;
        }
        private static void Expect(string json, ref int cursor, char expected, string what)
        {
            if (cursor >= json.Length || json[cursor] != expected) throw new ArgumentException("Coach " + what + " is malformed.");
            cursor++;
        }
        private static object ReadScalar(string json, ref int cursor, string what)
        {
            Space(json, ref cursor);
            var c = Peek(json, cursor);
            if (c == '"') return ReadString(json, ref cursor, what);
            if (c == '{' || c == '[') throw new ArgumentException("Coach " + what + " must be a flat object.");
            foreach (var literal in new[] { "true", "false", "null" })
                if (cursor + literal.Length <= json.Length && string.CompareOrdinal(json, cursor, literal, 0, literal.Length) == 0)
                {
                    cursor += literal.Length;
                    return literal == "null" ? null : (object)(literal == "true");
                }
            var start = cursor;
            if (Peek(json, cursor) == '-') cursor++;
            var digits = cursor;
            while (cursor < json.Length && json[cursor] >= '0' && json[cursor] <= '9') cursor++;
            if (digits == cursor) throw new ArgumentException("Coach " + what + " is malformed.");
            if (Peek(json, cursor) == '.' || Peek(json, cursor) == 'e' || Peek(json, cursor) == 'E')
                throw new ArgumentException("Coach " + what + " accepts only integer numbers.");
            double number;
            if (!double.TryParse(json.Substring(start, cursor - start), NumberStyles.AllowLeadingSign, CultureInfo.InvariantCulture, out number))
                throw new ArgumentException("Coach " + what + " has an unreadable number.");
            return number;
        }
        private static string ReadString(string json, ref int cursor, string what)
        {
            Expect(json, ref cursor, '"', what);
            var result = new StringBuilder();
            while (cursor < json.Length)
            {
                var c = json[cursor++];
                if (c == '"') return result.ToString();
                if (c < ' ') throw new ArgumentException("Coach " + what + " has a raw control character.");
                if (c != '\\') { result.Append(c); continue; }
                if (cursor >= json.Length) throw new ArgumentException("Coach " + what + " has an incomplete escape.");
                c = json[cursor++];
                switch (c)
                {
                    case '"': case '\\': case '/': result.Append(c); break;
                    case 'b': result.Append('\b'); break;
                    case 'f': result.Append('\f'); break;
                    case 'n': result.Append('\n'); break;
                    case 'r': result.Append('\r'); break;
                    case 't': result.Append('\t'); break;
                    case 'u':
                        if (cursor + 4 > json.Length) throw new ArgumentException("Coach " + what + " has an incomplete escape.");
                        ushort code;
                        if (!ushort.TryParse(json.Substring(cursor, 4), NumberStyles.AllowHexSpecifier, CultureInfo.InvariantCulture, out code))
                            throw new ArgumentException("Coach " + what + " has an invalid escape.");
                        cursor += 4; result.Append((char)code); break;
                    default: throw new ArgumentException("Coach " + what + " has an invalid escape.");
                }
            }
            throw new ArgumentException("Coach " + what + " has an unterminated string.");
        }
    }

    /// <summary>The live client events this client is allowed to send. There is no event here that can move the guide.</summary>
    public static class CoachLiveEvents
    {
        public static string Mute(int sequence) => Encode("session.input_audio.mute", "mute", sequence);
        public static string Unmute(int sequence) => Encode("session.input_audio.unmute", "unmute", sequence);
        public static string Close(int sequence) => Encode("session.close", "close", sequence);
        private static string Encode(string type, string prefix, int sequence)
        {
            if (sequence < 0) throw new ArgumentException("Coach event sequence must not be negative.");
            return "{\"type\":\"" + type + "\",\"event_id\":\"" + prefix + "-" + sequence.ToString(CultureInfo.InvariantCulture) + "\"}";
        }
    }
}
