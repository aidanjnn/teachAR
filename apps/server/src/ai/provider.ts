import type {
  CoachAnswer, CoachRequest, CoachSessionRequest, CoachSessionResponse, LabelRequest, LabelResult, TranscriptResult, VoiceUnavailable,
} from '@trail/contracts';

export interface TranscribeInput {
  bytes: Uint8Array;
  mimeType: string;
  audioStartOffsetMs: number;
  /** Client-reported duration; the mock provider scales its fixture to it. */
  audioDurationHintMs: number | null;
  signal: AbortSignal;
}

export interface AiProvider {
  readonly name: 'mock' | 'openai';
  transcribe(input: TranscribeInput): Promise<TranscriptResult>;
  label(request: LabelRequest, signal: AbortSignal): Promise<LabelResult>;
  coachText(request: CoachRequest, signal: AbortSignal): Promise<CoachAnswer>;
  createLiveSession(request: CoachSessionRequest, signal: AbortSignal): Promise<CoachSessionResponse | VoiceUnavailable>;
}
