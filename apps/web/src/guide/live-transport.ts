import { OpenAILiveWebRTC } from 'openai/live/webrtc';
import type { ConnectClientEvent, ConnectServerEvent } from 'openai/resources/live/sideband/sideband';

export type LiveServerEvent = ConnectServerEvent;
export type LiveClientEvent = ConnectClientEvent;

export interface LiveConnectOptions {
  /** Posts the SDP offer to our server and returns the answer. Never talks to OpenAI directly. */
  exchangeSdp: (offer: string, signal: AbortSignal) => Promise<string>;
  localStream: MediaStream;
  onEvent: (event: LiveServerEvent) => void;
  onRemoteStream: (stream: MediaStream) => void;
  onClosed: () => void;
  timeoutMs: number;
}
export interface LiveTransport {
  connect(options: LiveConnectOptions): Promise<void>;
  send(event: LiveClientEvent): void;
  close(): void;
}

export function createWebRtcLiveTransport(): LiveTransport {
  let connection: OpenAILiveWebRTC | null = null;
  return {
    async connect(options) {
      const active = new OpenAILiveWebRTC();
      connection = active;
      for (const track of options.localStream.getAudioTracks()) active.peerConnection.addTrack(track, options.localStream);
      active.peerConnection.addEventListener('track', event => {
        const [stream] = (event as RTCTrackEvent).streams;
        if (stream) options.onRemoteStream(stream);
      });
      active.onEvent(options.onEvent);
      active.onConnectionEvent(event => { if (event.type === 'closed') options.onClosed(); });
      await active.connect({ exchangeSdp: (offer, { signal }) => options.exchangeSdp(offer, signal), timeoutMs: options.timeoutMs });
    },
    send(event) { connection?.send(event); },
    close() { connection?.close(); connection = null; },
  };
}
