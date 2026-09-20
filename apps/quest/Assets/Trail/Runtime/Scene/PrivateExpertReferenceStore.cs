using System;
using System.IO;
using System.Text;
using Trail.Contracts;
using Trail.Runtime.Storage;
using UnityEngine;

namespace Trail.Runtime.Scene
{
    [Serializable]
    public sealed class PrivateExpertReference
    {
        public string recordingId, recordingHash, source = "quest-camera", sourceSessionId, sha256, jpegBase64;
        public string timing = "delivery-aligned-unverified";
        public int frameIndex, frameCount, width, height;
        public double deliveredAtMs, sampleMonoMs, frameTimeMs;
        public long sensorTimestampTicks, sourceFrameSequence;
    }
    /// <summary>Bounded private candidates, never approved references. No image bytes or sensor data enter logs.</summary>
    public sealed class PrivateExpertReferenceStore
    {
        private readonly string directory;
        private const long MaximumFile = 3 * 1024 * 1024;
        public PrivateExpertReferenceStore(string root)
        {
            directory = Path.Combine(Path.GetFullPath(root), "trail-expert-reference-candidates");
            Directory.CreateDirectory(directory);
        }
        private string PathFor(string id)
        {
            if (!Guid.TryParse(id, out var parsed)) throw new ArgumentException("Native take ID must be a UUID.");
            return Path.Combine(directory, parsed.ToString("N") + ".json");
        }
        private static bool Finite(double value) => !double.IsNaN(value) && !double.IsInfinity(value);
        public void Save(Recording recording, ExpertReferenceCandidate candidate, int frameIndex)
        {
            if (frameIndex < 0 || frameIndex >= recording.Frames.Length || candidate.Jpeg.Length > 2 * 1024 * 1024) throw new ArgumentException("Invalid reference candidate.");
            var hash = PrivateTutorialCache.Hash(candidate.Jpeg);
            if (hash != candidate.Sha256) throw new ArgumentException("Reference image hash mismatch.");
            var value = new PrivateExpertReference { recordingId = recording.Id,
                recordingHash = PrivateTutorialCache.Hash(Encoding.UTF8.GetBytes(ContractJson.SerializeRecording(recording))),
                frameTimeMs = recording.Frames[frameIndex].TMs, frameIndex = frameIndex, frameCount = recording.Frames.Length, width = candidate.Width, height = candidate.Height,
                sha256 = hash, jpegBase64 = Convert.ToBase64String(candidate.Jpeg), sourceSessionId = candidate.SourceSessionId,
                deliveredAtMs = candidate.DeliveredAtMs, sampleMonoMs = candidate.SampleMonoMs,
                sensorTimestampTicks = candidate.SensorTimestampTicks, sourceFrameSequence = candidate.SourceFrameSequence };
            var path = PathFor(recording.Id); var text = JsonUtility.ToJson(value);
            long total = Encoding.UTF8.GetByteCount(text); var count = 0;
            foreach (var file in Directory.GetFiles(directory, "*.json"))
                if (file != path) { total += new FileInfo(file).Length; count++; }
            if (total > 64L * 1024 * 1024 || count >= 128) throw new IOException("Expert reference private-storage limit reached.");
            var temporary = path + ".tmp";
            using (var output = new FileStream(temporary, FileMode.Create, FileAccess.Write, FileShare.None))
            { var bytes = Encoding.UTF8.GetBytes(text); output.Write(bytes, 0, bytes.Length); output.Flush(true); }
            if (File.Exists(path)) File.Replace(temporary, path, null); else File.Move(temporary, path);
        }
        private string Receipt(string id, int frameIndex, string hash)
        {
            PathFor(id);
            if (frameIndex < 0 || frameIndex >= 3600 || hash == null || hash.Length != 64) throw new ArgumentException("Invalid receipt identity.");
            foreach (var c in hash) if (!Uri.IsHexDigit(c)) throw new ArgumentException("Invalid hash.");
            return Path.Combine(directory, Guid.Parse(id).ToString("N") + "-" + frameIndex + "-" + hash + ".receipt");
        }
        public bool WasUploaded(string id, int frameIndex, string hash) => File.Exists(Receipt(id, frameIndex, hash));
        public void MarkUploaded(string id, int frameIndex, string hash) => File.WriteAllText(Receipt(id, frameIndex, hash), "accepted");
        public PrivateExpertReference Load(string recordingId)
        {
            var path = PathFor(recordingId);
            if (!File.Exists(path)) return null;
            if (new FileInfo(path).Length > MaximumFile) throw new IOException("Candidate exceeds byte limit.");
            var value = JsonUtility.FromJson<PrivateExpertReference>(File.ReadAllText(path));
            if (value == null || value.recordingId != recordingId || value.source != "quest-camera" || value.timing != "delivery-aligned-unverified" ||
                !Finite(value.frameTimeMs) || value.frameTimeMs < 0 || !Finite(value.deliveredAtMs) || !Finite(value.sampleMonoMs) ||
                value.deliveredAtMs < 0 || value.sampleMonoMs < 0 || value.frameIndex < 0 || value.frameIndex >= value.frameCount || value.frameCount > 3600 || value.width < 1 || value.width > 1280 || value.height < 1 || value.height > 1280 ||
                Math.Abs(value.deliveredAtMs - value.sampleMonoMs) > 50) throw new IOException("Invalid private candidate.");
            var bytes = Convert.FromBase64String(value.jpegBase64);
            if (bytes.Length == 0 || bytes.Length > 2 * 1024 * 1024 || PrivateTutorialCache.Hash(bytes) != value.sha256) throw new IOException("Candidate integrity check failed.");
            return value;
        }
    }
}
