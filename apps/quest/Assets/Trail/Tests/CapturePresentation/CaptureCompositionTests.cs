using System.Collections;
using NUnit.Framework;
using Trail.Presentation;
using Trail.Runtime.Record;
using Trail.Runtime.XR;
using UnityEngine;
using UnityEngine.TestTools;

namespace Trail.Tests.CapturePresentation
{
    public sealed class CaptureCompositionTests
    {
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
