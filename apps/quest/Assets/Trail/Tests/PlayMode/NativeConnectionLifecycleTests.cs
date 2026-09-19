using System.Collections;
using System.Linq;
using Trail.Runtime.Platform;
using UnityEngine.UI;
using NUnit.Framework;
using Trail.Runtime.Network;
using UnityEngine;
using UnityEngine.TestTools;
namespace Trail.Tests
{
    public sealed class NativeConnectionLifecycleTests
    {
        [UnityTest]
        public IEnumerator HeadDirectedKeyboardEntersAndClearsRoleCode()
        {
            var root = new GameObject("pairing-ui-test");
            var cameraObject = new GameObject("pairing-test-camera");
            var camera = cameraObject.AddComponent<Camera>();
            var connection = root.AddComponent<NativeApiConnection>();
            var panel = root.AddComponent<NativePairingPanel>();
            panel.Initialize(new PlatformContext(root, root.transform, camera, connection));
            yield return new WaitForSecondsRealtime(1.1f);
            var keyboard = root.transform.Find("Native pairing setup/Pairing keyboard");
            var edit = keyboard.Find("Key Edit code");
            camera.transform.rotation = Quaternion.LookRotation(edit.position - camera.transform.position);
            yield return new WaitForSecondsRealtime(1.05f);
            var digit = keyboard.Find("Key 1");
            camera.transform.rotation = Quaternion.LookRotation(digit.position - camera.transform.position);
            yield return new WaitForSecondsRealtime(1.05f);
            Assert.IsTrue(root.GetComponentsInChildren<Text>().Any(text => text.text.Contains("Editing code: • (1/8)")));
            panel.SendMessage("OnApplicationPause", true);
            Assert.IsTrue(root.GetComponentsInChildren<Text>().Any(text => text.text.Contains("Editing code:  (0/8)")));
            Assert.AreEqual(ConnectionState.Unpaired, connection.State);
            Object.Destroy(root); Object.Destroy(cameraObject);
            yield return null;
        }
        [UnityTest]
        public IEnumerator DisableAndPauseInvalidateConnectionWithoutNetworkSuccess()
        {
            var root = new GameObject("connection-test");
            var connection = root.AddComponent<NativeApiConnection>();
            var invalidations = 0;
            connection.SessionInvalidated += () => invalidations++;
            connection.Pair("bad");
            Assert.AreEqual(ConnectionState.Unavailable, connection.State);
            connection.SendMessage("OnApplicationPause", true);
            Assert.AreEqual(ConnectionState.Unpaired, connection.State);
            Assert.IsNull(connection.SessionId);
            root.SetActive(false);
            Assert.GreaterOrEqual(invalidations, 3);
            Object.Destroy(root);
            yield return null;
        }
    }
}
