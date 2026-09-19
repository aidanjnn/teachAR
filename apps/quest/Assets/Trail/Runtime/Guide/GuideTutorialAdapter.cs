using System;
using System.Linq;
using Trail.Contracts;
using Trail.Motion;

namespace Trail.Runtime.Guide
{
    public static class GuideTutorialAdapter
    {
        // Caller supplies the verified hash of the recording bytes, not a tutorial's self-asserted hash.
        public static GuideDefinition Create(Tutorial tutorial, Recording recording, string verifiedRecordingHash, GuideSource source)
        {
            ContractValidation.ValidateTutorialRecording(tutorial, recording, verifiedRecordingHash);
            if (tutorial.Status != "ready") throw new ArgumentException("Only an immutable ready tutorial may guide a learner.");
            return new GuideDefinition(tutorial.Id, tutorial.Revision, tutorial.Steps.Select(step => new GuideStep(step.Id, step.Instruction,
                step.Targets.Select(t => new GuideTarget(t.Side == "left" ? GuideHand.Left : GuideHand.Right,
                    t.StartPose, t.CheckpointPose, t.MotionGates.Select(g => new GuideGate(g.PositionM, g.ToleranceM, g.DwellMs)),
                    CuePath(recording, step, t),
                    t.PositionToleranceM, t.OrientationToleranceRad, Gesture(t.Gesture))),
                Mode(step.CompletionMode), step.DwellMs, step.StartDwellMs)), source);
        }
        private static System.Numerics.Vector3[] CuePath(Recording recording, TutorialStep step, HandTarget target)
        {
            var path = recording.Frames.Skip(step.StartFrame).Take(step.EndFrameExclusive - step.StartFrame)
                .Select(f => target.Side == "left" ? f.Hands.Left : f.Hands.Right).Where(h => h.Status == "valid")
                .Select(h => h.Joints["wrist"].PositionM).ToArray();
            return path.Length < 2 ? new[] { target.StartPose.PositionM, target.CheckpointPose.PositionM } : path;
        }
        public static GuideCompletionMode Mode(string mode) => mode == "path-and-pose" ? GuideCompletionMode.PathAndPose : mode == "pose-match" ? GuideCompletionMode.PoseMatch : mode == "user-confirmed" ? GuideCompletionMode.UserConfirmed : throw new ArgumentException("Unknown completion mode.");
        private static GuideGesture Gesture(string gesture) => gesture == "pinch" ? GuideGesture.Pinch : gesture == "open" ? GuideGesture.Open : gesture == "any" ? GuideGesture.Any : throw new ArgumentException("Unknown gesture.");
    }
}
