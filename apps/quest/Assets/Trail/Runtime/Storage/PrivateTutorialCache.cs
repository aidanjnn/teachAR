using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Security.Cryptography;
using System.Text;
using Trail.Contracts;
using Trail.Runtime.Record;

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

    /// <summary>A ready tutorial already stored on this device. The verified recording hash is
    /// deliberately absent: only <see cref="PrivateTutorialCache.Load"/> re-verifies the recorded
    /// bytes, and only its result may reach a guide preload.</summary>
    public sealed class CachedTutorial
    {
        public string Id { get; }
        public int Revision { get; }
        public string Title { get; }
        public int StepCount { get; }
        internal CachedTutorial(string id, int revision, string title, int stepCount)
        { Id = id; Revision = revision; Title = title; StepCount = stepCount; }
    }

    /// <summary>One library row. Server rows carry the reviewed title; StoredOnDevice reports only
    /// what this device actually holds, so offline availability is never implied by a server list.</summary>
    public sealed class TutorialLibraryEntry
    {
        public string Id { get; }
        public int Revision { get; }
        public string Title { get; }
        public int StepCount { get; }
        public bool StoredOnDevice { get; }
        public TutorialLibraryEntry(string id, int revision, string title, int stepCount, bool storedOnDevice)
        {
            if (string.IsNullOrWhiteSpace(id) || id.Length > 128 || revision < 0 || stepCount < 0) throw new ArgumentException("Invalid library entry identity");
            Id = id; Revision = revision; StepCount = stepCount; StoredOnDevice = storedOnDevice;
            Title = string.IsNullOrWhiteSpace(title) ? "Untitled guide" : (title.Length <= 80 ? title : title.Substring(0, 80));
        }
    }

    /// <summary>Pure merge policy shared by the runtime feature and its tests. No I/O.</summary>
    public static class TutorialLibrary
    {
        public const int MaximumEntries = 128;
        /// <summary>Server rows first, then device-only rows. A server refresh never removes a guide
        /// this device already holds, so losing the backend cannot empty the library.</summary>
        public static TutorialLibraryEntry[] Merge(IEnumerable<TutorialLibraryEntry> server, IEnumerable<CachedTutorial> local)
        {
            var stored = new List<CachedTutorial>();
            var byKey = new Dictionary<string, CachedTutorial>(StringComparer.Ordinal);
            if (local != null)
                foreach (var entry in local)
                    if (entry != null && !byKey.ContainsKey(Pair(entry.Id, entry.Revision)))
                    { byKey.Add(Pair(entry.Id, entry.Revision), entry); stored.Add(entry); }
            var merged = new List<TutorialLibraryEntry>();
            var seen = new HashSet<string>(StringComparer.Ordinal);
            if (server != null)
                foreach (var entry in server)
                {
                    if (entry == null || merged.Count >= MaximumEntries) break;
                    var key = Pair(entry.Id, entry.Revision);
                    if (!seen.Add(key)) continue;
                    merged.Add(new TutorialLibraryEntry(entry.Id, entry.Revision, entry.Title, entry.StepCount, byKey.ContainsKey(key)));
                }
            foreach (var entry in stored)
            {
                if (merged.Count >= MaximumEntries) break;
                if (!seen.Add(Pair(entry.Id, entry.Revision))) continue;
                merged.Add(new TutorialLibraryEntry(entry.Id, entry.Revision, entry.Title, entry.StepCount, true));
            }
            return merged.ToArray();
        }
        private static string Pair(string id, int revision) => id + "@" + revision.ToString(CultureInfo.InvariantCulture);
    }

    /// <summary>Use Application.persistentDataPath as root. Never restores session calibration.</summary>
    public sealed class PrivateTutorialCache
    {
        public const int MaximumRecordingBytes = 64 * 1024 * 1024;
        public const int MaximumTutorialBytes = 2 * 1024 * 1024;
        public const int MaximumListedTutorials = 64;
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
        /// <summary>Ready tutorials already on this device, newest first, so the library works with no
        /// server and no pairing. Unreadable, partial, foreign or unfinalized entries are skipped rather
        /// than surfaced or thrown. This verifies the tutorial document and that the recording is present
        /// and within bounds; <see cref="Load"/> still re-verifies the recorded bytes against the stored
        /// hash before anything can be preloaded, so a listed entry is available, never proven loadable.</summary>
        public CachedTutorial[] ListReady()
        {
            lock (gate)
            {
                var folders = Directory.GetDirectories(root);
                Array.Sort(folders, (a, b) =>
                {
                    var order = Directory.GetLastWriteTimeUtc(b).CompareTo(Directory.GetLastWriteTimeUtc(a));
                    return order != 0 ? order : string.CompareOrdinal(a, b);
                });
                var found = new List<CachedTutorial>();
                foreach (var folder in folders)
                {
                    if (found.Count >= MaximumListedTutorials) break;
                    var entry = Describe(folder);
                    if (entry != null) found.Add(entry);
                }
                return found.ToArray();
            }
        }
        /// <summary>Never throws: a damaged entry is not a ready entry.</summary>
        private static CachedTutorial Describe(string folder)
        {
            try
            {
                var name = Path.GetFileName(folder);
                var split = name.LastIndexOf('-');
                int revision;
                if (split <= 0 || !int.TryParse(name.Substring(split + 1), NumberStyles.None, CultureInfo.InvariantCulture, out revision)) return null;
                var id = name.Substring(0, split);
                // Rejects interrupted .pending-* writes and anything this cache did not write itself.
                if (Key(id, revision) != name) return null;
                var manifest = File.ReadAllText(Path.Combine(folder, "ready")).Split('\n');
                if (manifest.Length != 2) return null;
                var tutorialJson = ReadBounded(Path.Combine(folder, "tutorial.json"), MaximumTutorialBytes);
                if (Hash(tutorialJson) != manifest[1]) return null;
                var tutorial = ContractJson.ParseTutorial(new UTF8Encoding(false, true).GetString(tutorialJson));
                if (tutorial.Status != "ready" || tutorial.Id != id || tutorial.Revision != revision || tutorial.RecordingHash != manifest[0]) return null;
                using (var recording = new FileStream(Path.Combine(folder, "recording.json"), FileMode.Open, FileAccess.Read, FileShare.Read))
                    if (recording.Length <= 0 || recording.Length > MaximumRecordingBytes) return null;
                return new CachedTutorial(id, revision, Title(tutorial), tutorial.Steps.Length);
            }
            catch (Exception) { return null; }
        }
        /// <summary>Tutorials carry no title of their own; use the first reviewed step title.</summary>
        private static string Title(Tutorial tutorial)
        {
            foreach (var step in tutorial.Steps)
                if (!string.IsNullOrWhiteSpace(step.Title)) return step.Title.Length <= 80 ? step.Title : step.Title.Substring(0, 80);
            return "Guide " + tutorial.Id.Substring(0, 8);
        }
        /// <summary>Call at startup before any writes; interrupted directories never become ready.</summary>
        public void RecoverInterruptedWrites()
        {
            lock (gate) foreach (var folder in Directory.GetDirectories(root, ".pending-*")) Directory.Delete(folder, true);
        }
        public string SaveCapture(Recording recording, TakeAuthoringMetadata authoring = null, byte[] narration = null)
        {
            if (recording.Audio != null) NarrationPcm.Validate(narration, recording.Audio);
            else if (narration != null) throw new ArgumentException("Narration bytes require recording metadata.");
            var bytes = Encoding.UTF8.GetBytes(authoring == null ? ContractJson.SerializeRecording(recording) :
                ContractJson.SerializeAuthoredCapture(new AuthoredCapture { SchemaVersion = 1, Recording = recording, Authoring = authoring }));
            if (bytes.Length > MaximumRecordingBytes) throw new IOException("Recording exceeds local limit");
            lock (gate)
            {
                if (availableBytes() < (long)bytes.Length + (narration?.Length ?? 0) + 1024 * 1024) throw new IOException("Not enough private storage");
                if (narration != null) SaveNarration(recording, narration);
                var name = "capture-" + Guid.NewGuid().ToString("N") + ".json";
                var temporary = Path.Combine(root, name + ".tmp");
                try { WriteSynced(temporary, bytes); File.Move(temporary, Path.Combine(root, name)); }
                finally { if (File.Exists(temporary)) File.Delete(temporary); }
                return name;
            }
        }
        /// <summary>The most recently saved private capture, or null when none survives; unreadable files are skipped.</summary>
        public Recording LoadLatestCapture() => LoadLatestCapture(out _);
        public Recording LoadLatestCapture(out TakeAuthoringMetadata authoring)
        {
            authoring = null;
            lock (gate)
            {
                var files = Directory.GetFiles(root, "capture-*.json");
                Array.Sort(files, (a, b) => File.GetLastWriteTimeUtc(b).CompareTo(File.GetLastWriteTimeUtc(a)));
                foreach (var file in files)
                {
                    try
                    {
                        var json = new UTF8Encoding(false, true).GetString(ReadBounded(file, MaximumRecordingBytes));
                        try
                        {
                            var capture = ContractJson.ParseAuthoredCapture(json);
                            if (capture.Recording.Audio != null) LoadNarration(capture.Recording);
                            authoring = capture.Authoring; return capture.Recording;
                        }
                        catch (ContractException) { var recording = ContractJson.ParseRecording(json); if (recording.Audio != null) LoadNarration(recording); return recording; }
                    }
                    catch (Exception) { }
                }
                return null;
            }
        }
        public AuthoredCapture[] LoadAuthoredTakes(string tutorialId)
        {
            lock (gate)
            {
                var files = Directory.GetFiles(root, "capture-*.json");
                Array.Sort(files, (a, b) => File.GetLastWriteTimeUtc(b).CompareTo(File.GetLastWriteTimeUtc(a)));
                var byIndex = new SortedDictionary<int, AuthoredCapture>();
                foreach (var file in files)
                {
                    try
                    {
                        var capture = ContractJson.ParseAuthoredCapture(new UTF8Encoding(false, true).GetString(ReadBounded(file, MaximumRecordingBytes)));
                        if (capture.Recording.Audio != null) LoadNarration(capture.Recording);
                        if (capture.Authoring.TutorialId == tutorialId && !byIndex.ContainsKey(capture.Authoring.TakeIndex))
                            byIndex.Add(capture.Authoring.TakeIndex, capture);
                    }
                    catch (Exception) { }
                }
                var result = new AuthoredCapture[byIndex.Count]; byIndex.Values.CopyTo(result, 0); return result;
            }
        }
        private string NarrationDirectory(Recording recording) => Path.Combine(root, "narration-" + Hash(Encoding.UTF8.GetBytes(recording.Id)));
        private void SaveNarration(Recording recording, byte[] narration)
        {
            var directory = NarrationDirectory(recording);
            if (Directory.Exists(directory))
            {
                if (Hash(LoadNarration(recording)) != Hash(narration)) throw new IOException("Saved narration is immutable.");
                return;
            }
            var temporary = Path.Combine(root, ".pending-" + Guid.NewGuid().ToString("N")); Directory.CreateDirectory(temporary);
            try
            {
                WriteSynced(Path.Combine(temporary, "narration.wav"), narration);
                WriteSynced(Path.Combine(temporary, "sha256"), Encoding.ASCII.GetBytes(Hash(narration)));
                Directory.Move(temporary, directory);
            }
            finally { if (Directory.Exists(temporary)) Directory.Delete(temporary, true); }
        }
        public byte[] LoadNarration(Recording recording)
        {
            if (recording.Audio == null) return null;
            lock (gate)
            {
                var directory = NarrationDirectory(recording);
                var bytes = ReadBounded(Path.Combine(directory, "narration.wav"), NarrationPcm.MaximumBytes);
                var expected = Encoding.ASCII.GetString(ReadBounded(Path.Combine(directory, "sha256"), 64));
                if (Hash(bytes) != expected) throw new IOException("Narration integrity check failed.");
                NarrationPcm.Validate(bytes, recording.Audio); return bytes;
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
