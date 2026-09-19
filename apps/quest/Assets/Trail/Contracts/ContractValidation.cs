using System;
using System.Collections.Generic;
using System.Linq;
using System.Numerics;

namespace Trail.Contracts
{
    public static class ContractValidation
    {
        private static void Require(bool valid, string message) { if (!valid) throw new ContractException(message); }
        private static bool Unique(IEnumerable<string> values) { var a = values.ToArray(); return a.Distinct(StringComparer.Ordinal).Count() == a.Length; }
        internal static void Validate(Recording r)
        {
            ValidateRecordingMetadata(r.JointOrder, r.Markers, r.DurationMs);
            double previous = -1;
            foreach (var frame in r.Frames) { Require(frame.TMs > previous && frame.TMs <= r.DurationMs, "Frame time must strictly increase within duration"); previous = frame.TMs; }
        }
        internal static void Validate(RecordingMetadata r) => ValidateRecordingMetadata(r.JointOrder, r.Markers, r.DurationMs);
        private static void ValidateRecordingMetadata(string[] joints, StepMarker[] markers, double duration)
        {
            Require(joints.SequenceEqual(JointNames.Canonical), "Joint order must match canonical 25");
            Require(Unique(markers.Select(m => m.Id)) && markers.All(m => m.TMs <= duration), "Marker IDs must be unique and within duration");
        }
        internal static void Validate(AudioAsset a) => Require(!a.AssetId.StartsWith("blob:", StringComparison.Ordinal) && !a.AssetId.Contains("/") && !a.AssetId.Contains("\\"), "Expected durable asset ID");
        private static bool Range(int start, int end, int checkpoint) => start < end && checkpoint >= start && checkpoint < end;
        internal static void Validate(TutorialStep s)
        {
            Require(Range(s.StartFrame, s.EndFrameExclusive, s.CheckpointFrame), "Invalid half-open step range");
            Require(Unique(s.Targets.Select(t => t.Side)), "Duplicate target hand");
            Require(Unique(s.NarrationSpanIds), "Duplicate narration ID");
            foreach (var target in s.Targets)
            {
                int previous = s.StartFrame;
                foreach (var gate in target.MotionGates) { Require(gate.FrameIndex > previous && gate.FrameIndex < s.CheckpointFrame, "Gates must increase between start and checkpoint"); previous = gate.FrameIndex; }
                Require(s.CompletionMode != "path-and-pose" || target.MotionGates.Length > 0, "Path matching requires gates for each active hand");
            }
        }
        internal static void Validate(TutorialProvenance p) => Require(p.Labels != "model" || p.Model != null, "Model labels require model provenance");
        internal static void Validate(Tutorial t)
        {
            Require(Unique(t.Steps.Select(s => s.Id)), "Duplicate step ID");
            for (int i = 1; i < t.Steps.Length; i++) Require(t.Steps[i].StartFrame >= t.Steps[i - 1].EndFrameExclusive, "Step ranges overlap or are unordered");
        }
        internal static void Validate(TutorialDraftStep s) { Require(Range(s.StartFrame, s.EndFrameExclusive, s.CheckpointFrame), "Invalid step range"); Require(Unique(s.ActiveHands), "Duplicate active hand"); }
        internal static void Validate(TutorialDraftEdit t)
        {
            Require(Unique(t.Steps.Select(s => s.Id)), "Duplicate step ID");
            for (int i = 1; i < t.Steps.Length; i++) Require(t.Steps[i].StartFrame >= t.Steps[i - 1].EndFrameExclusive, "Step ranges overlap or are unordered");
        }
        internal static void Validate(GuideSnapshot s) => Require((s.StepId == null) == (s.AttemptId == null), "Step and attempt must be present together");
        internal static void Validate(SceneReferenceManifest m) => Require(Unique(m.References.Select(r => r.Id)) && m.References.All(r => r.RecordingId == m.RecordingId && r.RecordingHash == m.RecordingHash && r.TutorialId == m.TutorialId && r.TutorialRevision == m.TutorialRevision), "Duplicate reference or identity mismatch");
        internal static void Validate(InspectionRequest r) => Require(Unique(r.ReferenceIds), "Duplicate reference ID");
        internal static void Validate(CoachAssessment a) => Require(!Visual(a) || a.ObservedEvidence.Length > 0, "Visual verdict requires evidence");
        private static bool Visual(CoachAssessment a) => a.Verdict == "visible-match" || a.Verdict == "adjustment-needed";
        internal static void Validate(InspectionResult r) => Require(Unique(r.ReferenceIds) && r.ReferenceIds.SequenceEqual(r.Request.ReferenceIds) && (!Visual(r.Assessment) || r.ObservationId != null && r.ReferenceIds.Length > 0), "Result identity/evidence mismatch");
        private static bool SamePose(CanonicalPose a, CanonicalPose b) => Vector3.Distance(a.PositionM, b.PositionM) <= 0.000001 &&
            Math.Min(Vector4.Distance(new Vector4(a.OrientationXyzw.X,a.OrientationXyzw.Y,a.OrientationXyzw.Z,a.OrientationXyzw.W), new Vector4(b.OrientationXyzw.X,b.OrientationXyzw.Y,b.OrientationXyzw.Z,b.OrientationXyzw.W)), Vector4.Distance(new Vector4(a.OrientationXyzw.X,a.OrientationXyzw.Y,a.OrientationXyzw.Z,a.OrientationXyzw.W), -new Vector4(b.OrientationXyzw.X,b.OrientationXyzw.Y,b.OrientationXyzw.Z,b.OrientationXyzw.W))) <= 0.0001;
        public static void ValidateTutorialRecording(Tutorial tutorial, Recording recording, string recordingHash)
        {
            // Validate constructed DTOs as well as parsed DTOs. Callers may use object initializers.
            tutorial = ContractJson.ParseTutorial(ContractJson.SerializeTutorial(tutorial));
            recording = ContractJson.ParseRecording(ContractJson.SerializeRecording(recording));
            Require(tutorial.RecordingId == recording.Id && tutorial.RecordingHash == recordingHash && ContractJson.SerializeWorkspaceDefinition(tutorial.Workspace) == ContractJson.SerializeWorkspaceDefinition(recording.Workspace), "Tutorial recording/hash/workspace binding mismatch");
            foreach (var step in tutorial.Steps)
            {
                Require(step.EndFrameExclusive <= recording.Frames.Length, "Step exceeds recording");
                foreach (var target in step.Targets)
                {
                    var start = Hand(recording.Frames[step.StartFrame], target.Side); var checkpoint = Hand(recording.Frames[step.CheckpointFrame], target.Side);
                    Require(start.Status == "valid" && checkpoint.Status == "valid", "Target requires valid hands");
                    Require(SamePose(start.Joints["wrist"], target.StartPose) && SamePose(checkpoint.Joints["wrist"], target.CheckpointPose), "Target must derive from recorded wrist");
                    foreach (var gate in target.MotionGates) { var hand = Hand(recording.Frames[gate.FrameIndex], target.Side); Require(hand.Status == "valid" && Vector3.Distance(hand.Joints["wrist"].PositionM, gate.PositionM) <= 0.000001, "Gate must derive from recorded wrist"); }
                }
            }
        }
        private static HandSample Hand(MotionFrame frame, string side) => side == "left" ? frame.Hands.Left : frame.Hands.Right;
    }
}
