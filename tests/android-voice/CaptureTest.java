import android.content.Context;
import android.media.AudioRecord;
import android.media.audiofx.AcousticEchoCanceler;
import com.trail.audio.TrailVoiceCapture;
import java.util.function.BooleanSupplier;

public class CaptureTest {
    static int checks;
    static void check(boolean value, String label) { checks++; if (!value) throw new AssertionError(label); }
    static void until(BooleanSupplier done) throws Exception {
        long deadline = System.nanoTime() + 2_000_000_000L;
        while (!done.getAsBoolean() && System.nanoTime() < deadline) Thread.sleep(1);
        if (!done.getAsBoolean()) throw new AssertionError("worker did not make progress");
    }
    public static void main(String[] args) throws Exception {
        Context context = new Context(); TrailVoiceCapture capture = new TrailVoiceCapture();
        try {
            check(capture.start(context), "start");
            AudioRecord source = AudioRecord.latest;
            check(source.source == 7, "VOICE_COMMUNICATION input");
            check(context.manager.getMode() == 3 && AcousticEchoCanceler.session == 42, "mode and actual session");
            check(capture.getStatus().contains("verification pending"), "enabled is not verified");
            source.incoming.add(7); until(capture::isReady);
            check(capture.poll() == null, "initially muted");
            until(() -> source.reads >= 2);
            capture.setMuted(false); source.incoming.add(8); until(() -> source.reads >= 3);
            check(capture.poll() == null, "read begun before unmute is dropped");
            for (int i = 0; i < 20; i++) source.incoming.add(100 + i);
            until(() -> source.reads >= 23);
            int count = 0; short[] pcm; int first = -1;
            while ((pcm = capture.poll()) != null) { if (count == 0) first = pcm[0]; count++; check(pcm.length == 480, "10ms blocks"); }
            check(count == 12 && first == 108, "bounded newest 120ms");
            source.incoming.add(300); until(() -> source.reads >= 24);
            capture.setMuted(true); check(capture.poll() == null, "mute clears queued speech");
            source.incoming.add(301); until(() -> source.reads >= 25); check(capture.poll() == null, "muted speech discarded");
            capture.stop(); capture.stop();
            check(source.released && AcousticEchoCanceler.latest.released && context.manager.getMode() == 1, "idempotent teardown restores mode");
            check(!capture.isReady(), "stopped not ready");
            AcousticEchoCanceler.available = false;
            check(capture.start(context) && capture.getStatus().contains("Use headphones"), "unsupported AEC disclosed");
            context.manager.setMode(2); capture.stop(); check(context.manager.getMode() == 2, "preserve independently changed mode");
            AudioRecord.deny = true;
            check(!capture.start(context) && capture.hasFailed() && context.manager.getMode() == 2, "permission denial releases mode");
            AudioRecord.deny = false; AcousticEchoCanceler.available = true; AcousticEchoCanceler.returnNull = true;
            check(capture.start(context) && capture.getStatus().contains("Use headphones"), "null AEC fallback"); capture.stop();
            AcousticEchoCanceler.returnNull = false; AcousticEchoCanceler.enable = false;
            check(capture.start(context) && capture.getStatus().contains("Use headphones"), "enable failure fallback");
            AudioRecord.latest.incoming.add(-1); until(capture::hasFailed);
            check(!capture.isReady() && capture.poll() == null, "capture loss stops output"); capture.stop();
            check(context.manager.getMode() == 2, "read failure teardown restores mode");
        } finally { capture.stop(); }
        System.out.println("Android voice synthetic lifecycle: " + checks + " assertions passed.");
    }
}
