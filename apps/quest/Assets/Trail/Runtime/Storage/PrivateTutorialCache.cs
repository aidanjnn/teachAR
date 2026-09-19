using System;
using System.IO;
using System.Security.Cryptography;
using System.Text;
using Trail.Contracts;

namespace Trail.Runtime.Storage
{
    /// <summary>Validated preload owns in-memory data independently of transport lifetime.</summary>
    public sealed class PreloadedTutorial
    {
        public Tutorial Tutorial { get; }
        public Recording Recording { get; }
        public string RecordingHash { get; }
        internal PreloadedTutorial(Tutorial tutorial, Recording recording, string hash)
        { Tutorial = tutorial; Recording = recording; RecordingHash = hash; }
    }

    /// <summary>Use Application.persistentDataPath as root. Never restores session calibration.</summary>
    public sealed class PrivateTutorialCache
    {
        public const int MaximumRecordingBytes = 64 * 1024 * 1024;
        public const int MaximumTutorialBytes = 2 * 1024 * 1024;
        private readonly string root;
        private readonly Func<long> availableBytes;
        private readonly object gate = new object();
        public PrivateTutorialCache(string privateRoot, Func<long> availableBytes = null)
        {
            if (string.IsNullOrWhiteSpace(privateRoot)) throw new ArgumentException("Private storage root required");
            root = Path.GetFullPath(Path.Combine(privateRoot, "trail-cache"));
            this.availableBytes = availableBytes ?? (() => new DriveInfo(Path.GetPathRoot(root)).AvailableFreeSpace);
            Directory.CreateDirectory(root);
        }
        public PreloadedTutorial StoreReady(byte[] tutorialJson, byte[] recordingJson, string expectedRecordingHash)
        {
            lock (gate)
            {
                var loaded = Validate(tutorialJson, recordingJson, expectedRecordingHash);
                var key = Key(loaded.Tutorial.Id, loaded.Tutorial.Revision);
                var target = Path.Combine(root, key);
                if (Directory.Exists(target))
                {
                    var previous = Load(loaded.Tutorial.Id, loaded.Tutorial.Revision);
                    if (Hash(File.ReadAllBytes(Path.Combine(target, "tutorial.json"))) != Hash(tutorialJson) || previous.RecordingHash != expectedRecordingHash)
                        throw new IOException("Ready tutorial is immutable");
                    return previous;
                }
                if (availableBytes() < (long)tutorialJson.Length + recordingJson.Length + 1024 * 1024)
                    throw new IOException("Not enough private storage for preload");
                var temporary = Path.Combine(root, ".pending-" + Guid.NewGuid().ToString("N"));
                Directory.CreateDirectory(temporary);
                try
                {
                    WriteSynced(Path.Combine(temporary, "recording.json"), recordingJson);
                    WriteSynced(Path.Combine(temporary, "tutorial.json"), tutorialJson);
                    // Publication marker written last, then directory rename makes the entire version visible.
                    WriteSynced(Path.Combine(temporary, "ready"), Encoding.ASCII.GetBytes(expectedRecordingHash + "\n" + Hash(tutorialJson)));
                    Directory.Move(temporary, target);
                    return loaded;
                }
                finally { if (Directory.Exists(temporary)) Directory.Delete(temporary, true); }
            }
        }
        public PreloadedTutorial Load(string tutorialId, int revision)
        {
            lock (gate)
            {
                var folder = Path.Combine(root, Key(tutorialId, revision));
                var manifest = File.ReadAllText(Path.Combine(folder, "ready")).Split('\n');
                if (manifest.Length != 2) throw new IOException("Incomplete cache manifest");
                var tutorial = ReadBounded(Path.Combine(folder, "tutorial.json"), MaximumTutorialBytes);
                var recording = ReadBounded(Path.Combine(folder, "recording.json"), MaximumRecordingBytes);
                if (Hash(tutorial) != manifest[1]) throw new IOException("Cached tutorial hash mismatch");
                var loaded = Validate(tutorial, recording, manifest[0]);
                if (loaded.Tutorial.Id != tutorialId || loaded.Tutorial.Revision != revision) throw new IOException("Cached tutorial identity mismatch");
                return loaded;
            }
        }
        /// <summary>Call at startup before any writes; interrupted directories never become ready.</summary>
        public void RecoverInterruptedWrites()
        {
            lock (gate) foreach (var folder in Directory.GetDirectories(root, ".pending-*")) Directory.Delete(folder, true);
        }
        public string SaveCapture(Recording recording)
        {
            var bytes = Encoding.UTF8.GetBytes(ContractJson.SerializeRecording(recording));
            if (bytes.Length > MaximumRecordingBytes) throw new IOException("Recording exceeds local limit");
            lock (gate)
            {
                if (availableBytes() < bytes.Length + 1024 * 1024) throw new IOException("Not enough private storage");
                var name = "capture-" + Guid.NewGuid().ToString("N") + ".json";
                var temporary = Path.Combine(root, name + ".tmp");
                try { WriteSynced(temporary, bytes); File.Move(temporary, Path.Combine(root, name)); }
                finally { if (File.Exists(temporary)) File.Delete(temporary); }
                return name;
            }
        }
        private static PreloadedTutorial Validate(byte[] tutorialJson, byte[] recordingJson, string expectedHash)
        {
            if (tutorialJson == null || recordingJson == null || tutorialJson.Length == 0 || tutorialJson.Length > MaximumTutorialBytes || recordingJson.Length == 0 || recordingJson.Length > MaximumRecordingBytes)
                throw new IOException("Preload exceeds byte limits");
            if (Hash(recordingJson) != expectedHash) throw new IOException("Recording hash mismatch");
            var utf8 = new UTF8Encoding(false, true);
            var tutorial = ContractJson.ParseTutorial(utf8.GetString(tutorialJson));
            var recording = ContractJson.ParseRecording(utf8.GetString(recordingJson));
            if (tutorial.Status != "ready") throw new IOException("Only finalized tutorials can preload");
            ContractValidation.ValidateTutorialRecording(tutorial, recording, expectedHash);
            return new PreloadedTutorial(tutorial, recording, expectedHash);
        }
        private static string Key(string id, int revision)
        {
            Guid parsed;
            if (!Guid.TryParseExact(id, "D", out parsed) || revision < 0) throw new ArgumentException("Invalid tutorial cache identity");
            return parsed.ToString("D") + "-" + revision;
        }
        private static byte[] ReadBounded(string path, int maximum)
        {
            using (var stream = new FileStream(path, FileMode.Open, FileAccess.Read, FileShare.Read))
            {
                if (stream.Length <= 0 || stream.Length > maximum) throw new IOException("Cached asset exceeds byte limit");
                var result = new byte[(int)stream.Length];
                var offset = 0;
                while (offset < result.Length) { var count = stream.Read(result, offset, result.Length - offset); if (count == 0) throw new EndOfStreamException(); offset += count; }
                return result;
            }
        }
        private static void WriteSynced(string path, byte[] bytes)
        {
            using (var stream = new FileStream(path, FileMode.CreateNew, FileAccess.Write, FileShare.None))
            { stream.Write(bytes, 0, bytes.Length); stream.Flush(true); }
        }
        public static string Hash(byte[] bytes)
        {
            using (var sha = SHA256.Create()) return BitConverter.ToString(sha.ComputeHash(bytes)).Replace("-", "").ToLowerInvariant();
        }
    }
}
