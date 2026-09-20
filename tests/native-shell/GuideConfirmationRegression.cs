using System;
using System.Numerics;
using Trail.Contracts;
using Trail.Motion;
using Trail.Runtime.Guide;
using Trail.Runtime.Shell;

internal static class GuideConfirmationRegression
{
    public static void Run(Action<bool, string> check)
    {
        var left = new CanonicalPose(new Vector3(.5f, 0, 0), Quaternion.Identity);
        var right = new CanonicalPose(Vector3.Zero, Quaternion.Identity);
        var end = new CanonicalPose(new Vector3(.8f, 0, 0), Quaternion.Identity);
        var step = new GuideStep("step", "User-confirmed step", new[] { new GuideTarget(GuideHand.Left, left, end) },
            GuideCompletionMode.UserConfirmed, startDwellMs: 0);
        var guide = new GuideSession(new GuideDefinition("tutorial", 1, new[] { step }), "run");
        guide.Dispatch(new GuideInput(GuideAction.Preloaded, 0));
        guide.Dispatch(new GuideInput(GuideAction.Calibrated, 0, trackingSessionId: "tracking", originRevision: 0));
        guide.Dispatch(new GuideInput(GuideAction.DemonstrationFinished, 0));
        var touch = ShellInteraction.Create();
        var buttons = new[] { new ShellButton("ConfirmStep", Vector3.Zero, true) };
        long sequence = 0;
        void Sample(CanonicalPose? rightPose)
        {
            var now = ++sequence * 40;
            guide.Dispatch(new GuideInput(GuideAction.Sample, now,
                new GuideObservation(now, sequence, 0, "tracking", GuideSource.NativeHands, left, rightPose)));
            touch = ShellInteraction.Observe(touch, buttons,
                new ShellTouchSample(now, sequence, 0, "tracking", left.PositionM, rightPose?.PositionM), now);
            // Same command boundary as TutorialExperienceController.
            if (touch.ConfirmedId == "ConfirmStep") guide.Dispatch(new GuideInput(GuideAction.Confirm, now));
        }
        for (var i = 0; i < 17; i++) Sample(right);
        check(guide.State.Phase == GuidePhase.Guiding && touch.Touch == ShellTouch.Armed, "fixture armed while guide is active");
        Sample(null);
        check(touch.ConfirmedId == null && guide.State.Phase == GuidePhase.Guiding,
            "losing the non-required touching hand cannot complete a left-only step");
        for (var i = 0; i < 17; i++) Sample(right);
        Sample(new CanonicalPose(new Vector3(0, .5f, 0), Quaternion.Identity));
        check(guide.State.Phase == GuidePhase.Complete, "fresh reacquisition, new hold and tracked withdrawal can confirm");
    }
}
