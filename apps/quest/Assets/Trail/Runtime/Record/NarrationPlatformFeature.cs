using Trail.Runtime.Platform;
using UnityEngine;

namespace Trail.Runtime.Record
{
    public sealed class NarrationPlatformFeature : MonoBehaviour, IPlatformFeature
    {
        public int Order => 15;
        [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.BeforeSceneLoad)]
        private static void Register() => PlatformFeatures.Register("native-narration", root => root.AddComponent<NarrationPlatformFeature>());
        public void Initialize(PlatformContext context)
        {
            var capture = context.Root.GetComponentInChildren<CaptureReplaySession>(true);
            if (capture == null) throw new System.InvalidOperationException("Narration requires capture first.");
            var narration = capture.gameObject.AddComponent<UnityNarrationCapture>(); narration.Clock = () => capture.Clock(); capture.Narration = narration;
        }
    }
}
