using System;
using System.Collections.Generic;
using System.Numerics;
using Trail.Contracts;

namespace Trail.Motion
{
    public readonly struct RigidRegistration
    {
        public Vector3 TranslationM { get; }
        public Quaternion Rotation { get; }
        public RigidRegistration(Vector3 translationM, Quaternion rotation)
        {
            var checkedPose = new CanonicalPose(translationM, rotation);
            TranslationM = checkedPose.PositionM;
            Rotation = checkedPose.OrientationXyzw;
        }
        public Vector3 TransformPoint(Vector3 point) => Vector3.Transform(point, Rotation) + TranslationM;
        public CanonicalPose Apply(CanonicalPose pose) => new CanonicalPose(TransformPoint(pose.PositionM),
            Quaternion.Normalize(Rotation * pose.OrientationXyzw));
        public RigidRegistration Inverse()
        {
            var inverse = Quaternion.Conjugate(Rotation);
            return new RigidRegistration(Vector3.Transform(-TranslationM, inverse), inverse);
        }
    }

    public sealed class CalibrationRegistration
    {
        public RigidRegistration ReferenceFromWorkspace { get; }
        public float HeldOutErrorM { get; }
        public float FitErrorM { get; }
        internal CalibrationRegistration(RigidRegistration transform, float heldOut, float fit)
        { ReferenceFromWorkspace = transform; HeldOutErrorM = heldOut; FitErrorM = fit; }
    }

    public static class WorkspaceCalibration
    {
        // Initial plan gates; freeze/tune only from actual headset measurements.
        public const float MaxErrorM = .02f;
        public const float MaxSpreadM = .01f;
        public static CalibrationRegistration Fit(float widthM, float depthM, Vector3 a, Vector3 b,
            Vector3 c, Vector3 d, Vector3 referenceUp)
        {
            if (!Finite(widthM) || !Finite(depthM) || widthM < .2f || depthM < .2f ||
                !Finite(a) || !Finite(b) || !Finite(c) || !Finite(d) || !Finite(referenceUp) || referenceUp.Length() < .9f)
                throw new ArgumentException("Finite marks and at least 20 cm edges are required.");
            var ab = b - a; var ac = c - a;
            if (ab.Length() < .2f || ac.Length() < .2f ||
                Math.Abs(ab.Length() - widthM) > MaxErrorM || Math.Abs(ac.Length() - depthM) > MaxErrorM ||
                Math.Abs(Vector3.Distance(b, c) - Math.Sqrt(widthM * widthM + depthM * depthM)) > MaxErrorM)
                throw new ArgumentException("Mark distances disagree with the measured mat; no scaling is allowed.");
            var x = Vector3.Normalize(ab);
            var normal = Vector3.Cross(x, ac);
            if (normal.Length() < .15f) throw new ArgumentException("Calibration marks are degenerate.");
            var y = Vector3.Normalize(normal);
            if (Vector3.Dot(y, Vector3.Normalize(referenceUp)) < .9f)
                throw new ArgumentException("Mark order is flipped or mat is not sufficiently level.");
            var z = Vector3.Cross(x, y);
            // System.Numerics transforms row vectors: basis vectors occupy rows.
            var rotation = Quaternion.Normalize(Quaternion.CreateFromRotationMatrix(new Matrix4x4(
                x.X, x.Y, x.Z, 0, y.X, y.Y, y.Z, 0, z.X, z.Y, z.Z, 0, 0, 0, 0, 1)));
            var rigid = new RigidRegistration(a, rotation);
            var fit = Math.Max(Vector3.Distance(rigid.TransformPoint(new Vector3(widthM, 0, 0)), b),
                Vector3.Distance(rigid.TransformPoint(new Vector3(0, 0, -depthM)), c));
            var heldOut = Vector3.Distance(rigid.TransformPoint(new Vector3(widthM, 0, -depthM)), d);
            if (fit > MaxErrorM || heldOut > MaxErrorM)
                throw new ArgumentException("Registration failed the fit or independent fourth-mark check.");
            return new CalibrationRegistration(rigid, heldOut, fit);
        }
        internal static bool Finite(float value) => !float.IsNaN(value) && !float.IsInfinity(value);
        internal static bool Finite(Vector3 value) => Finite(value.X) && Finite(value.Y) && Finite(value.Z);
    }

    // Caller supplies fresh observation timestamps. A gap/invalid hand clears the entire hold.
    public sealed class StableMarkSampler
    {
        private readonly List<Vector3> points = new List<Vector3>();
        private double startedMs, lastMs = -1;
        public double Progress { get; private set; }
        public void Reset() { points.Clear(); lastMs = -1; Progress = 0; }
        public bool Push(double nowMs, Vector3? point, out Vector3 median)
        {
            median = default;
            if (double.IsNaN(nowMs) || double.IsInfinity(nowMs) || nowMs < 0 || !point.HasValue || !WorkspaceCalibration.Finite(point.Value))
            { Reset(); return false; }
            if (lastMs >= 0 && nowMs <= lastMs) { Reset(); return false; }
            if (lastMs >= 0 && nowMs - lastMs > 100) Reset();
            if (points.Count == 0) startedMs = nowMs;
            lastMs = nowMs;
            points.Add(point.Value);
            if (points.Count > 128) { Reset(); return false; }
            var xs = new float[points.Count]; var ys = new float[points.Count]; var zs = new float[points.Count];
            for (var i = 0; i < points.Count; i++) { xs[i] = points[i].X; ys[i] = points[i].Y; zs[i] = points[i].Z; }
            Array.Sort(xs); Array.Sort(ys); Array.Sort(zs);
            median = new Vector3(xs[xs.Length / 2], ys[ys.Length / 2], zs[zs.Length / 2]);
            foreach (var p in points)
                if (Vector3.Distance(p, median) > WorkspaceCalibration.MaxSpreadM) { Reset(); return false; }
            Progress = Math.Min(1, (nowMs - startedMs) / 400);
            return Progress >= 1 && points.Count >= 8;
        }
    }
}
