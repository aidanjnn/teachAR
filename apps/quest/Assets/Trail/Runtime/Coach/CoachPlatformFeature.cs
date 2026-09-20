using System;
using System.Linq;
using Trail.Contracts;
using Trail.Motion;
using Trail.Runtime.Guide;
using Trail.Runtime.Platform;
using Trail.Runtime.Record;
using Trail.Runtime.Shell;
using UnityEngine;

namespace Trail.Runtime.Coach
{
    /// <summary>Mounts native voice without granting it control over learner progression.</summary>
    public sealed class CoachPlatformFeature : MonoBehaviour, IPlatformFeature
    {
        public int Order => 95;
        public NativeVoiceCoach Coach { get; private set; }
        private CaptureReplaySession capture;
        private HandObservationSource subscribed;
        private TextMesh status, captions;
        private readonly TextMesh[] buttons = new TextMesh[3];
        private ShellInteractionState touch = ShellInteraction.Create();
        [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.BeforeSceneLoad)]
        private static void Register() => PlatformFeatures.Register("native-voice", root => root.AddComponent<CoachPlatformFeature>());
        public void Initialize(PlatformContext context)
        {
            var guide = context.Root.GetComponentInChildren<GuideController>(true);
            if (guide == null) throw new InvalidOperationException("Voice requires a guide feature.");
            capture = context.Root.GetComponentInChildren<CaptureReplaySession>(true);
            var root = new GameObject("Native voice coach"); root.transform.SetParent(context.TrackingSpace, false);
            Coach = root.AddComponent<NativeVoiceCoach>(); Coach.Guide = guide; Coach.Connection = context.Connection;
            Coach.InstallNativeAudio(); Coach.Bind();
            var panel = new GameObject("Voice controls"); panel.transform.SetParent(context.TrackingSpace, false);
            panel.transform.localPosition = new Vector3(0, 1.52f, .7f);
            status = Label(panel.transform, "Voice state", new Vector3(0, .1f, 0), .006f);
            captions = Label(panel.transform, "Voice captions", new Vector3(0, -.10f, 0), .0045f);
            for (var i = 0; i < buttons.Length; i++) buttons[i] = Label(panel.transform, "Voice action " + i, new Vector3((i - 1) * .21f, 0, 0), .008f);
        }
        private static TextMesh Label(Transform parent, string name, Vector3 position, float size)
        {
            var child = new GameObject(name); child.transform.SetParent(parent, false); child.transform.localPosition = position;
            var label = child.AddComponent<TextMesh>(); WorldSpaceText.Configure(label);
            label.fontSize = 48; label.characterSize = size; label.anchor = TextAnchor.MiddleCenter; label.color = Color.white;
            return label;
        }
        private void Update()
        {
            if (Coach == null) return;
            var hasGuide = Coach.Guide != null && Coach.Guide.Session != null;
            var audioStatus = Coach.Microphone is UnityCoachMicrophone native ? "\n" + native.CapabilityStatus : "";
            status.text = hasGuide ? Wrap(Coach.Status + audioStatus, 60) : "Load a reviewed tutorial to start voice.";
            var listening = Coach.Session != null && Coach.Session.State.Mode == CoachMode.Listening;
            buttons[0].text = "Start voice"; buttons[1].text = listening ? "Mute" : "Unmute"; buttons[2].text = "End voice";
            for (var i = 0; i < 3; i++) buttons[i].color = Enabled(i) ? Color.white : Color.gray;
            captions.text = Wrap("You: " + Last(Coach.LearnerCaption, 160) + "\nCoach: " + Last(Coach.CoachCaption, 220) + "\nAdvice only; movement controls progress.", 70);
            var source = capture == null ? null : capture.Source;
            if (source != subscribed) { Unbind(); subscribed = source; if (subscribed != null) subscribed.Observed += Observe; }
        }
        private bool Enabled(int index)
        {
            if (Coach == null || Coach.Guide == null || Coach.Guide.Session == null || (capture != null && capture.IsRecording)) return false;
            var state = Coach.Session?.State;
            if (index == 0) return state == null || state.Mode == CoachMode.Idle || state.Mode == CoachMode.Text || state.Mode == CoachMode.Unavailable || state.Mode == CoachMode.Ended;
            if (index == 1) return !Coach.WaitingForInspection && state != null && (state.Mode == CoachMode.Live || state.Mode == CoachMode.Listening) && state.Sync == CoachSync.Idle;
            return state != null;
        }
        public void StartVoice()
        {
            if (!Enabled(0)) return;
            var guide = Coach.Guide;
            var tutorial = guide.ReviewedTutorial;
            if (tutorial == null) return;
            var context = GuideTelemetry.Context(guide.Session);
            Coach.Prepare(new CoachContext(tutorial.Id, tutorial.Revision, context.RunId, context.AttemptId, "Reviewed tutorial",
                tutorial.Steps.Select(step => new CoachStepRef(step.Id, step.Title, step.Instruction)), context.StepId, context.StepRevision));
            Coach.Connect();
        }
        private void Observe(ReferenceObservation observation)
        {
            if (subscribed == null || subscribed.TrackingSpace == null || Coach == null) return;
            var targets = new ShellButton[3];
            for (var i = 0; i < 3; i++) targets[i] = new ShellButton(i.ToString(), Point(buttons[i].transform.position), Enabled(i));
            touch = ShellInteraction.Observe(touch, targets, new ShellTouchSample(observation.TimestampMs, observation.Sequence,
                observation.OriginRevision, subscribed.TrackingSessionId, Tip(observation.Left), Tip(observation.Right)), MotionClock.NowMs);
            if (touch.ConfirmedIndex < 0 || !Enabled(touch.ConfirmedIndex)) return;
            if (touch.ConfirmedIndex == 0) StartVoice();
            else if (touch.ConfirmedIndex == 1) Coach.ToggleListen();
            else Coach.EndConversation();
        }
        private static System.Numerics.Vector3 Point(Vector3 value) => new System.Numerics.Vector3(value.x, value.y, value.z);
        private System.Numerics.Vector3? Tip(HandSample hand)
        {
            if (hand == null || hand.Status != "valid" || hand.Joints == null || !hand.Joints.TryGetValue("index-finger-tip", out var pose)) return null;
            var p = pose.PositionM; return Point(subscribed.TrackingSpace.TransformPoint(new Vector3(p.X, p.Y, -p.Z)));
        }
        private static string Last(string text, int count) => text.Length <= count ? text : text.Substring(text.Length - count);
        private static string Wrap(string text, int columns)
        {
            var result = new System.Text.StringBuilder(); var column = 0;
            foreach (var c in text)
            {
                if (c == '\n') column = 0;
                else if (column >= columns && c == ' ') { result.Append('\n'); column = 0; continue; }
                result.Append(c); column++;
            }
            return result.ToString();
        }
        private void Unbind() { if (subscribed != null) subscribed.Observed -= Observe; subscribed = null; touch = ShellInteraction.Create(); }
        private void OnDisable() { Unbind(); if (Coach != null) Coach.EndConversation(); }
    }
}
