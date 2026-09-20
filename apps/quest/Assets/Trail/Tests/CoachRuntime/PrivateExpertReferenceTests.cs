using System;
using System.IO;
using NUnit.Framework;
using Trail.Contracts;
using Trail.Runtime.Scene;
using Trail.Runtime.Storage;
using UnityEngine;

namespace Trail.Tests.CoachRuntime
{
    public sealed class PrivateExpertReferenceTests
    {
        [Test]
        public void CandidatePersistsWithTimingAndNewerImageReplacesOnlyItsTake()
        {
            var root = Path.Combine(Path.GetTempPath(), "trail-reference-test-" + Guid.NewGuid().ToString("N"));
            try
            {
                var recording = Recording(); var store = new PrivateExpertReferenceStore(root);
                var original = Candidate(new byte[] { 1, 2, 3 }); store.Save(recording, original, 0);
                var loaded = new PrivateExpertReferenceStore(root).Load(recording.Id);
                Assert.AreEqual("delivery-aligned-unverified", loaded.timing);
                Assert.AreEqual(5, loaded.deliveredAtMs - loaded.sampleMonoMs);
                Assert.AreEqual(original.Sha256, loaded.sha256);
                var remote = Guid.NewGuid().ToString(); store.MarkUploaded(remote, 0, original.Sha256);
                Assert.IsTrue(store.WasUploaded(remote, 0, original.Sha256));
                var replacement = Candidate(new byte[] { 4, 5, 6 }); store.Save(recording, replacement, 0);
                Assert.AreEqual(replacement.Sha256, store.Load(recording.Id).sha256);
                Assert.IsFalse(store.WasUploaded(remote, 0, replacement.Sha256), "new image is not mistaken for an accepted earlier upload");
                Assert.IsNull(store.Load(Guid.NewGuid().ToString("N")), "a replaced take ID cannot inherit its predecessor's image");
            }
            finally { if (Directory.Exists(root)) Directory.Delete(root, true); }
        }
        [Test]
        public void LayoutAndEndpointPersistIndependentlyAndReplacementDoesNotInheritLayout()
        {
            var root = Path.Combine(Path.GetTempPath(), "trail-reference-test-" + Guid.NewGuid().ToString("N"));
            try
            {
                var recording = Recording(); var store = new PrivateExpertReferenceStore(root);
                var endpoint = Candidate(new byte[] { 1, 2, 3 });
                var layout = Candidate(new byte[] { 4, 5, 6 });
                store.Save(recording, endpoint, recording.Frames.Length - 1);
                store.Save(recording, layout, 0, "starting-layout");
                var reloaded = new PrivateExpertReferenceStore(root);
                Assert.AreEqual(endpoint.Sha256, reloaded.Load(recording.Id).sha256);
                Assert.AreEqual(layout.Sha256, reloaded.Load(recording.Id, "starting-layout").sha256);
                Assert.AreEqual("starting-layout", reloaded.Load(recording.Id, "starting-layout").kind);
                Assert.Throws<ArgumentException>(() => store.Save(recording, layout, 1, "starting-layout"));
                var replacement = Recording(); store.Save(replacement, endpoint, replacement.Frames.Length - 1);
                Assert.IsNull(store.Load(replacement.Id, "starting-layout"), "replacing action one needs its own actual start image");
                var legacyPath = Path.Combine(root, "trail-expert-reference-candidates", Guid.Parse(recording.Id).ToString("N") + ".json");
                File.WriteAllText(legacyPath, File.ReadAllText(legacyPath).Replace("\"kind\":\"endpoint\",", ""));
                Assert.AreEqual(endpoint.Sha256, store.Load(recording.Id).sha256, "legacy endpoint filenames still load");
            }
            finally { if (Directory.Exists(root)) Directory.Delete(root, true); }
        }
        [Test]
        public void CorruptionAndPathTraversalAreRejectedBeforeImageUpload()
        {
            var root = Path.Combine(Path.GetTempPath(), "trail-reference-test-" + Guid.NewGuid().ToString("N"));
            try
            {
                var recording = Recording(); var store = new PrivateExpertReferenceStore(root);
                store.Save(recording, Candidate(new byte[] { 1, 2, 3 }), 0);
                var path = Path.Combine(root, "trail-expert-reference-candidates", Guid.Parse(recording.Id).ToString("N") + ".json");
                var value = JsonUtility.FromJson<PrivateExpertReference>(File.ReadAllText(path));
                value.jpegBase64 = Convert.ToBase64String(new byte[] { 7, 8, 9 });
                File.WriteAllText(path, JsonUtility.ToJson(value));
                Assert.Throws<IOException>(() => store.Load(recording.Id));
                Assert.Throws<ArgumentException>(() => store.Load("../outside"));
                value.jpegBase64 = Convert.ToBase64String(new byte[] { 1, 2, 3 }); value.sampleMonoMs = 0;
                File.WriteAllText(path, JsonUtility.ToJson(value));
                Assert.Throws<IOException>(() => store.Load(recording.Id), "unbounded delivery/sample uncertainty is not accepted");
            }
            finally { if (Directory.Exists(root)) Directory.Delete(root, true); }
        }
        private static Recording Recording()
        {
            var path = Path.GetFullPath(Path.Combine(Application.dataPath, "../../../fixtures/contracts/recording.json"));
            var recording = ContractJson.ParseRecording(File.ReadAllText(path)); recording.Id = Guid.NewGuid().ToString("N"); return recording;
        }
        private static ExpertReferenceCandidate Candidate(byte[] bytes) => new ExpertReferenceCandidate {
            Jpeg = bytes, Sha256 = PrivateTutorialCache.Hash(bytes), Width = 16, Height = 16,
            DeliveredAtMs = 1005, SampleMonoMs = 1000, SensorTimestampTicks = 1234, SourceFrameSequence = 1, SourceSessionId = "synthetic-test" };
    }
}
