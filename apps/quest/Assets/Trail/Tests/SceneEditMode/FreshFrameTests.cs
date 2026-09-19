using NUnit.Framework;
using Trail.Runtime.Scene;
namespace Trail.Tests.Scene
{
    public sealed class FreshFrameTests
    {
        [Test] public void RetainedTextureCannotSatisfyNonce()
        {
            var gate = new FreshFrameGate(); gate.Delivered(10, 0); gate.Begin("nonce", 1);
            Assert.IsNull(gate.TryCopy(2)); Assert.IsFalse(gate.Delivered(10, 3));
            gate.Delivered(11, 4); var ticket = gate.TryCopy(5);
            Assert.IsNotNull(ticket); Assert.AreEqual(2, ticket.SourceFrameSequence);
            Assert.IsTrue(gate.Complete(ticket, 6));
        }
        [Test] public void CancelAndRestartDiscardReadback()
        {
            var gate = new FreshFrameGate(); gate.Begin("nonce", 0); gate.Delivered(1, 1); var ticket = gate.TryCopy(2);
            gate.Restart(); Assert.IsFalse(gate.Complete(ticket, 3));
            Assert.AreNotEqual(ticket.SourceSessionId, gate.SourceSessionId);
        }
        [Test] public void StalledSourceAndLatePixelsFailClosed()
        {
            var gate = new FreshFrameGate(); gate.Begin("nonce", 0); Assert.IsNull(gate.TryCopy(2001));
            gate.Begin("new-nonce", 2002); gate.Delivered(1, 2003); var ticket = gate.TryCopy(2004);
            Assert.IsFalse(gate.Complete(ticket, 2504));
        }
        [Test] public void OnlyOneReadbackCanOwnPixels()
        {
            var gate = new FreshFrameGate(); gate.Begin("nonce", 0); gate.Delivered(1, 1); gate.TryCopy(2);
            gate.Invalidate(); Assert.Throws<System.InvalidOperationException>(() => gate.Begin("new", 3));
            gate.ReleaseCopy(); Assert.DoesNotThrow(() => gate.Begin("new", 4));
        }
    }
}
