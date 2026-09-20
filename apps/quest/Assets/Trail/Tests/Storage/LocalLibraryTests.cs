using System;
using System.IO;
using System.Linq;
using System.Reflection;
using System.Text;
using NUnit.Framework;
using Trail.Contracts;
using Trail.Runtime.Storage;
using UnityEngine;

namespace Trail.Tests.Storage
{
    /// <summary>Offline library behaviour: what this device holds must be usable with no server.
    /// These are domain assertions; they establish nothing about a headset run.</summary>
    public sealed class LocalLibraryTests
    {
        private string root;
        private byte[] recordingJson;
        private string recordingHash;

        [SetUp]
        public void SetUp()
        {
            root = Path.Combine(Path.GetTempPath(), "trail-local-library-" + Guid.NewGuid().ToString("N"));
            var fixtures = Path.GetFullPath(Path.Combine(Application.dataPath, "../../../fixtures/contracts"));
            recordingJson = File.ReadAllBytes(Path.Combine(fixtures, "recording.json"));
            recordingHash = PrivateTutorialCache.Hash(recordingJson);
        }
        [TearDown]
        public void TearDown() { if (Directory.Exists(root)) Directory.Delete(root, true); }

        private Tutorial Ready(string title)
        {
            var fixtures = Path.GetFullPath(Path.Combine(Application.dataPath, "../../../fixtures/contracts"));
            var tutorial = ContractJson.ParseTutorial(File.ReadAllText(Path.Combine(fixtures, "tutorial.json")));
            tutorial.Id = Guid.NewGuid().ToString("D"); tutorial.Status = "ready"; tutorial.RecordingHash = recordingHash;
            if (title != null) tutorial.Steps[0].Title = title;
            return tutorial;
        }
        private static byte[] Bytes(Tutorial tutorial) => Encoding.UTF8.GetBytes(ContractJson.SerializeTutorial(tutorial));
        private Tutorial Store(PrivateTutorialCache cache, string title)
        {
            var tutorial = Ready(title);
            cache.StoreReady(Bytes(tutorial), recordingJson, recordingHash);
            return tutorial;
        }
        // Writes a cache directory directly so damage and tampering can be exercised.
        private void WriteEntry(string folderName, byte[] tutorialJson, byte[] recording, string manifest)
        {
            var folder = Path.Combine(root, "trail-cache", folderName);
            Directory.CreateDirectory(folder);
            if (tutorialJson != null) File.WriteAllBytes(Path.Combine(folder, "tutorial.json"), tutorialJson);
            if (recording != null) File.WriteAllBytes(Path.Combine(folder, "recording.json"), recording);
            if (manifest != null) File.WriteAllText(Path.Combine(folder, "ready"), manifest);
        }
        private static CachedTutorial Find(CachedTutorial[] entries, string id)
        {
            foreach (var entry in entries) if (entry.Id == id) return entry;
            return null;
        }

        [Test]
        public void StoredGuidesAreEnumerableWithNoServer()
        {
            var cache = new PrivateTutorialCache(root);
            var first = Store(cache, "Fold the sleeve");
            var second = Store(cache, "Align the collar");
            // A separate instance proves enumeration reads private storage, not in-memory state.
            var listed = new PrivateTutorialCache(root).ListReady();
            Assert.That(listed.Length, Is.EqualTo(2));
            Assert.That(Find(listed, first.Id).Title, Is.EqualTo("Fold the sleeve"));
            Assert.That(Find(listed, first.Id).Revision, Is.EqualTo(first.Revision));
            Assert.That(Find(listed, first.Id).StepCount, Is.EqualTo(first.Steps.Length));
            Assert.That(Find(listed, second.Id).Title, Is.EqualTo("Align the collar"));
            // A listed entry must still load and carry its verified hash to a preload.
            var loaded = new PrivateTutorialCache(root).Load(first.Id, first.Revision);
            Assert.That(loaded.RecordingHash, Is.EqualTo(recordingHash));
            Assert.That(loaded.Tutorial.Status, Is.EqualTo("ready"));
        }

        [Test]
        public void EmptyPrivateStorageListsNothingInsteadOfThrowing()
        {
            Assert.That(new PrivateTutorialCache(root).ListReady(), Is.Empty);
        }

        [Test]
        public void DamagedTamperedAndUnfinalizedEntriesAreSkippedNotSurfaced()
        {
            var cache = new PrivateTutorialCache(root);
            var good = Store(cache, "Fold the sleeve");

            // Tampered tutorial bytes: the manifest hash no longer matches.
            var tampered = Ready("Tampered");
            var tamperedBytes = Bytes(tampered);
            WriteEntry(tampered.Id + "-" + tampered.Revision, tamperedBytes, recordingJson,
                recordingHash + "\n" + PrivateTutorialCache.Hash(Encoding.UTF8.GetBytes("different")));

            // Unfinalized: a real, self-consistent entry that was never reviewed.
            var draft = Ready("Draft");
            draft.Status = "draft";
            var draftBytes = Bytes(draft);
            WriteEntry(draft.Id + "-" + draft.Revision, draftBytes, recordingJson,
                recordingHash + "\n" + PrivateTutorialCache.Hash(draftBytes));

            // Missing publication marker: an interrupted write that never became visible.
            var partial = Ready("Partial");
            WriteEntry(partial.Id + "-" + partial.Revision, Bytes(partial), recordingJson, null);

            // Empty recording payload.
            var empty = Ready("Empty");
            var emptyBytes = Bytes(empty);
            WriteEntry(empty.Id + "-" + empty.Revision, emptyBytes, new byte[0],
                recordingHash + "\n" + PrivateTutorialCache.Hash(emptyBytes));

            // Identity mismatch: the document claims a different tutorial than its directory.
            var moved = Ready("Moved");
            var movedBytes = Bytes(moved);
            WriteEntry(Guid.NewGuid().ToString("D") + "-" + moved.Revision, movedBytes, recordingJson,
                recordingHash + "\n" + PrivateTutorialCache.Hash(movedBytes));

            // Foreign and interrupted directories this cache never published.
            WriteEntry(".pending-" + Guid.NewGuid().ToString("N"), Bytes(Ready("Interrupted")), recordingJson, recordingHash + "\nx");
            WriteEntry("not-a-tutorial", null, null, null);
            WriteEntry(good.Id + "-notanumber", Bytes(Ready("Bad revision")), recordingJson, recordingHash + "\nx");

            var listed = new PrivateTutorialCache(root).ListReady();
            Assert.That(listed.Length, Is.EqualTo(1), "only the intact reviewed entry is listed");
            Assert.That(listed[0].Id, Is.EqualTo(good.Id));
            foreach (var entry in listed) Assert.That(entry.Title, Is.Not.EqualTo("Draft"));
        }

        [Test]
        public void EnumerationDoesNotProveLoadable()
        {
            var cache = new PrivateTutorialCache(root);
            var stored = Store(cache, "Fold the sleeve");
            File.WriteAllText(Path.Combine(root, "trail-cache", stored.Id + "-" + stored.Revision, "recording.json"), "{}");
            // Still listed as present, because the tutorial document is intact...
            Assert.That(new PrivateTutorialCache(root).ListReady().Length, Is.EqualTo(1));
            // ...but the recorded bytes are re-verified before anything can be preloaded.
            Assert.Throws<IOException>(() => new PrivateTutorialCache(root).Load(stored.Id, stored.Revision));
        }

        [Test]
        public void ServerRefreshMergesRatherThanReplacesLocalEntries()
        {
            var cache = new PrivateTutorialCache(root);
            var shared = Store(cache, "Fold the sleeve");
            var deviceOnly = Store(cache, "Align the collar");
            var local = new PrivateTutorialCache(root).ListReady();

            var server = new[]
            {
                new TutorialLibraryEntry(shared.Id, shared.Revision, "Reviewed title", 3, false),
                new TutorialLibraryEntry(Guid.NewGuid().ToString("D"), 2, "Server only", 4, false),
            };
            var merged = TutorialLibrary.Merge(server, local);
            Assert.That(merged.Length, Is.EqualTo(3), "server rows plus the device-only guide");
            Assert.That(merged[0].Id, Is.EqualTo(shared.Id));
            Assert.That(merged[0].Title, Is.EqualTo("Reviewed title"), "the reviewed server title wins");
            Assert.That(merged[0].StoredOnDevice, Is.True, "a row present in both is available offline");
            Assert.That(merged[1].Title, Is.EqualTo("Server only"));
            Assert.That(merged[1].StoredOnDevice, Is.False, "a server listing never implies local availability");
            Assert.That(merged[2].Id, Is.EqualTo(deviceOnly.Id), "the device-only guide survives the refresh");
            Assert.That(merged[2].StoredOnDevice, Is.True);
        }

        [Test]
        public void MergeToleratesMissingServerAndDuplicateRows()
        {
            var cache = new PrivateTutorialCache(root);
            var stored = Store(cache, "Fold the sleeve");
            var local = new PrivateTutorialCache(root).ListReady();
            // An unreachable server must never empty the library.
            var offline = TutorialLibrary.Merge(null, local);
            Assert.That(offline.Length, Is.EqualTo(1));
            Assert.That(offline[0].StoredOnDevice, Is.True);
            Assert.That(TutorialLibrary.Merge(null, null), Is.Empty);
            var duplicated = new[]
            {
                new TutorialLibraryEntry(stored.Id, stored.Revision, "First", 1, false),
                new TutorialLibraryEntry(stored.Id, stored.Revision, "Duplicate", 1, false),
            };
            var deduped = TutorialLibrary.Merge(duplicated, local);
            Assert.That(deduped.Length, Is.EqualTo(1));
            Assert.That(deduped[0].Title, Is.EqualTo("First"));
            // A different revision of the same tutorial is a distinct row.
            var other = TutorialLibrary.Merge(new[] { new TutorialLibraryEntry(stored.Id, stored.Revision + 1, "Newer", 1, false) }, local);
            Assert.That(other.Length, Is.EqualTo(2));
            Assert.That(other[0].StoredOnDevice, Is.False, "a revision this device lacks is not offline-available");
            Assert.Throws<ArgumentException>(() => new TutorialLibraryEntry(" ", 1, "x", 1, false));
            Assert.Throws<ArgumentException>(() => new TutorialLibraryEntry("id", -1, "x", 1, false));
        }

        [Test]
        public void FullRemoteLibraryReservesEveryLocalRevisionAndStillRefreshesSharedTitles()
        {
            var cache = new PrivateTutorialCache(root);
            var shared = Store(cache, "Shared old title");
            var deviceOnly = Store(cache, "Offline guide");
            var remote = Enumerable.Range(0, TutorialLibrary.MaximumEntries)
                .Select(i => new TutorialLibraryEntry(Guid.NewGuid().ToString("D"), 1, "Remote " + i, 1, false)).ToList();
            // Even a shared row after the remote capacity and a null row must be considered.
            remote.Add(null);
            remote.Add(new TutorialLibraryEntry(shared.Id, shared.Revision, "Reviewed title", 3, false));
            remote.Add(remote[0]);
            var merged = TutorialLibrary.Merge(remote, cache.ListReady());
            Assert.That(merged.Length, Is.EqualTo(TutorialLibrary.MaximumEntries));
            Assert.That(merged.Count(e => e.StoredOnDevice), Is.EqualTo(2));
            Assert.That(merged.Single(e => e.Id == deviceOnly.Id).StoredOnDevice, Is.True);
            Assert.That(merged.Single(e => e.Id == shared.Id).Title, Is.EqualTo("Reviewed title"));
            Assert.That(merged.Select(e => e.Id + "@" + e.Revision).Distinct().Count(), Is.EqualTo(merged.Length));
            Assert.That(new PrivateTutorialCache(root).Load(deviceOnly.Id, deviceOnly.Revision).RecordingHash,
                Is.EqualTo(recordingHash), "the retained offline row remains loadable without a server");
        }

        [TestCase(false)]
        [TestCase(true)]
        public void ColdStorageRestoresUploadAvailabilityWithoutACaptureBuffer(bool pendingOnly)
        {
            var cache = new PrivateTutorialCache(root);
            if (pendingOnly)
            {
                var recording = ContractJson.ParseRecording(Encoding.UTF8.GetString(recordingJson));
                recording.Id = Guid.NewGuid().ToString("D"); // Resumable uploads already have a server identity.
                var json = ContractJson.SerializeRecording(recording);
                File.WriteAllText(Path.Combine(root, "trail-pending-upload.json"), JsonUtility.ToJson(new PendingFixture
                    { id = recording.Id, json = json, hash = PrivateTutorialCache.Hash(Encoding.UTF8.GetBytes(json)) }));
            }
            else cache.SaveCapture(ContractJson.ParseRecording(Encoding.UTF8.GetString(recordingJson)));
            var host = new GameObject("cold-storage-recovery");
            try
            {
                var storage = host.AddComponent<NativeStorageFeature>();
                Assert.That(storage.HasUploadableCapture, Is.False);
                typeof(NativeStorageFeature).GetMethod("RestorePrivateStorage", BindingFlags.Instance | BindingFlags.NonPublic)
                    .Invoke(storage, new object[] { root });
                Assert.That(storage.Capture, Is.Null, "no current recording or replay buffer was installed");
                Assert.That(storage.HasUploadableCapture, Is.True);
                Assert.That(storage.Status, Does.Contain(pendingOnly ? "Interrupted upload restored" : "Saved recording restored"));
            }
            finally { UnityEngine.Object.DestroyImmediate(host); }
        }
        [Serializable] private sealed class PendingFixture { public string id, json, hash; }

        [Test]
        public void PublishingStillRequiresAPairedAuthor()
        {
            var host = new GameObject("storage-upload-gate");
            try
            {
                var storage = host.AddComponent<NativeStorageFeature>();
                // No connection at all: the local-first library must not weaken the publish gate.
                storage.UploadLastCapture();
                Assert.That(storage.Status, Is.EqualTo("Pair as author before uploading."));
                Assert.That(storage.HasReadyGuides, Is.False);
                storage.RefreshLibrary();
                Assert.That(storage.Status, Is.EqualTo("Pair as author before uploading."), "an unpaired refresh changes nothing");
                Assert.That(NativeStorageFeature.LocalSessionId, Does.Not.Match("^[0-9a-fA-F-]{36}$"),
                    "the local session marker must not look like a server-issued session");
            }
            finally { UnityEngine.Object.DestroyImmediate(host); }
        }
    }
}
