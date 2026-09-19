using Trail.Presentation;
using Trail.Runtime.Record;
using UnityEngine;

namespace Trail.Runtime.Guide
{
    public static class GuideInstaller
    {
        // Called by platform scene composition. Position/scale must be tuned on the actual headset.
        public static GuideController Install(Transform parent, CaptureReplaySession capture, GhostPresentation ghost)
        {
            var root = new GameObject("Local guide"); root.transform.SetParent(parent, false);
            var guide = root.AddComponent<GuideController>(); guide.Capture = capture; guide.Ghost = ghost; guide.Bind();
            var panel = new GameObject("Guide controls"); panel.transform.SetParent(parent, false); panel.transform.localPosition = new Vector3(.45f, 1.15f, .6f);
            panel.AddComponent<GuideControlPanel>().Guide = guide;
            return guide;
        }
    }
}
