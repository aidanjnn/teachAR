using NUnit.Framework;
using Trail.Contracts;
using Trail.Runtime.Scene;

namespace Trail.Tests.Scene
{
    public sealed class ExpertReferenceSamplesTests
    {
        private static ExpertReferenceCandidate Image(double delivered) => new ExpertReferenceCandidate {
            DeliveredAtMs = delivered, Width = 16, Height = 16, Jpeg = new byte[] { 1, 2, 3 } };
        private static Recording Take(params double[] times)
        {
            var frames = new MotionFrame[times.Length];
            for (var i = 0; i < times.Length; i++) frames[i] = new MotionFrame { TMs = times[i] };
            return new Recording { Frames = frames, DurationMs = times[times.Length - 1] };
        }
        [Test]
        public void TrimExcludesReturnGestureAndSelectsLatestRetainedEndpoint()
        {
            var samples = new ExpertReferenceSamples();
            samples.Admit(100, 1100); samples.Admit(200, 1200); samples.Admit(300, 1300);
            Assert.IsTrue(samples.Add(Image(1105))); Assert.IsTrue(samples.Add(Image(1205))); Assert.IsTrue(samples.Add(Image(1305)));
            var selected = samples.Select(Take(100, 200), 0, 300, out var index);
            Assert.AreEqual(200, selected.TakeMs); Assert.AreEqual(1, index);
        }
        [Test]
        public void PauseGapsDoNotBecomeMotionAndOldCandidatesNeverCrossTakes()
        {
            var samples = new ExpertReferenceSamples(); samples.Admit(100, 1000); samples.Admit(133, 3000);
            Assert.IsFalse(samples.Add(Image(2000)), "no admitted motion during pause");
            Assert.IsTrue(samples.Add(Image(3005)));
            Assert.AreEqual(133, samples.Select(Take(100, 133), 0, 134, out _).TakeMs);
            samples.Clear();
            Assert.IsNull(samples.Select(Take(100, 133), 0, 134, out _));
        }
        [Test]
        public void EarlyHoldAndNonretainedFramesAreNotPresentedAsFinalCheckpoint()
        {
            var samples = new ExpertReferenceSamples(); samples.Admit(100, 1000); samples.Add(Image(1005));
            Assert.IsNull(samples.Select(Take(100, 500), 0, 501, out _), "older than 250ms from kept endpoint");
            Assert.IsNull(samples.Select(Take(90, 200), 0, 201, out _), "must be an actual admitted retained frame");
        }
        [Test]
        public void ExportMappingUsesExactTakeBoundaryAndRejectsOtherTakeShapes()
        {
            var recording = Take(0, 100, 133, 233);
            recording.Markers = new[] {
                new StepMarker { Id = "take-0-start", TMs = 0 }, new StepMarker { Id = "take-0-end", TMs = 100 },
                new StepMarker { Id = "take-1-start", TMs = 133 }, new StepMarker { Id = "take-1-end", TMs = 233 } };
            Assert.AreEqual(3, ExpertReferenceUploadIndex.Resolve(recording, 1, 1, 2, 100));
            Assert.Throws<System.ArgumentException>(() => ExpertReferenceUploadIndex.Resolve(recording, 1, 1, 3, 100));
            Assert.Throws<System.ArgumentException>(() => ExpertReferenceUploadIndex.Resolve(recording, 1, 1, 2, 99));
        }
    }
}
