import {
  MAX_TRANSCRIPT_MS, MAX_TRANSCRIPT_SPANS, TranscriptResultSchema, type LabelSegment, type TranscriptResult, type TranscriptSpan,
} from '@trail/contracts';

/** A transcription segment as returned by the provider, in seconds relative to audio start. */
export interface RawTranscriptSegment { start: number; end: number; text: string }

export interface AlignInput {
  segments: readonly RawTranscriptSegment[];
  audioStartOffsetMs: number;
  audioDurationMs: number;
  language: string | null;
  model: string | null;
  source: 'model' | 'fixture';
}

interface Range { startMs: number; endMs: number }

export function overlapMs(a: Range, b: Range): number {
  return Math.max(0, Math.min(a.endMs, b.endMs) - Math.max(a.startMs, b.startMs));
}

/** Convert provider seconds to recording milliseconds exactly once and normalize text. */
export function alignTranscript(input: AlignInput): TranscriptResult {
  const offset = Math.round(input.audioStartOffsetMs);
  const spans: TranscriptSpan[] = [];
  for (const raw of input.segments) {
    if (!Number.isFinite(raw.start) || !Number.isFinite(raw.end)) continue;
    const text = raw.text.replace(/\s+/g, ' ').trim().slice(0, 1_000);
    if (!text) continue;
    let startMs = Math.round(raw.start * 1000) + offset;
    let endMs = Math.round(raw.end * 1000) + offset;
    if (endMs <= 0 || startMs >= MAX_TRANSCRIPT_MS) continue;
    startMs = Math.max(0, startMs);
    endMs = Math.min(MAX_TRANSCRIPT_MS, endMs);
    if (endMs <= startMs) endMs = startMs + 1;
    spans.push({ id: `span-${String(spans.length + 1).padStart(4, '0')}`, startMs, endMs, text });
    if (spans.length === MAX_TRANSCRIPT_SPANS) break;
  }
  return TranscriptResultSchema.parse({
    schemaVersion: 1, source: input.source, model: input.model, language: input.language,
    audioDurationMs: Math.min(MAX_TRANSCRIPT_MS, Math.max(0, Math.round(input.audioDurationMs))), spans,
  });
}

/** Each span goes to the segment it overlaps most; ties favour the earlier segment. */
export function assignSpansToSegments(spans: readonly TranscriptSpan[], segments: readonly LabelSegment[]): Map<string, string[]> {
  const assigned = new Map<string, string[]>(segments.map(segment => [segment.id, []]));
  for (const span of spans) {
    let best: LabelSegment | undefined;
    let bestOverlap = 0;
    for (const segment of segments) {
      const overlap = overlapMs(span, segment);
      if (overlap > bestOverlap) { best = segment; bestOverlap = overlap; }
    }
    if (best) assigned.get(best.id)?.push(span.id);
  }
  return assigned;
}
