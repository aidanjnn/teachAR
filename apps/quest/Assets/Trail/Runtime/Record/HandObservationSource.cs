using System;
using System.Diagnostics;
using Trail.Motion;
using UnityEngine;

namespace Trail.Runtime.Record
{
    public static class MotionClock
    {
        public static double NowMs => Stopwatch.GetTimestamp() * (1000.0 / Stopwatch.Frequency);
    }

    // Explicit adapter boundary. No synthetic fallback is installed when the native source is absent.
    public abstract class HandObservationSource : MonoBehaviour
    {
        public Transform TrackingSpace;
        public string TrackingSessionId { get; } = Guid.NewGuid().ToString("N");
        public virtual string ProviderId => "injected-source";
        public virtual string SdkVersion => "unavailable";
        public virtual string AdapterVersion => "unavailable";
        public int OriginRevision { get; private set; }
        public abstract string SourceKind { get; }
        public abstract string Availability { get; }
        public event Action<ReferenceObservation> Observed;
        public event Action<string, int> OriginInvalidated;
        protected void Publish(ReferenceObservation observation) => Observed?.Invoke(observation);
        public void Invalidate(string reason)
        {
            OriginRevision = checked(OriginRevision + 1);
            OriginInvalidated?.Invoke(reason, OriginRevision);
        }
    }
}
