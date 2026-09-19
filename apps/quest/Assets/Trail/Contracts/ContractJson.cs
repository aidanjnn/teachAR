using System;
using System.Collections.Generic;
using System.Numerics;

namespace Trail.Contracts
{
    public static partial class ContractJson
    {
        private static float NativeFloat(object value)
        {
            double number = (double)value;
            if (Math.Abs(number) > float.MaxValue) throw new ContractException("Coordinate exceeds native float representation");
            return (float)number;
        }
        private static Vector3 ReadVec3(object value)
        {
            var v = (List<object>)value;
            return new Vector3(NativeFloat(v[0]), NativeFloat(v[1]), NativeFloat(v[2]));
        }
        private static Quaternion ReadQuat(object value)
        {
            var q = (List<object>)value;
            double x = (double)q[0], y = (double)q[1], z = (double)q[2], w = (double)q[3];
            if (Math.Abs(Math.Sqrt(x*x + y*y + z*z + w*w) - 1) > 0.0001) throw new ContractException("Expected unit quaternion");
            return new Quaternion((float)x, (float)y, (float)z, (float)w);
        }
        private static CanonicalPose ReadPose(object value)
        {
            var map = (Dictionary<string, object>)value;
            try { return new CanonicalPose(ReadVec3(map["positionM"]), ReadQuat(map["orientationXyzw"])); }
            catch (ArgumentException e) { throw new ContractException(e.Message); }
        }
        private static object WriteVec3(Vector3 v) => new object[] { v.X, v.Y, v.Z };
        private static object WriteQuat(Quaternion q) => new object[] { q.X, q.Y, q.Z, q.W };
        private static object WritePose(CanonicalPose p) => new Dictionary<string, object> { { "positionM", WriteVec3(p.PositionM) }, { "orientationXyzw", WriteQuat(p.OrientationXyzw) } };
    }
}
