using System.Collections.Generic;
using Trail.Contracts;
using Trail.Motion;
using Trail.Runtime.Record;
using UnityEngine;

namespace Trail.Presentation
{
    // A separate procedural articulated ghost. It is never a tracking source or matcher input.
    public sealed class GhostPresentation : MonoBehaviour
    {
        public CaptureReplaySession Session;
        public bool DiagnosticSkeleton;
        private readonly Transform[] joints = new Transform[25];
        private readonly Transform[] bones = new Transform[24];
        private static readonly int[] Parents = { -1, 0, 1, 2, 3, 0, 5, 6, 7, 8, 0, 10, 11, 12, 13, 0, 15, 16, 17, 18, 0, 20, 21, 22, 23 };
        private Material material;
        private LineRenderer target, cue;
        private readonly Queue<Vector3> cuePoints = new Queue<Vector3>();
        private MotionFrame guideFrame;
        private CanonicalPose? guideTarget;
        public void ShowGuideFrame(MotionFrame frame, CanonicalPose? checkpoint) { guideFrame = frame; guideTarget = checkpoint; }
        public void ClearGuideFrame() { guideFrame = null; guideTarget = null; Hide(); }
        private void Awake()
        {
            var shader = Resources.Load<Shader>("TrailGhost");
            if (shader == null) { enabled = false; return; }
            material = new Material(shader); material.SetColor("_Color", new Color(.3f, .95f, .9f, .36f));
            for (var i = 0; i < 25; i++)
            {
                joints[i] = Shape("Joint " + JointNames.Canonical[i], PrimitiveType.Sphere);
                if (i > 0) bones[i - 1] = Shape("Bone " + JointNames.Canonical[i], PrimitiveType.Cylinder);
            }
            target = Line("Target ring", true, .003f); cue = Line("Short motion cue", false, .002f);
            Hide();
        }
        private Transform Shape(string label, PrimitiveType type)
        {
            var shape = GameObject.CreatePrimitive(type); shape.name = label; shape.transform.SetParent(transform, false);
            Destroy(shape.GetComponent<Collider>()); shape.GetComponent<Renderer>().sharedMaterial = material;
            return shape.transform;
        }
        private LineRenderer Line(string label, bool loop, float width)
        {
            var child = new GameObject(label); child.transform.SetParent(transform, false);
            var line = child.AddComponent<LineRenderer>(); line.useWorldSpace = true; line.loop = loop;
            line.widthMultiplier = width; line.sharedMaterial = material; return line;
        }
        private void LateUpdate()
        {
            if (Session == null || Session.Registration == null || Session.Source == null || Session.Source.TrackingSpace == null)
            { Hide(); return; }
            var frame = guideFrame ?? Session.ReplayFrame;
            var hand = frame == null ? null : (Session.UseLeftHand ? frame.Hands.Left : frame.Hands.Right);
            if (hand == null || hand.Status != "valid") { Hide(); return; }
            for (var i = 0; i < joints.Length; i++)
            {
                var point = World(hand.Joints[JointNames.Canonical[i]].PositionM);
                joints[i].gameObject.SetActive(true); joints[i].position = point;
                joints[i].localScale = Vector3.one * (DiagnosticSkeleton ? .006f : .011f);
                if (i == 0) continue;
                var a = joints[Parents[i]].position; var delta = point - a;
                var bone = bones[i - 1]; bone.gameObject.SetActive(delta.sqrMagnitude > .0000001f);
                bone.position = (a + point) * .5f;
                if (delta.sqrMagnitude > .0000001f) bone.rotation = Quaternion.FromToRotation(Vector3.up, delta.normalized);
                var radius = DiagnosticSkeleton ? .003f : .009f;
                bone.localScale = new Vector3(radius, delta.magnitude * .5f, radius);
            }
            cuePoints.Enqueue(joints[0].position); while (cuePoints.Count > 20) cuePoints.Dequeue();
            cue.positionCount = cuePoints.Count; cue.SetPositions(cuePoints.ToArray());
            if (guideTarget.HasValue)
            {
                target.positionCount = 32;
                for (var i = 0; i < 32; i++)
                {
                    var angle = i * Mathf.PI * 2 / 32;
                    target.SetPosition(i, World(guideTarget.Value.PositionM + new System.Numerics.Vector3(Mathf.Cos(angle) * .025f, 0, Mathf.Sin(angle) * .025f)));
                }
            }
            else target.positionCount = 0;
        }
        private Vector3 World(System.Numerics.Vector3 point)
        {
            var reference = Session.Registration.ReferenceFromWorkspace.TransformPoint(point);
            return Session.Source.TrackingSpace.TransformPoint(new Vector3(reference.X, reference.Y, -reference.Z));
        }
        private void Hide()
        {
            foreach (var joint in joints) if (joint != null) joint.gameObject.SetActive(false);
            foreach (var bone in bones) if (bone != null) bone.gameObject.SetActive(false);
            if (target != null) target.positionCount = 0;
            if (cue != null) cue.positionCount = 0;
            cuePoints.Clear();
        }
        private void OnDisable() { guideFrame = null; guideTarget = null; Hide(); }
        private void OnDestroy() { if (material != null) Destroy(material); }
    }
}
