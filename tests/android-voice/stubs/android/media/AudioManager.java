package android.media;
public class AudioManager {
    public static final int MODE_IN_COMMUNICATION = 3;
    private int mode = 1;
    public int getMode() { return mode; }
    public void setMode(int mode) { this.mode = mode; }
}
