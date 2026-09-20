using System;
using System.Collections.Generic;
using Trail.Contracts;

namespace Trail.Runtime.Record
{
    /// <summary>Canonical bounded PCM16 mono WAV and motion-time assembly. No Unity or device dependency.</summary>
    public static class NarrationPcm
    {
        public const int SampleRate = 48000;
        public const int MaximumSamples = SampleRate * 120;
        public const int MaximumBytes = 44 + MaximumSamples * 2;
        public static int SampleAt(double milliseconds)
        {
            if (double.IsNaN(milliseconds) || double.IsInfinity(milliseconds) || milliseconds < 0 || milliseconds > 120000)
                throw new ArgumentException("Narration time exceeds the portable recording limit.");
            return (int)Math.Round(milliseconds * SampleRate / 1000, MidpointRounding.AwayFromZero);
        }
        public static byte[] Encode(short[] samples)
        {
            if (samples == null || samples.Length == 0 || samples.Length > MaximumSamples) throw new ArgumentException("Narration must hold at most 120 seconds.");
            var bytes = new byte[44 + samples.Length * 2];
            Tag(bytes, 0, "RIFF"); U32(bytes, 4, bytes.Length - 8); Tag(bytes, 8, "WAVE"); Tag(bytes, 12, "fmt ");
            U32(bytes, 16, 16); U16(bytes, 20, 1); U16(bytes, 22, 1); U32(bytes, 24, SampleRate);
            U32(bytes, 28, SampleRate * 2); U16(bytes, 32, 2); U16(bytes, 34, 16); Tag(bytes, 36, "data"); U32(bytes, 40, samples.Length * 2);
            for (var i = 0; i < samples.Length; i++) U16(bytes, 44 + i * 2, unchecked((ushort)samples[i]));
            return bytes;
        }
        public static short[] Decode(byte[] bytes)
        {
            if (bytes == null || bytes.Length < 46 || bytes.Length > MaximumBytes || bytes.Length % 2 != 0 ||
                !IsTag(bytes, 0, "RIFF") || Read32(bytes, 4) != bytes.Length - 8 || !IsTag(bytes, 8, "WAVE") ||
                !IsTag(bytes, 12, "fmt ") || Read32(bytes, 16) != 16 || Read16(bytes, 20) != 1 || Read16(bytes, 22) != 1 ||
                Read32(bytes, 24) != SampleRate || Read32(bytes, 28) != SampleRate * 2 || Read16(bytes, 32) != 2 || Read16(bytes, 34) != 16 ||
                !IsTag(bytes, 36, "data") || Read32(bytes, 40) != bytes.Length - 44) throw new ArgumentException("Invalid canonical narration WAV.");
            var samples = new short[(bytes.Length - 44) / 2];
            for (var i = 0; i < samples.Length; i++) samples[i] = unchecked((short)Read16(bytes, 44 + i * 2));
            return samples;
        }
        public static AudioAsset Metadata(byte[] bytes)
        {
            var samples = Decode(bytes);
            return new AudioAsset { AssetId = "narration", MimeType = "audio/wav", DurationMs = samples.Length * 1000.0 / SampleRate,
                AudioStartOffsetMs = 0, SyncMethod = "manual-markers", EstimatedSyncErrorMs = 100 };
        }
        public static void Validate(byte[] bytes, AudioAsset metadata)
        {
            if (metadata == null || metadata.AssetId != "narration" || metadata.MimeType != "audio/wav" || metadata.AudioStartOffsetMs != 0)
                throw new ArgumentException("Narration requires the canonical motion-aligned asset.");
            var duration = Decode(bytes).Length * 1000.0 / SampleRate;
            if (Math.Abs(duration - metadata.DurationMs) > 1000.0 / SampleRate + .000001) throw new ArgumentException("Narration duration does not match its bytes.");
        }
        public static byte[] Join(IReadOnlyList<Recording> takes, IReadOnlyList<byte[]> waves)
        {
            if (takes == null || waves == null || takes.Count == 0 || takes.Count != waves.Count) throw new ArgumentException("Narration takes do not match motion.");
            double duration = 0;
            for (var i = 0; i < takes.Count; i++)
            { duration += takes[i].DurationMs; if (i != takes.Count - 1) duration += 1000.0 / 30; }
            var result = new short[SampleAt(duration)]; double offset = 0; var any = false;
            for (var i = 0; i < takes.Count; i++)
            {
                if (takes[i].Audio != null)
                {
                    Validate(waves[i], takes[i].Audio); var source = Decode(waves[i]);
                    var start = SampleAt(offset); var end = SampleAt(offset + takes[i].DurationMs);
                    if (Math.Abs(source.Length - (end - start)) > 1) throw new ArgumentException("Take narration does not cover its motion.");
                    Array.Copy(source, 0, result, start, Math.Min(source.Length, end - start)); any = true;
                }
                else if (waves[i] != null) throw new ArgumentException("Undeclared narration bytes.");
                offset = (offset + takes[i].DurationMs) + 1000.0 / 30;
            }
            return any ? Encode(result) : null;
        }
        private static void Tag(byte[] bytes, int offset, string value) { for (var i = 0; i < value.Length; i++) bytes[offset + i] = (byte)value[i]; }
        private static bool IsTag(byte[] bytes, int offset, string value) { for (var i = 0; i < value.Length; i++) if (bytes[offset + i] != value[i]) return false; return true; }
        private static void U16(byte[] bytes, int offset, int value) { bytes[offset] = (byte)value; bytes[offset + 1] = (byte)(value >> 8); }
        private static void U32(byte[] bytes, int offset, int value) { U16(bytes, offset, value); U16(bytes, offset + 2, value >> 16); }
        private static int Read16(byte[] bytes, int offset) => bytes[offset] | bytes[offset + 1] << 8;
        private static int Read32(byte[] bytes, int offset) => Read16(bytes, offset) | Read16(bytes, offset + 2) << 16;
    }
    public interface INarrationCapture
    {
        bool Begin();
        string Status { get; }
        void Align(double sourceMonotonicMs, double takeMs);
        byte[] Finish(double startMs, double durationMs);
        void Discard();
    }
    /// <summary>Samples copied only over the active director clock; paused wall time has no output slot.</summary>
    public sealed class NarrationTimeline
    {
        private readonly List<short> samples = new List<short>();
        public double DurationMs => samples.Count * 1000.0 / NarrationPcm.SampleRate;
        public int SampleCount => samples.Count;
        public void AppendTo(double takeMs, Func<int, int, short> source)
        {
            var end = NarrationPcm.SampleAt(takeMs);
            if (end < samples.Count) throw new ArgumentException("Narration clock went backwards.");
            var count = end - samples.Count;
            for (var i = 0; i < count; i++) samples.Add(source(i, count));
        }
        public byte[] Trim(double startMs, double durationMs)
        {
            var start = NarrationPcm.SampleAt(startMs); var length = NarrationPcm.SampleAt(durationMs);
            if (length == 0 || start + length > samples.Count) throw new ArgumentException("Narration does not cover the kept motion interval.");
            var result = new short[length]; samples.CopyTo(start, result, 0, length); return NarrationPcm.Encode(result);
        }
    }
}
