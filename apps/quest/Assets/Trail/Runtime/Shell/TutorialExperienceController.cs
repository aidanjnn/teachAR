using System;
using System.Linq;
using System.Text;
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

        // Authoring save-zone hooks. The capture feature assigns these once save-zone
        // authoring is installed; until then Create truthfully reports no save position,
        // which blocks recording rather than inventing a workspace point.
        public Func<bool> SavePositionSet = () => false;
        public Action SetSavePosition, ChangeSavePosition, DiscardTake;

        public ShellRoute Route => state.Route;
        public string Notice { get; private set; } = "";

        private const int Capacity = 8;
        private readonly TextMesh[] labels = new TextMesh[Capacity];
        private readonly TextMesh[] reasons = new TextMesh[Capacity];
        private TextMesh title, notice, hint;
        private Transform menu;
        private Camera head;
        private bool menuPlaced, paused, focused = true;
        private double lastTouchSampleMs = -1;
        private int headReadyFrames;
        private float headReadySince = -1;
        public Func<bool> HeadPoseReadyForPlacement;
        private ShellState state = ShellModel.Create();
        private ShellInteractionState touch = ShellInteraction.Create();
        private ShellView view;
        private HandObservationSource subscribed;
        private IDiagnosticPanel[] diagnostics = new IDiagnosticPanel[0];
        private bool diagnosticsApplied;
        private NativeShellPointer pointer;
        private int dispatchedFrame = -1;

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
            menu = panel.transform;
            head = context.HeadCamera;
            // Bootstrap initializes features before activating the rig. Wait for an actual
            // tracked head pose rather than placing the menu at the room origin.
            menuPlaced = head == null; // Headless synthetic fixtures retain a stable local panel.
            panel.transform.localPosition = new Vector3(0, 1.15f, .5f);
            title = Label(panel.transform, "Shell title", new Vector3(0, .18f, 0), .010f);
            notice = Label(panel.transform, "Shell notice", new Vector3(0, .15f, 0), .006f);
            notice.anchor = TextAnchor.UpperCenter;
            for (var i = 0; i < Capacity; i++)
            {
                labels[i] = Label(panel.transform, "Shell button " + i, new Vector3(0, .04f - i * .06f, 0), .009f);
                reasons[i] = Label(panel.transform, "Shell reason " + i, new Vector3(0, .016f - i * .06f, 0), .004f);
                reasons[i].color = new Color(.75f, .75f, .75f);
            }
            hint = Label(panel.transform, "Shell input hint", new Vector3(0, .075f, 0), .005f);
            hint.text = "Point and pinch, or touch, hold, then pull back";
            pointer = panel.AddComponent<NativeShellPointer>();
            pointer.Initialize(context.TrackingSpace, labels,
                index => view != null && index < view.Entries.Count && view.Entries[index].Enabled,
                index => { if (view != null && index < view.Entries.Count) Dispatch(view.Entries[index].Command); });
            pointer.MoveHandle = Label(panel.transform, "Shell move handle", new Vector3(0, .25f, 0), .0045f);
            pointer.MoveHandle.text = "— Move panel —\nPinch and hold to drag";
            pointer.Head = head == null ? null : head.transform;
            panel.SetActive(menuPlaced);
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

        private static string WrapNotice(string text)
        {
            var result = new StringBuilder();
            foreach (var paragraph in text.Split('\n'))
            {
                if (result.Length > 0) result.Append('\n');
                var column = 0;
                foreach (var word in paragraph.Split(new[] { ' ' }, StringSplitOptions.RemoveEmptyEntries))
                {
                    if (column > 0 && column + 1 + word.Length > 44)
                    { result.Append('\n'); column = 0; }
                    if (column > 0) { result.Append(' '); column++; }
                    result.Append(word); column += word.Length;
                }
            }
            return result.ToString();
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
                savePositionSet: SavePositionSet != null && SavePositionSet(),
                isRecording: Capture != null && Capture.IsRecording,
                hasLastTake: Capture != null && Capture.LastRecording != null,
                guideLoaded: session != null,
                guideAwaitingExplicitStart: phase == GuidePhase.WaitingStart && step != null && step.RequiresExplicitStart,
                guideActive: phase == GuidePhase.WaitingStart || phase == GuidePhase.Guiding ||
                    phase == GuidePhase.Holding || phase == GuidePhase.TrackingLost || phase == GuidePhase.Showing,
                guidePaused: phase == GuidePhase.Paused,
                guideUserConfirmed: step != null && step.CompletionMode == GuideCompletionMode.UserConfirmed,
                libraryHasEntries: Storage != null && Storage.HasReadyGuides);
        }

        private void Update()
        {
            if (title == null) return;
            if (!menuPlaced && head != null)
            {
                var ready = !paused && focused && head.isActiveAndEnabled &&
                    (HeadPoseReadyForPlacement != null ? HeadPoseReadyForPlacement() : HeadReady());
                headReadyFrames = ready ? headReadyFrames + 1 : 0;
                if (!ready) headReadySince = -1;
                else if (headReadySince < 0) headReadySince = Time.realtimeSinceStartup;
                // The rig and stage reference space initialize over several frames.
                // Use the current worn/tracked pose after a short settling interval.
                if (headReadyFrames >= 2 && Time.realtimeSinceStartup - headReadySince >= .5f) PlaceMenuInFront();
            }
            if (touch.Touch != ShellTouch.Idle && MotionClock.NowMs - lastTouchSampleMs > ShellInteraction.StallMs)
                Suspend();
            var conditions = Conditions();
            view = ShellModel.Describe(state, conditions);
            Notice = view.Notice;
            title.text = view.Title;
            // The reducer's own status stays visible underneath; the shell never restates progress itself.
            notice.text = WrapNotice(view.Notice + (Guide != null && Guide.Session != null ? "\n" + Guide.Status : ""));
            var extraNoticeHeight = Mathf.Max(0, notice.text.Count(c => c == '\n') - 2) * .022f;
            hint.transform.localPosition = new Vector3(0, .075f - extraNoticeHeight, 0);
            for (var i = 0; i < Capacity; i++)
            {
                var present = i < view.Entries.Count;
                labels[i].gameObject.SetActive(present);
                reasons[i].gameObject.SetActive(present);
                if (!present) continue;
                var entry = view.Entries[i];
                var marker = touch.TouchingIndex == i ? (touch.Touch == ShellTouch.Armed ? "◉ " : "◍ ") : "● ";
                labels[i].transform.localPosition = new Vector3(0, .04f - i * .06f - extraNoticeHeight, 0);
                labels[i].text = marker + entry.Label;
                reasons[i].transform.localPosition = labels[i].transform.localPosition - Vector3.up * .024f;
                reasons[i].text = entry.Enabled ? "" : WrapNotice(entry.Reason);
                labels[i].color = !entry.Enabled ? Color.gray : touch.TouchingIndex == i
                    ? (touch.Touch == ShellTouch.Armed ? Color.green : Color.cyan) : Color.white;
            }
            hint.text = touch.Touch == ShellTouch.Armed ? "Pull your finger back to select"
                : touch.Touch == ShellTouch.Touching ? "Hold still until green, then pull back"
                : "Point and pinch, or touch, hold, then pull back";
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
            if (paused || !focused || view == null || subscribed == null || subscribed.TrackingSpace == null) return;
            if (pointer != null && pointer.IsDragging)
            {
                touch = ShellInteraction.Cancel(touch);
                pointer.DirectTouchActive = false;
                return;
            }
            // Only labels that actually exist can be touched; the view never exceeds the pool,
            // but clamping keeps a future longer route from indexing past it.
            var buttons = new ShellButton[Math.Min(view.Entries.Count, Capacity)];
            for (var i = 0; i < buttons.Length; i++)
            {
                var label = labels[i].transform;
                var bounds = labels[i].GetComponent<MeshRenderer>().localBounds;
                buttons[i] = new ShellButton(view.Entries[i].Command.ToString(),
                    Point(label.TransformPoint(new Vector3(bounds.center.x, 0, 0))), view.Entries[i].Enabled,
                    Mathf.Max(.14f, bounds.extents.x) * label.lossyScale.x, Point(label.right));
            }
            var next = ShellInteraction.Observe(touch, buttons, new ShellTouchSample(
                observation.TimestampMs, observation.Sequence, observation.OriginRevision, subscribed.TrackingSessionId,
                Tip(observation.Left), Tip(observation.Right)), MotionClock.NowMs);
            touch = next;
            lastTouchSampleMs = observation.TimestampMs;
            if (pointer != null) pointer.DirectTouchActive = next.Touch != ShellTouch.Idle;
            if (next.ConfirmedIndex >= 0 && next.ConfirmedIndex < view.Entries.Count)
                Dispatch(view.Entries[next.ConfirmedIndex].Command);
        }

        private static bool HeadReady()
        {
            if (Application.isEditor) return true;
            var device = UnityEngine.XR.InputDevices.GetDeviceAtXRNode(UnityEngine.XR.XRNode.Head);
            if (!device.TryGetFeatureValue(UnityEngine.XR.CommonUsages.isTracked, out var tracked) || !tracked) return false;
            return !device.TryGetFeatureValue(UnityEngine.XR.CommonUsages.userPresence, out var worn) || worn;
        }

        public void PlaceMenuInFront()
        {
            if (menu == null || head == null) return;
            var forward = Vector3.ProjectOnPlane(head.transform.forward, Vector3.up);
            if (forward.sqrMagnitude < .01f) return;
            forward.Normalize();
            menu.SetPositionAndRotation(head.transform.position + forward * .5f - Vector3.up * .20f,
                Quaternion.LookRotation(forward, Vector3.up));
            menuPlaced = true;
            menu.gameObject.SetActive(true);
            Suspend();
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
            if (dispatchedFrame == Time.frameCount) return;
            var conditions = Conditions();
            // Re-check conditions when either touch or point-and-pinch confirms. State
            // can change after the labels were rendered; a control that is no longer
            // offered must not act.
            if (!ShellModel.Describe(state, conditions).Entries.Any(e => e.Command == command && e.Enabled)) return;
            dispatchedFrame = Time.frameCount;
            if (pointer != null) pointer.Cancel();
            var next = ShellModel.Apply(state, command, conditions);
            // Changing route cancels any pending touch so a later withdrawal cannot land on
            // whichever control happens to occupy that slot on the next screen.
            if (next.Route != state.Route || next.DiagnosticsVisible != state.DiagnosticsVisible)
                touch = ShellInteraction.Cancel(touch);
            state = next;
            switch (command)
            {
                case ShellCommand.SetSavePosition: if (SetSavePosition != null) SetSavePosition(); break;
                case ShellCommand.ChangeSavePosition: if (ChangeSavePosition != null) ChangeSavePosition(); break;
                case ShellCommand.DiscardTake: if (DiscardTake != null) DiscardTake(); break;
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
            Suspend();
        }

        // A pending touch can never survive losing focus, being paused or being torn down.
        private void Suspend()
        {
            touch = ShellInteraction.Cancel(touch);
            if (pointer != null) { pointer.DirectTouchActive = false; pointer.Cancel(); }
        }
        private void LoseFocus()
        {
            Suspend(); headReadyFrames = 0; headReadySince = -1;
            menuPlaced = head == null || (pointer != null && pointer.HasBeenMoved);
            if (menu != null) menu.gameObject.SetActive(menuPlaced);
        }
        private void OnApplicationPause(bool value) { paused = value; if (value) LoseFocus(); }
        private void OnApplicationFocus(bool value) { focused = value; if (!value) LoseFocus(); }
        private void OnDisable() => Unsubscribe();
    }
}
