using Trail.Contracts;
using Trail.Motion;
using Trail.Runtime.Record;
using UnityEngine;

namespace Trail.Runtime.Scene
{
    /// <summary>World-space native fingertip controls. No controller or synthetic input fallback.</summary>
    public sealed class InspectionControlPanel : MonoBehaviour
    {
        public SceneInspectionController Inspection;
        private TextMesh status;
        private readonly TextMesh[] buttons = new TextMesh[3];
        private HandObservationSource source;
        private int touching = -1;
        private double since, lastTime = -1;
        private long lastSequence = -1;
        private bool latched;
        private void Start()
        {
            status = Label("Scene inspection", new Vector3(0, .18f, 0), .004f);
            string[] labels = { "Enable camera", "Check placement / Retry", "Cancel inspection" };
            for (int i = 0; i < labels.Length; i++) buttons[i] = Label(labels[i], new Vector3(0, -.06f * i, 0), .006f);
        }
        private TextMesh Label(string text, Vector3 position, float size)
        {
            var go = new GameObject(text); go.transform.SetParent(transform, false); go.transform.localPosition = position;
            var label = go.AddComponent<TextMesh>(); label.text = text; label.fontSize = 48; label.characterSize = size;
            label.anchor = TextAnchor.MiddleLeft; return label;
        }
        private void Update()
        {
            if (Inspection == null) return;
            status.text = "Camera: " + Inspection.CameraSource.Status + "\n" + Inspection.Status;
            var next = Inspection.Guide?.Capture?.Source;
            if (next != source) { Detach(); source = next; if (source != null) source.Observed += Observe; }
            if (MotionClock.NowMs - lastTime > 100) ResetTouch();
        }
        private void Observe(ReferenceObservation frame)
        {
            if (buttons[0] == null || source == null || source.TrackingSpace == null || frame.OriginRevision != source.OriginRevision ||
                frame.Sequence <= lastSequence || frame.TimestampMs <= lastTime || MotionClock.NowMs - frame.TimestampMs > 100)
            { ResetTouch(); return; }
            if (frame.TimestampMs - lastTime > 100) ResetTouch();
            lastTime = frame.TimestampMs; lastSequence = frame.Sequence;
            int selected = -1;
            foreach (HandSample hand in new[] { frame.Left, frame.Right })
            {
                if (hand == null || hand.Status != "valid" || hand.Joints == null || !hand.Joints.TryGetValue("index-finger-tip", out var pose)) continue;
                var p = pose.PositionM; var world = source.TrackingSpace.TransformPoint(new Vector3(p.X, p.Y, -p.Z));
                for (int i = 0; i < buttons.Length; i++) if (Vector3.Distance(world, buttons[i].transform.position) <= .025f) { selected = i; break; }
                if (selected >= 0) break;
            }
            if (selected < 0) { ResetTouch(); return; }
            if (selected != touching) { touching = selected; since = frame.TimestampMs; latched = false; }
            if (latched || frame.TimestampMs - since < 600) return;
            latched = true;
            if (selected == 0) Inspection.CameraSource.EnableCamera();
            if (selected == 1) Inspection.CheckPlacement();
            if (selected == 2) Inspection.Cancel();
        }
        private void ResetTouch() { touching = -1; latched = false; }
        private void Detach() { if (source != null) source.Observed -= Observe; source = null; lastSequence = -1; lastTime = -1; ResetTouch(); }
        private void OnDisable() => Detach();
    }
}
