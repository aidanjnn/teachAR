using System.IO;
using System.IO.Compression;
using NUnit.Framework;
using Trail.Editor;
using Trail.Runtime.Platform;
using UnityEditor;
using UnityEditor.Build;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.SceneManagement;
using UnityEngine.XR.Hands.OpenXR;
using UnityEngine.XR.OpenXR;
using UnityEngine.XR.OpenXR.Features.Interactions;

namespace Trail.Tests.PlatformEditMode
{
    public sealed class NativeSetupTests
    {
        [Test]
        public void PackedApkDataLayoutIsAccepted()
        {
            WithApkDataEntries(path => Assert.DoesNotThrow(() => ProjectSetup.ValidateApkDataLayout(path)), "data.unity3d");
        }

        [Test]
        public void LooseApkDataLayoutIsAccepted()
        {
            WithApkDataEntries(path => Assert.DoesNotThrow(() => ProjectSetup.ValidateApkDataLayout(path)), "level0", "globalgamemanagers");
        }

        [TestCase("level0")]
        [TestCase("globalgamemanagers")]
        public void PackedApkWithAnyLooseStartupDataIsRejected(string looseEntry)
        {
            WithApkDataEntries(path => Assert.Throws<BuildFailedException>(() => ProjectSetup.ValidateApkDataLayout(path)), "data.unity3d", looseEntry);
        }

        [TestCase("")]
        [TestCase("level0")]
        [TestCase("globalgamemanagers")]
        public void MissingOrIncompleteApkDataLayoutIsRejected(string remainingEntry)
        {
            WithApkDataEntries(path => Assert.Throws<BuildFailedException>(() => ProjectSetup.ValidateApkDataLayout(path)),
                string.IsNullOrEmpty(remainingEntry) ? new string[0] : new[] { remainingEntry });
        }

        private static void WithApkDataEntries(System.Action<string> assertion, params string[] names)
        {
            var path = Path.GetTempFileName();
            try
            {
                using (var stream = File.Open(path, FileMode.Create))
                using (var archive = new ZipArchive(stream, ZipArchiveMode.Create))
                    foreach (var name in names)
                        using (var entry = archive.CreateEntry("assets/bin/Data/" + name).Open()) entry.WriteByte(1);
                assertion(path);
            }
            finally { File.Delete(path); }
        }

        [Test]
        public void CheckedInStartupSceneHasOnlyOneActiveBootstrap()
        {
            // Preview scenes do not replace or save the user's open scenes.
            var scene = EditorSceneManager.OpenPreviewScene("Assets/Trail/Scenes/Trail.unity");
            try { Assert.DoesNotThrow(() => ProjectSetup.ValidateStartupScene(scene)); }
            finally { EditorSceneManager.ClosePreviewScene(scene); }
        }

        [Test]
        public void StartupSceneWithoutBootstrapIsRejected()
        {
            var scene = EditorSceneManager.NewPreviewScene();
            try { Assert.Throws<BuildFailedException>(() => ProjectSetup.ValidateStartupScene(scene)); }
            finally { EditorSceneManager.ClosePreviewScene(scene); }
        }

        [Test]
        public void DuplicateBootstrapIsRejectedEvenWhenInactive()
        {
            var scene = EditorSceneManager.NewPreviewScene();
            try
            {
                AddBootstrap(scene);
                AddBootstrap(scene).gameObject.SetActive(false);
                Assert.Throws<BuildFailedException>(() => ProjectSetup.ValidateStartupScene(scene));
            }
            finally { EditorSceneManager.ClosePreviewScene(scene); }
        }

        [TestCase("object")]
        [TestCase("component")]
        [TestCase("parent")]
        public void InactiveBootstrapIsRejected(string inactivePart)
        {
            var scene = EditorSceneManager.NewPreviewScene();
            try
            {
                var bootstrap = AddBootstrap(scene);
                if (inactivePart == "object") bootstrap.gameObject.SetActive(false);
                else if (inactivePart == "component") bootstrap.enabled = false;
                else
                {
                    var parent = AddObject(scene, "inactive ancestor");
                    bootstrap.transform.SetParent(parent.transform, false);
                    parent.SetActive(false);
                }
                Assert.Throws<BuildFailedException>(() => ProjectSetup.ValidateStartupScene(scene));
            }
            finally { EditorSceneManager.ClosePreviewScene(scene); }
        }

        [TestCase(true)]
        [TestCase(false)]
        public void PreplacedCameraIsRejectedEvenWhenInactive(bool active)
        {
            var scene = EditorSceneManager.NewPreviewScene();
            try
            {
                var bootstrap = AddBootstrap(scene);
                var camera = AddObject(scene, "preplaced camera");
                camera.transform.SetParent(bootstrap.transform, false);
                camera.AddComponent<Camera>(); camera.SetActive(active);
                Assert.Throws<BuildFailedException>(() => ProjectSetup.ValidateStartupScene(scene));
            }
            finally { EditorSceneManager.ClosePreviewScene(scene); }
        }

        private static NativeBootstrap AddBootstrap(Scene scene) => AddObject(scene, "bootstrap fixture").AddComponent<NativeBootstrap>();

        private static GameObject AddObject(Scene scene, string name)
        {
            // Unity's preview helpers use hidden transient objects so the active editor scene stays clean.
            var root = EditorUtility.CreateGameObjectWithHideFlags(name, HideFlags.HideAndDontSave);
            SceneManager.MoveGameObjectToScene(root, scene);
            return root;
        }

        [Test]
        public void AndroidEnablesConcreteJointSubsystemAndPassesBuildPreflight()
        {
            var settings = OpenXRSettings.GetSettingsForBuildTargetGroup(BuildTargetGroup.Android);
            Assert.IsNotNull(settings);
            var hands = settings.GetFeature<HandTracking>();
            Assert.IsNotNull(hands);
            Assert.IsTrue(hands.enabled, "XR Hands joint subsystem must be enabled by concrete type");
            Assert.DoesNotThrow(ProjectSetup.ValidateAndroidConfiguration);
        }

        [Test]
        public void MicrosoftProfileCannotSubstituteForDisabledJointSubsystem()
        {
            var settings = OpenXRSettings.GetSettingsForBuildTargetGroup(BuildTargetGroup.Android);
            var hands = settings.GetFeature<HandTracking>();
            var microsoft = settings.GetFeature<MicrosoftHandInteraction>();
            Assert.IsNotNull(hands); Assert.IsNotNull(microsoft);
            var handEnabled = hands.enabled; var microsoftEnabled = microsoft.enabled;
            try
            {
                hands.enabled = false; microsoft.enabled = true;
                Assert.Throws<BuildFailedException>(ProjectSetup.ValidateAndroidConfiguration);
            }
            finally { hands.enabled = handEnabled; microsoft.enabled = microsoftEnabled; }
        }
    }
}
