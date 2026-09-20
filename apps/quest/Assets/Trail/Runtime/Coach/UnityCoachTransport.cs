using System;
using System.Collections;
using System.Text;
using UnityEngine;
using Unity.WebRTC;

namespace Trail.Runtime.Coach
{
    /// <summary>Audio-only WebRTC. Readiness requires the provider session.started event, not merely ICE connectivity.</summary>
    public sealed class UnityCoachTransport : MonoBehaviour, ICoachTransport
    {
        public UnityCoachMicrophone Microphone;
        public event Action<string, string> Transcript;
        public event Action Closed;
        public bool Open => channel != null && channel.ReadyState == RTCDataChannelState.Open;
        private RTCPeerConnection peer;
        private RTCDataChannel channel;
        private AudioStreamTrack remoteTrack;
        private AudioSource sink;
        private Action connected, failed;
        private bool started, answered, muted;
        private int generation;
        private Coroutine pump, negotiation;
        [Serializable] private sealed class WireEvent { public string type; public string delta;  }

        private void OnEnable() { pump = StartCoroutine(WebRTC.Update()); }
        public void CreateOffer(Action<string> offered, Action failure)
        {
            Close();
            failed = failure;
            var current = generation;
            try
            {
                if (Microphone == null || Microphone.Track == null) { Fail(current); return; }
                peer = new RTCPeerConnection();
                peer.OnConnectionStateChange = state =>
                {
                    if (current != generation) return;
                    if (state == RTCPeerConnectionState.Failed || state == RTCPeerConnectionState.Disconnected || state == RTCPeerConnectionState.Closed) Fail(current);
                };
                peer.OnTrack = e =>
                {
                    if (current != generation || !(e.Track is AudioStreamTrack audio)) return;
                    remoteTrack?.Dispose(); remoteTrack = audio;
                    if (sink == null) sink = gameObject.GetComponent<AudioSource>() ?? gameObject.AddComponent<AudioSource>();
                    sink.playOnAwake = false; sink.spatialBlend = 0; sink.loop = true; sink.mute = muted;
                    sink.SetTrack(audio); sink.Play();
                };
                peer.AddTrack(Microphone.Track);
                channel = peer.CreateDataChannel("oai-events");
                channel.OnMessage = bytes => { if (current == generation) Receive(bytes); };
                channel.OnOpen = Ready;
                channel.OnClose = () => { if (current == generation) Fail(current); };
                negotiation = StartCoroutine(Offer(current, offered));
            }
            catch (Exception) { Fail(current); }
        }

        private IEnumerator Offer(int current, Action<string> offered)
        {
            var deadline = Time.realtimeSinceStartup + 12;
            while (current == generation && !Microphone.Ready && Time.realtimeSinceStartup < deadline) yield return null;
            if (current != generation) yield break;
            if (!Microphone.Ready) { Fail(current); yield break; }
            var offer = peer.CreateOffer(); yield return offer;
            if (current != generation) yield break;
            if (offer.IsError) { Fail(current); yield break; }
            var description = offer.Desc;
            var local = peer.SetLocalDescription(ref description); yield return local;
            if (current != generation) yield break;
            if (local.IsError) { Fail(current); yield break; }
            while (current == generation && peer.GatheringState != RTCIceGatheringState.Complete && Time.realtimeSinceStartup < deadline) yield return null;
            if (current != generation) yield break;
            if (peer.GatheringState != RTCIceGatheringState.Complete) { Fail(current); yield break; }
            offered(peer.LocalDescription.sdp);
        }

        public void AcceptAnswer(string answerSdp, Action ready, Action failure)
        {
            connected = ready; failed = failure;
            if (peer == null) { failure(); return; }
            negotiation = StartCoroutine(Answer(generation, answerSdp));
        }
        private IEnumerator Answer(int current, string sdp)
        {
            var description = new RTCSessionDescription { type = RTCSdpType.Answer, sdp = sdp };
            var answer = peer.SetRemoteDescription(ref description); yield return answer;
            if (current != generation) yield break;
            if (answer.IsError) { Fail(current); yield break; }
            answered = true; Ready();
        }
        private void Ready()
        {
            if (!answered || !started || !Open) return;
            var callback = connected; connected = null; callback?.Invoke();
        }
        private void Receive(byte[] bytes)
        {
            if (bytes == null || bytes.Length > 65536) return;
            WireEvent value;
            try { value = JsonUtility.FromJson<WireEvent>(Encoding.UTF8.GetString(bytes)); }
            catch (ArgumentException) { return; }
            if (value == null) return;
            switch (value.type)
            {
                case "session.started": started = true; Ready(); break;
                case "session.input_transcript.delta":
                    if (value.delta == null || value.delta.Length > 4096) break;
                    Transcript?.Invoke("learner", value.delta); break;
                case "session.output_transcript.delta":
                    if (value.delta != null && value.delta.Length <= 4096) Transcript?.Invoke("coach", value.delta); break;
                case "session.closed": case "error": Fail(generation); break;
            }
        }
        private void Fail(int current)
        {
            if (current != generation) return;
            var callback = failed; failed = null;
            Close(); callback?.Invoke(); Closed?.Invoke();
        }
        public void Send(string json)
        {
            if (!Open) throw new InvalidOperationException("The coach channel is closed.");
            channel.Send(json);
        }
        public void SetOutputMuted(bool value) { muted = value; if (sink != null) sink.mute = value; }
        public void Close()
        {
            generation++;
            if (negotiation != null) { StopCoroutine(negotiation); negotiation = null; }
            connected = null; failed = null; started = false; answered = false;
            if (sink != null) sink.Stop();
            channel?.Close(); channel?.Dispose(); channel = null;
            peer?.Close(); peer?.Dispose(); peer = null;
            remoteTrack?.Dispose(); remoteTrack = null;
        }
        private void OnDisable() { Close(); if (pump != null) StopCoroutine(pump); }
        private void OnDestroy() => Close();
    }
}
