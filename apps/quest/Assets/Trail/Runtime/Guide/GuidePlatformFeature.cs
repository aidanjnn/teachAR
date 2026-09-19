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
            var capture = context.Root.GetComponentInChildren<CaptureReplaySession>();
            var ghost = context.Root.GetComponentInChildren<GhostPresentation>();
            if (capture == null || ghost == null) throw new InvalidOperationException("Capture feature must initialize before guide feature.");
            Controller = GuideInstaller.Install(context.Root.transform, capture, ghost);
        }
    }
}
