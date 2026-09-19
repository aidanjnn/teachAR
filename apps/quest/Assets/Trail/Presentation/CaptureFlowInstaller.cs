using Trail.Runtime.Record;
using Trail.Runtime.XR;
using UnityEngine;

namespace Trail.Presentation
{
    public static class CaptureFlowInstaller
    {
        // Main-scene composition calls this once with the sole rig's tracking-space transform.
        public static CaptureReplaySession Install(Transform trackingSpace, Transform panelAnchor = null)
        {
            if (trackingSpace == null) throw new System.ArgumentNullException(nameof(trackingSpace));
            var existing = trackingSpace.GetComponentInChildren<CaptureReplaySession>(true);
            if (existing != null) return existing;
            var root = new GameObject("Trail capture and calibration"); root.transform.SetParent(trackingSpace, false);
            var source = root.AddComponent<XRHandsSource>(); source.TrackingSpace = trackingSpace;
            var session = root.AddComponent<CaptureReplaySession>(); session.Source = source; session.BindSource();
            var prefab = Resources.Load<GameObject>("TrailGhost");
            if (prefab == null) throw new System.InvalidOperationException("TrailGhost prefab is missing.");
            var ghost = Object.Instantiate(prefab, root.transform).GetComponent<GhostPresentation>(); ghost.Session = session;
            var panel = new GameObject("Trail world-space controls"); panel.transform.SetParent(panelAnchor == null ? root.transform : panelAnchor, false);
            if (panelAnchor == null) panel.transform.localPosition = new Vector3(.45f, 1.15f, .65f);
            var controls = panel.AddComponent<CaptureControlPanel>(); controls.Session = session; controls.Ghost = ghost;
            return session;
        }
    }
}
