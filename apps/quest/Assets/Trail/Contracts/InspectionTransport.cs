using System;
using System.Collections.Generic;
using System.Text.RegularExpressions;

namespace Trail.Contracts
{
    public sealed class InspectionCapture
    {
        public InspectionRequest Request { get; set; }
        public string CaptureNonce { get; set; }
        public string SourceSessionId { get; set; }
        public long MinSourceFrameSeq { get; set; }
        public int UploadWithinMs { get; set; }
        public int TotalBudgetMs { get; set; }
    }
    // Delegated transport extension; shares the canonical strict grammar and request parser.
    public static partial class ContractJson
    {
        public static string ParseInspectionSession(string json)
        {
            if (json == null || json.Length > 1024) throw new ContractException("Session response too large");
            var map = StrictJson.Parse(json) as Dictionary<string, object>;
            if (map == null || map.Count != 2 || !map.ContainsKey("schemaVersion") || !map.ContainsKey("liveSessionId"))
                throw new ContractException("Invalid session fields");
            CaptureNumber(map["schemaVersion"], 1, 1);
            return CaptureId(map["liveSessionId"]);
        }
        public static InspectionCapture ParseInspectionCapture(string json)
        {
            if (json == null || json.Length > 16384) throw new ContractException("Capture response too large");
            var map = StrictJson.Parse(json) as Dictionary<string, object>;
            string[] keys = { "schemaVersion", "request", "captureNonce", "sourceSessionId", "minSourceFrameSeq", "uploadWithinMs", "totalBudgetMs" };
            if (map == null || map.Count != keys.Length) throw new ContractException("Invalid capture fields");
            foreach (string key in keys) if (!map.ContainsKey(key)) throw new ContractException("Missing capture field");
            if (CaptureNumber(map["schemaVersion"], 1, 1) != 1) throw new ContractException("Invalid version");
            return new InspectionCapture {
                Request = ParseInspectionRequest(StrictJson.Stringify(map["request"])),
                CaptureNonce = CaptureId(map["captureNonce"]), SourceSessionId = CaptureId(map["sourceSessionId"]),
                MinSourceFrameSeq = (long)CaptureNumber(map["minSourceFrameSeq"], 0, 9007199254740991),
                UploadWithinMs = (int)CaptureNumber(map["uploadWithinMs"], 1, 2000),
                TotalBudgetMs = (int)CaptureNumber(map["totalBudgetMs"], 1, 8000),
            };
        }
        public static string SerializeInspectionStart(GuideContextRef context, string liveSessionId, int sessionGeneration,
            int requestEpoch, string question, string sourceSessionId, long sourceFrameSeq)
        {
            // The canonical request parser validates every shared identity and text bound.
            var request = new InspectionRequest { RunId = context.RunId, TutorialId = context.TutorialId,
                TutorialRevision = context.TutorialRevision, StepId = context.StepId, StepRevision = context.StepRevision,
                AttemptId = context.AttemptId, RequestId = "not-yet-issued", LiveSessionId = liveSessionId,
                SessionGeneration = sessionGeneration, RequestEpoch = requestEpoch, DelegationId = null,
                Question = question, ReferenceIds = Array.Empty<string>() };
            SerializeInspectionRequest(request);
            CaptureId(sourceSessionId); CaptureNumber((double)sourceFrameSeq, 0, 9007199254740991);
            return StrictJson.Stringify(new Dictionary<string, object> {
                { "schemaVersion", 1 }, { "context", WriteGuideContextRef(context) }, { "liveSessionId", liveSessionId },
                { "sessionGeneration", sessionGeneration }, { "requestEpoch", requestEpoch }, { "question", question },
                { "sourceSessionId", sourceSessionId }, { "source", "quest-camera" }, { "sourceFrameSeq", sourceFrameSeq }
            });
        }
        public static string SerializeInspectionUpload(InspectionCapture capture, string sourceSessionId, long frameSequence,
            double captureAgeAtSendMs, byte[] jpeg, int width, int height, string sha256)
        {
            if (capture == null || jpeg == null || jpeg.Length == 0 || jpeg.Length > 2 * 1024 * 1024 ||
                width < 1 || height < 1 || width > 1280 || height > 1280 || sha256 == null || !Regex.IsMatch(sha256, "^[0-9a-f]{64}$"))
                throw new ContractException("Invalid upload image");
            CaptureId(sourceSessionId); CaptureId(capture.CaptureNonce);
            CaptureNumber((double)frameSequence, 0, 9007199254740991); CaptureNumber(captureAgeAtSendMs, 0, 500, false);
            if (sourceSessionId != capture.SourceSessionId || frameSequence <= capture.MinSourceFrameSeq) throw new ContractException("Stale capture");
            return StrictJson.Stringify(new Dictionary<string, object> {
                { "schemaVersion", 1 }, { "requestId", capture.Request.RequestId }, { "requestEpoch", capture.Request.RequestEpoch },
                { "captureNonce", capture.CaptureNonce }, { "sourceSessionId", sourceSessionId }, { "source", "quest-camera" },
                { "sourceFrameSeq", frameSequence }, { "captureAgeAtSendMs", captureAgeAtSendMs },
                { "image", new Dictionary<string, object> { { "mimeType", "image/jpeg" }, { "dataBase64", Convert.ToBase64String(jpeg) },
                    { "sha256", sha256 }, { "width", width }, { "height", height } } }
            });
        }
        private static string CaptureId(object value)
        {
            var text = value as string;
            if (text == null || text.Length == 0 || text.Length > 128) throw new ContractException("Invalid capture ID");
            return text;
        }
        private static double CaptureNumber(object value, double min, double max, bool integer = true)
        {
            if (!(value is double)) throw new ContractException("Invalid capture number");
            var n = (double)value;
            if (double.IsNaN(n) || double.IsInfinity(n) || n < min || n > max || (integer && Math.Floor(n) != n)) throw new ContractException("Invalid capture bound");
            return n;
        }
    }
}
