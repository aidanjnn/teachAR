using System;
using System.Numerics;

namespace Trail.Contracts
{
    // Numeric domain value only. Strict recording JSON parsing is a separate ticket.
    public readonly struct CanonicalPose
    {
        public Vector3 PositionM { get; }
        public Quaternion OrientationXyzw { get; }

        public CanonicalPose(Vector3 positionM, Quaternion orientationXyzw)
        {
            if (!Finite(positionM.X) || !Finite(positionM.Y) || !Finite(positionM.Z) ||
                !Finite(orientationXyzw.X) || !Finite(orientationXyzw.Y) ||
                !Finite(orientationXyzw.Z) || !Finite(orientationXyzw.W) ||
                Math.Abs(orientationXyzw.Length() - 1f) > 0.0001f)
                throw new ArgumentException("Pose must be finite with a normalized quaternion.");
            PositionM = positionM;
            OrientationXyzw = orientationXyzw;
        }

        private static bool Finite(float value) => !float.IsNaN(value) && !float.IsInfinity(value);
    }
}
