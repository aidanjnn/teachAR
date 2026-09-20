using System;
using Trail.Runtime.Coach;
using Trail.Runtime.Platform;
using UnityEngine;

namespace Trail.Runtime.Scene
{
    public sealed class SpokenInspectionFeature : MonoBehaviour, IPlatformFeature
    {
        public int Order => 100;
        [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.BeforeSceneLoad)]
        private static void Register() => PlatformFeatures.Register("spoken-inspection", root => root.AddComponent<SpokenInspectionFeature>());
        public void Initialize(PlatformContext context)
        {
            var coach = context.Root.GetComponentInChildren<NativeVoiceCoach>(true);
            var inspection = context.Root.GetComponentInChildren<SceneInspectionController>(true);
            if (coach == null || inspection == null) throw new InvalidOperationException("Spoken inspection requires coach and camera features.");
            var bridge = inspection.gameObject.AddComponent<SpokenSceneInspection>();
            bridge.Coach = coach; bridge.Inspection = inspection; bridge.Bind();
        }
    }
}
