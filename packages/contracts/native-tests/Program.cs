using System;
using System.IO;
using System.Linq;
using System.Text.Json.Nodes;
using System.Numerics;
using Trail.Contracts;
using Trail.Motion;
class Program
{
    private static string Roundtrip(string name, string json)
    {
        switch (name)
        {
            case "Recording": return ContractJson.SerializeRecording(ContractJson.ParseRecording(json));
            case "Tutorial": return ContractJson.SerializeTutorial(ContractJson.ParseTutorial(json));
            case "TutorialDraftEdit": return ContractJson.SerializeTutorialDraftEdit(ContractJson.ParseTutorialDraftEdit(json));
            case "GuideEvent": return ContractJson.SerializeGuideEvent(ContractJson.ParseGuideEvent(json));
            case "NativeCaptureSidecar": return ContractJson.SerializeNativeCaptureSidecar(ContractJson.ParseNativeCaptureSidecar(json));
            case "CalibrationV2": return ContractJson.SerializeCalibrationV2(ContractJson.ParseCalibrationV2(json));
            case "SceneReferenceManifest": return ContractJson.SerializeSceneReferenceManifest(ContractJson.ParseSceneReferenceManifest(json));
            case "InspectionRequest": return ContractJson.SerializeInspectionRequest(ContractJson.ParseInspectionRequest(json));
            case "SceneObservation": return ContractJson.SerializeSceneObservation(ContractJson.ParseSceneObservation(json));
            case "InspectionResult": return ContractJson.SerializeInspectionResult(ContractJson.ParseInspectionResult(json));
            case "CreateRecordingRequest": return ContractJson.SerializeCreateRecordingRequest(ContractJson.ParseCreateRecordingRequest(json));
            case "MotionChunk": return ContractJson.SerializeMotionChunk(ContractJson.ParseMotionChunk(json));
            case "FinalizeRecordingRequest": return ContractJson.SerializeFinalizeRecordingRequest(ContractJson.ParseFinalizeRecordingRequest(json));
            default: throw new Exception("Unknown test contract " + name);
        }
    }
    static void Check(bool value, string message) { if (!value) throw new Exception(message); }
    static string Load(string name) => File.ReadAllText("fixtures/contracts/" + name + ".json");
    static void Equal(JsonNode expected, JsonNode actual)
    {
        if (expected == null) { Check(actual == null, "Null lost"); return; }
        if (expected is JsonObject)
        {
            var a = actual as JsonObject; Check(a != null && a.Count == ((JsonObject)expected).Count, "Property loss");
            foreach (var pair in (JsonObject)expected) { Check(a.ContainsKey(pair.Key), "Property missing"); Equal(pair.Value,a[pair.Key]); }
        }
        else if (expected is JsonArray) { var a = actual as JsonArray; Check(a != null && a.Count == ((JsonArray)expected).Count, "Array loss"); for (int i=0;i<a.Count;i++) Equal(expected[i],a[i]); }
        else if (((JsonValue)expected).TryGetValue<double>(out double d)) Check(Math.Abs(d - actual.GetValue<double>()) <= Math.Max(1e-6,Math.Abs(d)*1e-6), "Numeric round-trip drift");
        else Check(expected.ToJsonString() == actual.ToJsonString(), "Value lost");
    }
    static void Main()
    {
        int count=0;
        foreach (var c in JsonNode.Parse(Load("corpus"))["cases"].AsArray())
        {
            string name=c["name"].GetValue<string>(), contract=c["contract"].GetValue<string>(); bool valid=c["valid"].GetValue<bool>();
            string json;
            if (c["json"] != null) json=c["json"].GetValue<string>();
            else
            {
                var raw=JsonNode.Parse(File.ReadAllText("fixtures/contracts/"+c["file"].GetValue<string>()));
                if(c["patches"]!=null) foreach(var patch in c["patches"].AsArray())
                {
                    JsonNode parent=raw; var path=patch["path"].AsArray();
                    for(int i=0;i<path.Count-1;i++) parent=path[i].AsValue().TryGetValue<int>(out int n)?parent[n]:parent[path[i].GetValue<string>()];
                    var last=path.Last(); bool remove=patch["remove"]?.GetValue<bool>()==true;
                    if(last.AsValue().TryGetValue<int>(out int index)) { if(remove) parent.AsArray().RemoveAt(index); else parent[index]=patch["value"]?.DeepClone(); }
                    else { var key=last.GetValue<string>(); if(remove) parent.AsObject().Remove(key); else parent[key]=patch["value"]?.DeepClone(); }
                }
                json=raw.ToJsonString();
            }
            bool accepted=false;
            try { var output=Roundtrip(contract,json); accepted=true; if(valid) Equal(JsonNode.Parse(json),JsonNode.Parse(output)); }
            catch(ContractException) { }
            Check(accepted==valid,name+": expected "+valid+", accepted "+accepted); count++;
        }
        var recording=ContractJson.ParseRecording(Load("recording")); var tutorial=ContractJson.ParseTutorial(Load("tutorial"));
        ContractValidation.ValidateTutorialRecording(tutorial,recording,tutorial.RecordingHash);
        foreach (string change in new[]{"hash","workspace","target","missing-hand"})
        {
            var t=ContractJson.ParseTutorial(Load("tutorial"));var r=ContractJson.ParseRecording(Load("recording"));
            if(change=="hash") t.RecordingHash=new string('0',64);
            if(change=="workspace") t.Workspace.LayoutId="wrong";
            if(change=="target") t.Steps[0].Targets[0].CheckpointPose=new CanonicalPose(Vector3.Zero,Quaternion.Identity);
            if(change=="missing-hand") r.Frames[0].Hands.Right=new HandSample{Status="missing",Reason="unavailable"};
            bool rejected=false;try{ContractValidation.ValidateTutorialRecording(t,r,tutorial.RecordingHash);}catch(ContractException){rejected=true;}
            Check(rejected,"Invalid tutorial binding: "+change);count++;
        }
        var legacy=ContractJson.ParseRecording(File.ReadAllText("fixtures/synthetic-reach.v1.json"));
        Equal(JsonNode.Parse(File.ReadAllText("fixtures/synthetic-reach.v1.json")),JsonNode.Parse(ContractJson.SerializeRecording(legacy)));count++;
        var joints=JsonNode.Parse(Load("joint-map"))["canonicalToNative"].AsObject();
        Check(OpenXrJointMap.CanonicalToNative.Count==25 && OpenXrJointMap.CanonicalToNative.Values.Distinct().Count()==25,"joint count");
        foreach(var pair in joints) Check(OpenXrJointMap.CanonicalToNative[pair.Key]==pair.Value.GetValue<string>(),"joint map "+pair.Key);count++;
        foreach(var c in JsonNode.Parse(Load("transforms"))["basisCases"].AsArray())
        {
            var input=Pose(c["pose"]);var expected=Pose(c["expected"]);var actual=CoordinateBasis.ReflectZ(input);
            Check(Vector3.Distance(actual.PositionM,expected.PositionM)<1e-6 && Math.Abs(Quaternion.Dot(actual.OrientationXyzw,expected.OrientationXyzw))>0.999999,"basis fixture");
            Check(Vector3.Distance(CoordinateBasis.ReflectZ(actual).PositionM,input.PositionM)<1e-6,"basis roundtrip");count++;
        }
        Console.WriteLine("Pure C# contracts: "+count+" corpus, binding, legacy, named-joint and basis checks passed (.NET; not Unity/IL2CPP).");
    }
    static CanonicalPose Pose(JsonNode n) => new CanonicalPose(new Vector3(n["positionM"][0].GetValue<float>(),n["positionM"][1].GetValue<float>(),n["positionM"][2].GetValue<float>()),new Quaternion(n["orientationXyzw"][0].GetValue<float>(),n["orientationXyzw"][1].GetValue<float>(),n["orientationXyzw"][2].GetValue<float>(),n["orientationXyzw"][3].GetValue<float>()));
}
