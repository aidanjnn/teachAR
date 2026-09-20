using System;
using Trail.Tests.EditMode;
CaptureFixtureAssertions.RunAll();
Console.WriteLine("PASS: native capture domain fixtures (actual C#; not Unity or headset evidence)");
RecordingFixtureAssertions.RunAll();
Console.WriteLine("PASS: save position and take lifecycle fixtures (actual C#; not Unity or headset evidence)");

// Optional portable export for the TypeScript authoring integration check. Synthetic
// motion only; no device recording or learner evidence is produced by this harness.
if (args.Length == 1)
{
    var recording = Trail.Contracts.ContractJson.ParseRecording(System.IO.File.ReadAllText("fixtures/contracts/recording.json"));
    var ledger = new Trail.Motion.TakeLedger(recording.Workspace, "synthetic-fixture");
    for (var take = 0; take < 3; take++)
    {
        for (var frame = 0; frame <= 40; frame++)
        {
            var shift = new Trail.Motion.RigidRegistration(new System.Numerics.Vector3(Math.Max(0, Math.Min(20, frame - 10)) * .01f, take * .03f, 0), System.Numerics.Quaternion.Identity);
            ledger.AppendFrame(frame * 40, Trail.Motion.MotionSamples.Transform(recording.Frames[0].Hands.Left, shift),
                Trail.Motion.MotionSamples.Transform(recording.Frames[0].Hands.Right, shift));
        }
        ledger.Commit(null, null, "explicit-stop", "synthetic-take-" + take);
    }
    System.IO.File.WriteAllText(args[0], Trail.Contracts.ContractJson.SerializeRecording(ledger.Export("synthetic-native-export")));
}

// Aggregate export cannot discard later actions to fit the portable 120-second contract.
{
    var recording = Trail.Contracts.ContractJson.ParseRecording(System.IO.File.ReadAllText("fixtures/contracts/recording.json"));
    var ledger = new Trail.Motion.TakeLedger(recording.Workspace, "synthetic-fixture");
    for (var take = 0; take < 3; take++)
    {
        ledger.AppendFrame(0, recording.Frames[0].Hands.Left, recording.Frames[0].Hands.Right);
        ledger.AppendFrame(60000, recording.Frames[1].Hands.Left, recording.Frames[1].Hands.Right);
        ledger.Commit(null, null, "explicit-stop", "long-take-" + take);
    }
    var rejected = false;
    try { ledger.Export("too-long"); } catch (InvalidOperationException) { rejected = true; }
    if (!rejected || ledger.Takes.Count != 3) throw new Exception("Overlong export must preserve every saved take.");
    Console.WriteLine("PASS: overlong multi-take export refused without deleting saved actions.");
}
