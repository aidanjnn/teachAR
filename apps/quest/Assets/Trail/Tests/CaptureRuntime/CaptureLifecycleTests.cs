using System.Collections;
using System.Collections.Generic;
using System.Linq;
using NUnit.Framework;
using Trail.Contracts;
using Trail.Motion;
using Trail.Runtime.Record;
using Trail.Runtime.XR;
using UnityEngine;
using UnityEngine.TestTools;
using UnityEngine.XR.Hands;
using NVector3 = System.Numerics.Vector3;
using NQuaternion = System.Numerics.Quaternion;

namespace Trail.Tests.CaptureRuntime
{
    public sealed class FixtureHands : HandObservationSource
    {
        public override string SourceKind => "synthetic-fixture";
        public override string Availability => "injected lifecycle fixture";
        public void Emit(double now, long sequence, NVector3 point)
        {
            var joints = new Dictionary<string, CanonicalPose>();
            foreach (var name in JointNames.Canonical) joints.Add(name, new CanonicalPose(point, NQuaternion.Identity));
            Publish(new ReferenceObservation(now, sequence, OriginRevision, SourceKind, new HandSample { Status = "valid", Joints = joints }, new HandSample { Status = "valid", Joints = joints }));
        }
    }
    public sealed class CaptureLifecycleTests
    {
        [Test] public void NamedSdkMapOmitsPalmAndPreservesFingerTips()
        {
            Assert.AreEqual(25, XRHandsSource.CanonicalJoints.Count);
            Assert.AreEqual(25, XRHandsSource.CanonicalJoints.Distinct().Count());
            Assert.IsFalse(XRHandsSource.CanonicalJoints.Contains(XRHandJointID.Palm));
            Assert.AreEqual(XRHandJointID.Wrist, XRHandsSource.CanonicalJoints[0]);
            Assert.AreEqual(XRHandJointID.IndexTip, XRHandsSource.CanonicalJoints[9]);
            Assert.AreEqual(XRHandJointID.LittleTip, XRHandsSource.CanonicalJoints[24]);
        }
        [Test] public void IntegratedTakesTrimReturnPreserveReplacementAndPauseTime()
        {
            var root = new GameObject("recording integration fixture"); root.SetActive(false);
            try
            {
                var source = root.AddComponent<FixtureHands>(); source.TrackingSpace = root.transform;
                var session = root.AddComponent<CaptureReplaySession>(); session.Source = source;
                double now = 0; long sequence = 0; session.Clock = () => now;
                root.SetActive(true);
                void Samples(int count, NVector3 point)
                { for (var i = 0; i < count; i++) { now += 40; source.Emit(now, ++sequence, point); } }
                session.BeginCalibration();
                foreach (var mark in new[] { NVector3.Zero, new NVector3(.5f, 0, 0), new NVector3(0, 0, -.35f), new NVector3(.5f, 0, -.35f) })
                { session.BeginMark(); Samples(11, mark); }
                session.StartRecording(); Assert.IsFalse(session.IsRecording, "save position gates all native capture");
                session.BeginSavePosition(); Samples(100, NVector3.Zero);
                var save = session.Authoring.SavePosition; Assert.NotNull(save);
                var saved = 0; session.RecordingCompleted += _ => saved++;
                session.StartRecording();
                session.StartRecording(1200); // refused double-start must not shorten the active take
                Samples(76, NVector3.Zero);
                Assert.AreEqual(RecordingPhase.Recording, session.Authoring.Phase);
                Samples(50, new NVector3(.3f, .1f, 0));
                Assert.IsTrue(session.Authoring.EndpointCandidateMs.HasValue);
                var boundary = session.Authoring.EndpointCandidateMs.Value;
                Samples(25, NVector3.Zero);
                Assert.AreEqual(1, saved); Assert.AreEqual(1, session.Takes.Count);
                Assert.AreEqual("endpoint-hold-return", session.Takes[0].TrimReason);
                Assert.AreEqual(boundary, session.Takes[0].Trim.EndMsExclusive);
                Assert.Less(session.LastRecording.DurationMs, boundary);
                Assert.AreEqual(.3f, session.LastRecording.Frames.Last().Hands.Right.Joints["wrist"].PositionM.X, .00001f);
                var original = session.LastRecording; var originalMetadata = session.LastAuthoringMetadata;
                session.ReRecordTake(0); Samples(76, NVector3.Zero); Samples(40, new NVector3(.4f, 0, 0));
                session.DiscardRecording(); Assert.AreSame(original, session.LastRecording);
                Assert.AreEqual(1, session.Takes.Count); Assert.AreEqual(1, saved);
                session.StartRecording(); Samples(76, NVector3.Zero); Samples(35, new NVector3(.4f, 0, 0));
                session.PauseRecording(); var pausedMs = session.Authoring.TakeMs;
                Samples(100, new NVector3(.4f, 0, 0));
                Assert.AreEqual(pausedMs, session.Authoring.TakeMs);
                session.ResumeRecording(); Samples(10, new NVector3(.4f, 0, 0)); session.StopRecording();
                Assert.AreEqual(2, saved); Assert.AreEqual(2, session.Takes.Count);
                var exported = session.ExportTakes();
                Assert.AreEqual(4, exported.Markers.Length);
                Assert.AreEqual("step-start", exported.Markers[2].Kind);
                Assert.Greater(exported.Markers[2].TMs, exported.Markers[1].TMs);
                Assert.AreEqual(session.Takes.Sum(t => t.Recording.Frames.Length), exported.Frames.Length);
                Assert.Less(session.LastRecording.DurationMs, pausedMs + 500);
                Assert.AreSame(save, session.Authoring.SavePosition);
                session.StartRecording(); Samples(76, NVector3.Zero); source.Invalidate("origin reset");
                Assert.IsFalse(session.IsRecording); Assert.AreEqual(2, session.Takes.Count);
                Assert.AreSame(save, session.Authoring.SavePosition);
                var captures = new[] {
                    new AuthoredCapture { SchemaVersion = 1, Recording = original, Authoring = originalMetadata },
                    new AuthoredCapture { SchemaVersion = 1, Recording = session.LastRecording, Authoring = session.LastAuthoringMetadata }
                };
                var latestMetadata = session.LastAuthoringMetadata;
                session.NewTutorial(); Assert.IsFalse(session.SavePositionSet); Assert.AreEqual(0, session.Takes.Count);
                session.RestoreAuthoring(captures, latestMetadata);
                Assert.AreEqual(2, session.Takes.Count); Assert.IsTrue(session.SavePositionSet);
                Assert.IsNull(session.Registration, "restored actions never restore session calibration");
                Assert.AreEqual(4, session.ExportTakes().Markers.Length);
                Assert.IsTrue(save.SamePosition(session.Authoring.SavePosition));
                session.StartRecording(); Assert.IsFalse(session.IsRecording, "recalibration is required after restoring");
            }
            finally { Object.DestroyImmediate(root); }
        }
        [UnityTest] public IEnumerator InvalidationStopsCaptureGhostAndRequiresNewRegistration()
        {
            var root = new GameObject("capture lifecycle fixture"); root.SetActive(false);
            var source = root.AddComponent<FixtureHands>(); source.TrackingSpace = root.transform;
            var session = root.AddComponent<CaptureReplaySession>(); session.Source = source;
            double now = 0; long sequence = 0; session.Clock = () => now;
            root.SetActive(true); session.BeginCalibration();
            var marks = new[] { NVector3.Zero, new NVector3(.5f, 0, 0), new NVector3(0, 0, -.35f), new NVector3(.5f, 0, -.35f) };
            foreach (var mark in marks)
            {
                session.BeginMark();
                for (var i = 0; i <= 10; i++) { now += 40; source.Emit(now, ++sequence, mark); }
            }
            Assert.IsNotNull(session.Registration);
            session.BeginSavePosition();
            for (var i = 0; i < 100; i++) { now += 40; source.Emit(now, ++sequence, NVector3.Zero); }
            Assert.IsTrue(session.SavePositionSet);
            session.StartRecording(); Assert.IsTrue(session.IsRecording);
            for (var i = 0; i < 120; i++) { now += 40; source.Emit(now, ++sequence, new NVector3(.2f, .1f, -.1f)); }
            session.StopRecording(); Assert.AreEqual("synthetic-fixture", session.LastRecording.Source);
            session.StartReplay(); Assert.IsTrue(session.IsReplaying);
            var invalidations = 0; session.Invalidated += (_, __) => invalidations++;
            source.Invalidate("fixture origin reset");
            Assert.IsNull(session.Registration); Assert.IsNull(session.LatestWorkspaceObservation);
            Assert.IsFalse(session.IsReplaying); Assert.IsNull(session.ReplayFrame);
            Assert.AreEqual(1, invalidations);
            session.StartRecording(); Assert.IsFalse(session.IsRecording);
            session.StartReplay(); Assert.IsFalse(session.IsReplaying);
            root.SetActive(false); root.SetActive(true); source.Invalidate("second reset");
            Assert.AreEqual(3, invalidations, "disable plus reset each fire once, no duplicate subscriptions");
            Object.Destroy(root); yield return null;
        }
    }
}
