using System;
using System.IO;
using System.Text;
using NUnit.Framework;
using Trail.Contracts;
using Trail.Runtime.Storage;
using UnityEngine;
namespace Trail.Tests.Storage
{
    public sealed class PrivateCacheTests
    {
        [Test]
        public void AuthoredCaptureRestoresMetadataAndLegacyMotionStillLoads()
        {
            var root = Path.Combine(Path.GetTempPath(), "trail-authoring-cache-" + Guid.NewGuid().ToString("N"));
            try
            {
                var fixtures = Path.GetFullPath(Path.Combine(Application.dataPath, "../../../fixtures/contracts"));
                var authored = ContractJson.ParseAuthoredCapture(File.ReadAllText(Path.Combine(fixtures, "authored-capture.json")));
                var cache = new PrivateTutorialCache(root);
                cache.SaveCapture(authored.Recording);
                Assert.NotNull(new PrivateTutorialCache(root).LoadLatestCapture(out var legacy));
                Assert.IsNull(legacy, "legacy files do not invent save positions");
                var file = cache.SaveCapture(authored.Recording, authored.Authoring);
                File.SetLastWriteTimeUtc(Path.Combine(root, "trail-cache", file), DateTime.UtcNow.AddSeconds(1));
                var reloaded = new PrivateTutorialCache(root).LoadLatestCapture(out var metadata);
                Assert.AreEqual(authored.Recording.Id, reloaded.Id);
                Assert.AreEqual(authored.Authoring.TutorialId, metadata.TutorialId);
                Assert.AreEqual(101, metadata.Trim.EndMsExclusive);
                Assert.AreEqual(1, new PrivateTutorialCache(root).LoadAuthoredTakes(metadata.TutorialId).Length);
                var duplicate = cache.SaveCapture(authored.Recording, authored.Authoring);
                Assert.AreEqual(1, new PrivateTutorialCache(root).LoadAuthoredTakes(metadata.TutorialId).Length, "replacement revisions do not duplicate steps");
                File.Delete(Path.Combine(root, "trail-cache", duplicate));
                Assert.AreEqual(0, metadata.SavePosition.LeftM.X, "zero is a valid workspace position");
                authored.Authoring.Trim.EndMsExclusive = 100;
                Assert.Throws<ContractException>(() => cache.SaveCapture(authored.Recording, authored.Authoring));
                Assert.AreEqual(101, new PrivateTutorialCache(root).LoadLatestCapture(out metadata).DurationMs + 1);
                File.WriteAllText(Path.Combine(root, "trail-cache", file), "{}");
                Assert.NotNull(new PrivateTutorialCache(root).LoadLatestCapture(out legacy));
                Assert.IsNull(legacy, "corrupt authored file cannot hide an earlier valid recording");
            }
            finally { if (Directory.Exists(root)) Directory.Delete(root, true); }
        }
        [Test]
        public void FinalizedBytesReloadAndCorruptionCannotReplaceAnOpenGuide()
        {
            var root=Path.Combine(Path.GetTempPath(),"trail-unity-cache-"+Guid.NewGuid().ToString("N"));
            try
            {
                var fixtures=Path.GetFullPath(Path.Combine(Application.dataPath,"../../../fixtures/contracts"));
                var recording=File.ReadAllBytes(Path.Combine(fixtures,"recording.json"));
                var hash=PrivateTutorialCache.Hash(recording);
                var tutorial=ContractJson.ParseTutorial(File.ReadAllText(Path.Combine(fixtures,"tutorial.json")));
                tutorial.Id=Guid.NewGuid().ToString("D"); tutorial.Status="ready";tutorial.RecordingHash=hash;
                var bytes=Encoding.UTF8.GetBytes(ContractJson.SerializeTutorial(tutorial));
                var cache=new PrivateTutorialCache(root);var loaded=cache.StoreReady(bytes,recording,hash);
                Assert.That(new PrivateTutorialCache(root).Load(tutorial.Id,tutorial.Revision).RecordingHash,Is.EqualTo(hash));
                File.WriteAllText(Path.Combine(root,"trail-cache",tutorial.Id+"-"+tutorial.Revision,"recording.json"),"{}");
                Assert.Throws<IOException>(()=>cache.Load(tutorial.Id,tutorial.Revision));
                Assert.That(loaded.Tutorial.Status,Is.EqualTo("ready"));
                Assert.That(loaded.Recording.Frames.Length,Is.GreaterThan(0));
                Assert.Throws<ArgumentException>(()=>cache.Load("../escape",1));
            }
            finally { if(Directory.Exists(root))Directory.Delete(root,true); }
        }
    }
}
