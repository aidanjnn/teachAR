using System;
using Trail.Contracts;

namespace Trail.Motion
{
    // Reject discontinuities without filling or smoothing missing samples. Device tuning is still required.
    public sealed class HandContinuity
    {
        private HandSample previous;
        private double previousMs = -1;
        public void Reset() { previous = null; previousMs = -1; }
        public HandSample Accept(HandSample current, double nowMs)
        {
            if (current == null || current.Status != "valid" || current.Joints == null || current.Joints.Count != 25 ||
                double.IsNaN(nowMs) || double.IsInfinity(nowMs) || nowMs < 0)
            { Reset(); return MotionSamples.Missing(current?.Reason ?? "unavailable"); }
            if (previousMs >= 0 && nowMs <= previousMs) { Reset(); return MotionSamples.Missing(); }
            if (previous != null && nowMs - previousMs <= 100)
            {
                var seconds = (nowMs - previousMs) / 1000;
                // 10 cm allowance + 5 m/s: conservative discontinuity rejection, not pose confidence.
                foreach (var name in JointNames.Canonical)
                {
                    if (!current.Joints.ContainsKey(name) || !previous.Joints.ContainsKey(name)) { Reset(); return MotionSamples.Missing(); }
                    if (System.Numerics.Vector3.Distance(previous.Joints[name].PositionM, current.Joints[name].PositionM) > .1 + 5 * seconds)
                    { Reset(); return MotionSamples.Missing("jump"); }
                }
            }
            previous = current; previousMs = nowMs;
            return current;
        }
    }
}
