using System;
using System.IO;
using System.Linq;
using UnityEditor;
using UnityEditor.Build;
using UnityEditor.Build.Reporting;
using UnityEditor.XR.Management;
using UnityEditor.XR.Management.Metadata;
using UnityEditor.XR.OpenXR.Features;
using UnityEngine;
using UnityEngine.Rendering;
using UnityEngine.Rendering.Universal;
using UnityEngine.XR.Management;
using UnityEngine.XR.OpenXR;

namespace Trail.Editor
{
    public static class ProjectSetup
    {
        private const string ScenePath = "Assets/Trail/Scenes/Trail.unity";
        [MenuItem("Trail/Configure Quest Android project")]
        public static void Apply()
        {
            if (EditorUserBuildSettings.activeBuildTarget != BuildTarget.Android)
                throw new BuildFailedException("Open Unity with -buildTarget Android before setup; target changes need a domain reload.");
            EditorSettings.serializationMode = SerializationMode.ForceText;
            PlayerSettings.companyName = "Trail";
            PlayerSettings.productName = "Trail";
            PlayerSettings.SetApplicationIdentifier(NamedBuildTarget.Android, "com.trail.guide");
            PlayerSettings.bundleVersion = "0.1.0";
            PlayerSettings.Android.bundleVersionCode = PositiveInteger("TRAIL_ANDROID_VERSION_CODE", 1);
            PlayerSettings.SetScriptingBackend(NamedBuildTarget.Android, ScriptingImplementation.IL2CPP);
            PlayerSettings.Android.targetArchitectures = AndroidArchitecture.ARM64;
            PlayerSettings.Android.minSdkVersion = AndroidSdkVersions.AndroidApiLevel32;
            PlayerSettings.Android.targetSdkVersion = AndroidSdkVersions.AndroidApiLevelAuto;
            PlayerSettings.Android.forceInternetPermission = true;
            PlayerSettings.insecureHttpOption = InsecureHttpOption.DevelopmentOnly;
            PlayerSettings.colorSpace = ColorSpace.Linear;
            PlayerSettings.SetUseDefaultGraphicsAPIs(BuildTarget.Android, false);
            PlayerSettings.SetGraphicsAPIs(BuildTarget.Android, new[] { GraphicsDeviceType.Vulkan });
            EditorUserBuildSettings.buildAppBundle = false;
            EditorBuildSettings.scenes = new[] { new EditorBuildSettingsScene(ScenePath, true) };
            ConfigureOpenXR();
            ConfigureRendering();
            var config = OVRProjectConfig.CachedProjectConfig;
            if (config == null) throw new BuildFailedException("Meta project configuration did not initialize");
            config.targetDeviceTypes = new System.Collections.Generic.List<OVRProjectConfig.DeviceType> { OVRProjectConfig.DeviceType.Quest3, OVRProjectConfig.DeviceType.Quest3S };
            config.handTrackingSupport = OVRProjectConfig.HandTrackingSupport.HandsOnly;
            config.insightPassthroughSupport = OVRProjectConfig.FeatureSupport.Required;
            OVRProjectConfig.CommitProjectConfig(config);
            AssetDatabase.SaveAssets();
            Debug.Log("Trail Android settings applied. Review generated assets and UPM lock; device readiness remains unverified.");
        }
        private static void ConfigureOpenXR()
        {
            if (!EditorBuildSettings.TryGetConfigObject<XRGeneralSettingsPerBuildTarget>(XRGeneralSettings.k_SettingsKey, out var settings))
            {
                settings = ScriptableObject.CreateInstance<XRGeneralSettingsPerBuildTarget>();
                if (!AssetDatabase.IsValidFolder("Assets/XR")) AssetDatabase.CreateFolder("Assets", "XR");
                AssetDatabase.CreateAsset(settings, "Assets/XR/TrailXRSettings.asset");
                EditorBuildSettings.AddConfigObject(XRGeneralSettings.k_SettingsKey, settings, true);
            }
            if (!settings.HasSettingsForBuildTarget(BuildTargetGroup.Android)) settings.CreateDefaultSettingsForBuildTarget(BuildTargetGroup.Android);
            if (!settings.HasManagerSettingsForBuildTarget(BuildTargetGroup.Android)) settings.CreateDefaultManagerSettingsForBuildTarget(BuildTargetGroup.Android);
            var general = settings.SettingsForBuildTarget(BuildTargetGroup.Android);
            general.InitManagerOnStart = true;
            var manager = general.Manager;
            if (manager.activeLoaders.Any(loader => loader.GetType().FullName != "UnityEngine.XR.OpenXR.OpenXRLoader"))
                throw new BuildFailedException("Remove competing XR providers before applying Trail settings");
            if (!XRPackageMetadataStore.AssignLoader(manager, "UnityEngine.XR.OpenXR.OpenXRLoader", BuildTargetGroup.Android))
                throw new BuildFailedException("OpenXR loader assignment failed");
            FeatureHelpers.RefreshFeatures(BuildTargetGroup.Android);
            // IDs verified in the exact OpenXR 1.18 / Meta Core 205 / XR Hands 1.7.2 package sources.
            foreach (var id in new[] { "com.meta.openxr.feature.metaxr", "com.unity.openxr.feature.metaquest", "com.unity.openxr.feature.input.handtracking" })
            {
                var feature = FeatureHelpers.GetFeatureWithIdForBuildTarget(BuildTargetGroup.Android, id);
                if (feature == null) throw new BuildFailedException("Required OpenXR feature is unavailable: " + id);
                feature.enabled = true; EditorUtility.SetDirty(feature);
            }
            var openxr = OpenXRSettings.GetSettingsForBuildTargetGroup(BuildTargetGroup.Android);
            if (openxr == null) throw new BuildFailedException("OpenXR settings missing");
            openxr.renderMode = OpenXRSettings.RenderMode.SinglePassInstanced;
            EditorUtility.SetDirty(openxr); EditorUtility.SetDirty(manager); EditorUtility.SetDirty(general); EditorUtility.SetDirty(settings);
        }
        private static void ConfigureRendering()
        {
            const string folder = "Assets/Trail/Rendering";
            if (!AssetDatabase.IsValidFolder(folder)) AssetDatabase.CreateFolder("Assets/Trail", "Rendering");
            var asset = AssetDatabase.LoadAssetAtPath<UniversalRenderPipelineAsset>(folder + "/TrailPipeline.asset");
            if (asset == null)
            {
                var renderer = ScriptableObject.CreateInstance<UniversalRendererData>();
                AssetDatabase.CreateAsset(renderer, folder + "/TrailRenderer.asset");
                asset = UniversalRenderPipelineAsset.Create(renderer);
                asset.supportsHDR = false; asset.msaaSampleCount = 4;
                AssetDatabase.CreateAsset(asset, folder + "/TrailPipeline.asset");
            }
            GraphicsSettings.defaultRenderPipeline = asset;
            QualitySettings.renderPipeline = asset;
        }
        private static int PositiveInteger(string name, int fallback)
        {
            var raw = Environment.GetEnvironmentVariable(name);
            if (string.IsNullOrEmpty(raw)) return fallback;
            if (!int.TryParse(raw, out var value) || value < 1) throw new BuildFailedException("Invalid " + name);
            return value;
        }
        [MenuItem("Trail/Build Android ARM64 APK")]
        public static void BuildAndroid()
        {
            if (!BuildPipeline.IsBuildTargetSupported(BuildTargetGroup.Android, BuildTarget.Android))
                throw new BuildFailedException("Android Build Support/SDK/NDK/JDK is required");
            Apply();
            if (!File.Exists("Packages/packages-lock.json")) throw new BuildFailedException("Unity has not resolved and written packages-lock.json");
            var output = Environment.GetEnvironmentVariable("TRAIL_APK_PATH");
            if (string.IsNullOrWhiteSpace(output) || !Path.IsPathRooted(output) || !output.EndsWith(".apk", StringComparison.OrdinalIgnoreCase))
                throw new BuildFailedException("TRAIL_APK_PATH must be an absolute .apk path");
            Directory.CreateDirectory(Path.GetDirectoryName(output));
            var development = Environment.GetEnvironmentVariable("TRAIL_DEVELOPMENT_BUILD") == "1";
            var report = BuildPipeline.BuildPlayer(new BuildPlayerOptions {
                scenes = new[] { ScenePath }, locationPathName = output, target = BuildTarget.Android,
                options = development ? BuildOptions.Development : BuildOptions.None
            });
            if (report.summary.result != BuildResult.Succeeded || report.summary.totalErrors != 0 || !File.Exists(output))
                throw new BuildFailedException("Trail Android build failed; inspect Unity build report");
            File.WriteAllText(Environment.GetEnvironmentVariable("TRAIL_BUILD_REPORT_PATH") ?? output + ".json",
                JsonUtility.ToJson(new BuildEvidence { result = "Succeeded", editor = Application.unityVersion, platform = "Android", architecture = "ARM64", backend = "IL2CPP", development = development, bytes = new FileInfo(output).Length }));
        }
        [Serializable] private sealed class BuildEvidence { public string result; public string editor; public string platform; public string architecture; public string backend; public bool development; public long bytes; }
    }
}
