using NUnit.Framework;
using Trail.Contracts;

namespace Trail.Tests.EditMode
{
    public sealed class StrictContractTests
    {
        private const string Ended = "{\"schemaVersion\":1,\"sessionId\":\"s\",\"runId\":\"r\",\"seq\":1,\"tMs\":0,\"type\":\"guide-ended\",\"reason\":\"cancelled\"}";
        private const string Calibration = "{\"schemaVersion\":2,\"id\":\"c\",\"referenceSpaceType\":\"native-device\",\"trackingSessionId\":\"s\",\"originRevision\":0,\"referenceFromWorkspace\":{\"positionM\":[0,0,0],\"orientationXyzw\":[0,0,0,0.9999]},\"sampledReferencePointsM\":[[0,0,0],[1,0,0],[0,0,-1]],\"verificationErrorM\":0,\"valid\":true}";
        [Test] public void AuthoringRequestsKeepWireFieldsAndRejectInvalidBounds()
        {
            var job = new TutorialJobCreate { RecordingId = "recording-1", RecordingHash = new string('a', 64), SegmentationRevision = 1 };
            Assert.That(ContractJson.ParseTutorialJobCreate(ContractJson.SerializeTutorialJobCreate(job)).RecordingId, Is.EqualTo(job.RecordingId));
            job.SegmentationRevision = 0;
            Assert.Throws<ContractException>(() => ContractJson.SerializeTutorialJobCreate(job));
            var chunk = new RecordingByteChunk { DataBase64 = System.Convert.ToBase64String(new byte[1024 * 1024]), Sha256 = new string('a', 64) };
            Assert.That(ContractJson.ParseRecordingByteChunk(ContractJson.SerializeRecordingByteChunk(chunk)).DataBase64, Is.EqualTo(chunk.DataBase64));
            chunk.DataBase64 = "not base64";
            Assert.Throws<ContractException>(() => ContractJson.SerializeRecordingByteChunk(chunk));
        }
        [Test] public void RoundTripKeepsKnownEventAndSession()
        {
            var parsed = ContractJson.ParseGuideEvent(Ended);
            Assert.That(parsed.Type, Is.EqualTo("guide-ended"));
            Assert.That(parsed.RunId, Is.EqualTo("r"));
            Assert.That(ContractJson.ParseGuideEvent(ContractJson.SerializeGuideEvent(parsed)).Reason, Is.EqualTo("cancelled"));
        }
        [Test] public void RejectsDuplicateUnknownMissingAndUnsafeFields()
        {
            foreach (var json in new[] { Ended.Replace("\"seq\":1", "\"seq\":1,\"seq\":2"), Ended.Replace("\"seq\":1", "\"seq\":1,\"payload\":{}"), Ended.Replace("\"seq\":1,", ""), Ended.Replace("\"seq\":1", "\"seq\":9007199254740992") })
                Assert.Throws<ContractException>(() => ContractJson.ParseGuideEvent(json));
        }
        [Test] public void UnitQuaternionBoundarySurvivesNativeFloatConversionAndReexport()
        {
            var parsed = ContractJson.ParseCalibrationV2(Calibration);
            var wire = ContractJson.SerializeCalibrationV2(parsed);
            Assert.That(wire, Does.Contain("0.9999"));
            Assert.That(ContractJson.ParseCalibrationV2(wire).Valid, Is.True);
            Assert.Throws<ContractException>(() => ContractJson.ParseCalibrationV2(Calibration.Replace("0.9999", "0.9998")));
        }
    }
}
