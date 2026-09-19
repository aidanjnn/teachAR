using NUnit.Framework;
namespace Trail.Tests.EditMode
{
    public sealed class CaptureMotionTests
    {
        [Test] public void RigidAndBasisGoldenResults() => CaptureFixtureAssertions.CalibrationRoundTrips();
        [Test] public void RejectUnsafeCalibrationGeometry() => CaptureFixtureAssertions.BadGeometryRejected();
        [Test] public void RequireStableFreshMarkHold() => CaptureFixtureAssertions.StableMarkRequiresConsecutiveSamples();
        [Test] public void BoundedCapturePreservesActualTimesAndValidity() => CaptureFixtureAssertions.CaptureBoundsAndGaps();
        [Test] public void FreshnessAndJumpPolicy() => CaptureFixtureAssertions.FreshnessRejectsJumps();
        [Test] public void ReplayNeverBridgesTrackingGaps() => CaptureFixtureAssertions.ReplayHidesGaps();
    }
}
