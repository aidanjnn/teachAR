import {
  COACH_TEXT_DEADLINE_MS,
  type CoachAnswer, type CoachContext, type CoachRequest, type CoachSessionRequest, type CoachSessionResponse,
  type LabelFailure, type LabelRequest, type LabelResult, type VoiceUnavailable,
} from '@trail/contracts';
import type { LiveCreateParams } from 'openai/resources/live/live';
import { alignTranscript } from './align.js';
import { CoachModelOutputSchema, backendInstructions, coachTextPrompt, fallbackAnswer, frontendInstructions, modelAnswer } from './coach-prompts.js';
import { LabelModelOutputSchema, buildLabelPrompt, fallbackLabels, modelLabels, validateLabelOutput } from './labels.js';
import type { OpenAiGateway } from './openai-gateway.js';
import type { AiProvider, TranscribeInput } from './provider.js';

export interface OpenAiProviderOptions {
  gateway: OpenAiGateway;
  transcribeModel: string; textModel: string; liveModel: string; liveBackendModel: string; liveVoice: string;
  labelTimeoutMs?: number; coachTimeoutMs?: number;
}
export const LABEL_TIMEOUT_MS = 15_000;
/** Client events the untrusted browser data channel may send. Instructions and session updates never come from the browser. */
export const BROWSER_CLIENT_EVENTS = ['session.input_audio.mute', 'session.input_audio.unmute', 'session.thinking.append', 'session.close'];

export function isTimeoutError(error: unknown): boolean {
  return error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError');
}

export function buildLiveSessionParams(
  context: CoachContext, sdp: string, models: Pick<OpenAiProviderOptions, 'liveModel' | 'liveBackendModel' | 'liveVoice'>,
): LiveCreateParams {
  return {
    session: {
      model: models.liveModel,
      instructions: frontendInstructions(context),
      audio: { output: { voice: models.liveVoice } },
      delegation: {
        type: 'responses',
        // No tools are registered, so the backend cannot call anything; tool_choice is deliberately omitted.
        responses: { model: models.liveBackendModel, instructions: backendInstructions(context), max_output_tokens: 200 },
      },
      client: { data_channel: { allowed_client_events: BROWSER_CLIENT_EVENTS } },
      store: false,
    },
    transport: { type: 'webrtc', sdp },
  };
}

export function createOpenAiProvider(options: OpenAiProviderOptions): AiProvider {
  const labelTimeoutMs = options.labelTimeoutMs ?? LABEL_TIMEOUT_MS;
  const coachTimeoutMs = options.coachTimeoutMs ?? COACH_TEXT_DEADLINE_MS;
  return {
    name: 'openai',
    async transcribe(input: TranscribeInput) {
      const raw = await options.gateway.transcribeVerbose({ bytes: input.bytes, mimeType: input.mimeType, model: options.transcribeModel, signal: input.signal });
      return alignTranscript({
        segments: raw.segments, audioStartOffsetMs: input.audioStartOffsetMs, audioDurationMs: raw.durationSeconds * 1000,
        language: raw.language, model: options.transcribeModel, source: 'model',
      });
    },
    async label(request: LabelRequest, signal: AbortSignal): Promise<LabelResult> {
      const fail = (code: LabelFailure['code'], message: string) => fallbackLabels(request, { code, message });
      try {
        const parsed = await options.gateway.parseJson({
          model: options.textModel, ...buildLabelPrompt(request), schema: LabelModelOutputSchema, schemaName: 'segment_labels',
          maxOutputTokens: 1_500, signal: AbortSignal.any([signal, AbortSignal.timeout(labelTimeoutMs)]),
        });
        if (parsed.status === 'refusal') return fail('refusal', 'The model declined to label this recording');
        if (parsed.status === 'incomplete') return fail('incomplete', `The model stopped early (${parsed.reason})`);
        if (parsed.status === 'unparsed') return fail('invalid_output', 'The model returned no parsable labels');
        const validated = validateLabelOutput(request, parsed.parsed);
        return validated.ok ? modelLabels(request, validated.labels, options.textModel) : fallbackLabels(request, validated.failure);
      } catch (error) {
        return isTimeoutError(error) ? fail('timeout', `Labeling exceeded ${labelTimeoutMs} ms`) : fail('provider_unavailable', 'The labeling provider failed');
      }
    },
    async coachText(request: CoachRequest, signal: AbortSignal): Promise<CoachAnswer> {
      try {
        const parsed = await options.gateway.parseJson({
          model: options.textModel, ...coachTextPrompt(request), schema: CoachModelOutputSchema, schemaName: 'coach_answer',
          maxOutputTokens: 200, signal: AbortSignal.any([signal, AbortSignal.timeout(coachTimeoutMs)]),
        });
        if (parsed.status !== 'ok') return fallbackAnswer(request);
        return modelAnswer(request, parsed.parsed, options.textModel) ?? fallbackAnswer(request);
      } catch {
        return fallbackAnswer(request);
      }
    },
    async createLiveSession(request: CoachSessionRequest, signal: AbortSignal): Promise<CoachSessionResponse | VoiceUnavailable> {
      try {
        const result = await options.gateway.createLiveSession(buildLiveSessionParams(request.context, request.sdp, options), signal);
        return { schemaVersion: 1, sessionId: result.session.id, sdp: result.transport.sdp, liveModel: options.liveModel };
      } catch {
        return { error: 'live_unavailable', message: 'The live coach could not start. Text answers remain available.' };
      }
    },
  };
}
