using System;
using Trail.Presentation;
using Trail.Runtime.Platform;
using Trail.Runtime.Record;
using UnityEngine;

namespace Trail.Runtime.Guide
{
    public sealed class GuidePlatformFeature : MonoBehaviour, IPlatformFeature
    {
        public int Order => 20;
        public GuideController Controller { get; private set; }
        [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.BeforeSceneLoad)]
        private static void Register() => PlatformFeatures.Register("local-guide", root => root.AddComponent<GuidePlatformFeature>());
        public void Initialize(PlatformContext context)
        {
            // Features initialize while the rig is still deactivated, so capture and ghost
            // live under an inactive transform: both lookups must include inactive objects.
            var capture = context.Root.GetComponentInChildren<CaptureReplaySession>(true);
            var ghost = context.Root.GetComponentInChildren<GhostPresentation>(true);
            if (capture == null || ghost == null) throw new InvalidOperationException("Capture feature must initialize before guide feature.");
            Controller = GuideInstaller.Install(context.Root.transform, capture, ghost);
        }
    }
}
