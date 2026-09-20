using System;
using System.Collections.Generic;
using System.Numerics;
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
    /// <summary>One opt-in image of the actual first admitted sample. A late view is never relabelled frame zero.</summary>
    public sealed class StartingLayoutReference
    {
        private double takeMs, sampleMs, invalidFrom = double.PositiveInfinity;
        private Vector3 left, right;
        private bool armed;
        private ExpertReferenceCandidate candidate;
        public void Clear() { armed = false; candidate = null; invalidFrom = double.PositiveInfinity; }
        public bool Arm(double takeTime, double deliverySampleMs, Vector3? leftPalm, Vector3? rightPalm)
        {
            Clear();
            if (!Finite(takeTime) || takeTime != 0 || !Finite(deliverySampleMs) || deliverySampleMs < 0 ||
                !Valid(leftPalm) || !Valid(rightPalm)) return false;
            takeMs = takeTime; sampleMs = deliverySampleMs; left = leftPalm.Value; right = rightPalm.Value; armed = true;
            return true;
        }
        public void Observe(double deliverySampleMs, Vector3? leftPalm, Vector3? rightPalm)
        {
            if (!armed || candidate != null || !Finite(deliverySampleMs) || deliverySampleMs < sampleMs) return;
            if (!Valid(leftPalm) || !Valid(rightPalm) || Vector3.Distance(left, leftPalm.Value) > .02f || Vector3.Distance(right, rightPalm.Value) > .02f)
                InvalidateAt(deliverySampleMs);
        }
        public void InvalidateAt(double deliveryTimeMs)
        { if (Finite(deliveryTimeMs)) invalidFrom = Math.Min(invalidFrom, deliveryTimeMs); }
        public bool Add(ExpertReferenceCandidate image)
        {
            if (!armed || candidate != null || image == null || image.Jpeg == null || image.Jpeg.Length == 0 || image.Jpeg.Length > 2 * 1024 * 1024 ||
                image.Width < 1 || image.Width > 1280 || image.Height < 1 || image.Height > 1280 || !Finite(image.DeliveredAtMs) ||
                image.DeliveredAtMs < sampleMs || image.DeliveredAtMs - sampleMs > 50 || image.DeliveredAtMs >= invalidFrom) return false;
            image.TakeMs = takeMs; image.SampleMonoMs = sampleMs; candidate = image; return true;
        }
        public ExpertReferenceCandidate Select(Recording recording, double trimStart, double trimEnd)
        {
            if (!Finite(trimStart) || !Finite(trimEnd) || trimStart < 0 || trimEnd <= trimStart || candidate == null || recording == null || recording.Frames == null || recording.Frames.Length == 0 ||
                takeMs < trimStart || takeMs >= trimEnd || Math.Abs(recording.Frames[0].TMs - (takeMs - trimStart)) > .001) return null;
            return candidate;
        }
        private static bool Finite(double value) => !double.IsNaN(value) && !double.IsInfinity(value);
        private static bool Valid(Vector3? point) => point.HasValue && Finite(point.Value.X) && Finite(point.Value.Y) && Finite(point.Value.Z);
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
