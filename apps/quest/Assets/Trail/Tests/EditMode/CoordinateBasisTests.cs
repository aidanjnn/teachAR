using System;
using System.Numerics;
using NUnit.Framework;
using Trail.Contracts;
using Trail.Motion;

namespace Trail.Tests.EditMode
{
    public class CoordinateBasisTests
    {
        [Test]
        public void ReflectsPositionAndRotationConsistently()
        {
            var pose = new CanonicalPose(new Vector3(1, 2, 3),
                Quaternion.CreateFromAxisAngle(Vector3.UnitY, (float)Math.PI / 2));
            var canonical = CoordinateBasis.ReflectZ(pose);
            Assert.That(canonical.PositionM.Z, Is.EqualTo(-3));
            // In the reflected basis +X rotated about -Y points toward +Z.
            var direction = Vector3.Transform(Vector3.UnitX, canonical.OrientationXyzw);
            Assert.That(direction.Z, Is.EqualTo(1).Within(0.00001));
            var restored = CoordinateBasis.ReflectZ(canonical);
            Assert.That(restored.PositionM, Is.EqualTo(pose.PositionM));
            Assert.That(restored.OrientationXyzw, Is.EqualTo(pose.OrientationXyzw));
        }

        [Test]
        public void RejectsNonfinitePositionAndInvalidRotation()
        {
            Assert.Throws<ArgumentException>(() => new CanonicalPose(
                new Vector3(float.NaN, 0, 0), Quaternion.Identity));
            Assert.Throws<ArgumentException>(() => new CanonicalPose(Vector3.Zero, new Quaternion()));
        }
    }
}
