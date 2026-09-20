using System;
using UnityEngine;

namespace Trail.Runtime.Record
{
    /// <summary>Two-second microphone ring, copied into a bounded piecewise motion timeline. Never monitors the mic locally.</summary>
    public sealed class UnityNarrationCapture : MonoBehaviour, INarrationCapture
    {
        public Func<double> Clock = () => MotionClock.NowMs;
        public string Status { get; private set; } = "Narration idle.";
        private AudioClip clip;
        private string device;
        private float[] ring;
        private int previousPosition;
        private long capturedSamples;
        private double lastPollMs, sourceOriginMs = double.NaN, previousTakeMs;
        private NarrationTimeline timeline;
        private string failure;
        public bool Begin()
        {
            Discard();
#if UNITY_ANDROID && !UNITY_EDITOR
            if (!UnityEngine.Android.Permission.HasUserAuthorizedPermission(UnityEngine.Android.Permission.Microphone))
            {
                UnityEngine.Android.Permission.RequestUserPermission(UnityEngine.Android.Permission.Microphone);
                Status = "Allow microphone access, then recalibrate and start recording again."; return false;
            }
#endif
            if (Microphone.devices.Length == 0) { Status = "No microphone is available for narration."; return false; }
            device = Microphone.devices[0];
            if (Microphone.IsRecording(device)) { Status = "End voice coaching before recording narration."; return false; }
            if (!MicrophoneLease.TryAcquire(this)) { Status = "End voice coaching before recording narration."; return false; }
            try
            {
                clip = Microphone.Start(device, true, 2, NarrationPcm.SampleRate);
                if (clip == null || clip.frequency != NarrationPcm.SampleRate || clip.channels != 1) throw new InvalidOperationException();
                ring = new float[clip.samples]; previousPosition = 0; capturedSamples = 0;
                timeline = new NarrationTimeline(); sourceOriginMs = double.NaN; previousTakeMs = 0; failure = null; lastPollMs = Clock();
                Status = "Microphone ready; narration follows the active take clock."; return true;
            }
            catch (Exception) { Discard(); Status = "Could not open the mono narration microphone."; return false; }
        }
        private void Update()
        {
            if (clip == null) return;
            try { Poll(); }
            catch (InvalidOperationException error) { failure = error.Message; Status = failure; ReleaseDevice(); }
        }
        private void Poll()
        {
            if (clip == null || !Microphone.IsRecording(device)) throw new InvalidOperationException("Narration microphone stopped; discard and retry this take.");
            var now = Clock();
            if (now < lastPollMs || now - lastPollMs > 1800) throw new InvalidOperationException("Narration ring overran during an application stall.");
            var position = Microphone.GetPosition(device);
            if (position < 0) throw new InvalidOperationException("Narration microphone position is unavailable.");
            var added = position - previousPosition; if (added < 0) added += clip.samples;
            capturedSamples += added; previousPosition = position; lastPollMs = now;
            if (double.IsNaN(sourceOriginMs) && capturedSamples > 0) sourceOriginMs = now - capturedSamples * 1000.0 / NarrationPcm.SampleRate;
            if (!double.IsNaN(sourceOriginMs) && Math.Abs(now - sourceOriginMs - capturedSamples * 1000.0 / NarrationPcm.SampleRate) > 100)
                throw new InvalidOperationException("Narration clock drift exceeded 100 ms; discard and retry this take.");
            if (!clip.GetData(ring, 0)) throw new InvalidOperationException("Narration microphone samples are unavailable.");
        }
        public void Align(double sourceMonotonicMs, double takeMs)
        {
            if (failure != null) throw new InvalidOperationException(failure);
            Poll();
            if (double.IsNaN(sourceOriginMs)) throw new InvalidOperationException("Narration microphone has not produced samples.");
            var delta = takeMs - previousTakeMs;
            if (delta < 0) throw new InvalidOperationException("Narration take clock went backwards.");
            var startSource = sourceMonotonicMs - delta;
            var first = (long)Math.Round((startSource - sourceOriginMs) * NarrationPcm.SampleRate / 1000);
            var last = (long)Math.Round((sourceMonotonicMs - sourceOriginMs) * NarrationPcm.SampleRate / 1000);
            // Device cursor may lag the hand clock by a polling interval. The measured bound is
            // represented in metadata; never silently replace genuinely missing history with silence.
            if (last > capturedSamples)
            {
                var lag = last - capturedSamples;
                if (lag * 1000.0 / NarrationPcm.SampleRate > 100) throw new InvalidOperationException("Narration is too far behind the hand clock.");
                first -= lag; last -= lag;
            }
            if (first < 0 || first < capturedSamples - ring.Length || last > capturedSamples || last - first > ring.Length)
                throw new InvalidOperationException("Narration samples no longer cover the motion interval.");
            timeline.AppendTo(takeMs, (index, count) =>
            {
                var at = first + (long)index * Math.Max(0, last - first) / Math.Max(1, count);
                var value = ring[(int)(at % ring.Length)];
                if (float.IsNaN(value) || float.IsInfinity(value)) throw new InvalidOperationException("Invalid microphone sample.");
                value = Mathf.Clamp(value, -1, 1); return (short)Math.Round(value * (value < 0 ? 32768 : 32767));
            });
            previousTakeMs = takeMs;
        }
        public byte[] Finish(double startMs, double durationMs)
        {
            if (failure != null || timeline == null) throw new InvalidOperationException(failure ?? "No narration was captured.");
            var result = timeline.Trim(startMs, durationMs); ReleaseDevice(); timeline = null; return result;
        }
        public void Discard() { ReleaseDevice(); timeline = null; failure = null; }
        private void ReleaseDevice()
        {
            if (clip != null) { Microphone.End(device); Destroy(clip); clip = null; }
            ring = null;
            MicrophoneLease.Release(this);
        }
        private void OnDisable() => Discard();
        private void OnApplicationPause(bool paused) { if (paused) Discard(); }
        private void OnApplicationFocus(bool focused) { if (!focused) Discard(); }
    }
}
