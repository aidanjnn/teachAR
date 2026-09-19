using Trail.Runtime.Platform;
using UnityEngine;

namespace Trail.Presentation
{
    public sealed class CapturePlatformFeature : MonoBehaviour, IPlatformFeature
    {
        public int Order => 10;
        [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.BeforeSceneLoad)]
        private static void Register() => PlatformFeatures.Register("capture-calibration-replay", root => root.AddComponent<CapturePlatformFeature>());
        public void Initialize(PlatformContext context) => CaptureFlowInstaller.Install(context.TrackingSpace);
    }
}
