using Trail.Runtime.Scene;
static void Check(bool condition, string name) { if (!condition) throw new Exception(name); }
var gate = new FreshFrameGate();
Check(gate.Delivered(1, 1), "first delivery");
gate.Begin("nonce-one", 2);
Check(gate.TryCopy(3) == null, "retained frame cannot answer nonce");
Check(!gate.Delivered(1, 4), "repeated sensor timestamp is not fresh");
Check(gate.Delivered(2, 5), "new delivery");
var ticket = gate.TryCopy(5);
Check(ticket != null && ticket.SourceFrameSequence == 2, "new frame identity");
Check(gate.TryCopy(6) == null, "one readback");
Check(gate.Complete(ticket, 505), "fresh completion at age bound");
gate.Begin("nonce-two", 506); gate.Delivered(3, 507); ticket = gate.TryCopy(508);
gate.Invalidate(); Check(!gate.Complete(ticket, 509), "cancel drops late readback");
gate.Begin("nonce-three", 510); gate.Delivered(4, 511); ticket = gate.TryCopy(512);
Check(!gate.Complete(ticket, 1012), "stale readback rejected");
gate.Begin("nonce-four", 1013); Check(gate.TryCopy(3014) == null && !gate.Pending, "stalled source timeout");
var oldSession = gate.SourceSessionId; gate.Restart(); Check(oldSession != gate.SourceSessionId, "lifecycle changes source session");
Check(gate.SourceFrameSequence == 0, "restart resets sequence");
try { gate.Begin("invalid", double.NaN); throw new Exception("accepted NaN"); } catch (ArgumentException) { }
try { gate.Begin("invalid", 0); throw new Exception("accepted clock regression"); } catch (ArgumentException) { }
Console.WriteLine("PASS: fresh frame identity, duplicate/stall/age/cancel/restart/clock and bounded readback lifecycle");

var context = new Trail.Contracts.GuideContextRef { RunId="run-1", TutorialId="tutorial-1", TutorialRevision=1, StepId="step-1", StepRevision=1, AttemptId="attempt-1" };
var start = Trail.Contracts.ContractJson.SerializeInspectionStart(context, "app-check", 1, 1, "A quoted \"question\"?", "camera-1", 2);
Check(start.Contains("\\\"question\\\""), "transport escapes questions");
var request = new Trail.Contracts.InspectionRequest { RunId="run-1", TutorialId="tutorial-1", TutorialRevision=1, StepId="step-1", StepRevision=1, AttemptId="attempt-1", RequestId="request-1", LiveSessionId="app-check", SessionGeneration=1, RequestEpoch=1, Question="Check?", ReferenceIds=new[]{"reference-1"} };
var captureJson = "{\"schemaVersion\":1,\"request\":" + Trail.Contracts.ContractJson.SerializeInspectionRequest(request) + ",\"captureNonce\":\"nonce-1\",\"sourceSessionId\":\"camera-1\",\"minSourceFrameSeq\":2,\"uploadWithinMs\":2000,\"totalBudgetMs\":8000}";
Check(Trail.Contracts.ContractJson.ParseInspectionCapture(captureJson).MinSourceFrameSeq == 2, "strict capture parse");
try { Trail.Contracts.ContractJson.ParseInspectionCapture(captureJson.Replace("\"schemaVersion\":1", "\"schemaVersion\":1,\"schemaVersion\":1")); throw new Exception("duplicate key accepted"); } catch (Trail.Contracts.ContractException) { }
try { Trail.Contracts.ContractJson.ParseInspectionCapture(captureJson.Replace("2000", "2001")); throw new Exception("capture bound accepted"); } catch (Trail.Contracts.ContractException) { }
Console.WriteLine("PASS: strict native inspection transport and canonical request binding");

Check(Trail.Contracts.ContractJson.ParseInspectionSession("{\"schemaVersion\":1,\"liveSessionId\":\"server-lease\"}") == "server-lease", "server lease parse");
foreach (var invalid in new[] { "{\"schemaVersion\":1}", "{\"schemaVersion\":2,\"liveSessionId\":\"lease\"}", "{\"schemaVersion\":1,\"liveSessionId\":\"lease\",\"liveSessionId\":\"other\"}" })
{
    try { Trail.Contracts.ContractJson.ParseInspectionSession(invalid); throw new Exception("invalid lease accepted"); } catch (Trail.Contracts.ContractException) { }
}
Console.WriteLine("PASS: strict server-issued inspection session transport");
