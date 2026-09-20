package com.trail.audio;

import android.content.Context;
import android.media.AudioFormat;
import android.media.AudioManager;
import android.media.AudioRecord;
import android.media.MediaRecorder;
import android.media.audiofx.AcousticEchoCanceler;
import java.util.ArrayDeque;

/** One owner, bounded 10 ms PCM blocks; muted and obsolete reads never enter the queue. */
public final class TrailVoiceCapture {
    public static final int SAMPLE_RATE = 48000;
    private static final int BLOCK = 480, MAX_BLOCKS = 12;
    private final ArrayDeque<short[]> queue = new ArrayDeque<>();
    private AudioRecord recorder;
    private AcousticEchoCanceler echo;
    private AudioManager manager;
    private Thread worker;
    private volatile boolean running, ready, failed;
    private boolean muted = true, modeOwned;
    private long revision;
    private volatile long session;
    private int previousMode;
    private volatile String status = "Voice microphone idle.";

    public boolean start(Context context) {
        stop();
        ready = false; failed = false;
        try {
            manager = (AudioManager) context.getSystemService(Context.AUDIO_SERVICE);
            if (manager == null) throw new IllegalStateException();
            previousMode = manager.getMode();
            manager.setMode(AudioManager.MODE_IN_COMMUNICATION); modeOwned = true;
            int minimum = AudioRecord.getMinBufferSize(SAMPLE_RATE, AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_16BIT);
            if (minimum <= 0) throw new IllegalStateException();
            recorder = new AudioRecord(MediaRecorder.AudioSource.VOICE_COMMUNICATION, SAMPLE_RATE,
                AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_16BIT, Math.max(minimum, BLOCK * 2 * 8));
            if (recorder.getState() != AudioRecord.STATE_INITIALIZED) throw new IllegalStateException();
            boolean enabled = false;
            try {
                if (AcousticEchoCanceler.isAvailable()) {
                    echo = AcousticEchoCanceler.create(recorder.getAudioSessionId());
                    enabled = echo != null && echo.setEnabled(true) == 0 && echo.getEnabled();
                }
            } catch (RuntimeException unavailable) { enabled = false; }
            status = enabled ? "Device echo cancellation enabled; headset verification pending."
                : "Echo cancellation unavailable. Use headphones for voice.";
            recorder.startRecording();
            if (recorder.getRecordingState() != AudioRecord.RECORDSTATE_RECORDING) throw new IllegalStateException();
            running = true;
            final AudioRecord source = recorder;
            final long identity = session;
            worker = new Thread(() -> capture(source, identity), "Trail voice capture");
            worker.start(); return true;
        } catch (RuntimeException error) {
            stop(); failed = true;
            status = "Microphone unavailable. Check permission, end recording, then retry voice.";
            return false;
        }
    }
    private void capture(AudioRecord source, long identity) {
        try {
            while (running && session == identity) {
                long token;
                synchronized (this) { token = revision; }
                short[] block = new short[BLOCK]; int offset = 0;
                while (running && session == identity && offset < BLOCK) {
                    int count = source.read(block, offset, BLOCK - offset);
                    if (count <= 0) throw new IllegalStateException();
                    offset += count;
                }
                synchronized (this) {
                    if (!running || session != identity) return;
                    ready = true;
                    if (muted || revision != token) continue;
                    if (queue.size() == MAX_BLOCKS) queue.removeFirst();
                    queue.addLast(block);
                }
            }
        } catch (RuntimeException error) {
            synchronized (this) {
                if (session != identity) return;
                if (running) { failed = true; ready = false; status = "Voice microphone stopped. End voice and retry."; }
                running = false; queue.clear();
            }
        }
    }
    public synchronized void setMuted(boolean value) {
        // A revision also invalidates a read begun before an unmute.
        muted = value; revision++; queue.clear();
    }
    public synchronized short[] poll() { return queue.pollFirst(); }
    public boolean isReady() { return ready && running; }
    public boolean hasFailed() { return failed; }
    public String getStatus() { return status; }
    public void stop() {
        synchronized (this) { running = false; ready = false; muted = true; revision++; session++; queue.clear(); }
        if (recorder != null) {
            try { recorder.stop(); } catch (RuntimeException ignored) { }
        }
        if (worker != null) {
            try { worker.join(500); } catch (InterruptedException error) { Thread.currentThread().interrupt(); }
            worker = null;
        }
        if (echo != null) { try { echo.release(); } catch (RuntimeException ignored) { } echo = null; }
        if (recorder != null) { try { recorder.release(); } catch (RuntimeException ignored) { } recorder = null; }
        if (modeOwned && manager != null) {
            try {
                if (manager.getMode() == AudioManager.MODE_IN_COMMUNICATION) manager.setMode(previousMode);
            } catch (RuntimeException ignored) { }
        }
        modeOwned = false; manager = null;
    }
}
