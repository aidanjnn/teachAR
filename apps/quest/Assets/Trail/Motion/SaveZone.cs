using System;
using System.Collections.Generic;
using System.Numerics;
using Trail.Contracts;

namespace Trail.Motion
{
    // Tutorial-scoped resting palms in workspace metres, chosen once and reused by every take.
    // Never a reference-space pose and never a single frame: RecordingDirector requires a
    // deliberate two-hand hold before one of these exists.
    public sealed class SaveZone
    {
        public Vector3 LeftM { get; }
        public Vector3 RightM { get; }
        public SaveZone(Vector3 leftM, Vector3 rightM)
        {
            GuideValidation.Position(leftM); GuideValidation.Position(rightM);
            if (Outside(leftM) || Outside(rightM)) throw new ArgumentException("Save position must lie within 10 m of the workspace origin.");
            LeftM = leftM; RightM = rightM;
        }
        // Both hands must be home, so the farther hand decides. Zero is a real coordinate.
        public float DistanceM(Vector3 leftM, Vector3 rightM) =>
            Math.Max(Vector3.Distance(leftM, LeftM), Vector3.Distance(rightM, RightM));
        public bool SamePosition(SaveZone other) =>
            other != null && Vector3.Distance(LeftM, other.LeftM) <= .000001f && Vector3.Distance(RightM, other.RightM) <= .000001f;
        private static bool Outside(Vector3 p) => Math.Abs(p.X) > 10 || Math.Abs(p.Y) > 10 || Math.Abs(p.Z) > 10;
    }

    public static class HandPalm
    {
        // Wrist plus the four finger proximal phalanges: the same five canonical joints the
        // browser reference averaged, addressed by name instead of by array index.
        public static IReadOnlyList<string> Joints { get; } = Array.AsReadOnly(new[]
        {
            "wrist", "index-finger-phalanx-proximal", "middle-finger-phalanx-proximal",
            "ring-finger-phalanx-proximal", "pinky-finger-phalanx-proximal",
        });
        // Explicit validity: a missing, partial or non-finite hand has no palm point at all.
        public static Vector3? Point(HandSample hand)
        {
            if (hand == null || hand.Status != "valid" || hand.Joints == null || hand.Joints.Count != 25) return null;
            var sum = Vector3.Zero;
            foreach (var name in Joints)
            {
                if (!hand.Joints.TryGetValue(name, out var pose) || !GuideValidation.ValidPose(pose)) return null;
                sum += pose.PositionM;
            }
            return sum / Joints.Count;
        }
    }

    // Half-open take-relative interval shared by motion frames, markers and narration.
    public sealed class TakeTrim
    {
        public double StartMs { get; }
        public double EndMsExclusive { get; }
        public TakeTrim(double startMs, double endMsExclusive)
        {
            if (!GuideValidation.Finite(startMs) || !GuideValidation.Finite(endMsExclusive) ||
                startMs < 0 || endMsExclusive <= startMs || endMsExclusive > 120001)
                throw new ArgumentException("Trim must be a bounded half-open take interval.");
            StartMs = startMs; EndMsExclusive = endMsExclusive;
        }
        public bool Contains(double tMs) => tMs >= StartMs && tMs < EndMsExclusive;
    }

    // Local tuning for authoring gestures. Initial values ported from the browser reference;
    // they still require headset measurement before anyone calls them validated.
    public sealed class RecordingPolicy
    {
        public string Source { get; }
        public double SaveZoneArmMs { get; }
        public double SaveZoneHoldMs { get; }
        public double SaveZoneJitterM { get; }
        public double TakeArmMs { get; }
        public double StallMs { get; }
        public double FramePeriodMs { get; }
        public double MinimumTakeMs { get; }
        public double ArmDistanceM { get; }
        public double HomeRadiusM { get; }
        public double AwayRadiusM { get; }
        public double EndpointStillMs { get; }
        public double EndpointJitterM { get; }
        public double EndpointExpiryMs { get; }
        public double ReturnHoldMs { get; }
        public double ResumeRadiusM { get; }
        public int MaximumTakes { get; }
        public RecordingPolicy(string source = "live", double saveZoneArmMs = 3000, double saveZoneHoldMs = 800,
            double saveZoneJitterM = .025, double takeArmMs = 3000, double stallMs = 250, double framePeriodMs = 1000.0 / 30.0,
            double minimumTakeMs = 1200, double armDistanceM = .15, double homeRadiusM = .08, double awayRadiusM = .1,
            double endpointStillMs = 800, double endpointJitterM = .02, double endpointExpiryMs = 6000,
            double returnHoldMs = 800, double resumeRadiusM = .12, int maximumTakes = 12)
        {
            if (source != "live" && source != "synthetic-fixture" && source != "recorded-fixture") throw new ArgumentException("Unknown capture source.");
            GuideValidation.Duration(saveZoneArmMs, nameof(saveZoneArmMs));
            GuideValidation.Duration(takeArmMs, nameof(takeArmMs));
            GuideValidation.Positive(saveZoneHoldMs, 10000, nameof(saveZoneHoldMs));
            GuideValidation.Positive(stallMs, 1000, nameof(stallMs));
            GuideValidation.Positive(framePeriodMs, 1000, nameof(framePeriodMs));
            GuideValidation.Positive(minimumTakeMs, 60000, nameof(minimumTakeMs));
            GuideValidation.Positive(endpointStillMs, 10000, nameof(endpointStillMs));
            GuideValidation.Positive(endpointExpiryMs, 60000, nameof(endpointExpiryMs));
            GuideValidation.Positive(returnHoldMs, 10000, nameof(returnHoldMs));
            GuideValidation.Positive(saveZoneJitterM, 1, nameof(saveZoneJitterM));
            GuideValidation.Positive(endpointJitterM, 1, nameof(endpointJitterM));
            GuideValidation.Positive(homeRadiusM, 1, nameof(homeRadiusM));
            GuideValidation.Positive(awayRadiusM, 1, nameof(awayRadiusM));
            GuideValidation.Positive(armDistanceM, 1, nameof(armDistanceM));
            GuideValidation.Positive(resumeRadiusM, 1, nameof(resumeRadiusM));
            // The away band must sit strictly outside the home band, and neither may reach the
            // arming distance; otherwise a hand resting at the save zone could arm and save itself.
            if (homeRadiusM >= awayRadiusM || awayRadiusM >= armDistanceM) throw new ArgumentException("Home < away < arming distances are required.");
            if (framePeriodMs > minimumTakeMs || maximumTakes < 1 || maximumTakes > 128) throw new ArgumentException("Invalid take bounds.");
            Source = source; SaveZoneArmMs = saveZoneArmMs; SaveZoneHoldMs = saveZoneHoldMs; SaveZoneJitterM = saveZoneJitterM;
            TakeArmMs = takeArmMs; StallMs = stallMs; FramePeriodMs = framePeriodMs; MinimumTakeMs = minimumTakeMs;
            ArmDistanceM = armDistanceM; HomeRadiusM = homeRadiusM; AwayRadiusM = awayRadiusM;
            EndpointStillMs = endpointStillMs; EndpointJitterM = endpointJitterM; EndpointExpiryMs = endpointExpiryMs;
            ReturnHoldMs = returnHoldMs; ResumeRadiusM = resumeRadiusM; MaximumTakes = maximumTakes;
        }
    }
}
