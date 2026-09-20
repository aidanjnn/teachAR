using NUnit.Framework;
namespace Trail.Tests.EditMode
{
    public sealed class RecordingLifecycleTests
    {
        [Test] public void PalmPointsAndAuthoringValuesValidate() => RecordingFixtureAssertions.PalmAndValueValidation();
        [Test] public void SavePositionIsSetOnceAndReusedByEveryTake() => RecordingFixtureAssertions.SavePositionSetOnceAndReused();
        [Test] public void SavePositionRejectsMissingTrackingAndAccidentalDwell() => RecordingFixtureAssertions.SavePositionRejectsBogusEvidence();
        [Test] public void SavePositionChangesOnlyOnExplicitRequest() => RecordingFixtureAssertions.ExplicitChangeCancelAndNewTutorial();
        [Test] public void EndpointHoldAndReturnTrimTheReturnGesture() => RecordingFixtureAssertions.EndpointHoldReturnTrimsTheReturn();
        [Test] public void OrdinaryTaskMotionNeverSavesATake() => RecordingFixtureAssertions.OrdinaryMotionDoesNotSave();
        [Test] public void NarrationAndMotionShareOneTrimBoundary() => RecordingFixtureAssertions.NarrationTrimsOnTheSameBoundary();
        [Test] public void DwellResetsOnPauseTrackingLossAndOriginChange() => RecordingFixtureAssertions.DwellResetsOnPauseLossAndOrigin();
        [Test] public void PausedTimeIsNeverPartOfTheTake() => RecordingFixtureAssertions.PausedTimeNeverCountsAsTakeTime();
        [Test] public void DiscardedReplacementPreservesThePreviousTake() => RecordingFixtureAssertions.DiscardedReplacementKeepsPreviousTake();
        [Test] public void ExplicitStopRemainsAvailable() => RecordingFixtureAssertions.ExplicitStopKeepsTheFullTake();
        [Test] public void DurationLimitKeepsASaveableTake() => RecordingFixtureAssertions.DurationLimitKeepsASaveableTake();
        [Test] public void TrimPreservesTrailingMarkers() => RecordingFixtureAssertions.TrimPreservesTrailingMarkers();
        [Test] public void ResumeRequiresReturningToThePausedPose() => RecordingFixtureAssertions.ResumeRequiresReturnToPausedPose();
    }
}
