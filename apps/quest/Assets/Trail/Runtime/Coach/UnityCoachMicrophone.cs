using UnityEngine;
using Unity.WebRTC;

namespace Trail.Runtime.Coach
{
    /// <summary>Single microphone owner. Local monitoring is disabled independently of the transmitted track gate.</summary>
    public sealed class UnityCoachMicrophone : MonoBehaviour, ICoachMicrophone
    {
        public string CapabilityStatus { get; private set; } = "Voice audio has not started.";
#if UNITY_ANDROID && !UNITY_EDITOR
        private AndroidJavaObject native;
        public bool Held => native != null;
        public bool Ready => native != null && native.Call<bool>("isReady");
        private readonly float[] samples = new float[480];
#else
        public bool Held => clip != null;
        public bool Ready => Held && UnityEngine.Microphone.GetPosition(device) > 0;
#endif
        public bool Capturing { get; private set; }
        public AudioStreamTrack Track { get; private set; }
#if !UNITY_ANDROID || UNITY_EDITOR
        private AudioSource source;
        private AudioClip clip;
        private string device;
#endif

        public bool AcquireMuted()
        {
            Release();
#if UNITY_ANDROID && !UNITY_EDITOR
            if (!UnityEngine.Android.Permission.HasUserAuthorizedPermission(UnityEngine.Android.Permission.Microphone))
            { CapabilityStatus = "Allow microphone access, then retry voice."; return false; }
#endif
            if (!MicrophoneLease.TryAcquire(this))
            { CapabilityStatus = "End narration before starting voice."; return false; }
#if UNITY_ANDROID && !UNITY_EDITOR
            try
            {
                native = new AndroidJavaObject("com.trail.audio.TrailVoiceCapture");
                using (var player = new AndroidJavaClass("com.unity3d.player.UnityPlayer"))
                using (var activity = player.GetStatic<AndroidJavaObject>("currentActivity"))
                {
                    var started = native.Call<bool>("start", activity);
                    CapabilityStatus = native.Call<string>("getStatus");
                    if (!started) { Release(); return false; }
                }
                Track = new AudioStreamTrack() { Enabled = false };
                return true;
            }
            catch (System.Exception) { CapabilityStatus = "Android voice capture failed. End voice and retry."; Release(); return false; }
#else
            if (UnityEngine.Microphone.devices.Length == 0) { Release(); return false; }
            device = UnityEngine.Microphone.devices[0];
            // Do not end a recording owned by narration capture.
            if (UnityEngine.Microphone.IsRecording(device)) { Release(); return false; }
            try
            {
                source = gameObject.GetComponent<AudioSource>() ?? gameObject.AddComponent<AudioSource>();
                source.playOnAwake = false; source.loop = true; source.spatialBlend = 0;
                Track = new AudioStreamTrack(source) { Loopback = false, Enabled = false };
                clip = UnityEngine.Microphone.Start(device, true, 1, 48000);
                if (clip == null) { Release(); return false; }
                source.clip = clip;
                CapabilityStatus = "Editor audio: echo cancellation is not provided. Use headphones.";
                return true;
            }
            catch (System.Exception) { Release(); return false; }
#endif
        }

        private void Update()
        {
#if UNITY_ANDROID && !UNITY_EDITOR
            if (native == null) return;
            try
            {
                if (native.Call<bool>("hasFailed")) { CapabilityStatus = native.Call<string>("getStatus"); Release(); return; }
                // The producer keeps only 120 ms. Bound JNI/drain work even after a frame stall.
                for (var block = 0; block < 12; block++)
                {
                    var pcm = native.Call<short[]>("poll");
                    if (pcm == null) break;
                    if (!Capturing || Track == null || pcm.Length != samples.Length) continue;
                    for (var i = 0; i < samples.Length; i++) samples[i] = pcm[i] / 32768f;
                    Track.SetData(samples, 1, 48000);
                }
            }
            catch (System.Exception) { CapabilityStatus = "Voice audio stopped. End voice and retry."; Release(); }
#else
            if (Ready && !source.isPlaying) source.Play();
#endif
        }

        public void SetCapturing(bool capturing)
        {
            Capturing = capturing && Held;
#if UNITY_ANDROID && !UNITY_EDITOR
            native?.Call("setMuted", !Capturing);
#endif
            if (Track != null) Track.Enabled = Capturing;
        }

        public void Release()
        {
            Capturing = false;
            try
            {
                if (Track != null) Track.Enabled = false;
#if UNITY_ANDROID && !UNITY_EDITOR
                var previous = native; native = null;
                if (previous != null)
                {
                    try { previous.Call("stop"); }
                    catch (System.Exception) { CapabilityStatus = "Voice audio teardown failed; restart the app before retrying."; }
                    finally { previous.Dispose(); }
                }
#else
                if (source != null) { source.Stop(); source.clip = null; }
                if (clip != null)
                {
                    UnityEngine.Microphone.End(device);
                    Destroy(clip); clip = null;
                }
#endif
            }
            finally
            {
                try { Track?.Dispose(); }
                finally { Track = null; MicrophoneLease.Release(this); }
            }
        }
        private void OnApplicationPause(bool paused) { if (paused) Release(); }
        private void OnApplicationFocus(bool focused) { if (!focused) Release(); }
        private void OnDisable() => Release();
        private void OnDestroy() => Release();
    }
}
