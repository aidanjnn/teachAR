using System.Collections.Generic;
using Trail.Contracts;
using Trail.Motion;
using Trail.Runtime.Record;
using UnityEngine;

namespace Trail.Presentation
{
    // One required hand of the expert demonstration, with the reviewed tolerance it is graded against.
    public readonly struct GhostGuideHand
    {
        public string Side { get; }
        public MotionFrame Frame { get; }
        public CanonicalPose? Checkpoint { get; }
        public double PositionToleranceM { get; }
        public GhostGuideHand(string side, MotionFrame frame, CanonicalPose? checkpoint, double positionToleranceM)
        { Side = side; Frame = frame; Checkpoint = checkpoint; PositionToleranceM = positionToleranceM; }
    }

    // A separate procedural articulated ghost. It is never a tracking source or matcher input.
    public sealed class GhostPresentation : MonoBehaviour
    {
        public CaptureReplaySession Session;
        public bool DiagnosticSkeleton;
        private const int RingSegments = 32;
        private static readonly int[] Parents = { -1, 0, 1, 2, 3, 0, 5, 6, 7, 8, 0, 10, 11, 12, 13, 0, 15, 16, 17, 18, 0, 20, 21, 22, 23 };
        // One rig per side, so a two-hand demonstration is never half-rendered.
        private readonly HandRig[] rigs = { new HandRig("left"), new HandRig("right") };
        private readonly GhostGuideHand[] guideHands = new GhostGuideHand[2];
        private readonly Vector3[] toleranceRing = new Vector3[RingSegments * 2 + 2];
        private Material material;
        private int guideCount;
        // Replaces the whole displayed guide frame with a step's required hands: one entry per side, at most two.
        public void ShowGuideHands(IReadOnlyList<GhostGuideHand> hands)
        {
            guideCount = 0;
            if (hands == null) return;
            for (var i = 0; i < hands.Count && guideCount < guideHands.Length; i++)
                if (hands[i].Frame != null) guideHands[guideCount++] = hands[i];
        }
        public void ClearGuideFrame() { guideCount = 0; Hide(); }
        private void Awake()
        {
            var shader = Resources.Load<Shader>("TrailGhost");
            if (shader == null) { enabled = false; return; }
            material = new Material(shader); material.SetColor("_Color", new Color(.3f, .95f, .9f, .36f));
            foreach (var rig in rigs) Build(rig);
            Hide();
        }
        private void Build(HandRig rig)
        {
            var root = new GameObject("Ghost " + rig.Side + " hand"); root.transform.SetParent(transform, false); rig.Root = root.transform;
            for (var i = 0; i < rig.Joints.Length; i++)
            {
                rig.Joints[i] = Shape(rig, "Joint " + rig.Side + " " + JointNames.Canonical[i], PrimitiveType.Sphere);
                if (i > 0) rig.Bones[i - 1] = Shape(rig, "Bone " + rig.Side + " " + JointNames.Canonical[i], PrimitiveType.Cylinder);
            }
            rig.Target = Line(rig, "Reviewed tolerance " + rig.Side, .003f); rig.Cue = Line(rig, "Short motion cue " + rig.Side, .002f);
        }
        private Transform Shape(HandRig rig, string label, PrimitiveType type)
        {
            var shape = GameObject.CreatePrimitive(type); shape.name = label; shape.transform.SetParent(rig.Root, false);
            Destroy(shape.GetComponent<Collider>()); shape.GetComponent<Renderer>().sharedMaterial = material;
            return shape.transform;
        }
        private LineRenderer Line(HandRig rig, string label, float width)
        {
            var child = new GameObject(label); child.transform.SetParent(rig.Root, false);
            var line = child.AddComponent<LineRenderer>(); line.useWorldSpace = true; line.loop = false;
            line.widthMultiplier = width; line.sharedMaterial = material; return line;
        }
        private void LateUpdate()
        {
            if (Session == null || Session.Registration == null || Session.Source == null || Session.Source.TrackingSpace == null)
            { Hide(); return; }
            foreach (var rig in rigs) Present(rig);
        }
        private void Present(HandRig rig)
        {
            MotionFrame frame = null; CanonicalPose? checkpoint = null; var toleranceM = 0d;
            if (guideCount > 0)
            {
                var required = false;
                for (var i = 0; i < guideCount && !required; i++)
                {
                    if (Side(guideHands[i].Side) != rig.Side) continue;
                    frame = guideHands[i].Frame; checkpoint = guideHands[i].Checkpoint; toleranceM = guideHands[i].PositionToleranceM; required = true;
                }
                // A side this step does not require is absent, not failed.
                if (!required) { Hide(rig); return; }
            }
            else if (Side(null) == rig.Side) frame = Session.ReplayFrame;
            else { Hide(rig); return; }
            var hand = frame == null || frame.Hands == null ? null : (rig.Side == "left" ? frame.Hands.Left : frame.Hands.Right);
            // Missing tracking hides this hand alone; the other keeps rendering and neither reads as success or failure.
            if (hand == null || hand.Status != "valid" || hand.Joints == null) { Hide(rig); return; }
            Draw(rig, hand, checkpoint, toleranceM);
        }
        private string Side(string side) => side == "left" || side == "right" ? side : (Session.UseLeftHand ? "left" : "right");
        private void Draw(HandRig rig, HandSample hand, CanonicalPose? checkpoint, double toleranceM)
        {
            rig.Root.gameObject.SetActive(true);
            for (var i = 0; i < rig.Joints.Length; i++)
            {
                var point = World(hand.Joints[JointNames.Canonical[i]].PositionM);
                rig.Joints[i].position = point;
                rig.Joints[i].localScale = Vector3.one * (DiagnosticSkeleton ? .006f : .011f);
                if (i == 0) continue;
                var a = rig.Joints[Parents[i]].position; var delta = point - a;
                var bone = rig.Bones[i - 1]; bone.gameObject.SetActive(delta.sqrMagnitude > .0000001f);
                bone.position = (a + point) * .5f;
                if (delta.sqrMagnitude > .0000001f) bone.rotation = Quaternion.FromToRotation(Vector3.up, delta.normalized);
                var radius = DiagnosticSkeleton ? .003f : .009f;
                bone.localScale = new Vector3(radius, delta.magnitude * .5f, radius);
            }
            if (rig.CuePoints.Count > 0 && Vector3.Distance(rig.LastCuePoint, rig.Joints[0].position) > .1f) rig.CuePoints.Clear();
            rig.LastCuePoint = rig.Joints[0].position;
            rig.CuePoints.Enqueue(rig.LastCuePoint); while (rig.CuePoints.Count > 20) rig.CuePoints.Dequeue();
            rig.Cue.positionCount = rig.CuePoints.Count; rig.Cue.SetPositions(rig.CuePoints.ToArray());
            Tolerance(rig.Target, checkpoint, toleranceM);
        }
        // The visible zone is the reviewed grading tolerance itself, drawn as two orthogonal circles of
        // that exact radius. It is never inflated, and it marks motion proximity, not a verified result.
        private void Tolerance(LineRenderer line, CanonicalPose? checkpoint, double toleranceM)
        {
            if (!checkpoint.HasValue || !(toleranceM > 0 && toleranceM <= 1)) { line.positionCount = 0; return; }
            var centre = checkpoint.Value.PositionM; var radius = (float)toleranceM;
            for (var i = 0; i <= RingSegments; i++)
            {
                var angle = i * Mathf.PI * 2 / RingSegments;
                var cos = Mathf.Cos(angle) * radius; var sin = Mathf.Sin(angle) * radius;
                toleranceRing[i] = World(centre + new System.Numerics.Vector3(cos, 0, sin));
                toleranceRing[RingSegments + 1 + i] = World(centre + new System.Numerics.Vector3(cos, sin, 0));
            }
            line.positionCount = toleranceRing.Length; line.SetPositions(toleranceRing);
        }
        private Vector3 World(System.Numerics.Vector3 point)
        {
            var reference = Session.Registration.ReferenceFromWorkspace.TransformPoint(point);
            return Session.Source.TrackingSpace.TransformPoint(new Vector3(reference.X, reference.Y, -reference.Z));
        }
        private void Hide() { foreach (var rig in rigs) Hide(rig); }
        private static void Hide(HandRig rig)
        {
            if (rig.Root != null) rig.Root.gameObject.SetActive(false);
            if (rig.Target != null) rig.Target.positionCount = 0;
            if (rig.Cue != null) rig.Cue.positionCount = 0;
            rig.CuePoints.Clear();
        }
        private void OnDisable() { guideCount = 0; Hide(); }
        private void OnDestroy() { if (material != null) Destroy(material); }

        // Translucent expert geometry for one side. Live learner hands are drawn by the hand provider, never from here.
        private sealed class HandRig
        {
            public readonly string Side;
            public readonly Transform[] Joints = new Transform[25];
            public readonly Transform[] Bones = new Transform[24];
            public readonly Queue<Vector3> CuePoints = new Queue<Vector3>();
            public Transform Root;
            public LineRenderer Target, Cue;
            public Vector3 LastCuePoint;
            public HandRig(string side) { Side = side; }
        }
    }
}
