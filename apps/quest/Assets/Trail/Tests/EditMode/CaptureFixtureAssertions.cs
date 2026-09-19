using System;
using System.Collections.Generic;
using System.Numerics;
using Trail.Contracts;
using Trail.Motion;

namespace Trail.Tests.EditMode
{
    public static class CaptureFixtureAssertions
    {
        private static void Check(bool condition, string label) { if (!condition) throw new Exception(label); }
        private static void Near(Vector3 actual, Vector3 expected, string label) => Check(Vector3.Distance(actual, expected) < .0001f, label);
        private static void Throws(Action action, string label)
        { try { action(); } catch (ArgumentException) { return; } catch (InvalidOperationException) { return; } throw new Exception(label); }
        public static void RunAll()
        {
            CalibrationRoundTrips(); BadGeometryRejected(); StableMarkRequiresConsecutiveSamples(); CaptureBoundsAndGaps(); ReplayHidesGaps(); FreshnessRejectsJumps();
        }
        public static void CalibrationRoundTrips()
        {
            foreach (var angle in new[] { 0f, .3f, 1.5707963f, 3.1415926f })
            {
                var rotation = Quaternion.CreateFromAxisAngle(Vector3.UnitY, angle);
                var reference = new RigidRegistration(new Vector3(1.4f, .8f, -2), rotation);
                var fit = WorkspaceCalibration.Fit(.5f, .35f, reference.TransformPoint(Vector3.Zero), reference.TransformPoint(new Vector3(.5f, 0, 0)),
                    reference.TransformPoint(new Vector3(0, 0, -.35f)), reference.TransformPoint(new Vector3(.5f, 0, -.35f)), Vector3.UnitY);
                Near(fit.ReferenceFromWorkspace.TransformPoint(new Vector3(.23f, .17f, -.09f)), reference.TransformPoint(new Vector3(.23f, .17f, -.09f)), "rotated room transfer");
                var pose = new CanonicalPose(new Vector3(.1f, .2f, -.3f), Quaternion.CreateFromAxisAngle(Vector3.UnitX, .6f));
                var restored = fit.ReferenceFromWorkspace.Inverse().Apply(fit.ReferenceFromWorkspace.Apply(pose));
                Near(restored.PositionM, pose.PositionM, "rigid round trip");
                Check(Math.Abs(Quaternion.Dot(restored.OrientationXyzw, pose.OrientationXyzw)) > .99999f, "orientation round trip");
                var reflected = CoordinateBasis.ReflectZ(CoordinateBasis.ReflectZ(pose));
                Near(reflected.PositionM, pose.PositionM, "basis position round trip");
                Check(Math.Abs(Quaternion.Dot(reflected.OrientationXyzw, pose.OrientationXyzw)) > .99999f, "basis quaternion round trip");
            }
            // Fixed golden marks/expected point, independent of the transform used to generate other cases.
            var quarterTurn = WorkspaceCalibration.Fit(.5f, .35f,
                new Vector3(1, .8f, 2), new Vector3(1, .8f, 1.5f),
                new Vector3(.65f, .8f, 2), new Vector3(.65f, .8f, 1.5f), Vector3.UnitY);
            Near(quarterTurn.ReferenceFromWorkspace.TransformPoint(new Vector3(.2f, .1f, -.1f)),
                new Vector3(.9f, .9f, 1.8f), "fixed quarter-turn calibration golden");
            // A known non-roundtrip golden: Unity +Z becomes canonical -Z, and a +Y rotation reverses.
            var golden = CoordinateBasis.ReflectZ(new CanonicalPose(new Vector3(1, 2, 3), new Quaternion(0, .70710677f, 0, .70710677f)));
            Near(golden.PositionM, new Vector3(1, 2, -3), "golden reflected position");
            Check(Math.Abs(golden.OrientationXyzw.Y + .70710677f) < .00001f, "golden reflected orientation");
        }
        public static void BadGeometryRejected()
        {
            var a = Vector3.Zero; var b = new Vector3(.5f, 0, 0); var c = new Vector3(0, 0, -.35f); var d = b + c;
            Throws(() => WorkspaceCalibration.Fit(.5f, .35f, a, b, -c, b-c, Vector3.UnitY), "mirrored order rejected");
            Throws(() => WorkspaceCalibration.Fit(.5f, .35f, a, b, new Vector3(.35f, 0, 0), d, Vector3.UnitY), "collinear rejected");
            Throws(() => WorkspaceCalibration.Fit(.5f, .35f, a, b * 1.2f, c, d, Vector3.UnitY), "scale mismatch rejected");
            Throws(() => WorkspaceCalibration.Fit(.5f, .35f, a, b, c, d + new Vector3(.04f, 0, 0), Vector3.UnitY), "held-out mark does not enter fit");
            Throws(() => WorkspaceCalibration.Fit(float.NaN, .35f, a, b, c, d, Vector3.UnitY), "nonfinite rejected");
            Throws(() => WorkspaceCalibration.Fit(.5f, .35f, a, b, c, d, -Vector3.UnitY), "flipped up rejected");
        }
        public static void StableMarkRequiresConsecutiveSamples()
        {
            var sampler = new StableMarkSampler(); Vector3 point;
            for (var i = 0; i < 10; i++) Check(!sampler.Push(i * 40, Vector3.Zero, out point), "hold not early");
            Check(sampler.Push(400, Vector3.Zero, out point), "zero is a valid coordinate"); Near(point, Vector3.Zero, "median zero");
            sampler.Reset(); sampler.Push(0, Vector3.Zero, out point); sampler.Push(400, Vector3.Zero, out point);
            Check(sampler.Progress == 0, "stall resets hold");
            sampler.Push(440, new Vector3(.04f, 0, 0), out point); Check(sampler.Progress == 0, "jitter resets hold");
            sampler.Push(480, null, out point); Check(sampler.Progress == 0, "tracking loss resets hold");
            sampler.Push(500, Vector3.Zero, out point); Check(!sampler.Push(500, Vector3.Zero, out point), "duplicate observation rejected");
        }
        public static void CaptureBoundsAndGaps()
        {
            var capture = new MotionCapture(1000, 5000, 2, new RigidRegistration(new Vector3(1, 0, 0), Quaternion.Identity), "synthetic-fixture");
            Check(capture.Append(Obs(1000, 1, 2, Hand(new Vector3(1, 0, 0)))), "first sample");
            Check(!capture.Append(Obs(1010, 2, 2, Hand(Vector3.Zero))), "30Hz bound");
            Check(!capture.Append(Obs(1020, 1, 2, Hand(Vector3.Zero))), "duplicate sequence");
            Check(capture.Append(Obs(1060, 3, 2, MotionSamples.Missing())), "missing hand frame retained");
            Check(capture.Append(Obs(1400, 4, 2, Hand(new Vector3(1.5f, 0, 0)))), "stall not filled");
            Throws(() => capture.Finish("fixture", Workspace(), double.NaN), "nonfinite completion clock rejected");
            var recording = capture.Finish("fixture", Workspace(), 6000);
            Check(recording.Frames.Length == 3 && recording.Frames[2].TMs == 400, "actual times retained");
            Near(recording.Frames[0].Hands.Left.Joints["wrist"].PositionM, Vector3.Zero, "recorded in workspace");
            Check(recording.Frames[1].Hands.Left.Status == "missing", "explicit missing");
            Check(recording.Source == "synthetic-fixture" && recording.Audio == null, "honest provenance and no narration");
            Throws(() => new MotionCapture(0, 120001, 0, new RigidRegistration(Vector3.Zero, Quaternion.Identity), "live"), "duration bound");
            var invalidated = new MotionCapture(0, 5000, 1, new RigidRegistration(Vector3.Zero, Quaternion.Identity), "live");
            Throws(() => invalidated.Append(new ReferenceObservation(10, 1, 2, "live", Hand(Vector3.Zero), Hand(Vector3.Zero))), "origin invalidates capture");
            invalidated.Tick(5000); Check(invalidated.IsFinished, "deadline runs without callbacks");
            var bounded = new MotionCapture(0, 120000, 0, new RigidRegistration(Vector3.Zero, Quaternion.Identity), "synthetic-fixture");
            for (var i = 0; i < 10000; i++) bounded.Append(Obs(i * 34, i, 0, MotionSamples.Missing()));
            Check(bounded.FrameCount <= 3600 && bounded.IsFinished, "duration and memory bounded");
            var bytes = new MotionCapture(0, 5000, 0, new RigidRegistration(Vector3.Zero, Quaternion.Identity), "synthetic-fixture", 10000);
            for (var i = 0; i < 100; i++) bytes.Append(Obs(i * 40, i, 0, Hand(new Vector3(.1234567f, .2345678f, -.3456789f))));
            Check(bytes.IsFinished && bytes.FrameCount > 0 && bytes.FrameCount < 100, "serialized byte budget stops admission");
            var finalized = bytes.Finish("byte-bound", Workspace(), 4000);
            Check(finalized.Frames.Length == bytes.FrameCount && bytes.StopReason == "serialized motion size limit", "byte-bound capture remains saveable");
        }
        public static void FreshnessRejectsJumps()
        {
            var continuity = new HandContinuity();
            Check(continuity.Accept(Hand(Vector3.Zero), 0).Status == "valid", "fresh hand accepted");
            Check(continuity.Accept(Hand(new Vector3(1, 0, 0)), 30).Reason == "jump", "jump rejected");
            Check(continuity.Accept(Hand(Vector3.Zero), 60).Status == "valid", "fresh reacquisition");
            Check(continuity.Accept(Hand(Vector3.Zero), 60).Status == "missing", "duplicate callback rejected");
            continuity.Accept(Hand(Vector3.Zero), 90);
            Check(continuity.Accept(Hand(Vector3.One), 250).Status == "valid", "gap restarts continuity");
        }
        public static void ReplayHidesGaps()
        {
            var capture = new MotionCapture(0, 5000, 0, new RigidRegistration(Vector3.Zero, Quaternion.Identity), "synthetic-fixture");
            capture.Append(Obs(0, 1, 0, Hand(Vector3.Zero))); capture.Append(Obs(40, 2, 0, Hand(new Vector3(.04f, 0, 0))));
            capture.Append(Obs(80, 3, 0, MotionSamples.Missing())); capture.Append(Obs(120, 4, 0, Hand(new Vector3(.12f, 0, 0))));
            capture.Append(Obs(500, 5, 0, Hand(new Vector3(.5f, 0, 0))));
            var recording = capture.Finish("replay", Workspace(), 5000); var replay = new MotionReplay(recording);
            recording.Frames[0].Hands.Left.Joints.Clear();
            Near(replay.Sample(20).Hands.Left.Joints["wrist"].PositionM, new Vector3(.02f, 0, 0), "timestamp interpolation and immutable copy");
            Check(replay.Sample(60).Hands.Left.Status == "missing", "no interpolation into tracking loss");
            Check(replay.Sample(100).Hands.Left.Status == "missing", "no interpolation out of tracking loss");
            Check(replay.Sample(140).Hands.Left.Status == "missing", "hide long gap");
            Check(replay.Sample(500).Hands.Left.Status == "valid", "fresh exact frame after gap");
            Check(replay.Sample(601).Hands.Left.Status == "missing", "no stale trailing hold");
            Check(replay.Sample(-1).Hands.Left.Status == "missing", "outside playback");
        }
        private static HandSample Hand(Vector3 position)
        {
            var joints = new Dictionary<string, CanonicalPose>(); foreach (var name in JointNames.Canonical) joints.Add(name, new CanonicalPose(position, Quaternion.Identity));
            return new HandSample { Status = "valid", Joints = joints };
        }
        private static ReferenceObservation Obs(double time, long seq, int revision, HandSample hand) => new ReferenceObservation(time, seq, revision, "synthetic-fixture", hand, MotionSamples.Missing());
        private static WorkspaceDefinition Workspace() => new WorkspaceDefinition { Id = "mat", Version = 1, WidthM = .5, DepthM = .35,
            LayoutId = "test", DominantHand = "left", CalibrationMethod = "three-point-index-tip-v1",
            CalibrationMarksM = new CalibrationMarks { A = Vector3.Zero, B = new Vector3(.5f,0,0), C = new Vector3(0,0,-.35f), D = new Vector3(.5f,0,-.35f) } };
    }
}
