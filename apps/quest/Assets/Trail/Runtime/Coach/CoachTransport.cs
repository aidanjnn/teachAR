using System;

namespace Trail.Runtime.Coach
{
    /// <summary>
    /// The microphone as the pure layer sees it. An implementation must open silent and must survive being
    /// released twice: the reducer emits a release on every exit path, including ones that never acquired it.
    /// </summary>
    public interface ICoachMicrophone
    {
        bool Held { get; }
        bool Capturing { get; }
        /// <summary>Opens the capture device with capture disabled. False when permission is refused or the device is busy.</summary>
        bool AcquireMuted();
        void SetCapturing(bool capturing);
        /// <summary>Stops and frees the device. Idempotent.</summary>
        void Release();
    }

    /// <summary>
    /// Narrow live-audio transport. The offer is relayed through the paired Trail server, which holds the
    /// provider credential; this client never talks to a provider directly and never sees a provider key.
    ///
    /// UnityCoachTransport implements this with the pinned native WebRTC package; headset validation remains required.
    /// </summary>
    public interface ICoachTransport
    {
        bool Open { get; }
        /// <summary>Produces a local audio offer SDP for the caller to relay. Reports failure instead of throwing.</summary>
        void CreateOffer(Action<string> offered, Action failed);
        /// <summary>Applies the server-relayed answer SDP and reports when the live session is usable.</summary>
        void AcceptAnswer(string answerSdp, Action connected, Action failed);
        /// <summary>Sends one already-encoded live client event. See CoachLiveEvents for the permitted set.</summary>
        void Send(string clientEventJson);
        /// <summary>Silences remote coach audio that belongs to a step the learner has already left.</summary>
        void SetOutputMuted(bool muted);
        /// <summary>Closes the peer connection and drops the remote track. Idempotent.</summary>
        void Close();
    }
}
