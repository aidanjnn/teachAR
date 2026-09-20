package android.content;
public class Context {
    public static final String AUDIO_SERVICE = "audio";
    public final android.media.AudioManager manager = new android.media.AudioManager();
    public Object getSystemService(String name) { return manager; }
}
