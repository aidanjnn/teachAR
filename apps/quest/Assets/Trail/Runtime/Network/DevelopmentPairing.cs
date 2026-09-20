using System;
using System.IO;
using Trail.Runtime.Platform;
using UnityEngine;

namespace Trail.Runtime.Network
{
    /// <summary>
    /// Development-only USB pairing handoff. A tethered test should never require typing an
    /// eight-digit code by head gaze, so the host pushes the short-lived code into this app's
    /// private directory and the app consumes it once at startup.
    ///
    /// This is deliberately narrow. It registers only in a development player, so it is absent
    /// from a release build; it never ships a credential inside the APK, because the code is
    /// pushed at test time and is single-use and short-lived; and the file is deleted as soon as
    /// it is read, whether or not pairing succeeded, so the code cannot linger on device storage.
    /// The code is never written to a log or to Status.
    /// </summary>
    public sealed class DevelopmentPairing : MonoBehaviour, IPlatformFeature
    {
        public const string FileName = "trail-dev-pairing.json";
        // Before capture, guide, scene and storage, so a paired role is available as they initialize.
        public int Order => 5;
        public string Status { get; private set; } = "No development pairing handoff.";

        [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.BeforeSceneLoad)]
        private static void Register()
        {
            if (!Debug.isDebugBuild) return;
            PlatformFeatures.Register("development-pairing", root => root.AddComponent<DevelopmentPairing>());
        }

        public void Initialize(PlatformContext context)
        {
            if (!Debug.isDebugBuild || context == null || context.Connection == null) return;
            var path = Path.Combine(Application.persistentDataPath, FileName);
            string origin = null, code = null;
            try
            {
                if (!File.Exists(path)) return;
                // A handoff is a few dozen bytes. Anything larger is not one.
                if (new FileInfo(path).Length > 4096) { Status = "Development pairing handoff too large; ignored."; return; }
                var handoff = JsonUtility.FromJson<Handoff>(File.ReadAllText(path));
                if (handoff != null) { origin = handoff.origin; code = handoff.code; }
            }
            catch (Exception) { Status = "Development pairing handoff unreadable."; }
            finally { try { File.Delete(path); } catch (Exception) { } }

            if (string.IsNullOrEmpty(origin) || string.IsNullOrEmpty(code))
            { Status = "Development pairing handoff incomplete."; return; }
            try
            {
                // Loopback cleartext is permitted only on this explicitly scoped development path.
                context.Connection.Configure(origin, true);
                context.Connection.Pair(code);
                Status = "Development pairing requested from the USB handoff.";
            }
            catch (ArgumentException) { Status = "Development pairing handoff refused by the connection policy."; }
        }

        [Serializable] private sealed class Handoff { public string origin; public string code; }
    }
}
