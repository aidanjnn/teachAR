using System;
using System.IO;
using System.Linq;
using System.Reflection;
using System.Security.Cryptography;
using System.Text;
using NUnit.Framework;
using Trail.Contracts;
using Trail.Presentation;
using Trail.Runtime.Coach;
using Trail.Runtime.Guide;
using Trail.Runtime.Network;
using Trail.Runtime.Record;
using Trail.Runtime.Scene;
using UnityEngine;

namespace Trail.Tests.CoachRuntime
{
    /// <summary>Real Unity coach composition with injected microphone/media effects. No audio/provider claim.</summary>
    public sealed class NativeCoachLifecycleTests
    {
        private GameObject root;
        private NativeVoiceCoach coach;
        private GuideController guide;
        private FakeMicrophone microphone;
        private FakeTransport transport;
        private double now;
        [SetUp]
        public void SetUp()
        {
            now = 0;
            root = new GameObject("voice lifecycle test"); root.SetActive(false);
            var capture = root.AddComponent<CaptureReplaySession>();
            var ghost = root.AddComponent<GhostPresentation>(); ghost.Session = capture;
            guide = root.AddComponent<GuideController>(); guide.Capture = capture; guide.Ghost = ghost;
            var directory = Path.GetFullPath(Path.Combine(Application.dataPath, "../../..", "fixtures/contracts"));
            var tutorial = ContractJson.ParseTutorial(File.ReadAllText(Path.Combine(directory, "tutorial.json")));
            var recording = ContractJson.ParseRecording(File.ReadAllText(Path.Combine(directory, "recording.json")));
            var bytes = Encoding.UTF8.GetBytes(ContractJson.SerializeRecording(recording));
            using (var hash = SHA256.Create()) tutorial.RecordingHash = BitConverter.ToString(hash.ComputeHash(bytes)).Replace("-", "").ToLowerInvariant();
            guide.Preload(tutorial, recording, tutorial.RecordingHash, "voice-fixture", true);
            coach = root.AddComponent<NativeVoiceCoach>(); coach.Guide = guide; coach.Clock = () => now;
            var connection = root.AddComponent<NativeApiConnection>();
            // A grant/SDP is deliberately never requested: the fake holds negotiation pending.
            typeof(NativeApiConnection).GetProperty("State").SetValue(connection, ConnectionState.Ready);
            coach.Connection = connection;
            microphone = new FakeMicrophone(); transport = new FakeTransport();
            coach.Microphone = microphone; coach.Transport = transport;
            var identity = GuideTelemetry.Context(guide.Session);
            coach.Prepare(new CoachContext(tutorial.Id, tutorial.Revision, identity.RunId, identity.AttemptId, "Reviewed tutorial",
                tutorial.Steps.Select(step => new CoachStepRef(step.Id, step.Title, step.Instruction)), identity.StepId, identity.StepRevision));
        }
        [TearDown] public void TearDown() => UnityEngine.Object.DestroyImmediate(root);
        private void Invoke(string method, params object[] args) => typeof(NativeVoiceCoach).GetMethod(method, BindingFlags.Instance | BindingFlags.NonPublic).Invoke(coach, args);
        private void Tick() => Invoke("Update");
        private void Ready()
        {
            coach.Connect(); Tick();
            Assert.IsTrue(microphone.Held);
            Assert.IsFalse(microphone.Capturing, "offer and permission cannot open audio transmission");
            Assert.AreEqual(1, transport.Offers);
            coach.Session.LiveReady(); Tick();
        }
        [Test]
        public void ExplicitStartListensHandsFreeUntilMutedAndFocusLossReleases()
        {
            var guideState = guide.Session.State;
            Ready();
            Assert.IsTrue(microphone.Capturing);
            now = 60000; Tick();
            Assert.IsTrue(microphone.Capturing, "silence must not silently disable hands-free conversation");
            coach.ToggleListen(); Tick(); Assert.IsFalse(microphone.Capturing);
            Tick(); Assert.IsFalse(microphone.Capturing, "explicit mute survives updates");
            coach.ToggleListen(); Tick(); Assert.IsTrue(microphone.Capturing);
            Invoke("OnApplicationFocus", false);
            Assert.IsFalse(microphone.Held); Assert.IsFalse(transport.Open);
            Assert.AreSame(guideState, guide.Session.State, "voice never drives progression");
        }
        [Test]
        public void ContextInvalidationDestroysPlaybackAndLateCaptionsCannotReviveIt()
        {
            Ready();
            Invoke("OnTranscript", "learner", "check my placement");
            Invoke("OnTranscript", "coach", "I am looking");
            Assert.AreEqual("I am looking", coach.CoachCaption);
            coach.InvalidateOutput();
            Assert.IsNull(coach.Session); Assert.IsFalse(microphone.Held); Assert.IsFalse(transport.Open);
            Assert.AreEqual("", coach.CoachCaption);
            Invoke("OnTranscript", "coach", "old reply");
            Assert.AreEqual("", coach.CoachCaption);
        }
        [Test]
        public void TranscriptFragmentsPreserveSpacingAndClearForNextInspection()
        {
            Ready(); string latest = null;
            coach.LearnerTranscriptReceived += value => latest = value;
            Invoke("OnTranscript", "learner", "check my"); Invoke("OnTranscript", "learner", " placement");
            Assert.AreEqual("check my placement", latest);
            coach.ClearLearnerTranscript(); Invoke("OnTranscript", "learner", "new command");
            Assert.AreEqual("new command", latest);
            Invoke("OnTranscript", "learner", new string('a', 5000));
            Assert.AreEqual(4096, latest.Length);
        }
        [Test]
        public void InspectionReplacesPeerAndDoesNotTransmitOrPlayBeforeAcceptedResult()
        {
            Ready();
            typeof(NativeVoiceCoach).GetField("liveSessionId", BindingFlags.Instance | BindingFlags.NonPublic).SetValue(coach, "fixture-live");
            var connection = coach.Connection; coach.Connection = null; // No HTTP endpoint in this injected media test.
            Assert.IsTrue(coach.BeginInspectionConversation());
            coach.Connection = connection; Tick();
            Assert.AreEqual(2, transport.Offers);
            coach.Session.LiveReady(); Tick();
            Assert.IsTrue(coach.WaitingForInspection);
            Assert.IsFalse(microphone.Capturing); Assert.IsTrue(transport.Muted);
            coach.NotifyLearnerSpoke(); Assert.IsTrue(transport.Muted, "a transcript cannot bypass visual-result acceptance");
            Assert.IsTrue(coach.ListeningRequested, "internal capture gate preserves the explicit Start intent");
            coach.AllowInspectionOutput();
            Assert.IsFalse(transport.Muted); Assert.IsFalse(microphone.Capturing);
            Assert.IsFalse(coach.WaitingForInspection);
            Tick(); Assert.IsTrue(microphone.Capturing, "accepted findings restore the existing hands-free intent");
        }
        [TestCase(false)]
        [TestCase(true)]
        public void InspectionBridgeClosesPeerOnCancelOrSupersedingSpeech(bool supersedingQuestion)
        {
            Ready();
            var guideState = guide.Session.State;
            var inspection = root.AddComponent<SceneInspectionController>();
            var bridge = root.AddComponent<SpokenSceneInspection>();
            bridge.Coach = coach; bridge.Inspection = inspection; bridge.Bind();
            typeof(NativeVoiceCoach).GetField("liveSessionId", BindingFlags.Instance | BindingFlags.NonPublic).SetValue(coach, "fixture-live");
            typeof(SpokenSceneInspection).GetField("liveSession", BindingFlags.Instance | BindingFlags.NonPublic).SetValue(bridge, "fixture-live");
            typeof(SpokenSceneInspection).GetField("ownedSession", BindingFlags.Instance | BindingFlags.NonPublic).SetValue(bridge, coach.Session);
            coach.Connection = null; // No HTTP endpoint in this injected lifecycle test.
            Invoke("OnTranscript", "coach", "checked snapshot");
            if (supersedingQuestion)
            {
                bridge.Clock = () => now;
                Invoke("OnTranscript", "learner", "What should I move now?");
                Assert.IsTrue(transport.Muted, "first fragment silences stale snapshot audio immediately");
                Assert.IsNotNull(coach.Session, "retain mic until the replacement utterance is collected");
                now += 1;
                typeof(SpokenSceneInspection).GetMethod("Update", BindingFlags.Instance | BindingFlags.NonPublic).Invoke(bridge, null);
            }
            else inspection.Cancel();
            Assert.IsNull(coach.Session);
            Assert.IsFalse(transport.Open); Assert.IsFalse(microphone.Held);
            Assert.AreEqual("", coach.CoachCaption);
            Assert.AreSame(guideState, guide.Session.State, "inspection speech never completes or advances the guide");
        }
        [Test]
        public void InspectionBridgeRejectsFindingsItDidNotAcceptWithoutUngatingPlayback()
        {
            Ready();
            var inspection = root.AddComponent<SceneInspectionController>();
            var bridge = root.AddComponent<SpokenSceneInspection>();
            bridge.Coach = coach; bridge.Inspection = inspection; bridge.Bind();
            typeof(NativeVoiceCoach).GetField("liveSessionId", BindingFlags.Instance | BindingFlags.NonPublic).SetValue(coach, "fixture-live");
            typeof(SpokenSceneInspection).GetField("liveSession", BindingFlags.Instance | BindingFlags.NonPublic).SetValue(bridge, "fixture-live");
            transport.SetOutputMuted(true); coach.Connection = null;
            typeof(SpokenSceneInspection).GetMethod("OnFindings", BindingFlags.Instance | BindingFlags.NonPublic)
                .Invoke(bridge, new object[] { new InspectionResult() });
            Assert.IsTrue(transport.Muted, "unsolicited/stale findings cannot open the output gate");
            inspection.Cancel();
        }
        [Test]
        public void MuteDuringInspectionSurvivesAcceptedFindings()
        {
            Ready();
            typeof(NativeVoiceCoach).GetField("liveSessionId", BindingFlags.Instance | BindingFlags.NonPublic).SetValue(coach, "fixture-live");
            var connection = coach.Connection; coach.Connection = null;
            Assert.IsTrue(coach.BeginInspectionConversation()); coach.Connection = connection; Tick();
            coach.Session.LiveReady(); Tick();
            coach.ToggleListen(); // Explicit mute while the internal microphone gate is already shut.
            Assert.IsFalse(coach.ListeningRequested);
            coach.AllowInspectionOutput(); Tick();
            Assert.IsFalse(microphone.Capturing);
            Assert.IsFalse(coach.RecoverInspectionConversation(), "mute never starts another peer");
        }
        [Test]
        public void RecoveryReplacesPeerOnceWithoutAdvancingGuideAndRespectsEnd()
        {
            Ready(); var previous = coach.Session; var guideState = guide.Session.State;
            Assert.IsTrue(coach.RecoverInspectionConversation());
            Assert.AreNotSame(previous, coach.Session); Tick();
            Assert.AreEqual(2, transport.Offers);
            Assert.IsFalse(coach.RecoverInspectionConversation(), "do not duplicate a pending recovery");
            coach.Session.LiveReady(); Tick(); Assert.IsTrue(microphone.Capturing);
            Assert.AreSame(guideState, guide.Session.State);
            coach.EndConversation();
            Assert.IsFalse(coach.RecoverInspectionConversation());
            Assert.IsFalse(microphone.Held);
        }
        [Test]
        public void FocusLossAndSupersedingTranscriptCannotReopenOldInspectionAudio()
        {
            Ready(); coach.SilenceInspectionOutput();
            Invoke("OnTranscript", "learner", "check");
            Invoke("OnTranscript", "learner", " again");
            Assert.IsTrue(transport.Muted, "later fragments do not reopen the obsolete peer");
            Invoke("OnApplicationFocus", false);
            Assert.IsFalse(coach.RecoverInspectionConversation());
            Assert.IsFalse(microphone.Held);
        }
        [Test]
        public void NegotiationTimeoutReleasesWithoutChangingLoadedGuide()
        {
            var guideState = guide.Session.State;
            coach.Connect(); Tick(); now = 16000; Tick();
            Assert.AreEqual(CoachMode.Text, coach.Session.State.Mode);
            Assert.IsFalse(microphone.Held); Assert.IsFalse(transport.Open);
            Assert.AreSame(guideState, guide.Session.State);
        }
        private sealed class FakeMicrophone : ICoachMicrophone
        {
            public bool Held { get; private set; }
            public bool Capturing { get; private set; }
            public bool AcquireMuted() { Held = true; Capturing = false; return true; }
            public void SetCapturing(bool value) => Capturing = Held && value;
            public void Release() { Capturing = false; Held = false; }
        }
        private sealed class FakeTransport : ICoachTransport
        {
            public bool Open { get; private set; }
            public int Offers;
            public bool Muted;
            public void CreateOffer(Action<string> offered, Action failed) { Offers++; Open = true; }
            public void AcceptAnswer(string sdp, Action connected, Action failed) => connected();
            public void Send(string json) { }
            public void SetOutputMuted(bool value) => Muted = value;
            public void Close() => Open = false;
        }
    }
}
