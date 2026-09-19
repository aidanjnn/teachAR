import {
  AUDIO_MIME_TYPES, MAX_NARRATION_BYTES, MAX_RECORDING_DURATION_MS, NarrationCaptureSchema, type AudioMimeType, type NarrationCapture,
} from '@trail/contracts';

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

export type NarrationLimit = 'duration' | 'size';
export interface NarrationRecording {
  blob: Blob;
  capture: NarrationCapture;
  /** Set when recording stopped itself at the contract limit instead of on the user's Stop. */
  limitReached: NarrationLimit | null;
}
export interface NarrationRecorderOptions {
  /** Recording epoch on the same clock as `now`; audioStartOffsetMs is measured from it. */
  epochMs: number;
  now?: () => number;
  getUserMedia?: (constraints: MediaStreamConstraints) => Promise<MediaStream>;
  isTypeSupported?: (type: string) => boolean;
  createRecorder?: (stream: MediaStream, mimeType: string) => MediaRecorder;
  /** Hard stop; defaults to the contract's 120 s. */
  maxDurationMs?: number;
  /** Hard stop; defaults to the contract's 20 MiB. */
  maxBytes?: number;
  /** How often MediaRecorder hands over data so the byte limit can be enforced while recording. */
  timesliceMs?: number;
  /** Called when a limit stops the recording without the user pressing Stop. */
  onAutoStop?: (result: NarrationRecording | NarrationError) => void;
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
  const maxDurationMs = Math.min(options.maxDurationMs ?? MAX_RECORDING_DURATION_MS, MAX_RECORDING_DURATION_MS);
  const maxBytes = Math.min(options.maxBytes ?? MAX_NARRATION_BYTES, MAX_NARRATION_BYTES);
  const timesliceMs = options.timesliceMs ?? 1_000;
  let state: NarrationRecorder['state'] = 'idle';
  let stream: MediaStream | null = null;
  let recorder: MediaRecorder | null = null;
  let selected: AudioMimeType | null = null;
  let chunks: Blob[] = [];
  let bytes = 0;
  let startCalledAt = 0;
  let startEventAt = 0;
  let durationTimer: ReturnType<typeof setTimeout> | null = null;
  let finishing: Promise<NarrationRecording> | null = null;
  const stopTracks = () => { stream?.getTracks().forEach(track => track.stop()); stream = null; };
  const clearDurationTimer = () => { if (durationTimer) { clearTimeout(durationTimer); durationTimer = null; } };

  function finish(limitReached: NarrationLimit | null): Promise<NarrationRecording> {
    if (finishing) return finishing;
    const active = recorder;
    const mime = selected;
    if (!active || !mime) return Promise.reject(new NarrationError('not-recording', 'Nothing is recording.'));
    clearDurationTimer();
    finishing = (async () => {
      // A recorder can already be inactive (device unplugged); stop() then throws and onstop never fires.
      await new Promise<void>(resolve => {
        if (active.state === 'inactive') { resolve(); return; }
        active.onstop = () => resolve();
        try { active.stop(); } catch { resolve(); }
      });
      const stopAt = now();
      state = 'stopped';
      stopTracks();
      const blob = new Blob(chunks, { type: active.mimeType || mime });
      if (blob.size === 0) throw new NarrationError('no-audio', 'No audio was captured.');
      const audioStartOffsetMs = Math.round(startEventAt - options.epochMs);
      if (Math.abs(audioStartOffsetMs) > 5_000) throw new NarrationError('sync-failed', 'Audio started too far from the recording epoch.');
      const capture = NarrationCaptureSchema.parse({
        mimeType: normalizeMimeType(active.mimeType, mime),
        durationMs: Math.min(MAX_RECORDING_DURATION_MS, Math.max(1, Math.round(stopAt - startEventAt))),
        audioStartOffsetMs,
        syncMethod: 'media-recorder-start',
        estimatedSyncErrorMs: Math.max(0, Math.round(startEventAt - startCalledAt)),
        sizeBytes: blob.size,
      });
      return { blob, capture, limitReached };
    })();
    return finishing;
  }
  function autoStop(limit: NarrationLimit) {
    if (state !== 'recording' || finishing) return;
    finish(limit).then(result => options.onAutoStop?.(result), (error: unknown) => {
      options.onAutoStop?.(error instanceof NarrationError ? error : new NarrationError('no-audio', 'Recording failed at the limit.'));
    });
  }

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
      let active: MediaRecorder;
      try {
        active = createRecorder(stream, selected);
      } catch {
        stopTracks();
        throw new NarrationError('unsupported', 'This browser cannot record in the selected audio format.');
      }
      recorder = active;
      chunks = [];
      bytes = 0;
      active.ondataavailable = event => {
        if (event.data.size === 0) return;
        // Enforce the byte limit as data arrives; the chunk that would overflow is not kept.
        if (bytes + event.data.size > maxBytes) { autoStop('size'); return; }
        chunks.push(event.data);
        bytes += event.data.size;
      };
      startCalledAt = now();
      try {
        await new Promise<void>((resolve, reject) => {
          active.onstart = () => { startEventAt = now(); resolve(); };
          active.onerror = () => reject(new NarrationError('no-audio', 'The recorder failed to start.'));
          try { active.start(timesliceMs); } catch { reject(new NarrationError('no-audio', 'The recorder failed to start.')); }
        });
      } catch (error) {
        stopTracks();
        throw error;
      }
      state = 'recording';
      durationTimer = setTimeout(() => { autoStop('duration'); }, maxDurationMs);
    },
    async stop() {
      if (finishing) return finishing;
      if (state !== 'recording') throw new NarrationError('not-recording', 'Nothing is recording.');
      return finish(null);
    },
    dispose() {
      clearDurationTimer();
      if (recorder && recorder.state !== 'inactive') { try { recorder.stop(); } catch { /* already stopped */ } }
      stopTracks();
      state = 'stopped';
    },
  };
}
