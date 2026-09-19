using System;
using System.Collections.Generic;
using Trail.Contracts;
using Trail.Motion;
using Trail.Runtime.Record;
using UnityEngine;
using UnityEngine.XR;
using UnityEngine.XR.Hands;
using NVector3 = System.Numerics.Vector3;
using NQuaternion = System.Numerics.Quaternion;

namespace Trail.Runtime.XR
{
    // XR Hands providers already convert native OpenXR into Unity's left-handed tracking basis.
    // Read only the Dynamic updatedHands callback with fresh joint flags; never a visual hand skin.
    public sealed class XRHandsSource : HandObservationSource
    {
        public override string AdapterVersion => "unity-xrhands-openxr-v1";
        public override string SdkVersion => "xr-hands-1.7.2";
        public override string ProviderId => hands == null ? "unavailable" : hands.subsystemDescriptor.id;
        public override string SourceKind => !Application.isEditor && Application.platform == RuntimePlatform.Android ? "live" : "synthetic-fixture";
        public override string Availability => available;
        private string available = "waiting for a running native XR Hands subsystem";
        private XRHandSubsystem hands;
        private readonly List<XRHandSubsystem> handSystems = new List<XRHandSubsystem>();
        private readonly List<XRInputSubsystem> inputs = new List<XRInputSubsystem>();
        private long sequence;
        private readonly HandContinuity leftContinuity = new HandContinuity();
        private readonly HandContinuity rightContinuity = new HandContinuity();
        private Matrix4x4 originMatrix;
        private bool hasOrigin, paused, focused = true, hadPresence, present;
        // Canonical order is explicit. Palm is deliberately omitted; do not cast enum indices.
        public static IReadOnlyList<XRHandJointID> CanonicalJoints { get; } = Array.AsReadOnly(new[] {
            XRHandJointID.Wrist,
            XRHandJointID.ThumbMetacarpal, XRHandJointID.ThumbProximal, XRHandJointID.ThumbDistal, XRHandJointID.ThumbTip,
            XRHandJointID.IndexMetacarpal, XRHandJointID.IndexProximal, XRHandJointID.IndexIntermediate, XRHandJointID.IndexDistal, XRHandJointID.IndexTip,
            XRHandJointID.MiddleMetacarpal, XRHandJointID.MiddleProximal, XRHandJointID.MiddleIntermediate, XRHandJointID.MiddleDistal, XRHandJointID.MiddleTip,
            XRHandJointID.RingMetacarpal, XRHandJointID.RingProximal, XRHandJointID.RingIntermediate, XRHandJointID.RingDistal, XRHandJointID.RingTip,
            XRHandJointID.LittleMetacarpal, XRHandJointID.LittleProximal, XRHandJointID.LittleIntermediate, XRHandJointID.LittleDistal, XRHandJointID.LittleTip
        });
        private void Update()
        {
            if (TrackingSpace == null) { available = "tracking space not assigned"; return; }
            if ((TrackingSpace.lossyScale - Vector3.one).sqrMagnitude > .000001f)
            { if (hasOrigin) Invalidate("Scaled tracking space is unsupported"); hasOrigin = false; available = "tracking space must have unit scale"; return; }
            var current = TrackingSpace.localToWorldMatrix;
            if (hasOrigin && current != originMatrix) Invalidate("Tracking space transform changed");
            originMatrix = current; hasOrigin = true;
            var device = InputDevices.GetDeviceAtXRNode(XRNode.Head);
            if (device.TryGetFeatureValue(CommonUsages.userPresence, out var presence))
            {
                if (hadPresence && present && !presence) Invalidate("Headset removed");
                present = presence; hadPresence = true;
            }
            if (hands != null && !hands.running) { Detach(); Invalidate("Native hand subsystem stopped"); }
            if (hands == null && !paused && focused)
            {
                handSystems.Clear(); SubsystemManager.GetSubsystems(handSystems);
                foreach (var candidate in handSystems)
                    if (candidate.running && candidate.subsystemDescriptor.id == "OpenXR Hands") { hands = candidate; hands.updatedHands += OnHands; break; }
                if (hands != null)
                {
                    inputs.Clear(); SubsystemManager.GetSubsystems(inputs);
                    foreach (var input in inputs) input.trackingOriginUpdated += OnOrigin;
                }
            }
            available = hands == null ? "native hand subsystem unavailable" : "native Dynamic callback; all 25 joints required per hand";
        }
        private void OnOrigin(XRInputSubsystem subsystem) { leftContinuity.Reset(); rightContinuity.Reset(); Invalidate("XR reference space reset"); }
        private void OnApplicationPause(bool value) { paused = value; if (value) Invalidate("XR application suspended"); }
        private void OnApplicationFocus(bool value) { focused = value; if (!value) Invalidate("XR focus lost"); }
        private void OnDisable() { Detach(); hasOrigin = false; Invalidate("Hand source disabled"); }
        private void Detach()
        {
            if (hands != null) hands.updatedHands -= OnHands;
            hands = null; leftContinuity.Reset(); rightContinuity.Reset();
            foreach (var input in inputs) input.trackingOriginUpdated -= OnOrigin;
            inputs.Clear();
        }
        private void OnHands(XRHandSubsystem subsystem, XRHandSubsystem.UpdateSuccessFlags flags, XRHandSubsystem.UpdateType updateType)
        {
            if (TrackingSpace == null || TrackingSpace.localToWorldMatrix != originMatrix)
            { if (hasOrigin) Invalidate("Tracking space changed before hand update"); hasOrigin = false; return; }
            if (updateType != XRHandSubsystem.UpdateType.Dynamic || !hasOrigin || paused || !focused || (hadPresence && !present)) return;
            var leftFresh = (flags & XRHandSubsystem.UpdateSuccessFlags.LeftHandJoints) != 0;
            var rightFresh = (flags & XRHandSubsystem.UpdateSuccessFlags.RightHandJoints) != 0;
            var now = MotionClock.NowMs;
            Publish(new ReferenceObservation(now, ++sequence, OriginRevision, SourceKind,
                leftContinuity.Accept(Read(subsystem.leftHand, leftFresh), now), rightContinuity.Accept(Read(subsystem.rightHand, rightFresh), now)));
        }
        private static HandSample Read(XRHand hand, bool fresh)
        {
            if (!fresh || !hand.isTracked) return MotionSamples.Missing();
            var joints = new Dictionary<string, CanonicalPose>();
            for (var i = 0; i < CanonicalJoints.Count; i++)
            {
                if (!hand.GetJoint(CanonicalJoints[i]).TryGetPose(out var pose)) return MotionSamples.Missing();
                try
                {
                    var q = new NQuaternion(pose.rotation.x, pose.rotation.y, pose.rotation.z, pose.rotation.w);
                    // Reject malformed SDK data, including a zero/nonfinite quaternion, before normalization.
                    if (float.IsNaN(q.LengthSquared()) || float.IsInfinity(q.LengthSquared()) || Math.Abs(q.LengthSquared() - 1) > .01f)
                        return MotionSamples.Missing("nonfinite");
                    var unityPose = new CanonicalPose(new NVector3(pose.position.x, pose.position.y, pose.position.z), NQuaternion.Normalize(q));
                    // Identity per-joint correction: canonical local axes are reflected provider joint axes.
                    // Ghost bones use endpoint geometry, so no unmeasured model bind-pose offsets are assumed.
                    joints.Add(JointNames.Canonical[i], CoordinateBasis.ReflectZ(unityPose));
                }
                catch (ArgumentException) { return MotionSamples.Missing("nonfinite"); }
            }
            return new HandSample { Status = "valid", Joints = joints };
        }
    }
}
