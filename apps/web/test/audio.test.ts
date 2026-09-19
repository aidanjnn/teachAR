import { describe, expect, it, vi } from 'vitest';
import { NarrationError, createNarrationRecorder, normalizeMimeType, selectMimeType } from '../src/record/audio.js';

describe('selectMimeType', () => {
  it('prefers WebM Opus, then falls down the list, and returns null when nothing works', () => {
    expect(selectMimeType(type => type === 'audio/webm;codecs=opus' || type === 'audio/mp4')).toBe('audio/webm;codecs=opus');
    expect(selectMimeType(type => type === 'audio/mp4')).toBe('audio/mp4');
    expect(selectMimeType(() => false)).toBeNull();
    expect(selectMimeType(() => { throw new Error('no MediaRecorder'); })).toBeNull();
  });
});

describe('normalizeMimeType', () => {
  it('keeps known types, reduces unknown parameters to the essence, and falls back to the requested type', () => {
    expect(normalizeMimeType('audio/webm; codecs=opus', 'audio/webm')).toBe('audio/webm;codecs=opus');
    expect(normalizeMimeType('audio/mp4;codecs=mp4a.40.2', 'audio/webm')).toBe('audio/mp4');
    expect(normalizeMimeType('', 'audio/ogg')).toBe('audio/ogg');
    expect(normalizeMimeType('video/webm', 'audio/webm')).toBe('audio/webm');
  });
});

describe('createNarrationRecorder', () => {
  it('reports unsupported browsers and denied permission with typed errors', async () => {
    const unsupported = createNarrationRecorder({ epochMs: 0, now: () => 0, isTypeSupported: () => false, getUserMedia: async () => { throw new Error('unreachable'); } });
    await expect(unsupported.start()).rejects.toMatchObject({ code: 'unsupported' } satisfies Partial<NarrationError>);
    const denied = createNarrationRecorder({ epochMs: 0, now: () => 0, isTypeSupported: () => true, getUserMedia: async () => { throw new Error('NotAllowedError'); } });
    await expect(denied.start()).rejects.toMatchObject({ code: 'permission-denied' });
    await expect(denied.stop()).rejects.toMatchObject({ code: 'not-recording' });
  });
});

describe('createNarrationRecorder failure handling', () => {
  function fakeStream() {
    const stopped: string[] = [];
    const track = { stop: () => { stopped.push('audio'); } };
    return { stream: { getTracks: () => [track], getAudioTracks: () => [track] } as unknown as MediaStream, stopped };
  }
  it('releases the microphone when the recorder cannot be created', async () => {
    const { stream, stopped } = fakeStream();
    const recorder = createNarrationRecorder({
      epochMs: 0, now: () => 0, isTypeSupported: () => true, getUserMedia: async () => stream,
      createRecorder: () => { throw new DOMException('nope', 'NotSupportedError'); },
    });
    await expect(recorder.start()).rejects.toMatchObject({ code: 'unsupported' });
    expect(stopped).toEqual(['audio']);
  });
  it('does not hang when the recorder is already inactive at stop time', async () => {
    const { stream } = fakeStream();
    let clock = 0;
    const fake = {
      state: 'inactive' as RecordingState, mimeType: 'audio/webm',
      ondataavailable: null as ((event: BlobEvent) => void) | null, onstart: null as (() => void) | null,
      onstop: null as (() => void) | null, onerror: null as (() => void) | null,
      start() { this.state = 'recording'; this.ondataavailable?.({ data: new Blob(['x']) } as BlobEvent); this.onstart?.(); this.state = 'inactive'; },
      stop() { throw new DOMException('inactive', 'InvalidStateError'); },
    };
    const recorder = createNarrationRecorder({
      epochMs: 0, now: () => (clock += 500), isTypeSupported: () => true, getUserMedia: async () => stream,
      createRecorder: () => fake as unknown as MediaRecorder,
    });
    await recorder.start();
    const result = await recorder.stop();
    expect(result.capture.durationMs).toBeGreaterThan(0);
    expect(result.blob.size).toBe(1);
  });
});

describe('createNarrationRecorder limits', () => {
  const mic = () => ({ getTracks: () => [{ stop: () => undefined }], getAudioTracks: () => [] }) as unknown as MediaStream;
  function fakeRecorder(chunkBytes: number) {
    return {
      state: 'inactive' as RecordingState, mimeType: 'audio/webm',
      ondataavailable: null as ((event: BlobEvent) => void) | null, onstart: null as (() => void) | null,
      onstop: null as (() => void) | null, onerror: null as (() => void) | null,
      start() { this.state = 'recording'; this.onstart?.(); },
      stop() { this.state = 'inactive'; this.onstop?.(); },
      emit() { this.ondataavailable?.({ data: new Blob([new Uint8Array(chunkBytes)]) } as BlobEvent); },
    };
  }
  it('stops itself at the duration limit and reports through onAutoStop', async () => {
    vi.useFakeTimers();
    try {
      const fake = fakeRecorder(10);
      let clock = 0;
      const results: unknown[] = [];
      const recorder = createNarrationRecorder({
        epochMs: 0, now: () => clock, isTypeSupported: () => true, getUserMedia: async () => mic(),
        createRecorder: () => fake as unknown as MediaRecorder, maxDurationMs: 2_000, onAutoStop: result => { results.push(result); },
      });
      await recorder.start();
      fake.emit();
      clock = 2_000;
      await vi.advanceTimersByTimeAsync(2_000);
      expect(recorder.state).toBe('stopped');
      expect(results).toHaveLength(1);
      const result = await recorder.stop();
      expect(result.limitReached).toBe('duration');
      expect(result.capture.durationMs).toBe(2_000);
    } finally {
      vi.useRealTimers();
    }
  });
  it('stops itself before the byte limit is exceeded and keeps only the data that fits', async () => {
    const fake = fakeRecorder(600);
    let clock = 0;
    const results: unknown[] = [];
    const recorder = createNarrationRecorder({
      epochMs: 0, now: () => (clock += 100), isTypeSupported: () => true, getUserMedia: async () => mic(),
      createRecorder: () => fake as unknown as MediaRecorder, maxBytes: 1_000, onAutoStop: result => { results.push(result); },
    });
    await recorder.start();
    fake.emit();
    fake.emit();
    const result = await recorder.stop();
    expect(result.limitReached).toBe('size');
    expect(result.blob.size).toBe(600);
    expect(results).toHaveLength(1);
  });
});
