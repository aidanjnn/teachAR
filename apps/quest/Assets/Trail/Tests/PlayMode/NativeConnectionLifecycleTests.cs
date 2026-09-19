using System.Collections;
using NUnit.Framework;
using Trail.Runtime.Network;
using UnityEngine;
using UnityEngine.TestTools;
namespace Trail.Tests
{
    public sealed class NativeConnectionLifecycleTests
    {
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
