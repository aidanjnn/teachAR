using System;
using System.Collections;
using System.IO;
using System.Linq;
using System.Reflection;
using System.Text;
using NUnit.Framework;
using Trail.Contracts;
using Trail.Motion;
using Trail.Presentation;
using Trail.Runtime.Guide;
using Trail.Runtime.Network;
using Trail.Runtime.Platform;
using Trail.Runtime.Record;
using Trail.Runtime.Shell;
using Trail.Runtime.Storage;
using UnityEngine;
using UnityEngine.TestTools;
using Object = UnityEngine.Object;
using NVector3 = System.Numerics.Vector3;
using NQuaternion = System.Numerics.Quaternion;

namespace Trail.Tests
{
    // Controlled samples carrying the native source tag exercise routing, not device tracking.
    public sealed class ShellFeedbackSource : HandObservationSource
    {
        public override string SourceKind => "live";
        public override string Availability => "injected shell test";
        public void Emit(double now, long sequence, HandSample hand) =>
            Publish(new ReferenceObservation(now, sequence, OriginRevision, SourceKind, MotionSamples.Missing(), hand));
        public static HandSample At(NVector3 point) => new HandSample { Status = "valid",
            Joints = JointNames.Canonical.ToDictionary(n => n, _ => new CanonicalPose(point, NQuaternion.Identity)) };
    }

    public sealed class ShellFeedbackTests
    {
        private static object Invoke(object owner, string method, params object[] args) =>
            owner.GetType().GetMethod(method, BindingFlags.Instance | BindingFlags.NonPublic).Invoke(owner, args);
        private static void SetField(object owner, string field, object value) =>
            owner.GetType().GetField(field, BindingFlags.Instance | BindingFlags.NonPublic).SetValue(owner, value);
        private sealed class EmptyPointers : IShellPointerSource
        { public ShellPointerFrame Read(bool left) => default; }
        private sealed class Fixture : IDisposable
        {
            public readonly string PathRoot = Path.Combine(Path.GetTempPath(), "trail-shell-feedback-" + Guid.NewGuid().ToString("N"));
            public readonly GameObject Root;
            public readonly CaptureReplaySession Capture;
            public readonly GuideController Guide;
            public readonly NativeStorageFeature Storage;
            public readonly NativeApiConnection Connection;
            public readonly TutorialExperienceController Shell;
            public readonly ShellFeedbackSource Source;
            public readonly Recording Recording;
            public readonly Tutorial Tutorial;
            public readonly TextMesh Text, Title, FirstButton;
            public readonly GameObject Diagnostic;
            public double Now;
            private long sequence;
            public Fixture(bool savedCapture = false)
            {
                var fixtures = Path.GetFullPath(Path.Combine(Application.dataPath, "../../../fixtures/contracts"));
                var bytes = File.ReadAllBytes(Path.Combine(fixtures, "recording.json"));
                Recording = ContractJson.ParseRecording(Encoding.UTF8.GetString(bytes));
                Tutorial = ContractJson.ParseTutorial(File.ReadAllText(Path.Combine(fixtures, "tutorial.json")));
                Tutorial.Id = Guid.NewGuid().ToString("D");
                Tutorial.RecordingHash = PrivateTutorialCache.Hash(bytes);
                Tutorial.Steps[0].Instruction = "Place the sleeve over the collar, keep its opening facing you, then check that the two edges line up before confirming this step.";
                Tutorial.Steps[0].CompletionMode = "user-confirmed";
                var cache = new PrivateTutorialCache(PathRoot);
                cache.StoreReady(Encoding.UTF8.GetBytes(ContractJson.SerializeTutorial(Tutorial)), bytes, Tutorial.RecordingHash);
                if (savedCapture) cache.SaveCapture(Recording);
                Root = new GameObject("shell feedback test"); Root.SetActive(false);
                Source = Root.AddComponent<ShellFeedbackSource>(); Source.TrackingSpace = Root.transform;
                Capture = Root.AddComponent<CaptureReplaySession>(); Capture.Source = Source; Capture.Clock = () => Now;
                Capture.WidthM = (float)Recording.Workspace.WidthM; Capture.DepthM = (float)Recording.Workspace.DepthM;
                var ghost = Root.AddComponent<GhostPresentation>(); ghost.Session = Capture;
                Guide = Root.AddComponent<GuideController>(); Guide.Capture = Capture; Guide.Ghost = ghost; Guide.Clock = () => Now;
                Connection = Root.AddComponent<NativeApiConnection>();
                Storage = Root.AddComponent<NativeStorageFeature>();
                Invoke(Storage, "RestorePrivateStorage", PathRoot);
                SetField(Storage, "guide", Guide); SetField(Storage, "connection", Connection);
                Diagnostic = new GameObject("hidden guide diagnostics"); Diagnostic.transform.SetParent(Root.transform);
                Diagnostic.AddComponent<GuideControlPanel>().Guide = Guide;
                Shell = Root.AddComponent<TutorialExperienceController>();
                Shell.Initialize(new PlatformContext(Root, Root.transform, null, Connection));
                var panel = Root.transform.Find("Trail shell");
                panel.GetComponent<NativeShellPointer>().Source = new EmptyPointers();
                Text = panel.Find("Shell notice").GetComponent<TextMesh>();
                Title = panel.Find("Shell title").GetComponent<TextMesh>();
                FirstButton = panel.Find("Shell button 0").GetComponent<TextMesh>();
                Root.SetActive(true);
            }
            public void Command(ShellCommand command) => Invoke(Shell, "Dispatch", command);
            public void Emit(HandSample hand) { Now += 40; Source.Emit(Now, ++sequence, hand); }
            public void Mark(NVector3 point) { Capture.BeginMark(); for (var i = 0; i <= 10; i++) Emit(ShellFeedbackSource.At(point)); }
            public void Calibrate()
            {
                Capture.BeginCalibration(); var m = Recording.Workspace.CalibrationMarksM;
                foreach (var p in new[] { m.A, m.B, m.C, m.D }) Mark(p);
            }
            public void AssertFeedback(string expected)
            {
                Assert.That(Shell.Notice, Does.Contain(expected));
                Assert.That(Text.text.Replace("\n", " "), Does.Contain(expected.Replace("\n", " ")));
                Assert.That(Diagnostic.activeSelf, Is.False, "essential feedback must not require diagnostics");
                Assert.That(Text.richText, Is.False, "reviewed text must be displayed literally");
                Assert.That(Text.text.Split('\n').All(line => line.Length <= 64), Is.True);
            }
            public void Dispose() { Object.Destroy(Root); Directory.Delete(PathRoot, true); }
        }

        [UnityTest]
        public IEnumerator CalibrationPromptsStabilityAndHeldOutResultStayVisible()
        {
            using (var f = new Fixture())
            {
                yield return null; f.Command(ShellCommand.OpenSettings); yield return null;
                f.Command(ShellCommand.Calibrate); yield return null;
                f.AssertFeedback("Touch A near-left");
                f.Capture.BeginMark();
                var m = f.Recording.Workspace.CalibrationMarksM;
                for (var i = 0; i < 6; i++) f.Emit(ShellFeedbackSource.At(m.A));
                yield return null;
                Assert.Greater(f.Capture.MarkProgress, 0);
                f.AssertFeedback("Mark stability: " + (f.Capture.MarkProgress * 100).ToString("F0") + "%");
                for (var i = 0; i < 5; i++) f.Emit(ShellFeedbackSource.At(m.A));
                yield return null; f.AssertFeedback("Move to B");
                f.Mark(m.B); f.Mark(m.C); yield return null; f.AssertFeedback("Move to D");
                f.Mark(m.D); yield return null; yield return null;
                f.AssertFeedback("Registered. Independent D error:");
                Assert.Greater(f.Title.GetComponent<MeshRenderer>().bounds.min.y, f.Text.GetComponent<MeshRenderer>().bounds.max.y,
                    "wrapped feedback must not overlap the title");
                Assert.Greater(f.Text.GetComponent<MeshRenderer>().bounds.min.y, f.FirstButton.GetComponent<MeshRenderer>().bounds.max.y,
                    "feedback must not overlap interactive controls");
                f.Capture.BeginCalibration(); f.Mark(m.A); f.Mark(m.B); f.Mark(m.C); f.Mark(m.D + new NVector3(.1f, 0, 0));
                yield return null;
                Assert.IsNull(f.Capture.Registration);
                f.AssertFeedback(f.Capture.Status);
                f.AssertFeedback("Recalibrate");
            }
            yield return null;
        }

        [UnityTest]
        public IEnumerator LibrarySelectionPreloadFailuresAndReviewedStepStayVisible()
        {
            using (var f = new Fixture())
            {
                yield return null; f.Command(ShellCommand.OpenLibrary); yield return null;
                f.AssertFeedback("Selected: " + f.Storage.SelectedTitle);
                f.AssertFeedback("Stored on this headset; available offline.");
                f.Command(ShellCommand.PreloadSelected); yield return null;
                Assert.AreEqual(GuideSource.NativeHands, f.Guide.Session.Definition.Source);
                Assert.AreEqual("synthetic-fixture", f.Guide.ExpertSource);
                f.AssertFeedback("Loaded from this headset's storage with no pairing.");
                f.Command(ShellCommand.Back); yield return null;
                f.Command(ShellCommand.OpenFollow); yield return null;
                f.AssertFeedback(f.Tutorial.Steps[0].Instruction);
                f.AssertFeedback("Expert motion: synthetic-fixture (SYNTHETIC DIAGNOSTIC)");
                f.AssertFeedback("Learner input: native hands");
                f.AssertFeedback("USER-CONFIRMED: no automatic movement verification.");
                f.Calibrate(); f.Now += f.Recording.DurationMs + 1; yield return null;
                for (var i = 0; i < 12; i++) { f.Emit(f.Recording.Frames[0].Hands.Right); yield return null; }
                Assert.AreEqual(GuidePhase.Guiding, f.Guide.Session.State.Phase);
                f.Command(ShellCommand.ConfirmStep); yield return null; yield return null;
                f.AssertFeedback("Step completed by user confirmation.");
                f.Command(ShellCommand.Back); yield return null;
                f.Command(ShellCommand.OpenLibrary); yield return null;
                File.WriteAllText(Path.Combine(f.PathRoot, "trail-cache", f.Tutorial.Id + "-" + f.Tutorial.Revision, "recording.json"), "{}");
                f.Command(ShellCommand.PreloadSelected); yield return null;
                f.AssertFeedback("copy failed its integrity check");
            }
            yield return null;
        }

        [UnityTest]
        public IEnumerator ShellOffersRestoredUploadWithoutACurrentTakeAndShowsFailures()
        {
            using (var f = new Fixture(savedCapture: true))
            {
                // Set an in-memory test pairing; no request or real credential leaves this fixture.
                var session = (PairedSession)typeof(NativeApiConnection).GetField("session", BindingFlags.Instance | BindingFlags.NonPublic).GetValue(f.Connection);
                session.Accept(new string('a', 43), "author", Guid.NewGuid().ToString("D"), DateTimeOffset.UtcNow.ToUnixTimeMilliseconds() + 60000, DateTimeOffset.UtcNow.ToUnixTimeMilliseconds());
                Invoke(f.Connection, "SetState", ConnectionState.Ready);
                yield return null; f.Command(ShellCommand.OpenCreate); yield return null;
                Assert.IsNull(f.Capture.LastRecording);
                Assert.IsTrue(f.Storage.HasUploadableCapture);
                var conditions = (ShellConditions)Invoke(f.Shell, "Conditions");
                var state = ShellModel.Apply(ShellModel.Create(), ShellCommand.OpenCreate, conditions);
                Assert.IsTrue(ShellModel.Describe(state, conditions).Entries.Single(e => e.Command == ShellCommand.UploadLastCapture).Enabled);
                Assert.IsFalse(ShellModel.Describe(state, conditions).Entries.Single(e => e.Command == ShellCommand.DiscardTake).Enabled);
                f.AssertFeedback("Saved recording restored.");
                File.WriteAllText(Path.Combine(f.PathRoot, "trail-pending-upload.json"), "invalid");
                f.Command(ShellCommand.UploadLastCapture); yield return null;
                f.AssertFeedback("Interrupted upload metadata is invalid");
            }
            yield return null;
        }
    }
}
