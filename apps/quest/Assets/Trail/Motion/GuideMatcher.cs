using System;
using System.Numerics;
using Trail.Contracts;

namespace Trail.Motion
{
    public static class GuideMatcher
    {
        public static bool Matches(CanonicalPose actual, CanonicalPose expected, double radiusM, double? orientationRad = null)
        {
            if (!GuideValidation.ValidPose(actual) || !GuideValidation.ValidPose(expected)) return false;
            if (Vector3.Distance(actual.PositionM, expected.PositionM) > radiusM) return false;
            if (!orientationRad.HasValue) return true;
            var dot = Math.Min(1, Math.Abs(Quaternion.Dot(actual.OrientationXyzw, expected.OrientationXyzw)));
            return 2 * Math.Acos(dot) <= orientationRad.Value;
        }

        // Cosmetic only: local search cannot mark a motion gate passed.
        public static int CueIndex(GuideTarget target, Vector3 wrist, int previous)
        {
            previous = Math.Max(0, Math.Min(previous, target.CuePath.Count - 1));
            var best = previous; var distance = Vector3.DistanceSquared(wrist, target.CuePath[best]);
            for (var i = previous + 1; i <= Math.Min(previous + 3, target.CuePath.Count - 1); i++)
            {
                var candidate = Vector3.DistanceSquared(wrist, target.CuePath[i]);
                if (candidate < distance) { best = i; distance = candidate; }
            }
            return best;
        }
    }
}
