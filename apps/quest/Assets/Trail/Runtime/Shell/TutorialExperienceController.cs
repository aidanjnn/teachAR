using System;
using System.Linq;
using Trail.Contracts;
using Trail.Motion;
using Trail.Runtime.Guide;
using Trail.Runtime.Network;
using Trail.Runtime.Platform;
using Trail.Runtime.Record;
using Trail.Runtime.Storage;
using UnityEngine;

namespace Trail.Runtime.Shell
{
    /// <summary>
    /// The single Create/Follow experience. It owns no progression, no capture and no
    /// storage of its own: every decision is made by the pure <see cref="ShellModel"/>
    /// and every effect is delegated to the existing capture, guide and storage
    /// controllers. <c>GuideReducer</c> remains the sole progression authority.
    /// </summary>
    public sealed class TutorialExperienceController : MonoBehaviour, IPlatformFeature
    {
        // After capture (10), guide (20), scene (30) and storage (40): the shell needs them all.
        public int Order => 90;

        public CaptureReplaySession Capture;
        public GuideController Guide;
        public NativeStorageFeature Storage;
        public NativeApiConnection Connection;

        public ShellRoute Route => state.Route;
        public string Notice { get; private set; } = "";

        private const int Capacity = 8;
        private readonly TextMesh[] labels = new TextMesh[Capacity];
        private TextMesh title, notice;
        private ShellState state = ShellModel.Create();
        private ShellInteractionState touch = ShellInteraction.Create();
        private ShellView view;
        private HandObservationSource subscribed;
        private IDiagnosticPanel[] diagnostics = new IDiagnosticPanel[0];
        private bool diagnosticsApplied;

        [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.BeforeSceneLoad)]
        private static void Register() =>
            PlatformFeatures.Register("tutorial-experience", root => root.AddComponent<TutorialExperienceController>());

        public void Initialize(PlatformContext context)
        {
            Connection = context.Connection;
            Capture = context.Root.GetComponentInChildren<CaptureReplaySession>(true);
            Guide = context.Root.GetComponentInChildren<GuideController>(true);
            Storage = context.Root.GetComponentInChildren<NativeStorageFeature>(true);
            diagnostics = context.Root.GetComponentsInChildren<MonoBehaviour>(true).OfType<IDiagnosticPanel>().ToArray();

            var panel = new GameObject("Trail shell");
            // Parent under tracking space, like every other world-space panel. Parenting to the
            // app root and setting a world position instead inherits the root's rotation rather
            // than the rig's, which rendered the labels at the wrong orientation on device.
            panel.transform.SetParent(context.TrackingSpace, false);
            // Offset to the side, within fingertip reach, matching the existing native panels.
            // Centring it would put the controls between the learner and the mat they are
            // working on; the browser reference reached the same conclusion and added a
            // "move panel" control. Exact placement still needs headset tuning.
            panel.transform.localPosition = new Vector3(.40f, 1.15f, .55f);
            title = Label(panel.transform, "Shell title", new Vector3(0, .18f, 0), .010f);
            notice = Label(panel.transform, "Shell notice", new Vector3(0, .13f, 0), .006f);
            for (var i = 0; i < Capacity; i++)
                labels[i] = Label(panel.transform, "Shell button " + i, new Vector3(0, .04f - i * .06f, 0), .009f);
            ApplyDiagnostics();
        }

        private static TextMesh Label(Transform parent, string name, Vector3 localPosition, float size)
        {
            var child = new GameObject(name);
            child.transform.SetParent(parent, false);
            child.transform.localPosition = localPosition;
            var text = child.AddComponent<TextMesh>();
            text.font = Resources.GetBuiltinResource<Font>("LegacyRuntime.ttf");
            child.GetComponent<MeshRenderer>().sharedMaterial = text.font.material;
            text.fontSize = 48; text.characterSize = size;
            text.anchor = TextAnchor.MiddleCenter; text.color = Color.white;
            return text;
        }

        private ShellConditions Conditions()
        {
            var session = Guide == null ? null : Guide.Session;
            var phase = session == null ? GuidePhase.Preload : session.State.Phase;
            var step = session == null ? null : session.Definition.Steps[session.State.StepIndex];
            var observation = Capture == null ? null : Capture.LatestWorkspaceObservation;
            // Both hands must be genuinely present to place a save position; a cached or
            // missing observation must never look like tracking.
            var tracked = observation != null && observation.Left != null && observation.Right != null &&
                observation.Left.Status == "valid" && observation.Right.Status == "valid" &&
                MotionClock.NowMs - observation.TimestampMs <= ShellInteraction.StallMs;
            return new ShellConditions(
                paired: Connection != null && Connection.State == ConnectionState.Ready,
                isAuthor: Connection != null && Connection.Role == "author",
                calibrated: Capture != null && Capture.Registration != null,
                handsTracked: tracked,
                savePositionSet: Capture != null && Capture.SavePositionSet,
                isRecording: Capture != null && Capture.IsRecording,
                hasLastTake: Capture != null && Capture.LastRecording != null,
                guideLoaded: session != null,
                guideAwaitingExplicitStart: phase == GuidePhase.WaitingStart && step != null && step.RequiresExplicitStart,
                guideActive: phase == GuidePhase.WaitingStart || phase == GuidePhase.Guiding ||
                    phase == GuidePhase.Holding || phase == GuidePhase.TrackingLost || phase == GuidePhase.Showing,
                guidePaused: phase == GuidePhase.Paused,
                guideUserConfirmed: step != null && step.CompletionMode == GuideCompletionMode.UserConfirmed,
                libraryHasEntries: Storage != null && Storage.HasReadyGuides,
                recordingPaused: Capture != null && Capture.Authoring.Phase == RecordingPhase.Paused,
                choosingSavePosition: Capture != null && Capture.Authoring.Phase == RecordingPhase.ChoosingSaveZone);
        }

        private void Update()
        {
            if (title == null) return;
            var conditions = Conditions();
            view = ShellModel.Describe(state, conditions);
            Notice = view.Notice;
            title.text = view.Title;
            // The reducer's own status stays visible underneath; the shell never restates progress itself.
            notice.text = view.Notice + (state.Route == ShellRoute.Create && Storage != null ? "\n" + Storage.Status : "") + (Capture != null && (state.Route == ShellRoute.Create || state.Route == ShellRoute.Settings) ? "\n" + Capture.Status : "") + (Guide != null && Guide.Session != null ? "\n" + Guide.Status : "");
            for (var i = 0; i < Capacity; i++)
            {
                var present = i < view.Entries.Count;
                labels[i].gameObject.SetActive(present);
                if (!present) continue;
                var entry = view.Entries[i];
                var marker = touch.TouchingIndex == i ? (touch.Touch == ShellTouch.Armed ? "◉ " : "◍ ") : "● ";
                labels[i].text = marker + entry.Label + (entry.Enabled ? "" : "   — " + entry.Reason);
                labels[i].color = entry.Enabled ? Color.white : Color.gray;
            }
            var source = Capture == null ? null : Capture.Source;
            if (source != subscribed)
            {
                Unsubscribe(); subscribed = source;
                if (subscribed != null) subscribed.Observed += Observe;
            }
            if (state.DiagnosticsVisible != diagnosticsApplied) ApplyDiagnostics();
        }

        private void Observe(ReferenceObservation observation)
        {
            if (view == null || subscribed == null || subscribed.TrackingSpace == null) return;
            // Only labels that actually exist can be touched; the view never exceeds the pool,
            // but clamping keeps a future longer route from indexing past it.
            var buttons = new ShellButton[Math.Min(view.Entries.Count, Capacity)];
            for (var i = 0; i < buttons.Length; i++)
                buttons[i] = new ShellButton(view.Entries[i].Command.ToString(), Point(labels[i].transform.position), view.Entries[i].Enabled);
            var next = ShellInteraction.Observe(touch, buttons, new ShellTouchSample(
                observation.TimestampMs, observation.Sequence, observation.OriginRevision, subscribed.TrackingSessionId,
                Tip(observation.Left), Tip(observation.Right)), MotionClock.NowMs);
            touch = next;
            if (next.ConfirmedIndex >= 0 && next.ConfirmedIndex < view.Entries.Count)
                Dispatch(view.Entries[next.ConfirmedIndex].Command);
        }

        // The interaction model compares points in one space; Unity world space is that space here.
        private static System.Numerics.Vector3 Point(Vector3 world) => new System.Numerics.Vector3(world.x, world.y, world.z);

        private System.Numerics.Vector3? Tip(HandSample hand)
        {
            if (hand == null || hand.Status != "valid" || hand.Joints == null ||
                !hand.Joints.TryGetValue("index-finger-tip", out var pose)) return null;
            var p = pose.PositionM;
            var world = subscribed.TrackingSpace.TransformPoint(new Vector3(p.X, p.Y, -p.Z));
            return Point(world);
        }

        private void Dispatch(ShellCommand command)
        {
            var conditions = Conditions();
            // Re-check against fresh conditions. A control is armed by holding and fired by
            // withdrawing, so the world can change in between; a control that is no longer
            // offered must not act.
            if (!ShellModel.Describe(state, conditions).Entries.Any(e => e.Command == command && e.Enabled)) return;
            var next = ShellModel.Apply(state, command, conditions);
            // Changing route cancels any pending touch so a later withdrawal cannot land on
            // whichever control happens to occupy that slot on the next screen.
            if (next.Route != state.Route || next.DiagnosticsVisible != state.DiagnosticsVisible)
                touch = ShellInteraction.Cancel(touch);
            state = next;
            switch (command)
            {
                case ShellCommand.SetSavePosition: Capture?.BeginSavePosition(); break;
                case ShellCommand.ChangeSavePosition: Capture?.BeginSavePosition(); break;
                case ShellCommand.DiscardTake: Capture?.DiscardRecording(); break;
                case ShellCommand.PauseRecording: Capture?.PauseRecording(); break;
                case ShellCommand.ResumeRecording: Capture?.ResumeRecording(); break;
                case ShellCommand.ReRecordTake: if (Capture != null) Capture.ReRecordTake(Capture.Authoring.LastTakeIndex); break;
                case ShellCommand.NewTutorial: Capture?.NewTutorial(); break;
                case ShellCommand.CancelSavePosition: Capture?.CancelSavePosition(); break;
                case ShellCommand.StartRecording: if (Capture != null) Capture.StartRecording(120000); break;
                case ShellCommand.StopRecording: if (Capture != null) Capture.StopRecording(); break;
                case ShellCommand.Calibrate: if (Capture != null) Capture.BeginCalibration(); break;
                case ShellCommand.SampleMark: if (Capture != null) Capture.BeginMark(); break;
                case ShellCommand.RecenterWorkspace: if (Capture != null) Capture.Invalidate("Mat moved"); break;
                case ShellCommand.UploadLastCapture: if (Storage != null) Storage.UploadLastCapture(); break;
                case ShellCommand.RefreshLibrary: if (Storage != null) Storage.RefreshLibrary(); break;
                case ShellCommand.NextGuide: if (Storage != null) Storage.NextGuide(); break;
                case ShellCommand.PreloadSelected: if (Storage != null) Storage.PreloadSelected(); break;
                case ShellCommand.StartStep: if (Guide != null) Guide.StartStep(); break;
                case ShellCommand.Repeat: if (Guide != null) Guide.Repeat(); break;
                case ShellCommand.Pause: if (Guide != null) Guide.Pause(); break;
                case ShellCommand.Resume: if (Guide != null) Guide.Resume(); break;
                case ShellCommand.ConfirmStep: if (Guide != null) Guide.ConfirmStep(); break;
            }
        }

        private void ApplyDiagnostics()
        {
            diagnosticsApplied = state.DiagnosticsVisible;
            foreach (var panel in diagnostics)
                if (panel != null) panel.SetPanelVisible(diagnosticsApplied);
        }

        private void Unsubscribe()
        {
            if (subscribed != null) subscribed.Observed -= Observe;
            subscribed = null;
            touch = ShellInteraction.Cancel(touch);
        }

        // A pending touch can never survive losing focus, being paused or being torn down.
        private void Suspend() => touch = ShellInteraction.Cancel(touch);
        private void OnApplicationPause(bool paused) { if (paused) Suspend(); }
        private void OnApplicationFocus(bool focused) { if (!focused) Suspend(); }
        private void OnDisable() => Unsubscribe();
    }
}
