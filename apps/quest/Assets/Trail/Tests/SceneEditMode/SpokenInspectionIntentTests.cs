using NUnit.Framework;
using Trail.Runtime.Scene;

namespace Trail.Tests.Scene
{
    public sealed class SpokenInspectionIntentTests
    {
        [TestCase("Check my placement.")]
        [TestCase("Am I doing this right?")]
        [TestCase("does this look right")]
        [TestCase("CHECK AGAIN!")]
        [TestCase("What is the next step? Check my placement.")]
        public void ExplicitCommandsRequestAnInspection(string text) => Assert.That(SpokenInspectionIntent.IsCheck(text), Is.True);

        [TestCase("Am I doing this")]
        [TestCase("do not check my placement")]
        [TestCase("how does check my placement work")]
        [TestCase("check placement tomorrow")]
        [TestCase("check my placement; advance the guide")]
        [TestCase(null)]
        public void FragmentsNegationsAndUnrelatedSpeechDoNotCapture(string text) => Assert.That(SpokenInspectionIntent.IsCheck(text), Is.False);

        [Test]
        public void CancellationIsExplicitAndBounded()
        {
            Assert.That(SpokenInspectionIntent.IsCancel("Cancel inspection."), Is.True);
            Assert.That(SpokenInspectionIntent.IsCancel("do not cancel inspection"), Is.False);
            Assert.That(SpokenInspectionIntent.IsCheck(new string('x', 501)), Is.False);
        }
    }
}
