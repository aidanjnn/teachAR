using System;
using UnityEngine;

namespace Trail.Runtime.Shell
{
    // LateUpdate sees the current route's labels after the shell has refreshed them.
    public sealed class NativeShellPointer : MonoBehaviour
    {
        private const float MaximumDistance = 3f;
        private readonly ShellPinchLatch[] presses = { new ShellPinchLatch(), new ShellPinchLatch() };
        private readonly LineRenderer[] rays = new LineRenderer[2];
        private readonly Transform[] cursors = new Transform[2];
        private readonly Material[] materials = new Material[2];
        private TextMesh[] labels;
        private Func<int, bool> enabledEntry;
        private Action<int> select;
        private bool paused, focused = true;
        private int generation;
        private int draggingHand = -1;
        private float grabDistance;
        private Vector3 grabOffset;
        public TextMesh MoveHandle { get; set; }
        public Transform Head { get; set; }
        public bool IsDragging => draggingHand >= 0;
        public bool HasBeenMoved { get; private set; }
        public IShellPointerSource Source { get; set; }
        public bool IsAimingAtMenu { get; private set; }
        public bool DirectTouchActive { get; set; }

        public void Initialize(Transform trackingSpace, TextMesh[] buttons, Func<int, bool> enabled, Action<int> selected)
        {
            labels = buttons; enabledEntry = enabled; select = selected;
            Source = Source ?? new MetaShellPointerSource(trackingSpace);
            var shader = Resources.Load<Shader>("TrailGhost");
            if (shader == null) throw new InvalidOperationException("Shell pointer shader unavailable");
            for (var i = 0; i < 2; i++)
            {
                materials[i] = new Material(shader);
                var ray = new GameObject(i == 0 ? "Left menu ray" : "Right menu ray");
                ray.transform.SetParent(transform, false);
                rays[i] = ray.AddComponent<LineRenderer>();
                rays[i].useWorldSpace = true; rays[i].positionCount = 2;
                rays[i].widthMultiplier = .0015f; rays[i].sharedMaterial = materials[i];
                var cursor = GameObject.CreatePrimitive(PrimitiveType.Sphere);
                cursor.name = i == 0 ? "Left menu cursor" : "Right menu cursor";
                cursor.transform.SetParent(transform, false); cursor.transform.localScale = Vector3.one * .009f;
                Destroy(cursor.GetComponent<Collider>());
                cursor.GetComponent<Renderer>().sharedMaterial = materials[i]; cursors[i] = cursor.transform;
            }
            Cancel();
        }

        private void LateUpdate()
        {
            if (labels == null || Source == null) return;
            if (paused || !focused || DirectTouchActive) { Cancel(); return; }
            IsAimingAtMenu = false;
            if (MoveHandle != null) MoveHandle.color = Color.white;
            if (IsDragging) { MovePanel(); return; }
            var revision = generation;
            for (var hand = 0; hand < 2; hand++)
            {
                var frame = Source.Read(hand == 0);
                var valid = frame.Valid && Finite(frame.Ray.origin) && Finite(frame.Ray.direction) && frame.Ray.direction.sqrMagnitude > .5f;
                var pressed = presses[hand].Observe(valid, frame.Pinching);
                rays[hand].enabled = valid; cursors[hand].gameObject.SetActive(false);
                if (!valid) continue;
                var hit = HitTest(frame.Ray, out var point);
                var movePoint = Vector3.zero;
                var moveHit = MoveHandle != null && TryHit(MoveHandle, frame.Ray, MaximumDistance, out movePoint);
                if (moveHit) point = movePoint;
                var color = hit >= 0 || moveHit ? (frame.Pinching ? Color.green : Color.cyan) : new Color(.8f, .9f, 1f, .45f);
                materials[hand].SetColor("_Color", color);
                rays[hand].SetPosition(0, frame.Ray.origin);
                rays[hand].SetPosition(1, hit >= 0 || moveHit ? point : frame.Ray.GetPoint(1.2f));
                if (hit < 0 && !moveHit) continue;
                IsAimingAtMenu = true;
                if (moveHit) MoveHandle.color = color;
                else labels[hit].color = color;
                cursors[hand].gameObject.SetActive(true);
                cursors[hand].position = point - frame.Ray.direction * .004f;
                if (pressed)
                {
                    // One action per frame. A route change cancels both hands, so a
                    // held second pinch cannot hit a new button occupying the same slot.
                    if (moveHit)
                    {
                        draggingHand = hand;
                        grabDistance = Vector3.Distance(frame.Ray.origin, point);
                        grabOffset = transform.position - point;
                        HasBeenMoved = true;
                        for (var other = 0; other < 2; other++)
                            if (other != hand) { rays[other].enabled = false; cursors[other].gameObject.SetActive(false); }
                        return;
                    }
                    select(hit);
                    if (revision == generation) Cancel();
                    return;
                }
            }
        }

        private void MovePanel()
        {
            var frame = Source.Read(draggingHand == 0);
            if (!frame.Valid || !frame.Pinching || !Finite(frame.Ray.origin) || !Finite(frame.Ray.direction) ||
                frame.Ray.direction.sqrMagnitude < .5f)
            { Cancel(); return; }
            var target = frame.Ray.GetPoint(grabDistance);
            var position = target + grabOffset;
            // Keep the window outside the near clipping plane and within comfortable
            // interaction range. Depth follows the hand's translation, not only its aim.
            if (Head != null)
            {
                var offset = position - Head.position;
                if (offset.sqrMagnitude < .0001f) { Cancel(); return; }
                position = Head.position + offset.normalized * Mathf.Clamp(offset.magnitude, .30f, 1.5f);
            }
            transform.position = position;
            target = position - grabOffset;
            IsAimingAtMenu = true;
            MoveHandle.color = Color.green;
            rays[draggingHand].SetPosition(0, frame.Ray.origin);
            rays[draggingHand].SetPosition(1, target);
            cursors[draggingHand].position = target;
        }

        private int HitTest(Ray ray, out Vector3 point)
        {
            point = default; var selected = -1; var closest = MaximumDistance;
            for (var i = 0; i < labels.Length; i++)
            {
                var label = labels[i];
                if (label == null || !enabledEntry(i) || !TryHit(label, ray, closest, out var candidate)) continue;
                selected = i; closest = Vector3.Distance(ray.origin, candidate); point = candidate;
            }
            return selected;
        }

        private static bool TryHit(TextMesh label, Ray ray, float maximum, out Vector3 point)
        {
            point = default;
            if (!label.gameObject.activeInHierarchy) return false;
            var plane = new Plane(label.transform.forward, label.transform.position);
            if (!plane.Raycast(ray, out var distance) || distance < .03f || distance > maximum) return false;
            var candidate = ray.GetPoint(distance);
            var local = label.transform.InverseTransformPoint(candidate);
            var bounds = label.GetComponent<MeshRenderer>().localBounds;
            var halfWidth = Mathf.Max(.14f, bounds.extents.x + .02f);
            if (Mathf.Abs(local.x - bounds.center.x) > halfWidth || Mathf.Abs(local.y) > .025f) return false;
            point = candidate; return true;
        }
        private static bool Finite(Vector3 value) => !float.IsNaN(value.sqrMagnitude) && !float.IsInfinity(value.sqrMagnitude);
        public void Cancel()
        {
            generation++; IsAimingAtMenu = false; draggingHand = -1;
            for (var i = 0; i < presses.Length; i++)
            {
                presses[i].Cancel();
                if (rays[i] != null) rays[i].enabled = false;
                if (cursors[i] != null) cursors[i].gameObject.SetActive(false);
            }
        }
        private void OnApplicationPause(bool value) { paused = value; if (value) Cancel(); }
        private void OnApplicationFocus(bool value) { focused = value; if (!value) Cancel(); }
        private void OnDisable() => Cancel();
        private void OnDestroy() { foreach (var material in materials) if (material != null) Destroy(material); }
    }
}
