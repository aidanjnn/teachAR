using NUnit.Framework;

namespace Trail.Tests.Guide
{
    public sealed class GuideTests
    {
        [Test]
        public void DeterministicGuideScenarios() => Assert.That(GuideScenarios.RunAll(), Is.GreaterThanOrEqualTo(19));
        [Test]
        public void SyntheticDiagnosticTraversesFullFlow()
        {
            Assert.That(GuideScenarios.DiagnosticTrace(), Does.Contain("Calibrate -> Showing -> WaitingStart -> Guiding -> Holding -> Showing -> WaitingStart -> Guiding -> Holding -> Complete"));
        }
    }
}
