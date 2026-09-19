using UnityEditor;
using UnityEditor.Build;
using UnityEngine;

namespace Trail.Editor
{
    public static class ProjectSetup
    {
        [MenuItem("Trail/Apply Android scaffold settings")]
        public static void Apply()
        {
            EditorSettings.serializationMode = SerializationMode.ForceText;
            PlayerSettings.companyName = "Trail";
            PlayerSettings.productName = "Trail";
            PlayerSettings.SetApplicationIdentifier(NamedBuildTarget.Android, "com.trail.guide");
            PlayerSettings.SetScriptingBackend(NamedBuildTarget.Android, ScriptingImplementation.IL2CPP);
            PlayerSettings.Android.targetArchitectures = AndroidArchitecture.ARM64;
            PlayerSettings.Android.minSdkVersion = AndroidSdkVersions.AndroidApiLevel32;
            PlayerSettings.colorSpace = ColorSpace.Linear;
            AssetDatabase.SaveAssets();
            Debug.Log("Android scaffold settings applied. Configure Android OpenXR, Meta features, URP and the rig before building. No device validation has run.");
        }
    }
}
