using System;
using System.Collections.Generic;
using Trail.Contracts;

namespace Trail.Runtime.Scene
{
    public sealed class ExpertReferenceCandidate
    {
        public double TakeMs, SampleMonoMs, DeliveredAtMs;
        public long SensorTimestampTicks, SourceFrameSequence;
        public string SourceSessionId, Sha256;
        public byte[] Jpeg;
        public int Width, Height;
    }
    /// <summary>Delivery-to-admitted-sample association, not calibrated camera sensor-clock synchronization.</summary>
    public sealed class ExpertReferenceSamples
    {
        private readonly List<(double take, double mono)> samples = new List<(double, double)>();
        private readonly List<ExpertReferenceCandidate> candidates = new List<ExpertReferenceCandidate>();
        public void Clear() { samples.Clear(); candidates.Clear(); }
        /// <summary>Map a Stopwatch-based hand sample into Unity's camera-delivery clock using
        /// a same-time clock pair. This preserves observation age; it does not calibrate the sensor clock.</summary>
        public static bool TryMapMotionTime(double observationMs, double motionNowMs, double deliveryNowMs, out double deliverySampleMs)
        {
            deliverySampleMs = 0;
            if (!Finite(observationMs) || !Finite(motionNowMs) || !Finite(deliveryNowMs) ||
                observationMs < 0 || motionNowMs < 0 || deliveryNowMs < 0) return false;
            var ageMs = motionNowMs - observationMs;
            if (ageMs < 0 || ageMs > 100 || deliveryNowMs < ageMs) return false;
            deliverySampleMs = deliveryNowMs - ageMs;
            return true;
        }
        public void Admit(double takeMs, double monoMs)
        {
            if (!Finite(takeMs) || !Finite(monoMs) || takeMs < 0 || monoMs < 0) return;
            if (samples.Count > 0 && (takeMs <= samples[samples.Count - 1].take || monoMs <= samples[samples.Count - 1].mono)) return;
            samples.Add((takeMs, monoMs));
            if (samples.Count > 90) samples.RemoveAt(0);
        }
        public bool Add(ExpertReferenceCandidate candidate)
        {
            if (candidate == null || candidate.Jpeg == null || candidate.Jpeg.Length == 0 || candidate.Jpeg.Length > 2 * 1024 * 1024 ||
                !Finite(candidate.DeliveredAtMs) || candidate.Width < 1 || candidate.Height < 1 || candidate.Width > 1280 || candidate.Height > 1280) return false;
            var best = -1; var distance = double.PositiveInfinity;
            for (var i = 0; i < samples.Count; i++)
            {
                var delta = Math.Abs(samples[i].mono - candidate.DeliveredAtMs);
                if (delta < distance) { best = i; distance = delta; }
            }
            if (best < 0 || distance > 50) return false;
            candidate.TakeMs = samples[best].take; candidate.SampleMonoMs = samples[best].mono;
            candidates.Add(candidate);
            if (candidates.Count > 4) candidates.RemoveAt(0);
            return true;
        }
        public ExpertReferenceCandidate Select(Recording recording, double trimStart, double trimEnd, out int frameIndex)
        {
            frameIndex = -1; ExpertReferenceCandidate selected = null; var best = double.PositiveInfinity;
            foreach (var candidate in candidates)
            {
                if (candidate.TakeMs < trimStart || candidate.TakeMs >= trimEnd) continue;
                var time = candidate.TakeMs - trimStart;
                var endpointDistance = Math.Abs(recording.DurationMs - time);
                if (endpointDistance > 250 || endpointDistance >= best) continue;
                for (var i = 0; i < recording.Frames.Length; i++)
                    if (Math.Abs(recording.Frames[i].TMs - time) < .001)
                    { selected = candidate; frameIndex = i; best = endpointDistance; break; }
            }
            return selected;
        }
        private static bool Finite(double value) => !double.IsNaN(value) && !double.IsInfinity(value);
    }
}
