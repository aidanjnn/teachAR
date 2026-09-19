using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Numerics;
using System.Security.Cryptography;
using System.Text;
using Trail.Contracts;
using Trail.Motion;
using Trail.Runtime.Guide;

internal static class ContractIntegration
{
    internal static void Run()
    {
        // Shared fixture generator hashes compact JSON; reproduce its exact byte form.
        using var document = System.Text.Json.JsonDocument.Parse(File.ReadAllBytes("fixtures/contracts/recording.json"));
        var recordingBytes = Encoding.UTF8.GetBytes(System.Text.Json.JsonSerializer.Serialize(document.RootElement));
        var hash = Convert.ToHexString(SHA256.HashData(recordingBytes)).ToLowerInvariant();
        var recording = ContractJson.ParseRecording(Encoding.UTF8.GetString(recordingBytes));
        var tutorial = ContractJson.ParseTutorial(File.ReadAllText("fixtures/contracts/tutorial.json"));
        var definition = GuideTutorialAdapter.Create(tutorial, recording, hash, GuideSource.SyntheticDiagnostic);
        var session = new GuideSession(definition, "fixture-integration-run");
        var telemetry = new GuideTelemetry("fixture-paired-session", 0);
        var events = new List<GuideEvent>(); var phases = new List<string>();
        var time = 0d; var sequence = 0L;
        session.Transitioned += transition =>
        {
            foreach (var effect in transition.Effects)
                if (effect.Kind == GuideEffectKind.MovementCheckpointReached) events.Add(telemetry.CompletionEvent(session, effect, time));
            var snapshot = telemetry.SnapshotEvent(session, time);
            if (phases.LastOrDefault() != snapshot.State.Phase) phases.Add(snapshot.State.Phase);
            events.Add(snapshot);
        };
        session.Dispatch(new GuideInput(GuideAction.Preloaded, time));
        // Independent, rotated/translated synthetic learner calibration, including held-out D.
        var transform = new RigidRegistration(new Vector3(1, .7f, 2), Quaternion.CreateFromAxisAngle(Vector3.UnitY, (float)Math.PI / 2));
        var marks = recording.Workspace.CalibrationMarksM;
        var registration = WorkspaceCalibration.Fit((float)recording.Workspace.WidthM, (float)recording.Workspace.DepthM,
            transform.TransformPoint(marks.A), transform.TransformPoint(marks.B), transform.TransformPoint(marks.C), transform.TransformPoint(marks.D), Vector3.UnitY);
        session.Dispatch(new GuideInput(GuideAction.Calibrated, time, trackingSessionId: "fixture-xr-session", originRevision: 3));
        var replay = new MotionReplay(recording);
        if (replay.Sample(recording.Frames[0].TMs).Hands.Right.Status != "valid") throw new Exception("Actual replay failed.");
        session.Dispatch(new GuideInput(GuideAction.DemonstrationFinished, time));
        void Hold(int frameIndex, int samples)
        {
            for (var i = 0; i < samples; i++)
            {
                time += 50;
                var workspace = recording.Frames[frameIndex];
                var reference = new ReferenceObservation(time, ++sequence, 3, "synthetic-fixture",
                    MotionSamples.Transform(workspace.Hands.Left, transform), MotionSamples.Transform(workspace.Hands.Right, transform));
                var projected = MotionSamples.ToWorkspace(reference, registration.ReferenceFromWorkspace);
                session.Dispatch(new GuideInput(GuideAction.Sample, time, new GuideObservation(time, sequence, 3, "fixture-xr-session", GuideSource.SyntheticDiagnostic,
                    projected.Hands.Left.Status == "valid" ? projected.Hands.Left.Joints["wrist"] : (CanonicalPose?)null,
                    projected.Hands.Right.Status == "valid" ? projected.Hands.Right.Joints["wrist"] : (CanonicalPose?)null)));
            }
        }
        Hold(0, 7); Hold(1, 3); Hold(2, 11);
        if (session.State.Phase != GuidePhase.Complete || events.Count(e => e.Type == "step-completed") != 1) throw new Exception("Bound fixture did not complete exactly once.");
        var expected = File.ReadAllText("fixtures/guide/expected-integration-phases.txt").Trim();
        var actual = string.Join(" -> ", phases);
        if (actual != expected) throw new Exception("Golden phase trace mismatch: " + actual);
        long prior = -1;
        foreach (var guideEvent in events)
        {
            var parsed = ContractJson.ParseGuideEvent(ContractJson.SerializeGuideEvent(guideEvent));
            if (parsed.Seq <= prior) throw new Exception("Telemetry sequence not monotonic."); prior = parsed.Seq;
        }
        var completion = events.Single(e => e.Type == "step-completed");
        if (completion.Evidence != "path-and-pose" || completion.StepId != "step-1" || completion.AttemptId != "step-0:attempt-1") throw new Exception("Completion identity/evidence mismatch.");
        // Adapter owns copies of execution values; later caller edits cannot move the active target.
        var checkpoint = definition.Steps[0].Targets[0].Checkpoint;
        tutorial.Steps[0].Targets[0].CheckpointPose = new CanonicalPose(Vector3.Zero, Quaternion.Identity);
        if (definition.Steps[0].Targets[0].Checkpoint.PositionM != checkpoint.PositionM) throw new Exception("Preload retained mutable target DTO.");
        Console.WriteLine("PASS: bound shared tutorial/recording -> rotated calibration -> workspace projection -> actual C# guide -> strict shared telemetry round-trip; golden phases match.");
    }
}
