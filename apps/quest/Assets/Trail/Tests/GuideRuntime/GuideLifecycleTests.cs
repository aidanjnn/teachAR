using System;
using System.Collections;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Security.Cryptography;
using System.Text;
using NUnit.Framework;
using Trail.Contracts;
using Trail.Motion;
using Trail.Presentation;
using Trail.Runtime.Guide;
using Trail.Runtime.Record;
using UnityEngine;
using UnityEngine.TestTools;
using NVector3 = System.Numerics.Vector3;
using NQuaternion = System.Numerics.Quaternion;

namespace Trail.Tests.GuideRuntime
{
    public sealed class GuideFixtureSource : HandObservationSource
    {
        public override string SourceKind => "synthetic-fixture";
        public override string Availability => "injected guide lifecycle fixture";
        public void Emit(double now, long sequence, HandSample hand) => Publish(new ReferenceObservation(now, sequence, OriginRevision, SourceKind, MotionSamples.Missing(), hand));
        public static HandSample At(NVector3 point) => new HandSample { Status = "valid", Joints = JointNames.Canonical.ToDictionary(n => n, _ => new CanonicalPose(point, NQuaternion.Identity)) };
    }
    public sealed class GuideLifecycleTests
    {
        [UnityTest]
        public IEnumerator PreloadCalibrationObservationPauseAndResetUseRealAdapters()
        {
            var fixtureRoot = Path.GetFullPath(Path.Combine(Application.dataPath, "../../..", "fixtures/contracts"));
            var recording = ContractJson.ParseRecording(File.ReadAllText(Path.Combine(fixtureRoot, "recording.json")));
            var tutorial = ContractJson.ParseTutorial(File.ReadAllText(Path.Combine(fixtureRoot, "tutorial.json")));
            // This fixture is saved into a new native byte representation, with its matching verified hash.
            var bytes = Encoding.UTF8.GetBytes(ContractJson.SerializeRecording(recording));
            using (var sha = SHA256.Create()) tutorial.RecordingHash = BitConverter.ToString(sha.ComputeHash(bytes)).Replace("-", "").ToLowerInvariant();
            var root = new GameObject("guide lifecycle synthetic fixture"); root.SetActive(false);
            var source = root.AddComponent<GuideFixtureSource>(); source.TrackingSpace = root.transform;
            var capture = root.AddComponent<CaptureReplaySession>(); capture.Source = source;
            var ghost = root.AddComponent<GhostPresentation>(); ghost.Session = capture;
            var guide = root.AddComponent<GuideController>(); guide.Capture = capture; guide.Ghost = ghost;
            var now = 0d; var sequence = 0L; capture.Clock = () => now; guide.Clock = () => now;
            var completions = new List<GuideEvent>(); var snapshots = new List<GuideEvent>();
            guide.Telemetry += e => { ContractJson.ParseGuideEvent(ContractJson.SerializeGuideEvent(e)); if (e.Type == "step-completed") completions.Add(e); else if (e.Type == "snapshot") snapshots.Add(e); };
            try
            {
                root.SetActive(true); guide.Preload(tutorial, recording, tutorial.RecordingHash, "fixture-paired", true);
                Assert.AreEqual(GuidePhase.Calibrate, guide.Session.State.Phase);
                var marks = recording.Workspace.CalibrationMarksM;
                foreach (var mark in new[] { marks.A, marks.B, marks.C, marks.D })
                {
                    capture.BeginMark();
                    for (var i = 0; i <= 10; i++) { now += 40; source.Emit(now, ++sequence, GuideFixtureSource.At(mark)); }
                }
                Assert.AreEqual(GuidePhase.Showing, guide.Session.State.Phase);
                now += recording.DurationMs + 1; yield return null;
                Assert.AreEqual(GuidePhase.WaitingStart, guide.Session.State.Phase);
                for (var i = 0; i < 7; i++) { now += 50; source.Emit(now, ++sequence, recording.Frames[0].Hands.Right); yield return null; }
                Assert.AreEqual(GuidePhase.Guiding, guide.Session.State.Phase);
                for (var i = 0; i < 3; i++) { now += 50; source.Emit(now, ++sequence, recording.Frames[1].Hands.Right); yield return null; }
                for (var i = 0; i < 5; i++) { now += 50; source.Emit(now, ++sequence, recording.Frames[2].Hands.Right); yield return null; }
                Assert.AreEqual(GuidePhase.Holding, guide.Session.State.Phase);
                var acknowledgment = guide.PauseForInspection();
                Assert.AreEqual("paused", ContractJson.ParseGuideEvent(ContractJson.SerializeGuideEvent(acknowledgment)).State.Phase);
                Assert.AreEqual(0, guide.Session.State.DwellMs);
                Assert.IsTrue(snapshots.Any(e => e.State.Phase == "paused"), "pause is published immediately");
                var pausedState = guide.Session.State;
                guide.RebindTelemetrySession("fixture-paired");
                Assert.Greater(snapshots.Last().Seq, acknowledgment.Seq, "same-server re-pair preserves sequence");
                guide.RebindTelemetrySession("fixture-server-restarted");
                Assert.AreEqual("fixture-server-restarted", snapshots.Last().SessionId);
                Assert.AreEqual(0, snapshots.Last().Seq);
                Assert.AreSame(pausedState, guide.Session.State, "backend recovery cannot mutate local progression");
                now += 1000; source.Emit(now, ++sequence, recording.Frames[2].Hands.Right); yield return null;
                Assert.AreEqual(0, completions.Count);
                guide.Resume(); yield return null;
                for (var i = 0; i < 16; i++) { now += 50; source.Emit(now, ++sequence, recording.Frames[2].Hands.Right); yield return null; }
                Assert.AreEqual(1, completions.Count);
                Assert.AreEqual("path-and-pose", completions[0].Evidence);
                Assert.AreEqual("Movement checkpoint reached.", guide.LastCompletion);
                guide.Repeat(); yield return null; Assert.AreEqual(GuidePhase.Showing, guide.Session.State.Phase);
                source.Invalidate("fixture reference reset"); Assert.AreEqual(GuidePhase.Calibrate, guide.Session.State.Phase);
                var revision = guide.Session.State.StepRevision;
                root.SetActive(false); root.SetActive(true); source.Invalidate("second reset");
                Assert.Greater(guide.Session.State.StepRevision, revision);
                Assert.AreEqual(1, completions.Count, "lifecycle cannot emit another completion");
            }
            finally { UnityEngine.Object.Destroy(root); }
            yield return null;
        }
    }
}
