import { describe, expect, it } from 'vitest';
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
