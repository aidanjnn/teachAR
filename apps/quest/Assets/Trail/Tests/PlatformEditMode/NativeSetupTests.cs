using NUnit.Framework;
using Trail.Editor;
using UnityEditor;
using UnityEditor.Build;
using UnityEngine.XR.Hands.OpenXR;
using UnityEngine.XR.OpenXR;
using UnityEngine.XR.OpenXR.Features.Interactions;

namespace Trail.Tests.PlatformEditMode
{
    public sealed class NativeSetupTests
    {
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
