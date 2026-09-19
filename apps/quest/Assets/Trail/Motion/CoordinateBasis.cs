using System.Numerics;
using Trail.Contracts;

namespace Trail.Motion
{
    public static class CoordinateBasis
    {
        // C R C with C=diag(1,1,-1). Applying twice restores the original basis.
        // Bone-local rig corrections and workspace registration are separate operations.
        public static CanonicalPose ReflectZ(CanonicalPose pose)
        {
            var p = pose.PositionM;
            var q = pose.OrientationXyzw;
            return new CanonicalPose(new Vector3(p.X, p.Y, -p.Z),
                new Quaternion(-q.X, -q.Y, q.Z, q.W));
        }
    }
}
