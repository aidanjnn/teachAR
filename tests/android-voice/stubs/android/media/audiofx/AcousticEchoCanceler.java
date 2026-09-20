package android.media.audiofx;
public class AcousticEchoCanceler {
    public static boolean available = true, enable = true, returnNull;
    public static AcousticEchoCanceler latest;
    public static int session;
    public boolean released;
    public static boolean isAvailable() { return available; }
    public static AcousticEchoCanceler create(int id) { session = id; return returnNull ? null : (latest = new AcousticEchoCanceler()); }
    public int setEnabled(boolean value) { return enable ? 0 : -1; }
    public boolean getEnabled() { return enable; }
    public void release() { released = true; }
}
