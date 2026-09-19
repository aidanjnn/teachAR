using System;
using System.Collections.Generic;
using System.Numerics;
using Trail.Contracts;

namespace Trail.Motion
{
    public sealed class ReferenceObservation
    {
        public double TimestampMs { get; }
        public long Sequence { get; }
        public int OriginRevision { get; }
        public string Source { get; }
        public HandSample Left { get; }
        public HandSample Right { get; }
        public ReferenceObservation(double timestampMs, long sequence, int originRevision, string source, HandSample left, HandSample right)
        { TimestampMs = timestampMs; Sequence = sequence; OriginRevision = originRevision; Source = source; Left = left; Right = right; }
    }

    public static class MotionSamples
    {
        public static HandSample Missing(string reason = "unavailable") => new HandSample { Status = "missing", Reason = reason };
        public static HandSample Transform(HandSample hand, RigidRegistration transform)
        {
            if (hand == null || hand.Status != "valid" || hand.Joints == null || hand.Joints.Count != 25)
                return Missing(hand?.Reason ?? "unavailable");
            var joints = new Dictionary<string, CanonicalPose>();
            foreach (var name in JointNames.Canonical)
            {
                if (!hand.Joints.TryGetValue(name, out var pose)) return Missing();
                joints.Add(name, transform.Apply(pose));
            }
            return new HandSample { Status = "valid", Joints = joints };
        }
        public static MotionFrame ToWorkspace(ReferenceObservation observation, RigidRegistration referenceFromWorkspace)
        {
            var inverse = referenceFromWorkspace.Inverse();
            return new MotionFrame { TMs = observation.TimestampMs, Hands = new HandSamples {
                Left = Transform(observation.Left, inverse), Right = Transform(observation.Right, inverse) }, Head = null };
        }
    }

    // No I/O, timers, Unity dependencies, or calibration persistence. The caller owns the clock.
    public sealed class MotionCapture
    {
        private readonly List<MotionFrame> frames = new List<MotionFrame>();
        private readonly double startedMs, durationMs;
        private readonly int revision;
        private readonly RigidRegistration registration;
        private long lastSequence = -1;
        private double lastObservationMs = -1, lastFrameMs = double.NegativeInfinity;
        private readonly string source;
        public bool IsFinished { get; private set; }
        public int FrameCount => frames.Count;
        public MotionCapture(double nowMs, double durationMs, int originRevision, RigidRegistration registration, string source)
        {
            if (double.IsNaN(nowMs) || double.IsInfinity(nowMs) || nowMs < 0 ||
                double.IsNaN(durationMs) || double.IsInfinity(durationMs) || durationMs <= 0 || durationMs > 120000 ||
                (source != "live" && source != "synthetic-fixture" && source != "recorded-fixture")) throw new ArgumentException("Invalid recording bounds/source.");
            startedMs = nowMs; this.durationMs = durationMs; revision = originRevision; this.registration = registration; this.source = source;
        }
        public void Tick(double nowMs) { if (nowMs >= startedMs + durationMs) IsFinished = true; }
        public bool Append(ReferenceObservation observation)
        {
            if (IsFinished) return false;
            if (observation.OriginRevision != revision || observation.Source != source)
                throw new InvalidOperationException("Capture invalidated by origin/source change.");
            var elapsed = observation.TimestampMs - startedMs;
            if (double.IsNaN(elapsed) || double.IsInfinity(elapsed) || elapsed < 0 ||
                observation.Sequence <= lastSequence || observation.TimestampMs <= lastObservationMs) return false;
            lastSequence = observation.Sequence; lastObservationMs = observation.TimestampMs;
            if (elapsed > durationMs || frames.Count >= 3600) { IsFinished = true; return false; }
            // Never fabricate samples to fill a stall. Actual callback timestamps survive downsampling.
            if (elapsed - lastFrameMs < 1000.0 / 30.0) return false;
            var frame = MotionSamples.ToWorkspace(observation, registration);
            frame.TMs = elapsed; frames.Add(frame); lastFrameMs = elapsed;
            if (frames.Count == 3600 || elapsed >= durationMs) IsFinished = true;
            return true;
        }
        public Recording Finish(string id, WorkspaceDefinition workspace, double nowMs)
        {
            if (double.IsNaN(nowMs) || double.IsInfinity(nowMs) || nowMs < startedMs) throw new ArgumentException("Invalid completion clock.");
            IsFinished = true;
            if (frames.Count == 0) throw new InvalidOperationException("No fresh frames were captured.");
            var names = new string[JointNames.Canonical.Count];
            for (var i = 0; i < names.Length; i++) names[i] = JointNames.Canonical[i];
            var recording = new Recording { SchemaVersion = 1, Id = id, CoordinateFrame = "workspace", Workspace = workspace,
                JointOrder = names, NominalSampleHz = 30, DurationMs = Math.Max(lastFrameMs, Math.Min(durationMs, nowMs - startedMs)),
                Frames = frames.ToArray(), Markers = Array.Empty<StepMarker>(), Audio = null, Source = source };
            // Validation and deep copy at the save boundary; callers cannot mutate the live capture.
            return ContractJson.ParseRecording(ContractJson.SerializeRecording(recording));
        }
    }

    public sealed class MotionReplay
    {
        private readonly Recording recording;
        public double DurationMs => recording.DurationMs;
        public string Source => recording.Source;
        public MotionReplay(Recording recording)
        { this.recording = ContractJson.ParseRecording(ContractJson.SerializeRecording(recording)); }
        public MotionFrame Sample(double tMs)
        {
            var missing = new MotionFrame { TMs = tMs, Hands = new HandSamples { Left = MotionSamples.Missing(), Right = MotionSamples.Missing() } };
            if (double.IsNaN(tMs) || double.IsInfinity(tMs) || tMs < 0 || tMs > recording.DurationMs) return missing;
            var frames = recording.Frames;
            var lo = 0; var hi = frames.Length - 1; var index = -1;
            while (lo <= hi) { var mid = (lo + hi) / 2; if (frames[mid].TMs <= tMs) { index = mid; lo = mid + 1; } else hi = mid - 1; }
            if (index < 0 || tMs - frames[index].TMs > 100) return missing;
            var a = frames[index];
            if (index == frames.Length - 1 || tMs == a.TMs)
                return new MotionFrame { TMs = tMs, Hands = new HandSamples { Left = Copy(a.Hands.Left), Right = Copy(a.Hands.Right) } };
            var b = frames[index + 1];
            if (b.TMs - a.TMs > 100) return missing;
            var alpha = (float)((tMs - a.TMs) / (b.TMs - a.TMs));
            return new MotionFrame { TMs = tMs, Hands = new HandSamples {
                Left = Blend(a.Hands.Left, b.Hands.Left, alpha), Right = Blend(a.Hands.Right, b.Hands.Right, alpha) } };
        }
        private static HandSample Copy(HandSample hand) => MotionSamples.Transform(hand, new RigidRegistration(Vector3.Zero, Quaternion.Identity));
        private static HandSample Blend(HandSample a, HandSample b, float alpha)
        {
            if (a.Status != "valid" || b.Status != "valid") return MotionSamples.Missing();
            var joints = new Dictionary<string, CanonicalPose>();
            foreach (var name in JointNames.Canonical)
                joints[name] = new CanonicalPose(Vector3.Lerp(a.Joints[name].PositionM, b.Joints[name].PositionM, alpha),
                    Quaternion.Normalize(Quaternion.Slerp(a.Joints[name].OrientationXyzw, b.Joints[name].OrientationXyzw, alpha)));
            return new HandSample { Status = "valid", Joints = joints };
        }
    }
}
