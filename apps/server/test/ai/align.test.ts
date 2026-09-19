import { describe, expect, it } from 'vitest';
import { alignTranscript, assignSpansToSegments, overlapMs } from '../../src/ai/align.js';

const base = { audioDurationMs: 12_000, language: 'en', model: 'whisper-1', source: 'model' as const };

describe('alignTranscript', () => {
  it('converts seconds to recording milliseconds exactly once, applying the audio offset', () => {
    const result = alignTranscript({ ...base, audioStartOffsetMs: -300, segments: [{ start: 1.25, end: 2.5, text: ' Place  the base ' }] });
    expect(result.spans).toEqual([{ id: 'span-0001', startMs: 950, endMs: 2200, text: 'Place the base' }]);
    expect(result.source).toBe('model');
    expect(result.model).toBe('whisper-1');
  });
  it('clips spans that begin before the recording epoch and drops ones that end before it', () => {
    const result = alignTranscript({ ...base, audioStartOffsetMs: -1000, segments: [{ start: 0, end: 0.5, text: 'gone' }, { start: 0.5, end: 1.5, text: 'kept' }] });
    expect(result.spans.map(span => span.text)).toEqual(['kept']);
    expect(result.spans[0]).toMatchObject({ startMs: 0, endMs: 500 });
  });
  it('drops empty text and repairs zero-length timing', () => {
    const result = alignTranscript({ ...base, audioStartOffsetMs: 0, segments: [{ start: 1, end: 1, text: 'blip' }, { start: 2, end: 3, text: '   ' }, { start: 3, end: 2.5, text: 'NaN-ish' }] });
    expect(result.spans).toHaveLength(2);
    expect(result.spans[0]).toMatchObject({ startMs: 1000, endMs: 1001 });
    expect(result.spans[1]).toMatchObject({ startMs: 3000, endMs: 3001, text: 'NaN-ish' });
  });
  it('ignores non-finite times and never exceeds the transcript ceiling', () => {
    const result = alignTranscript({ ...base, audioStartOffsetMs: 0, segments: [{ start: Number.NaN, end: 1, text: 'bad' }, { start: 129, end: 400, text: 'late' }, { start: 131, end: 132, text: 'beyond' }] });
    expect(result.spans.map(span => span.text)).toEqual(['late']);
    expect(result.spans[0]?.endMs).toBe(130_000);
  });
});

describe('assignSpansToSegments', () => {
  const segments = [{ id: 'a', startMs: 0, endMs: 1000 }, { id: 'b', startMs: 1000, endMs: 2000 }, { id: 'c', startMs: 2000, endMs: 3000 }];
  it('assigns each span to the segment with the largest overlap and leaves gaps empty', () => {
    const spans = [
      { id: 's1', startMs: 100, endMs: 900, text: 'a' },
      { id: 's2', startMs: 800, endMs: 1900, text: 'mostly b' },
      { id: 's3', startMs: 5000, endMs: 6000, text: 'outside' },
    ];
    const assigned = assignSpansToSegments(spans, segments);
    expect(assigned.get('a')).toEqual(['s1']);
    expect(assigned.get('b')).toEqual(['s2']);
    expect(assigned.get('c')).toEqual([]);
  });
  it('prefers the earlier segment on an exact tie', () => {
    const assigned = assignSpansToSegments([{ id: 's', startMs: 500, endMs: 1500, text: 'tie' }], segments);
    expect(assigned.get('a')).toEqual(['s']);
    expect(assigned.get('b')).toEqual([]);
  });
  it('computes overlap in milliseconds', () => {
    expect(overlapMs({ startMs: 0, endMs: 10 }, { startMs: 5, endMs: 20 })).toBe(5);
    expect(overlapMs({ startMs: 0, endMs: 10 }, { startMs: 10, endMs: 20 })).toBe(0);
  });
});
