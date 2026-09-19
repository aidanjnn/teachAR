using System;
using System.Collections.Generic;
using Trail.Runtime.Network;
using UnityEngine;

namespace Trail.Runtime.Platform
{
    public sealed class PlatformContext
    {
        public GameObject Root { get; }
        public Transform TrackingSpace { get; }
        public Camera HeadCamera { get; }
        public NativeApiConnection Connection { get; }
        public PlatformContext(GameObject root, Transform trackingSpace, Camera headCamera, NativeApiConnection connection)
        { Root = root; TrackingSpace = trackingSpace; HeadCamera = headCamera; Connection = connection; }
    }
    public interface IPlatformFeature
    {
        int Order { get; }
        void Initialize(PlatformContext context);
    }
    /// <summary>Feature assemblies register concrete installers before scene load, without runtime reflection.</summary>
    public static class PlatformFeatures
    {
        private static readonly SortedDictionary<string, Action<GameObject>> factories = new SortedDictionary<string, Action<GameObject>>(StringComparer.Ordinal);
        [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.SubsystemRegistration)]
        private static void Reset() => factories.Clear();
        public static void Register(string id, Action<GameObject> install)
        {
            if (string.IsNullOrWhiteSpace(id) || install == null) throw new ArgumentException("Invalid feature registration");
            factories.Add(id, install);
        }
        internal static void Install(GameObject root) { foreach (var install in factories.Values) install(root); }
    }
}
