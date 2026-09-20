using System;

namespace Trail.Runtime
{
    /// <summary>Shared process lease across Unity narration and Android voice capture.</summary>
    public static class MicrophoneLease
    {
        private static readonly object Gate = new object();
        private static object owner;
        public static bool TryAcquire(object candidate)
        {
            if (candidate == null) throw new ArgumentNullException(nameof(candidate));
            lock (Gate)
            {
                if (owner != null && !ReferenceEquals(owner, candidate)) return false;
                owner = candidate; return true;
            }
        }
        public static void Release(object candidate)
        {
            lock (Gate) { if (ReferenceEquals(owner, candidate)) owner = null; }
        }
    }
}
