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
