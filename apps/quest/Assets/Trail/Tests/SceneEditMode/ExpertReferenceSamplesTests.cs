using NUnit.Framework;
using System.Numerics;
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
        public void IndependentClockOriginsPreserveSampleAgeBeforeMatchingCameraDelivery()
        {
            const double stopwatchNow = 9000000000;
            const double unityNow = 5000;
            Assert.IsTrue(ExpertReferenceSamples.TryMapMotionTime(stopwatchNow - 37.5, stopwatchNow, unityNow, out var mapped));
            Assert.AreEqual(37.5, unityNow - mapped, .000001, "mapping preserves the observation's age");
            var samples = new ExpertReferenceSamples(); samples.Admit(200, mapped);
            var image = Image(unityNow);
            Assert.IsTrue(samples.Add(image), "large clock offsets no longer discard every real camera frame");
            Assert.AreEqual(4962.5, image.SampleMonoMs, .000001);
            Assert.AreEqual(200, samples.Select(Take(100, 200), 0, 201, out _).TakeMs);
        }
        [TestCase(1001, 1000, 5000)]
        [TestCase(899, 1000, 5000)]
        [TestCase(950, 1000, 20)]
        [TestCase(double.NaN, 1000, 5000)]
        [TestCase(950, double.PositiveInfinity, 5000)]
        [TestCase(950, 1000, double.NaN)]
        public void ClockMappingRejectsFutureStaleInvalidAndPreStartupSamples(double sample, double motionNow, double cameraNow)
        {
            Assert.IsFalse(ExpertReferenceSamples.TryMapMotionTime(sample, motionNow, cameraNow, out _));
        }
        [Test]
        public void StartingLayoutBindsOnlyActualFirstSampleAcrossDifferentClockOrigins()
        {
            Assert.IsTrue(ExpertReferenceSamples.TryMapMotionTime(9000000000 - 10, 9000000000, 1000, out var sampleTime));
            var layout = new StartingLayoutReference();
            Assert.IsTrue(layout.Arm(0, sampleTime, Vector3.Zero, Vector3.UnitX));
            var image = Image(1020); Assert.IsTrue(layout.Add(image));
            Assert.AreSame(image, layout.Select(Take(0, 100), 0, 101));
            Assert.AreEqual(0, image.TakeMs); Assert.AreEqual(990, image.SampleMonoMs);
        }
        [TestCase(1050, true)]
        [TestCase(1050.001, false)]
        [TestCase(999, false)]
        public void StartingLayoutDeliveryWindowNeverRelabelsLateImages(double delivery, bool accepted)
        {
            var layout = new StartingLayoutReference(); layout.Arm(0, 1000, Vector3.Zero, Vector3.UnitX);
            Assert.AreEqual(accepted, layout.Add(Image(delivery)));
        }
        [Test]
        public void StartingLayoutRejectsMotionBeforeDeliveryButPreservesAnEarlierValidSnapshot()
        {
            var layout = new StartingLayoutReference(); layout.Arm(0, 1000, Vector3.Zero, Vector3.UnitX);
            layout.Observe(1020, new Vector3(.03f, 0, 0), Vector3.UnitX);
            Assert.IsFalse(layout.Add(Image(1030)));
            Assert.IsTrue(layout.Add(Image(1010)), "readback may finish after movement when the delivered view preceded it");
            layout.Clear(); layout.Arm(0, 1000, Vector3.Zero, Vector3.UnitX);
            layout.Observe(1020, null, Vector3.UnitX);
            Assert.IsFalse(layout.Add(Image(1030)), "tracking loss cannot establish a stable start pose");
        }
        [Test]
        public void StartingLayoutCannotSurviveStartTrimDiscardOrWrongFirstFrame()
        {
            var layout = new StartingLayoutReference(); layout.Arm(0, 1000, Vector3.Zero, Vector3.UnitX); layout.Add(Image(1030));
            Assert.IsNull(layout.Select(Take(0, 100), 10, 111));
            Assert.IsNull(layout.Select(Take(33, 100), 0, 101));
            layout.Clear(); Assert.IsNull(layout.Select(Take(0, 100), 0, 101));
            Assert.IsFalse(layout.Arm(33, 1000, Vector3.Zero, Vector3.UnitX), "never request a later sample as frame zero");
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
