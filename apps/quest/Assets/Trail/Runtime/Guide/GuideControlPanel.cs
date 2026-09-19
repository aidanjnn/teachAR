using System;
using Trail.Motion;
using Trail.Runtime.Record;
using UnityEngine;

namespace Trail.Runtime.Guide
{
    // World-space touch controls. A controller interaction adapter may call the same public actions.
    public sealed class GuideControlPanel : MonoBehaviour
    {
        public GuideController Guide;
        private TextMesh status;
        private readonly TextMesh[] buttons = new TextMesh[5];
        private HandObservationSource source;
        private int touching = -1;
        private double startedMs, lastSampleMs = -1;
        private long lastSequence = -1;
        private bool latched;
        private readonly string[] labels = { "Start", "Repeat", "Pause", "Resume", "I completed this step" };
        private void Start()
        {
            status = Label("Guide status", new Vector3(0, .15f, 0), .006f);
            for (var i = 0; i < labels.Length; i++) buttons[i] = Label(labels[i], new Vector3(0, -.06f * i, 0), .008f);
        }
        private TextMesh Label(string label, Vector3 position, float size)
        {
            var child = new GameObject(label); child.transform.SetParent(transform, false); child.transform.localPosition = position;
            var text = child.AddComponent<TextMesh>(); text.fontSize = 48; text.characterSize = size; text.anchor = TextAnchor.MiddleLeft;
            text.font = Resources.GetBuiltinResource<Font>("LegacyRuntime.ttf");
            child.GetComponent<MeshRenderer>().sharedMaterial = text.font.material;
            text.color = Color.white; text.text = "● " + label; return text;
        }
        private void Update()
        {
            if (Guide == null || status == null) return;
            var nextSource = Guide.Capture == null ? null : Guide.Capture.Source;
            if (nextSource != source) { Unsubscribe(); source = nextSource; if (source != null) source.Observed += Observe; }
            if (MotionClock.NowMs - lastSampleMs > 100) ResetTouch();
            var session = Guide.Session;
            status.text = session == null ? Guide.Status : "TRAIL • " + (session.Definition.Source == GuideSource.NativeHands ? "native hands" : "SYNTHETIC DIAGNOSTIC") +
                "\nExpert motion: " + Guide.ExpertSource + "\n" + session.Definition.Steps[session.State.StepIndex].Instruction + "\n" + Guide.Status + "\n" + Guide.LastCompletion +
                "\n" + (session.Definition.Steps[session.State.StepIndex].CompletionMode == GuideCompletionMode.UserConfirmed ? "USER-CONFIRMED • no automatic movement verification" : "Movement checkpoints only • not assembly verification");
            for (var i = 0; i < buttons.Length; i++) buttons[i].color = Available(i) ? Color.white : Color.gray;
        }
        private bool Available(int button)
        {
            var s = Guide?.Session; if (s == null) return false;
            var phase = s.State.Phase; var step = s.Definition.Steps[s.State.StepIndex];
            switch (button)
            {
                case 0: return phase == GuidePhase.WaitingStart && step.RequiresExplicitStart;
                case 1: return s.State.Calibrated;
                case 2: return phase == GuidePhase.Showing || phase == GuidePhase.WaitingStart || phase == GuidePhase.Guiding || phase == GuidePhase.Holding || phase == GuidePhase.TrackingLost;
                case 3: return phase == GuidePhase.Paused;
                case 4: return step.CompletionMode == GuideCompletionMode.UserConfirmed && (phase == GuidePhase.Guiding || phase == GuidePhase.Holding || phase == GuidePhase.TrackingLost);
                default: return false;
            }
        }
        private void Observe(ReferenceObservation observation)
        {
            if (buttons[0] == null || source == null || source.TrackingSpace == null || observation.OriginRevision != source.OriginRevision ||
                observation.Sequence <= lastSequence || observation.TimestampMs <= lastSampleMs || MotionClock.NowMs - observation.TimestampMs > 100)
            { ResetTouch(); return; }
            if (observation.TimestampMs - lastSampleMs > 100) ResetTouch();
            lastSequence = observation.Sequence; lastSampleMs = observation.TimestampMs;
            var selected = -1;
            foreach (var hand in new[] { observation.Left, observation.Right })
            {
                if (hand == null || hand.Status != "valid" || hand.Joints == null || !hand.Joints.TryGetValue("index-finger-tip", out var pose)) continue;
                var p = pose.PositionM; var world = source.TrackingSpace.TransformPoint(new Vector3(p.X, p.Y, -p.Z));
                for (var i = 0; i < buttons.Length; i++) if (Available(i) && Vector3.Distance(world, buttons[i].transform.position) <= .025f) { selected = i; break; }
                if (selected >= 0) break;
            }
            if (selected < 0) { ResetTouch(); return; }
            if (touching != selected) { touching = selected; startedMs = observation.TimestampMs; latched = false; }
            if (latched || observation.TimestampMs - startedMs < 600) return;
            latched = true;
            switch (selected) { case 0: Guide.StartStep(); break; case 1: Guide.Repeat(); break; case 2: Guide.Pause(); break; case 3: Guide.Resume(); break; case 4: Guide.ConfirmStep(); break; }
        }
        private void ResetTouch() { touching = -1; latched = false; }
        private void Unsubscribe() { if (source != null) source.Observed -= Observe; source = null; lastSequence = -1; lastSampleMs = -1; ResetTouch(); }
        private void OnDisable() => Unsubscribe();
    }
}
