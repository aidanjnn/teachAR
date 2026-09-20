// Behavioural diagnostic for the ghost/guide presentation (U4/U5).
// It drives the ACTUAL GhostPresentation and GuideController sources against a
// HAND-WRITTEN UnityEngine stub (UnityEngineStub.cs). That stub is NOT Unity: this is
// not Unity compilation, not EditMode/PlayMode, not an APK build and not headset
// evidence. See README.md for exactly what it does and does not prove.
using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Reflection;
using System.Security.Cryptography;
using System.Text;
using Trail.Contracts;
using Trail.Motion;
using Trail.Presentation;
using Trail.Runtime.Guide;
using Trail.Runtime.Record;
using UnityEngine;
using NVector3 = System.Numerics.Vector3;
using NQuaternion = System.Numerics.Quaternion;

public sealed class HarnessSource : HandObservationSource
{
    public override string SourceKind => "synthetic-fixture";
    public override string Availability => "scratchpad ghost/guide harness";
    public void Emit(double now, long sequence, HandSample left, HandSample right) => Publish(new ReferenceObservation(now, sequence, OriginRevision, SourceKind, left, right));
    public static HandSample At(NVector3 point) => new HandSample { Status = "valid", Joints = JointNames.Canonical.ToDictionary(n => n, _ => new CanonicalPose(point, NQuaternion.Identity)) };
}

internal static class Program
{
    private static int failures, checks;
    private const BindingFlags Any = BindingFlags.Instance | BindingFlags.NonPublic | BindingFlags.Public;
    private static void Check(bool ok, string label)
    {
        checks++;
        if (!ok) { failures++; Console.WriteLine("  FAIL  " + label); } else Console.WriteLine("  ok    " + label);
    }
    private static object Call(object target, string method, params object[] args) =>
        target.GetType().GetMethod(method, Any).Invoke(target, args);
    private static object Field(object target, string name) =>
        target.GetType().GetField(name, Any).GetValue(target);
    private static GameObject Child(GameObject parent, string name) =>
        parent.transform.Children.Select(c => c.gameObject).FirstOrDefault(g => g.name == name);
    private static LineRenderer Line(GameObject rig, string name) => Child(rig, name).GetComponent<LineRenderer>();
    private static Vector3 World(CaptureReplaySession session, NVector3 point)
    {
        var reference = session.Registration.ReferenceFromWorkspace.TransformPoint(point);
        return new Vector3(reference.X, reference.Y, -reference.Z);
    }
    private static void Calibrate(CaptureReplaySession capture, HarnessSource source, ref double now, ref long sequence, CalibrationMarks marks)
    {
        foreach (var mark in new[] { marks.A, marks.B, marks.C, marks.D })
        {
            capture.BeginMark();
            for (var i = 0; i <= 10; i++) { now += 40; source.Emit(now, ++sequence, MotionSamples.Missing(), HarnessSource.At(mark)); }
        }
    }

    // Run from the repository root; fixtures resolve relative to it, as in tests/guide-harness.
    private static int Main()
    {
        GhostRendersBothRequiredHands();
        GuideFeedsEveryRequiredTarget();
        Console.WriteLine();
        if (failures > 0)
        {
            Console.Error.WriteLine("FAIL: " + failures + " of " + checks + " presentation checks.");
            return 1;
        }
        Console.WriteLine("PASS: " + checks + " real C# presentation checks (actual GhostPresentation/GuideController sources).");
        Console.WriteLine("Covers per-side ghost rigs, both required hands, reviewed tolerance zones, neutral tracking loss, and per-target guide presentation driven by the real GuideReducer.");
        Console.WriteLine("STUB ONLY: a hand-written UnityEngine stub, not Unity compilation, EditMode/PlayMode, Android/IL2CPP build, rendering, legibility or headset evidence.");
        return 0;
    }

    private static void GhostRendersBothRequiredHands()
    {
        Console.WriteLine("U4 — ghost presentation");
        var host = new GameObject("ghost harness");
        var source = host.AddComponent<HarnessSource>(); source.TrackingSpace = host.transform;
        var capture = host.AddComponent<CaptureReplaySession>(); capture.Source = source;
        var ghost = host.AddComponent<GhostPresentation>(); ghost.Session = capture;
        Call(ghost, "Awake");
        capture.BindSource();
        double now = 0; long sequence = 0;
        var marks = new CalibrationMarks { A = NVector3.Zero, B = new NVector3(capture.WidthM, 0, 0), C = new NVector3(0, 0, -capture.DepthM), D = new NVector3(capture.WidthM, 0, -capture.DepthM) };
        capture.Clock = () => now;
        Calibrate(capture, source, ref now, ref sequence, marks);
        Check(capture.Registration != null, "harness registration established through the real calibration path");

        var left = host.transform.Children.Select(c => c.gameObject).FirstOrDefault(g => g.name == "Ghost left hand");
        var right = host.transform.Children.Select(c => c.gameObject).FirstOrDefault(g => g.name == "Ghost right hand");
        Check(left != null && right != null, "a rig is built for each side");
        Check(left.transform.Children.Count == 25 + 24 + 2, "each rig owns 25 joints, 24 bones and 2 lines");

        var leftWrist = new NVector3(.05f, .12f, -.10f); var rightWrist = new NVector3(.35f, .12f, -.10f);
        var leftCheckpoint = new CanonicalPose(new NVector3(.05f, .20f, -.10f), NQuaternion.Identity);
        var rightCheckpoint = new CanonicalPose(new NVector3(.35f, .20f, -.10f), NQuaternion.Identity);
        var both = new MotionFrame { TMs = 0, Hands = new HandSamples { Left = HarnessSource.At(leftWrist), Right = HarnessSource.At(rightWrist) } };
        ghost.ShowGuideHands(new List<GhostGuideHand> {
            new GhostGuideHand("left", both, leftCheckpoint, .05),
            new GhostGuideHand("right", both, rightCheckpoint, .04) });
        Call(ghost, "LateUpdate");
        Check(left.activeSelf && right.activeSelf, "a two-hand step renders BOTH hands (the U4 defect)");
        Check(Vector3.Distance(Child(left, "Joint left wrist").transform.position, World(capture, leftWrist)) < 1e-5f, "left rig follows the left hand of the frame");
        Check(Vector3.Distance(Child(right, "Joint right wrist").transform.position, World(capture, rightWrist)) < 1e-5f, "right rig follows the right hand of the frame");

        var leftRing = Line(left, "Reviewed tolerance left"); var rightRing = Line(right, "Reviewed tolerance right");
        Check(leftRing.positionCount == 66 && rightRing.positionCount == 66, "each tolerance zone is drawn as two orthogonal circles");
        Check(Radius(leftRing, World(capture, leftCheckpoint.PositionM), out var leftSpread) && Math.Abs(leftSpread - .05f) < 1e-4f, "left zone radius is the reviewed .05 m tolerance, not a decorative .025");
        Check(Radius(rightRing, World(capture, rightCheckpoint.PositionM), out var rightSpread) && Math.Abs(rightSpread - .04f) < 1e-4f, "right zone radius is that target's reviewed .04 m tolerance");
        var leftCentre = World(capture, leftCheckpoint.PositionM);
        Check(Enumerable.Range(0, 33).All(i => Math.Abs(leftRing.GetPosition(i).y - leftCentre.y) < 1e-5f), "the first circle lies flat in the table plane");
        Check(Math.Abs(leftRing.GetPosition(41).y - leftCentre.y - .05f) < 1e-4f, "the second circle stands vertical, so the zone reads as a volume not a flat ring");

        var rightOnly = new MotionFrame { TMs = 0, Hands = new HandSamples { Left = MotionSamples.Missing(), Right = HarnessSource.At(rightWrist) } };
        ghost.ShowGuideHands(new List<GhostGuideHand> {
            new GhostGuideHand("left", rightOnly, leftCheckpoint, .05),
            new GhostGuideHand("right", rightOnly, rightCheckpoint, .04) });
        Call(ghost, "LateUpdate");
        Check(!left.activeSelf && right.activeSelf, "an invalid hand hides that hand alone; the other keeps rendering");
        Check(leftRing.positionCount == 0, "a hidden hand shows no tolerance zone at all — neutral, not pass or fail");

        ghost.ShowGuideHands(new List<GhostGuideHand> { new GhostGuideHand("right", both, rightCheckpoint, .04) });
        Call(ghost, "LateUpdate");
        Check(!left.activeSelf && right.activeSelf, "a one-hand step leaves the unrequired side absent");

        ghost.ShowGuideHands(new List<GhostGuideHand> { new GhostGuideHand("right", both, rightCheckpoint, 0) });
        Call(ghost, "LateUpdate");
        Check(right.activeSelf && rightRing.positionCount == 0, "an out-of-contract tolerance draws no zone rather than inventing one");

        ghost.ClearGuideFrame();
        Check(!left.activeSelf && !right.activeSelf, "ClearGuideFrame leaves no stale visible ghost");
        Call(ghost, "LateUpdate");
        Check(!left.activeSelf && !right.activeSelf, "and replay with no loaded frame keeps both hidden");
        Call(ghost, "OnDisable");
        Check(!left.activeSelf && !right.activeSelf && (int)Field(ghost, "guideCount") == 0, "teardown drops the guide frame and hides every rig");
        Console.WriteLine();
    }
    private static bool Radius(LineRenderer line, Vector3 centre, out float radius)
    {
        radius = 0;
        if (line.positionCount == 0) return false;
        var distances = Enumerable.Range(0, line.positionCount).Select(i => Vector3.Distance(line.GetPosition(i), centre)).ToArray();
        var first = distances[0];
        radius = first;
        return distances.All(d => Math.Abs(d - first) < 1e-4f);
    }

    private static void GuideFeedsEveryRequiredTarget()
    {
        Console.WriteLine("U5 — guide presentation wired to the existing reducer");
        var fixtures = "fixtures/contracts";
        var recording = ContractJson.ParseRecording(File.ReadAllText(Path.Combine(fixtures, "recording.json")));
        var tutorial = ContractJson.ParseTutorial(File.ReadAllText(Path.Combine(fixtures, "tutorial.json")));
        using (var sha = SHA256.Create())
            tutorial.RecordingHash = BitConverter.ToString(sha.ComputeHash(Encoding.UTF8.GetBytes(ContractJson.SerializeRecording(recording)))).Replace("-", "").ToLowerInvariant();
        var step = tutorial.Steps[0];
        var leftTarget = new HandTarget
        {
            Side = "left", Joint = "wrist",
            StartPose = recording.Frames[step.StartFrame].Hands.Left.Joints["wrist"],
            CheckpointPose = recording.Frames[step.CheckpointFrame].Hands.Left.Joints["wrist"],
            PositionToleranceM = .05, OrientationToleranceRad = null, Gesture = "any", PathCorridorM = .08,
            MotionGates = new[] { new MotionGate { FrameIndex = 1, PositionM = recording.Frames[1].Hands.Left.Joints["wrist"].PositionM, ToleranceM = .05, DwellMs = 100 } },
        };
        step.Targets = new[] { step.Targets[0], leftTarget };

        var host = new GameObject("guide harness");
        var source = host.AddComponent<HarnessSource>(); host.name = "guide harness";
        source.TrackingSpace = host.transform;
        var capture = host.AddComponent<CaptureReplaySession>(); capture.Source = source;
        var ghost = host.AddComponent<GhostPresentation>(); ghost.Session = capture;
        var guide = host.AddComponent<GuideController>(); guide.Capture = capture; guide.Ghost = ghost;
        Call(ghost, "Awake"); capture.BindSource(); guide.Bind();
        double now = 0; long sequence = 0;
        capture.Clock = () => now; guide.Clock = () => now;

        guide.Preload(tutorial, recording, tutorial.RecordingHash, "harness-paired", true);
        Check(guide.Session.Definition.Steps[0].Targets.Count == 2, "a two-hand step survives the real tutorial adapter");
        Check(guide.PhaseLabel == "Calibrate", "phase label follows the reducer into Calibrate");
        Calibrate(capture, source, ref now, ref sequence, recording.Workspace.CalibrationMarksM);
        Check(guide.Session.State.Phase == GuidePhase.Showing, "calibration starts the demonstration");
        Check(guide.PhaseLabel == "Watch" && guide.Status.StartsWith("Watch • "), "learner sees the Watch stage");

        var cueFrames = (List<int>[])Field(guide, "cueFrames");
        Check(cueFrames != null && cueFrames.Length == 2, "cue frames are built per required hand, not for Targets[0] alone");
        Check(cueFrames[0].SequenceEqual(new[] { 0, 1, 2 }) && cueFrames[1].SequenceEqual(new[] { 0, 1, 2 }), "each hand keeps only its own valid demonstration frames");

        now += 10; Call(guide, "Update"); Call(ghost, "LateUpdate");
        Check((int)Field(ghost, "guideCount") == 2, "the demonstration feeds one ghost frame per required hand");

        now += 500; Call(guide, "Update");
        Check(guide.Session.State.Phase == GuidePhase.WaitingStart, "the demonstration ends into the start wait");
        Check(guide.PhaseLabel == "Get ready", "learner sees the Get ready stage");
        // Fresh valid samples for both required hands, deliberately away from the start pose.
        for (var i = 0; i < 3; i++)
        {
            now += 40;
            source.Emit(now, ++sequence, HarnessSource.At(new NVector3(.50f, .40f, -.35f)), HarnessSource.At(new NVector3(.55f, .40f, -.35f)));
            Call(guide, "Update");
        }
        Check(guide.Session.State.Phase == GuidePhase.WaitingStart, "an unmatched start pose keeps the learner waiting");
        Call(ghost, "LateUpdate");
        var shown = (GhostGuideHand[])Field(ghost, "guideHands");
        Check((int)Field(ghost, "guideCount") == 2, "the start wait also shows both required hands");
        Check(shown[0].Side == "right" && Math.Abs(shown[0].PositionToleranceM - .04) < 1e-9, "each hand carries its own reviewed tolerance (right .04)");
        Check(shown[1].Side == "left" && Math.Abs(shown[1].PositionToleranceM - .05) < 1e-9, "each hand carries its own reviewed tolerance (left .05)");
        Check(Vector3.Distance(Child(Child(host, "Ghost left hand"), "Joint left wrist").transform.position,
                World(capture, recording.Frames[step.StartFrame].Hands.Left.Joints["wrist"].PositionM)) < 1e-5f, "the left ghost waits at the demonstrated start pose");

        var progress = guide.Session.State.CueProgress;
        Check((int)Call(guide, "CueFrame", step, progress, 0) == 2 && (int)Call(guide, "CueFrame", step, progress, 1) == 2, "the bounded +2 lookahead is clamped per hand to its last valid frame");
        cueFrames[1] = new List<int>();
        Check((int)Call(guide, "CueFrame", step, progress, 1) == step.StartFrame, "a hand the demonstration never tracked falls back to the start frame instead of throwing");

        Call(guide, "Suspend");
        Check((int)Field(ghost, "guideCount") == 0, "suspension clears the displayed guide frame");
        Check(guide.Session.State.Phase == GuidePhase.Calibrate, "suspension still invalidates through the reducer, not the presentation");
        Console.WriteLine();
    }
}
