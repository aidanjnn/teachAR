using System;
using Trail.Motion;
using Trail.Runtime.Record;
using UnityEngine;

namespace Trail.Presentation
{
    // World-space controls activate after a fresh index tip touches a label for 0.6 s, then withdraws.
    // The same public methods can be bound to a platform controller UI; controllers never provide capture poses.
    public sealed class CaptureControlPanel : MonoBehaviour
    {
        public CaptureReplaySession Session;
        public GhostPresentation Ghost;
        private TextMesh status;
        private readonly TextMesh[] buttons = new TextMesh[7];
        private Action[] actions;
        private int touching = -1;
        private double touchStarted;
        private bool latched;
        private HandObservationSource subscribed;
        private void Start()
        {
            status = Label("Status", new Vector3(-.32f, .16f, 0), .007f);
            var titles = new[] { "Calibrate / retry", "Sample mark", "Record 5 seconds", "Record up to 120s / stop", "Replay / stop", "Mat moved", "Skeleton / ghost" };
            actions = new Action[] { () => Session.BeginCalibration(), () => Session.BeginMark(), () => Session.StartRecording(),
                () => { if (Session.IsRecording) Session.StopRecording(); else Session.StartRecording(120000); },
                () => { if (Session.IsReplaying) Session.StopReplay(); else Session.StartReplay(); },
                () => Session.Invalidate("Mat moved"), () => { if (Ghost != null) Ghost.DiagnosticSkeleton = !Ghost.DiagnosticSkeleton; } };
            for (var i = 0; i < titles.Length; i++)
            {
                buttons[i] = Label(titles[i], new Vector3(-.28f, .04f - i * .055f, 0), .009f);
                buttons[i].text = "● " + titles[i];
            }
        }
        private TextMesh Label(string label, Vector3 position, float size)
        {
            var child = new GameObject(label); child.transform.SetParent(transform, false); child.transform.localPosition = position;
            var text = child.AddComponent<TextMesh>();
            text.font = Resources.GetBuiltinResource<Font>("LegacyRuntime.ttf");
            child.GetComponent<MeshRenderer>().sharedMaterial = text.font.material;
            text.fontSize = 48; text.characterSize = size;
            text.anchor = TextAnchor.MiddleLeft; text.color = Color.white; return text;
        }
        private void Update()
        {
            if (Session == null || status == null) return;
            status.text = "TRAIL • " + Session.SourceLabel + "\n" + Session.Status + "\nSample stability " + (Session.MarkProgress * 100).ToString("F0") + "% • opposite hand: touch a dot, then withdraw";
            if (subscribed != Session.Source)
            {
                Unsubscribe(); subscribed = Session.Source;
                if (subscribed != null) subscribed.Observed += OnObservation;
            }
            if (touching >= 0 && MotionClock.NowMs - lastSeenMs > 100) ResetTouch();
        }
        private double lastSeenMs;
        private void OnObservation(ReferenceObservation observation)
        {
            if (Session == null || Session.Source == null || Session.Source.TrackingSpace == null || buttons[0] == null) return;
            var hand = Session.UseLeftHand ? observation.Right : observation.Left;
            if (hand.Status != "valid") { ResetTouch(); return; }
            var tip = hand.Joints["index-finger-tip"].PositionM;
            var world = Session.Source.TrackingSpace.TransformPoint(new Vector3(tip.X, tip.Y, -tip.Z));
            var selected = -1;
            for (var i = 0; i < buttons.Length; i++) if (Vector3.Distance(world, buttons[i].transform.position) < .025f) { selected = i; break; }
            if (observation.TimestampMs - lastSeenMs > 100 || observation.TimestampMs <= lastSeenMs) ResetTouch();
            lastSeenMs = observation.TimestampMs;
            if (selected != touching)
            {
                // Only a fresh, tracked withdrawal from an armed label confirms; loss, stalls or drift cancel instead.
                var armed = latched && selected < 0 ? touching : -1;
                ResetTouch();
                if (selected >= 0) { touching = selected; touchStarted = observation.TimestampMs; }
                if (armed >= 0) actions[armed]();
                return;
            }
            if (touching >= 0 && !latched && observation.TimestampMs - touchStarted >= 600) { latched = true; buttons[touching].text = "◉ " + buttons[touching].name; }
        }
        private void ResetTouch()
        {
            if (touching >= 0 && buttons[touching] != null) buttons[touching].text = "● " + buttons[touching].name;
            touching = -1; latched = false;
        }
        private void Unsubscribe() { if (subscribed != null) subscribed.Observed -= OnObservation; subscribed = null; ResetTouch(); }
        private void OnDisable() => Unsubscribe();
    }
}
