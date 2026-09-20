using System.Collections;
using System.Linq;
using System;
using System.Net;
using System.Net.Sockets;
using System.Text;
using System.Threading.Tasks;
using Object = UnityEngine.Object;
using Trail.Runtime.Platform;
using Trail.Runtime.Shell;
using UnityEngine.UI;
using NUnit.Framework;
using Trail.Runtime.Network;
using UnityEngine;
using UnityEngine.TestTools;
namespace Trail.Tests
{
    public sealed class NativeConnectionLifecycleTests
    {
        private static async Task Respond(HttpListenerContext incoming, int status, string json)
        {
            incoming.Response.StatusCode = status;
            var body = Encoding.UTF8.GetBytes(json);
            incoming.Response.ContentType = "application/json"; incoming.Response.ContentLength64 = body.Length;
            try { await incoming.Response.OutputStream.WriteAsync(body, 0, body.Length); }
            catch (System.IO.IOException) { }
            finally { incoming.Response.Close(); }
        }
        [UnityTest]
        public IEnumerator HidingPairingKeepsTheRigAndApplicationActive()
        {
            var root = new GameObject("pairing-root-visibility-test");
            try
            {
                var rig = new GameObject("rig"); rig.transform.SetParent(root.transform);
                var camera = rig.AddComponent<Camera>();
                var connection = root.AddComponent<NativeApiConnection>();
                var invalidations = 0; connection.SessionInvalidated += () => invalidations++;
                var panel = root.AddComponent<NativePairingPanel>();
                panel.Initialize(new PlatformContext(root, rig.transform, camera, connection));
                // Match bootstrap composition: the rig is inactive when the shell hides diagnostics.
                rig.SetActive(false);
                panel.SetPanelVisible(false);
                rig.SetActive(true);
                yield return null;
                Assert.IsTrue(root.activeInHierarchy);
                Assert.IsTrue(camera.isActiveAndEnabled);
                Assert.AreEqual(0, invalidations, "hiding the canvas must not disconnect the application");
                Assert.IsFalse(panel.enabled, "hidden keys must not accept dwell input");
                Assert.IsFalse(rig.transform.Find("Native pairing setup").gameObject.activeInHierarchy);
                panel.SetPanelVisible(true);
                Assert.IsTrue(panel.enabled);
                Assert.IsTrue(rig.transform.Find("Native pairing setup").gameObject.activeInHierarchy);
            }
            finally { Object.Destroy(root); }
        }

        [UnityTest]
        public IEnumerator UnauthorizedResponseSuppressesAllConcurrentCallbacks()
        {
            var reservation = new TcpListener(IPAddress.Loopback, 0); reservation.Start();
            var port = ((IPEndPoint)reservation.LocalEndpoint).Port; reservation.Stop();
            var listener = new HttpListener(); listener.Prefixes.Add("http://127.0.0.1:" + port + "/"); listener.Start();
            var server = Task.Run(async () =>
            {
                try
                {
                    var pairing = await listener.GetContextAsync();
                    var json = "{\"token\":\"" + new string('a', 43) + "\",\"role\":\"learner\",\"sessionId\":\"" + Guid.NewGuid() + "\",\"client\":\"native\",\"expiresAt\":" + (DateTimeOffset.UtcNow.ToUnixTimeMilliseconds() + 3600000) + "}";
                    await Respond(pairing, 200, json);
                    // Hold both requests before responding, independent of connection arrival order.
                    var first = await listener.GetContextAsync();
                    var second = await listener.GetContextAsync();
                    var expire = first.Request.Url.AbsolutePath.EndsWith("expire") ? first : second;
                    var late = expire == first ? second : first;
                    await Respond(expire, 401, "{}");
                    await Task.Delay(250);
                    await Respond(late, 200, "{}");
                }
                catch (HttpListenerException) { }
                catch (ObjectDisposedException) { }
            });
            var root = new GameObject("native-auth-race-test");
            var connection = root.AddComponent<NativeApiConnection>();
            try
            {
                connection.Configure("http://127.0.0.1:" + port, true); connection.Pair("12345678");
                var deadline = Time.realtimeSinceStartup + 10;
                while (connection.State == ConnectionState.Pairing && Time.realtimeSinceStartup < deadline) yield return null;
                Assert.AreEqual(ConnectionState.Ready, connection.State);
                var callbacks = 0; var invalidations = 0;
                connection.SessionInvalidated += () => invalidations++;
                connection.Request("GET", "/api/expire", null, (_, __) => callbacks++);
                connection.Request("GET", "/api/late", null, (_, __) => callbacks++);
                while (connection.State != ConnectionState.Expired && Time.realtimeSinceStartup < deadline) yield return null;
                yield return new WaitForSecondsRealtime(0.5f);
                Assert.AreEqual(ConnectionState.Expired, connection.State);
                Assert.AreEqual(0, callbacks); Assert.AreEqual(1, invalidations); Assert.IsNull(connection.SessionId);
            }
            finally { listener.Close(); Object.Destroy(root); }
            while (!server.IsCompleted) yield return null;
            Assert.IsFalse(server.IsFaulted);
        }
        [UnityTest]
        public IEnumerator ShellHidesPairingWithoutDisablingApplicationOrCamera()
        {
            var root = new GameObject("shell composition test");
            try
            {
                // Match bootstrap ownership and activation order without starting a native XR provider.
                var rig = new GameObject("inactive rig"); rig.transform.SetParent(root.transform, false); rig.SetActive(false);
                var tracking = new GameObject("tracking space"); tracking.transform.SetParent(rig.transform, false);
                var eye = new GameObject("head camera"); eye.transform.SetParent(tracking.transform, false);
                var camera = eye.AddComponent<Camera>();
                var connection = root.AddComponent<NativeApiConnection>();
                var context = new PlatformContext(root, tracking.transform, camera, connection);
                var pairing = root.AddComponent<NativePairingPanel>(); pairing.Initialize(context);
                var invalidations = 0; connection.SessionInvalidated += () => invalidations++;
                var shell = root.AddComponent<TutorialExperienceController>(); shell.Initialize(context);
                rig.SetActive(true);

                var canvas = tracking.transform.Find("Native pairing setup").gameObject;
                var shellPanel = tracking.transform.Find("Trail shell").gameObject;
                Assert.IsTrue(root.activeSelf, "Hiding diagnostics must not deactivate the application root");
                Assert.IsTrue(camera.isActiveAndEnabled, "Activating the rig must leave its camera active in the hierarchy");
                Assert.IsTrue(shell.isActiveAndEnabled);
                Assert.IsFalse(shellPanel.activeInHierarchy, "The shell waits for the first settled head pose");
                Assert.IsFalse(canvas.activeSelf, "Only the pairing canvas should start hidden");
                Assert.AreEqual(0, invalidations, "Hiding a panel must not invalidate the shared connection");
                yield return null;
                yield return new WaitForSecondsRealtime(.6f);
                Assert.IsTrue(root.activeInHierarchy);
                Assert.IsTrue(camera.isActiveAndEnabled);
                Assert.IsTrue(shellPanel.activeInHierarchy, "The shell must appear after head-pose initialization");
                Assert.AreEqual("Trail", shellPanel.transform.Find("Shell title").GetComponent<TextMesh>().text,
                    "The visible shell must continue updating after composition");

                pairing.SetPanelVisible(true);
                Assert.IsTrue(canvas.activeInHierarchy);
                pairing.SetPanelVisible(false);
                Assert.IsFalse(canvas.activeInHierarchy);
                Assert.IsTrue(root.activeInHierarchy);
                Assert.IsTrue(camera.isActiveAndEnabled);
                Assert.IsTrue(shellPanel.activeInHierarchy);
                Assert.AreEqual(0, invalidations);
            }
            finally { Object.Destroy(root); }
            yield return null;
        }
        [UnityTest]
        public IEnumerator HeadDirectedKeyboardEntersAndClearsRoleCode()
        {
            var root = new GameObject("pairing-ui-test");
            var cameraObject = new GameObject("pairing-test-camera");
            var camera = cameraObject.AddComponent<Camera>();
            var connection = root.AddComponent<NativeApiConnection>();
            var panel = root.AddComponent<NativePairingPanel>();
            try
            {
                panel.Initialize(new PlatformContext(root, root.transform, camera, connection));
                yield return new WaitForSecondsRealtime(1.1f);
                var canvas = root.transform.Find("Native pairing setup").gameObject;
                var keyboard = canvas.transform.Find("Pairing keyboard");
                var edit = keyboard.Find("Key Edit code");
                camera.transform.rotation = Quaternion.LookRotation(edit.position - camera.transform.position);
                yield return new WaitForSecondsRealtime(1.05f);
                var digit = keyboard.Find("Key 1");
                camera.transform.rotation = Quaternion.LookRotation(digit.position - camera.transform.position);
                yield return new WaitForSecondsRealtime(1.05f);
                Assert.IsTrue(root.GetComponentsInChildren<Text>().Any(text => text.text.Contains("Editing code: • (1/8)")));

                panel.SetPanelVisible(false);
                Assert.IsTrue(root.activeInHierarchy, "Hiding the keyboard must preserve its application's lifecycle");
                Assert.IsFalse(canvas.activeInHierarchy);
                Assert.IsTrue(canvas.GetComponentsInChildren<Text>(true).Any(text => text.text.Contains("Editing code:  (0/8)")),
                    "Hiding clears the entered code and pending dwell");
                // Keep aiming at the same digit long enough to activate it if hidden input were still live.
                yield return new WaitForSecondsRealtime(1.05f);
                Assert.IsTrue(canvas.GetComponentsInChildren<Text>(true).Any(text => text.text.Contains("Editing code:  (0/8)")),
                    "Hidden controls must not accept head-directed input");

                panel.SetPanelVisible(true);
                Assert.IsTrue(canvas.activeInHierarchy);
                yield return new WaitForSecondsRealtime(1.05f);
                Assert.IsTrue(canvas.GetComponentsInChildren<Text>().Any(text => text.text.Contains("Editing code: • (1/8)")),
                    "Showing the panel resets the old latch and allows a fresh dwell on the same key");
                panel.SendMessage("OnApplicationPause", true);
                Assert.IsTrue(root.GetComponentsInChildren<Text>().Any(text => text.text.Contains("Editing code:  (0/8)")));
                Assert.AreEqual(ConnectionState.Unpaired, connection.State);
            }
            finally { Object.Destroy(root); Object.Destroy(cameraObject); }
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
