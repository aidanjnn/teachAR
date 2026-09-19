using System.Collections;
using System.Linq;
using System;
using System.Net;
using System.Net.Sockets;
using System.Text;
using System.Threading.Tasks;
using Object = UnityEngine.Object;
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
