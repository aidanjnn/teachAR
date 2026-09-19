using System;
using System.Numerics;

namespace Trail.Contracts
{
    // Native numeric domain value. Parsed wire doubles are retained for lossless JSON re-export.
    public readonly struct CanonicalPose
    {
        internal double[] WirePositionM { get; }
        internal double[] WireOrientationXyzw { get; }
        public Vector3 PositionM { get; }
        public Quaternion OrientationXyzw { get; }

        public CanonicalPose(Vector3 positionM, Quaternion orientationXyzw)
        {
            if (!Finite(positionM.X) || !Finite(positionM.Y) || !Finite(positionM.Z) ||
                !Finite(orientationXyzw.X) || !Finite(orientationXyzw.Y) ||
                !Finite(orientationXyzw.Z) || !Finite(orientationXyzw.W) ||
                Math.Abs(orientationXyzw.Length() - 1f) > 0.0001002f)
                throw new ArgumentException("Pose must be finite with a normalized quaternion.");
            WirePositionM = null;
            WireOrientationXyzw = null;
            PositionM = positionM;
            OrientationXyzw = orientationXyzw;
        }

        // The JSON reader already checks the exact double norm within 1e-4. The
        // float constructor allows only the additional rounding error of conversion.
        internal CanonicalPose(Vector3 position, Quaternion orientation, double[] wirePosition, double[] wireOrientation)
            : this(position, orientation)
        {
            WirePositionM = (double[])wirePosition.Clone();
            WireOrientationXyzw = (double[])wireOrientation.Clone();
        }

        private static bool Finite(float value) => !float.IsNaN(value) && !float.IsInfinity(value);
    }
}
