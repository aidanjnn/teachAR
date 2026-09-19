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
            Publish(new ReferenceObservation(now, sequence, OriginRevision, SourceKind, MotionSamples.Missing(), new HandSample { Status = "valid", Joints = joints }));
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
            session.StartRecording(); Assert.IsTrue(session.IsRecording);
            now += 40; source.Emit(now, ++sequence, new NVector3(.2f, .1f, -.1f));
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
