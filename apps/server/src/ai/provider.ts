import type {
  CoachAnswer, CoachRequest, CoachSessionRequest, CoachSessionResponse, LabelRequest, LabelResult, TranscriptResult, VoiceUnavailable,
} from '@trail/contracts';

export interface TranscribeInput {
  /** ArrayBuffer-backed so it can be wrapped in a File without another copy. */
  bytes: Uint8Array<ArrayBuffer>;
  mimeType: string;
  audioStartOffsetMs: number;
  /** Client-reported duration; the mock provider scales its fixture to it. */
  audioDurationHintMs: number | null;
  signal: AbortSignal;
}

/** Server-side control channel to a live session; the browser never gets one. */
export interface LiveControlChannel {
  send(event: { type: 'session.thinking.append'; event_id: string; delegation_id: null; content: string } | { type: 'session.close'; event_id: string }): void;
  close(): void;
  onClose(handler: () => void): void;
}

export interface AiProvider {
  readonly name: 'mock' | 'openai';
  transcribe(input: TranscribeInput): Promise<TranscriptResult>;
  label(request: LabelRequest, signal: AbortSignal): Promise<LabelResult>;
  coachText(request: CoachRequest, signal: AbortSignal): Promise<CoachAnswer>;
  createLiveSession(request: CoachSessionRequest, signal: AbortSignal): Promise<CoachSessionResponse | VoiceUnavailable>;
  /** Null when the provider has no live sessions (mock) or the control channel could not be opened. */
  openLiveControl(sessionId: string): LiveControlChannel | null;
}
