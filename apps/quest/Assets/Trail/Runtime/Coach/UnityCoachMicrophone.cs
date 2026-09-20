using UnityEngine;
using Unity.WebRTC;

namespace Trail.Runtime.Coach
{
    /// <summary>Single microphone owner. Local monitoring is disabled independently of the transmitted track gate.</summary>
    public sealed class UnityCoachMicrophone : MonoBehaviour, ICoachMicrophone
    {
        public bool Held => clip != null;
        public bool Capturing { get; private set; }
        public AudioStreamTrack Track { get; private set; }
        public bool Ready => Held && UnityEngine.Microphone.GetPosition(device) > 0;
        private AudioSource source;
        private AudioClip clip;
        private string device;

        public bool AcquireMuted()
        {
            Release();
#if UNITY_ANDROID && !UNITY_EDITOR
            if (!UnityEngine.Android.Permission.HasUserAuthorizedPermission(UnityEngine.Android.Permission.Microphone)) return false;
#endif
            if (UnityEngine.Microphone.devices.Length == 0) return false;
            device = UnityEngine.Microphone.devices[0];
            // Do not end a recording owned by narration capture.
            if (UnityEngine.Microphone.IsRecording(device)) return false;
            try
            {
                source = gameObject.GetComponent<AudioSource>() ?? gameObject.AddComponent<AudioSource>();
                source.playOnAwake = false; source.loop = true; source.spatialBlend = 0;
                Track = new AudioStreamTrack(source) { Loopback = false, Enabled = false };
                clip = UnityEngine.Microphone.Start(device, true, 1, 48000);
                if (clip == null) { Release(); return false; }
                source.clip = clip;
                return true;
            }
            catch (System.Exception) { Release(); return false; }
        }

        private void Update()
        {
            if (Ready && !source.isPlaying) source.Play();
        }

        public void SetCapturing(bool capturing)
        {
            Capturing = capturing && Held;
            if (Track != null) Track.Enabled = Capturing;
        }

        public void Release()
        {
            SetCapturing(false);
            if (source != null) { source.Stop(); source.clip = null; }
            if (clip != null)
            {
                UnityEngine.Microphone.End(device);
                Destroy(clip); clip = null;
            }
            Track?.Dispose(); Track = null;
        }
        private void OnDisable() => Release();
        private void OnDestroy() => Release();
    }
}
