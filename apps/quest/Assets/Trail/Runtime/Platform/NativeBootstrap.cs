using System;
using System.Collections;
using System.Linq;
using Trail.Runtime.Network;
using UnityEngine;
using UnityEngine.XR.Management;

namespace Trail.Runtime.Platform
{
    /// <summary>Single provider/rig foundation. No locomotion or synthetic hand fallback.</summary>
    public sealed class NativeBootstrap : MonoBehaviour
    {
        public string Status { get; private set; } = "Starting OpenXR";
        public PlatformContext Context { get; private set; }
        private IEnumerator Start()
        {
            var deadline = Time.realtimeSinceStartup + 15;
            while ((XRGeneralSettings.Instance == null || XRGeneralSettings.Instance.Manager == null || !XRGeneralSettings.Instance.Manager.isInitializationComplete) && Time.realtimeSinceStartup < deadline) yield return null;
            var manager = XRGeneralSettings.Instance?.Manager;
            if (manager?.activeLoader == null || manager.activeLoader.GetType().FullName != "UnityEngine.XR.OpenXR.OpenXRLoader")
            { Unavailable("OpenXR unavailable; run on the configured Quest Android build"); yield break; }
            if (FindObjectsByType<OVRCameraRig>(FindObjectsSortMode.None).Length != 0 || FindObjectsByType<OVRManager>(FindObjectsSortMode.None).Length != 0 || Camera.allCamerasCount != 0)
            { Unavailable("Duplicate XR rig or camera detected"); yield break; }
            var rigRoot = new GameObject("Trail OpenXR Rig");
            rigRoot.transform.SetParent(transform, false);
            rigRoot.SetActive(false);
            var rig = rigRoot.AddComponent<OVRCameraRig>();
            rig.EnsureGameObjectIntegrity();
            var ovr = rigRoot.GetComponent<OVRManager>() ?? rigRoot.AddComponent<OVRManager>();
            ovr.trackingOriginType = OVRManager.TrackingOrigin.Stage;
            ovr.isInsightPassthroughEnabled = true;
            ovr.usePositionTracking = true;
            ovr.AllowRecenter = false;
            rigRoot.AddComponent<OVRPassthroughLayer>().overlayType = OVROverlay.OverlayType.Underlay;
            foreach (var camera in rigRoot.GetComponentsInChildren<Camera>(true))
            { camera.clearFlags = CameraClearFlags.SolidColor; camera.backgroundColor = Color.clear; camera.nearClipPlane = 0.05f; }
            var connection = gameObject.AddComponent<NativeApiConnection>();
            Context = new PlatformContext(gameObject, rig.trackingSpace, rig.centerEyeAnchor.GetComponent<Camera>(), connection);
            var stage = "pairing panel";
            try
            {
                gameObject.AddComponent<NativePairingPanel>().Initialize(Context);
                stage = "feature registration";
                PlatformFeatures.Install(gameObject);
                foreach (var feature in GetComponentsInChildren<MonoBehaviour>(true).OfType<IPlatformFeature>().OrderBy(value => value.Order))
                {
                    // Record which feature is running so a device-only failure can be identified.
                    // Type names only: an exception message may carry a token or payload.
                    stage = feature.GetType().Name;
                    feature.Initialize(Context);
                }
                rigRoot.SetActive(true);
                Status = "OpenXR initialized; pair and calibrate before use";
            }
            catch (Exception failure)
            {
                // Do not print feature exceptions: networking callbacks may carry sensitive payloads.
                connection.Disconnect(); rigRoot.SetActive(false);
                Unavailable("Feature composition failed in " + stage + " (" + failure.GetType().Name + "); inspect setup and feature tests");
            }
        }
        private void Unavailable(string reason) { Status = reason; Debug.LogError(reason); }
    }
}
