package android.media;
import java.util.concurrent.BlockingQueue;
import java.util.concurrent.LinkedBlockingQueue;
import java.util.concurrent.TimeUnit;
public class AudioRecord {
    public static final int STATE_INITIALIZED = 1, RECORDSTATE_RECORDING = 3;
    public static volatile AudioRecord latest;
    public static boolean deny;
    public final BlockingQueue<Integer> incoming = new LinkedBlockingQueue<>();
    public volatile int reads;
    public volatile boolean stopped, released;
    public final int source;
    public AudioRecord(int source, int rate, int channels, int format, int size) {
        if (deny) throw new SecurityException();
        this.source = source; latest = this;
    }
    public static int getMinBufferSize(int a,int b,int c) { return 960; }
    public int getState() { return STATE_INITIALIZED; }
    public int getAudioSessionId() { return 42; }
    public void startRecording() { }
    public int getRecordingState() { return RECORDSTATE_RECORDING; }
    public int read(short[] output,int offset,int length) {
        reads++;
        try {
            Integer value;
            do { value = incoming.poll(20, TimeUnit.MILLISECONDS); } while (value == null && !stopped);
            if (stopped || value == null || value < 0) return -1;
            java.util.Arrays.fill(output, offset, offset + length, value.shortValue()); return length;
        } catch (InterruptedException error) { return -1; }
    }
    public void stop() { stopped = true; }
    public void release() { released = true; }
}
