using System.Collections;
using System.Collections.Generic;
using NUnit.Framework;
using Trail.Contracts;
using Trail.Motion;
using Trail.Presentation;
using Trail.Runtime.Record;
using Trail.Runtime.XR;
using UnityEngine;
using UnityEngine.TestTools;

namespace Trail.Tests.CapturePresentation
{
    public sealed class PanelFixtureHands : HandObservationSource
    {
        public override string SourceKind => "synthetic-fixture";
        public override string Availability => "injected panel fixture";
        public void Emit(double timestamp, long sequence, Vector3 position, bool valid = true)
        {
            var joints = new Dictionary<string, CanonicalPose>();
            foreach (var name in JointNames.Canonical)
                joints.Add(name, new CanonicalPose(new System.Numerics.Vector3(position.x, position.y, -position.z), System.Numerics.Quaternion.Identity));
            Publish(new ReferenceObservation(timestamp, sequence, OriginRevision, SourceKind, MotionSamples.Missing(),
                valid ? new HandSample { Status = "valid", Joints = joints } : MotionSamples.Missing()));
        }
    }
    public sealed class CaptureCompositionTests
    {
        [UnityTest] public IEnumerator PanelConfirmsWithdrawalButCancelsDriftLossAndStalls()
        {
            var root = new GameObject("capture panel fixture"); root.SetActive(false);
            try
            {
                var source = root.AddComponent<PanelFixtureHands>(); source.TrackingSpace = root.transform;
                var session = root.AddComponent<CaptureReplaySession>(); session.Source = source; session.UseLeftHand = true;
                double now = MotionClock.NowMs; long sequence = 0; session.Clock = () => now;
                var ghost = root.AddComponent<GhostPresentation>(); ghost.Session = session;
                var panel = root.AddComponent<CaptureControlPanel>(); panel.Session = session; panel.Ghost = ghost;
                root.SetActive(true); yield return null;
                var labels = panel.GetComponentsInChildren<TextMesh>();
                var toggle = System.Array.Find(labels, label => label.name == "Skeleton / ghost").transform.localPosition;
                var other = System.Array.Find(labels, label => label.name == "Mat moved").transform.localPosition;
                var outside = Vector3.one;
                void Emit(Vector3 position, bool valid = true, double gap = 40)
                { now += gap; source.Emit(now, ++sequence, position, valid); }
                void Arm()
                { for (var i = 0; i <= 15; i++) Emit(toggle); }

                Arm(); Assert.IsFalse(ghost.DiagnosticSkeleton, "Dwell only arms the action");
                Emit(other); Assert.IsFalse(ghost.DiagnosticSkeleton, "Drift to another label cancels the armed action");
                Emit(outside);
                Arm(); Emit(outside);
                Assert.IsTrue(ghost.DiagnosticSkeleton, "Fresh withdrawal confirms the armed action");
                Emit(outside); Assert.IsTrue(ghost.DiagnosticSkeleton, "Withdrawal fires once");
                ghost.DiagnosticSkeleton = false;
                Arm(); Emit(outside, false); Emit(outside);
                Assert.IsFalse(ghost.DiagnosticSkeleton, "Tracking loss cancels confirmation");
                Arm(); Emit(outside, gap: 101);
                Assert.IsFalse(ghost.DiagnosticSkeleton, "A stale gap cancels confirmation");
                Arm(); Emit(outside, gap: 0);
                Assert.IsFalse(ghost.DiagnosticSkeleton, "Non-increasing timestamps cancel confirmation");
            }
            finally { Object.Destroy(root); }
            yield return null;
        }
        [UnityTest] public IEnumerator InstallerCreatesOneSourceSeparateGhostAndRuntimeText()
        {
            var root = new GameObject("capture composition fixture");
            try
            {
                var session = CaptureFlowInstaller.Install(root.transform);
                Assert.AreSame(session, CaptureFlowInstaller.Install(root.transform));
                Assert.AreSame(root.transform, session.Source.TrackingSpace);
                Assert.IsInstanceOf<XRHandsSource>(session.Source);
                Assert.AreEqual(1, root.GetComponentsInChildren<CaptureReplaySession>(true).Length);
                var ghost = root.GetComponentInChildren<GhostPresentation>(true);
                Assert.IsNotNull(ghost); Assert.AreNotSame(session.gameObject, ghost.gameObject);
                Assert.AreSame(session, ghost.Session);
                Assert.GreaterOrEqual(ghost.GetComponentsInChildren<MeshRenderer>(true).Length, 25, "Prefab creates articulated geometry");
                Assert.IsNotNull(Resources.Load<Shader>("TrailGhost"));
                yield return null;
                var panel = root.GetComponentInChildren<CaptureControlPanel>(true);
                Assert.IsNotNull(panel);
                var labels = panel.GetComponentsInChildren<TextMesh>();
                Assert.AreEqual(8, labels.Length);
                foreach (var label in labels)
                {
                    Assert.IsNotNull(label.font);
                    Assert.IsNotNull(label.GetComponent<MeshRenderer>().sharedMaterial);
                }
                Assert.IsFalse(session.IsRecording, "No synthetic success when native hands are unavailable");
                Assert.IsNull(session.Registration);
                Assert.AreEqual(0, ghost.GetComponentsInChildren<Collider>(true).Length, "Ghost cannot become a physical input collider");
            }
            finally { Object.Destroy(root); }
            yield return null;
        }
    }
}
