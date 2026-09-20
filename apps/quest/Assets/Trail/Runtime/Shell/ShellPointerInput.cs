using System;
using UnityEngine;

namespace Trail.Runtime.Shell
{
    public readonly struct ShellPointerFrame
    {
        public readonly bool Valid, Pinching;
        public readonly Ray Ray;
        public ShellPointerFrame(Ray ray, bool pinching, bool valid = true)
        { Ray = ray; Pinching = pinching; Valid = valid; }
    }

    public interface IShellPointerSource
    {
        ShellPointerFrame Read(bool left);
    }

    // UI input only. This does not provide recording joints or learner observations.
    public sealed class MetaShellPointerSource : IShellPointerSource
    {
        private readonly Transform trackingSpace;
        private OVRPlugin.HandState leftState, rightState;
        public MetaShellPointerSource(Transform trackingSpace) => this.trackingSpace = trackingSpace;
        public ShellPointerFrame Read(bool left)
        {
            if (Application.isEditor || trackingSpace == null || !OVRManager.hasInputFocus) return default;
            var state = left ? leftState : rightState;
            if (!OVRPlugin.GetHandState(OVRPlugin.Step.Render,
                left ? OVRPlugin.Hand.HandLeft : OVRPlugin.Hand.HandRight, ref state)) return default;
            if (left) leftState = state; else rightState = state;
            var required = OVRPlugin.HandStatus.HandTracked | OVRPlugin.HandStatus.InputStateValid;
            if ((state.Status & required) != required ||
                (state.Status & OVRPlugin.HandStatus.SystemGestureInProgress) != 0 ||
                state.HandConfidence != OVRPlugin.TrackingConfidence.High) return default;
            // Meta's native pointer is right-handed. Match OVRHand's conversion, then
            // use the existing rig tracking space for both ray and menu geometry.
            var position = state.PointerPose.Position.FromFlippedZVector3f();
            var rotation = state.PointerPose.Orientation.FromFlippedZQuatf();
            var origin = trackingSpace.TransformPoint(position);
            var direction = trackingSpace.TransformDirection(rotation * Vector3.forward);
            if (!Finite(origin) || !Finite(direction) || direction.sqrMagnitude < .5f) return default;
            return new ShellPointerFrame(new Ray(origin, direction.normalized),
                (state.Pinches & OVRPlugin.HandFingerPinch.Index) != 0);
        }
        private static bool Finite(Vector3 point) =>
            !float.IsNaN(point.sqrMagnitude) && !float.IsInfinity(point.sqrMagnitude);
    }

    // Must observe an open hand before accepting a press. Acquiring tracking while
    // pinching, continuing a held pinch, or resuming focus cannot activate a menu.
    public sealed class ShellPinchLatch
    {
        private bool ready;
        public bool Observe(bool valid, bool pinching)
        {
            if (!valid) { Cancel(); return false; }
            if (!pinching) { ready = true; return false; }
            var pressed = ready; ready = false; return pressed;
        }
        public void Cancel() => ready = false;
    }
}
