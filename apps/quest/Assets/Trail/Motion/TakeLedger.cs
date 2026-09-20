using System;
using System.Collections.Generic;
using System.Numerics;
using Trail.Contracts;

namespace Trail.Motion
{
    // The interval to keep from inside the narration asset itself, so the adapter that owns the
    // bytes clips exactly the span the motion trim kept. Times are relative to the asset start.
    public sealed class NarrationTrim
    {
        public double SourceStartMs { get; }
        public double SourceEndMsExclusive { get; }
        public bool ClipsSource { get; }
        internal NarrationTrim(double sourceStartMs, double sourceEndMsExclusive, bool clipsSource)
        { SourceStartMs = sourceStartMs; SourceEndMsExclusive = sourceEndMsExclusive; ClipsSource = clipsSource; }
    }

    public sealed class TrimmedTake
    {
        public Recording Recording { get; }
        public AudioAsset Narration { get; }
        public NarrationTrim NarrationSource { get; }
        public TakeTrim Trim { get; }
        public string DroppedNarrationReason { get; }
        internal TrimmedTake(Recording recording, AudioAsset narration, NarrationTrim source, TakeTrim trim, string droppedReason)
        { Recording = recording; Narration = narration; NarrationSource = source; Trim = trim; DroppedNarrationReason = droppedReason; }
    }

    public sealed class RecordedTake
    {
        public Recording Recording { get; }
        public AudioAsset Narration { get; }
        public NarrationTrim NarrationSource { get; }
        public TakeTrim Trim { get; }
        public string TrimReason { get; }
        internal RecordedTake(TrimmedTake trimmed, string trimReason)
        { Recording = trimmed.Recording; Narration = trimmed.Narration; NarrationSource = trimmed.NarrationSource; Trim = trimmed.Trim; TrimReason = trimReason; }
    }

    // One half-open boundary applied to motion, markers and narration together. No I/O and no
    // clocks: the caller has already decided the boundary with RecordingDirector.
    public static class TakeTrimmer
    {
        public static TrimmedTake Trim(Recording recording, TakeTrim trim, string recordingId,
            AudioAsset narration = null, string trimmedNarrationAssetId = null)
        {
            if (recording == null) throw new ArgumentNullException(nameof(recording));
            if (string.IsNullOrWhiteSpace(recordingId) || recordingId.Length > 128) throw new ArgumentException("Recording ID required.");
            var start = trim == null ? 0 : trim.StartMs;
            var kept = new List<MotionFrame>();
            foreach (var frame in recording.Frames)
                if (trim == null || trim.Contains(frame.TMs))
                    kept.Add(new MotionFrame { TMs = frame.TMs - start, Hands = frame.Hands, Head = frame.Head });
            if (kept.Count == 0) throw new InvalidOperationException("The trim boundary leaves no recorded motion.");
            var markers = new List<StepMarker>();
            foreach (var marker in recording.Markers)
                if (trim == null || trim.Contains(marker.TMs))
                    markers.Add(new StepMarker { Id = marker.Id, TMs = marker.TMs - start, Kind = marker.Kind, Source = marker.Source });
            string dropped = null; NarrationTrim source = null; AudioAsset audio = null;
            if (narration != null)
            {
                // The narration covers [offset, offset + duration) on the same take timeline the
                // motion frames use, so the identical boundary decides both.
                var end = trim == null ? Math.Max(narration.AudioStartOffsetMs + narration.DurationMs, kept[kept.Count - 1].TMs + start) : trim.EndMsExclusive;
                var keepStart = Math.Max(start, narration.AudioStartOffsetMs);
                var keepEnd = Math.Min(end, narration.AudioStartOffsetMs + narration.DurationMs);
                if (keepEnd - keepStart <= 0) dropped = "The trim boundary leaves no narration on the take timeline.";
                else
                {
                    var sourceStart = keepStart - narration.AudioStartOffsetMs;
                    var sourceEnd = keepEnd - narration.AudioStartOffsetMs;
                    var clips = sourceStart > .0000001 || sourceEnd < narration.DurationMs - .0000001;
                    if (clips && (string.IsNullOrWhiteSpace(trimmedNarrationAssetId) || trimmedNarrationAssetId.Length > 128))
                        throw new ArgumentException("Clipped narration needs a new durable asset ID for its re-clipped bytes.");
                    source = new NarrationTrim(sourceStart, sourceEnd, clips);
                    audio = new AudioAsset { AssetId = clips ? trimmedNarrationAssetId : narration.AssetId, MimeType = narration.MimeType,
                        DurationMs = keepEnd - keepStart, AudioStartOffsetMs = keepStart - start, SyncMethod = narration.SyncMethod,
                        EstimatedSyncErrorMs = narration.EstimatedSyncErrorMs };
                }
            }
            var result = new Recording { SchemaVersion = recording.SchemaVersion, Id = recordingId, CoordinateFrame = recording.CoordinateFrame,
                Workspace = recording.Workspace, JointOrder = recording.JointOrder, NominalSampleHz = recording.NominalSampleHz,
                DurationMs = kept[kept.Count - 1].TMs, Frames = kept.ToArray(), Markers = markers.ToArray(), Audio = audio, Source = recording.Source };
            // Validation and deep copy at the save boundary, exactly as MotionCapture.Finish does.
            return new TrimmedTake(ContractJson.ParseRecording(ContractJson.SerializeRecording(result)), audio, source,
                trim ?? new TakeTrim(0, result.DurationMs + 1), dropped);
        }
    }

    // Bounded take buffer plus the committed takes of one tutorial. No clocks, timers or I/O:
    // every timestamp arrives from RecordingDirector's paused-time-free take clock.
    public sealed class TakeLedger
    {
        private readonly List<MotionFrame> pending = new List<MotionFrame>();
        private readonly List<RecordedTake> takes = new List<RecordedTake>();
        private readonly WorkspaceDefinition workspace;
        private readonly string source;
        private readonly int maxFrames, maxTakes, maxEncodedFrameChars;
        private double lastFrameMs = double.NegativeInfinity;
        private int encodedFrameChars;
        public IReadOnlyList<RecordedTake> Takes => takes;
        public int PendingFrameCount => pending.Count;
        public string PendingStopReason { get; private set; }
        public TakeLedger(WorkspaceDefinition workspace, string source, int maxFrames = 3600, int maxTakes = 12,
            int maxEncodedFrameChars = 31 * 1024 * 1024)
        {
            if (workspace == null) throw new ArgumentNullException(nameof(workspace));
            if ((source != "live" && source != "synthetic-fixture" && source != "recorded-fixture") ||
                maxFrames < 2 || maxFrames > 3600 || maxTakes < 1 || maxTakes > 128 ||
                maxEncodedFrameChars < 256 || maxEncodedFrameChars > 31 * 1024 * 1024) throw new ArgumentException("Invalid ledger bounds/source.");
            this.workspace = workspace; this.source = source; this.maxFrames = maxFrames;
            this.maxTakes = maxTakes; this.maxEncodedFrameChars = maxEncodedFrameChars;
        }
        public bool AppendFrame(double takeMs, HandSample left, HandSample right)
        {
            if (!GuideValidation.Finite(takeMs) || takeMs < 0 || takeMs <= lastFrameMs || takeMs > 120000) return false;
            if (pending.Count >= maxFrames) { PendingStopReason = "frame limit"; return false; }
            var frame = new MotionFrame { TMs = takeMs, Hands = new HandSamples { Left = Copy(left), Right = Copy(right) }, Head = null };
            var encodedSize = ContractJson.SerializeMotionFrame(frame).Length + 1;
            if (encodedFrameChars + encodedSize > maxEncodedFrameChars) { PendingStopReason = "serialized motion size limit"; return false; }
            encodedFrameChars += encodedSize; pending.Add(frame); lastFrameMs = takeMs;
            return true;
        }
        public void DiscardPending()
        { pending.Clear(); lastFrameMs = double.NegativeInfinity; encodedFrameChars = 0; PendingStopReason = null; }
        // Starting a new tutorial abandons its predecessor's takes along with its save position.
        public void Clear() { takes.Clear(); DiscardPending(); }
        // Replacing take N rewrites only take N; discarding instead of committing leaves it untouched.
        public RecordedTake Commit(int? replaceIndex, TakeTrim trim, string trimReason, string recordingId,
            AudioAsset narration = null, string trimmedNarrationAssetId = null)
        {
            if (pending.Count == 0) throw new InvalidOperationException("No fresh frames were captured.");
            if (replaceIndex.HasValue && (replaceIndex.Value < 0 || replaceIndex.Value >= takes.Count)) throw new ArgumentOutOfRangeException(nameof(replaceIndex));
            if (!replaceIndex.HasValue && takes.Count >= maxTakes) throw new InvalidOperationException("Tutorial already holds the maximum number of takes.");
            if (string.IsNullOrWhiteSpace(trimReason) || trimReason.Length > 128) throw new ArgumentException("Trim reason required.");
            var whole = new Recording { SchemaVersion = 1, Id = recordingId, CoordinateFrame = "workspace", Workspace = workspace,
                JointOrder = Names(), NominalSampleHz = 30, DurationMs = pending[pending.Count - 1].TMs, Frames = pending.ToArray(),
                Markers = Array.Empty<StepMarker>(), Audio = null, Source = source };
            var take = new RecordedTake(TakeTrimmer.Trim(whole, trim, recordingId, narration, trimmedNarrationAssetId), trimReason);
            if (replaceIndex.HasValue) takes[replaceIndex.Value] = take; else takes.Add(take);
            DiscardPending();
            return take;
        }
        // Convenience wiring for one reduced transition; the runtime adapter adds no policy of its own.
        public RecordedTake Apply(RecordingTransition transition, ReferenceObservation observation, string recordingId = null,
            AudioAsset narration = null, string trimmedNarrationAssetId = null)
        {
            if (transition == null) throw new ArgumentNullException(nameof(transition));
            if (transition.ClearCommittedTakes) Clear();
            else if (transition.DiscardPendingTake) DiscardPending();
            if (transition.AdmitFrameAtMs.HasValue)
            {
                if (observation == null) throw new ArgumentNullException(nameof(observation));
                AppendFrame(transition.AdmitFrameAtMs.Value, observation.Left, observation.Right);
            }
            if (transition.Commit == null) return null;
            return Commit(transition.Commit.ReplaceIndex, transition.Commit.Trim, transition.Commit.Reason,
                recordingId, narration, trimmedNarrationAssetId);
        }
        private static HandSample Copy(HandSample hand) =>
            MotionSamples.Transform(hand, new RigidRegistration(Vector3.Zero, Quaternion.Identity));
        private static string[] Names()
        {
            var names = new string[JointNames.Canonical.Count];
            for (var i = 0; i < names.Length; i++) names[i] = JointNames.Canonical[i];
            return names;
        }
    }
}
