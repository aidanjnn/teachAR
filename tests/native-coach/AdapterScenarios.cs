using System;
using System.Numerics;
using System.Reflection;
using Trail.Contracts;
using Trail.Motion;
using Trail.Runtime.Coach;
using Trail.Runtime.Guide;
using Trail.Runtime.Network;

internal static class AdapterScenarios
{
    private static int checks;
    private static void Check(bool value, string label)
    { checks++; if (!value) throw new Exception(label); }
    private static void Tick(NativeVoiceCoach coach) =>
        typeof(NativeVoiceCoach).GetMethod("Update", BindingFlags.NonPublic | BindingFlags.Instance).Invoke(coach, null);
    private static CoachContext Context(NativeVoiceCoach coach)
    {
        var c = GuideTelemetry.Context(coach.Guide.Session);
        return new CoachContext(c.TutorialId, c.TutorialRevision, c.RunId, c.AttemptId, "Tutorial",
            new[] { new CoachStepRef("s1", "Step one", "Instruction one"), new CoachStepRef("s2", "Step two", "Instruction two") },
            c.StepId, c.StepRevision);
    }
    private static NativeVoiceCoach Create(bool network = false)
    {
        var start = new CanonicalPose(Vector3.Zero, Quaternion.Identity);
        var end = new CanonicalPose(new Vector3(.3f, 0, 0), Quaternion.Identity);
        GuideStep Step(string id) => new GuideStep(id, id, new[] { new GuideTarget(GuideHand.Left, start, end) },
            GuideCompletionMode.UserConfirmed, startDwellMs: 0);
        var guide = new GuideSession(new GuideDefinition("tutorial", 1, new[] { Step("s1"), Step("s2") }), "run");
        guide.Dispatch(new GuideInput(GuideAction.Preloaded, 0));
        guide.Dispatch(new GuideInput(GuideAction.Calibrated, 0, trackingSessionId: "tracking", originRevision: 0));
        guide.Dispatch(new GuideInput(GuideAction.DemonstrationFinished, 0));
        guide.Dispatch(new GuideInput(GuideAction.Sample, 40,
            new GuideObservation(40, 1, 0, "tracking", GuideSource.NativeHands, start, null)));
        var coach = new NativeVoiceCoach { Guide = new GuideController { Session = guide },
            Connection = network ? new NativeApiConnection() : null };
        coach.Prepare(Context(coach));
        return coach;
    }
    private static void ReplyCannotOutliveGuideIdentity()
    {
        var coach = Create(); var accepted = 0;
        coach.AnswerAccepted += _ => accepted++;
        coach.AskText("What should I do?");
        coach.Guide.Session.Dispatch(new GuideInput(GuideAction.Confirm, 50));
        Tick(coach);
        Check(coach.Session.Context.CurrentStepId == "s2", "coach follows real guide transition");
        Check(accepted == 0 && coach.LastAnswer == null, "queued old-step answer is never emitted");
        coach.AskText("What should I do now?"); Tick(coach);
        Check(accepted == 1 && coach.LastAnswer.StepId == "s2", "current-step fallback still works");
        coach.Guide.Session.Repeat(60); Tick(coach);
        Check(coach.LastAnswer == null, "repeat removes the displayed answer");
        coach.AskText("Repeat that instruction"); Tick(coach);
        Check(coach.LastAnswer != null, "new attempt may answer");
        coach.Prepare(Context(coach));
        Check(coach.LastAnswer == null, "preparing a conversation clears previous output");
    }
    private static void SynchronousExpiryReleasesResources(bool duringContextUpdate)
    {
        var coach = Create(true); var mic = new Microphone(); var transport = new Transport();
        coach.Microphone = mic; coach.Transport = transport;
        coach.Connection.ExpireNext = !duringContextUpdate;
        coach.Connect();
        if (!duringContextUpdate) coach.ToggleListen(); // Must be discarded by invalidation.
        Tick(coach);
        if (duringContextUpdate)
        {
            coach.Connection.Pending(201, "{\"schemaVersion\":1,\"sessionId\":\"session-1\",\"sdp\":\"v=0\",\"liveModel\":\"mock\"}");
            Tick(coach);
            Check(coach.Session.State.Mode == CoachMode.Live, "test established the live adapter state");
            coach.ToggleListen(); Tick(coach);
            Check(mic.Capturing, "test enabled capture before context update");
            coach.Connection.ExpireNext = true;
            coach.Guide.Session.Dispatch(new GuideInput(GuideAction.Confirm, 50));
            Tick(coach);
        }
        Check(coach.Session.State.Mode == CoachMode.Unavailable, "expiry becomes unavailable without reentrant dispatch");
        Check(!mic.Held && !mic.Capturing && !transport.Open, "expiry releases all local audio resources");
        Tick(coach);
        Check(mic.Acquisitions == 1 && !mic.Held, "queued stale controls cannot reopen microphone");
    }
    private static void SynchronousExpiryDuringClose()
    {
        var coach = Create(true); var mic = new Microphone(); var transport = new Transport();
        coach.Microphone = mic; coach.Transport = transport;
        coach.Connect(); Tick(coach);
        coach.Connection.Pending(201, "{\"schemaVersion\":1,\"sessionId\":\"session-1\",\"sdp\":\"v=0\",\"liveModel\":\"mock\"}");
        Tick(coach);
        coach.Connection.ExpireNext = true;
        coach.Prepare(Context(coach));
        Check(coach.Session.State.Mode == CoachMode.Idle, "Prepare survives expiry in the previous session's DELETE");
        Check(!mic.Held && !transport.Open, "recursive invalidation during close leaves resources released");
    }

    private sealed class Microphone : ICoachMicrophone
    {
        public bool Held { get; private set; }
        public bool Capturing { get; private set; }
        public int Acquisitions;
        public bool AcquireMuted() { Acquisitions++; Held = true; Capturing = false; return true; }
        public void SetCapturing(bool value) => Capturing = value;
        public void Release() { Held = false; Capturing = false; }
    }
    private sealed class Transport : ICoachTransport
    {
        public bool Open { get; private set; }
        public void CreateOffer(Action<string> offered, Action failed) { Open = true; offered("v=0"); }
        public void AcceptAnswer(string sdp, Action ready, Action failed) => ready();
        public void Send(string value) { }
        public void SetOutputMuted(bool muted) { }
        public void Close() => Open = false;
    }
    private static void Main()
    {
        ReplyCannotOutliveGuideIdentity();
        SynchronousExpiryReleasesResources(false);
        SynchronousExpiryReleasesResources(true);
        SynchronousExpiryDuringClose();
        Console.WriteLine("PASS: " + checks + " adapter checks using actual coach and guide sources.");
        Console.WriteLine("Engine/HTTP/audio boundaries are stubs; no Unity lifecycle or live-provider evidence.");
    }
}
