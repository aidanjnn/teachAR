using System;
using Meta.XR;
using Trail.Runtime.Guide;
using Trail.Runtime.Platform;
using UnityEngine;

namespace Trail.Runtime.Scene
{
    public sealed class ScenePlatformFeature : MonoBehaviour, IPlatformFeature
    {
        public int Order => 30;
        [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.BeforeSceneLoad)]
        private static void Register() => PlatformFeatures.Register("scene-inspection", root => root.AddComponent<ScenePlatformFeature>());
        public void Initialize(PlatformContext context)
        {
            var guide = context.Root.GetComponentInChildren<GuideController>(true);
            if (guide == null) throw new InvalidOperationException("Inspection requires guide feature");
            var cameraRoot = new GameObject("On-demand source camera"); cameraRoot.transform.SetParent(context.TrackingSpace, false);
            cameraRoot.SetActive(false);
            var camera = cameraRoot.AddComponent<PassthroughCameraAccess>(); camera.enabled = false;
            camera.CameraPosition = PassthroughCameraAccess.CameraPositionType.Left;
            var source = cameraRoot.AddComponent<SceneCaptureController>(); source.CameraAccess = camera;
            var inspection = cameraRoot.AddComponent<SceneInspectionController>();
            inspection.CameraSource = source; inspection.Guide = guide; inspection.Connection = context.Connection; inspection.Bind();
            cameraRoot.SetActive(true);
            var panel = new GameObject("Inspection controls"); panel.transform.SetParent(context.TrackingSpace, false);
            panel.transform.localPosition = new Vector3(-.45f, 1.15f, .6f);
            var controls = panel.AddComponent<InspectionControlPanel>(); controls.Inspection = inspection;
        }
    }
}
