import { AUDIO_MIME_TYPES, NarrationCaptureSchema, type AudioMimeType, type NarrationCapture } from '@trail/contracts';

export type NarrationErrorCode = 'unsupported' | 'permission-denied' | 'no-audio' | 'not-recording' | 'sync-failed';
export class NarrationError extends Error {
  constructor(readonly code: NarrationErrorCode, message: string) {
    super(message);
    this.name = 'NarrationError';
  }
}

const PREFERRED: readonly AudioMimeType[] = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/ogg', 'audio/mp4', 'audio/wav'];

export function selectMimeType(isTypeSupported: (type: string) => boolean): AudioMimeType | null {
  for (const type of PREFERRED) {
    try { if (isTypeSupported(type)) return type; } catch { /* treated as unsupported */ }
  }
  return null;
}

/** Map what MediaRecorder reports onto the contract enum; otherwise keep what we requested. */
export function normalizeMimeType(reported: string, selected: AudioMimeType): AudioMimeType {
  const known = AUDIO_MIME_TYPES as readonly string[];
  const cleaned = reported.replace(/\s+/g, '').toLowerCase();
  if (known.includes(cleaned)) return cleaned as AudioMimeType;
  const essence = cleaned.split(';')[0] ?? '';
  if (known.includes(essence)) return essence as AudioMimeType;
  return selected;
}

export interface NarrationRecording { blob: Blob; capture: NarrationCapture }
export interface NarrationRecorderOptions {
  /** Recording epoch on the same clock as `now`; audioStartOffsetMs is measured from it. */
  epochMs: number;
  now?: () => number;
  getUserMedia?: (constraints: MediaStreamConstraints) => Promise<MediaStream>;
  isTypeSupported?: (type: string) => boolean;
  createRecorder?: (stream: MediaStream, mimeType: string) => MediaRecorder;
}
export interface NarrationRecorder {
  readonly state: 'idle' | 'recording' | 'stopped';
  start(): Promise<void>;
  stop(): Promise<NarrationRecording>;
  dispose(): void;
}

export function createNarrationRecorder(options: NarrationRecorderOptions): NarrationRecorder {
  const now = options.now ?? (() => performance.now());
  const getUserMedia = options.getUserMedia ?? (constraints => navigator.mediaDevices.getUserMedia(constraints));
  const isTypeSupported = options.isTypeSupported ?? (type => typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(type));
  const createRecorder = options.createRecorder ?? ((stream, mimeType) => new MediaRecorder(stream, { mimeType }));
  let state: NarrationRecorder['state'] = 'idle';
  let stream: MediaStream | null = null;
  let recorder: MediaRecorder | null = null;
  let selected: AudioMimeType | null = null;
  let chunks: Blob[] = [];
  let startCalledAt = 0;
  let startEventAt = 0;
  const stopTracks = () => { stream?.getTracks().forEach(track => track.stop()); stream = null; };

  return {
    get state() { return state; },
    async start() {
      if (state !== 'idle') throw new NarrationError('not-recording', 'This recorder was already used; create a new one.');
      selected = selectMimeType(isTypeSupported);
      if (!selected) throw new NarrationError('unsupported', 'This browser cannot record audio in a supported format.');
      try {
        stream = await getUserMedia({ audio: true });
      } catch {
        throw new NarrationError('permission-denied', 'Microphone permission was denied or no microphone is available.');
      }
      const active = createRecorder(stream, selected);
      recorder = active;
      chunks = [];
      active.ondataavailable = event => { if (event.data.size > 0) chunks.push(event.data); };
      startCalledAt = now();
      try {
        await new Promise<void>((resolve, reject) => {
          active.onstart = () => { startEventAt = now(); resolve(); };
          active.onerror = () => reject(new NarrationError('no-audio', 'The recorder failed to start.'));
          try { active.start(); } catch { reject(new NarrationError('no-audio', 'The recorder failed to start.')); }
        });
      } catch (error) {
        stopTracks();
        throw error;
      }
      state = 'recording';
    },
    async stop() {
      if (state !== 'recording' || !recorder || !selected) throw new NarrationError('not-recording', 'Nothing is recording.');
      const active = recorder;
      await new Promise<void>(resolve => { active.onstop = () => resolve(); active.stop(); });
      const stopAt = now();
      state = 'stopped';
      stopTracks();
      const blob = new Blob(chunks, { type: active.mimeType || selected });
      if (blob.size === 0) throw new NarrationError('no-audio', 'No audio was captured.');
      const audioStartOffsetMs = Math.round(startEventAt - options.epochMs);
      if (Math.abs(audioStartOffsetMs) > 5_000) throw new NarrationError('sync-failed', 'Audio started too far from the recording epoch.');
      const capture = NarrationCaptureSchema.parse({
        mimeType: normalizeMimeType(active.mimeType, selected),
        durationMs: Math.max(1, Math.round(stopAt - startEventAt)),
        audioStartOffsetMs,
        syncMethod: 'media-recorder-start',
        estimatedSyncErrorMs: Math.max(0, Math.round(startEventAt - startCalledAt)),
        sizeBytes: blob.size,
      });
      return { blob, capture };
    },
    dispose() {
      if (recorder && recorder.state !== 'inactive') { try { recorder.stop(); } catch { /* already stopped */ } }
      stopTracks();
      state = 'stopped';
    },
  };
}
