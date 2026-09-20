# Android voice capture checks

Run `bash tests/android-voice/run.sh` from the repository root. The script first
compiles the production Java bridge against the installed Android SDK, then runs
that same bridge against synthetic Android services. Override `UNITY_ANDROID_DIR`
or `ANDROID_JAR` for another installed editor/SDK. Nothing records audio.

The scenarios cover the actual audio session ID, communication mode, initially
muted capture, incomplete reads spanning unmute, a bounded newest-120-ms queue,
mute clearing buffered speech, permission denial, absent/null/disabled AEC,
read failure, idempotent stop, and restoration of the previous audio mode without
overwriting a later independent mode change. Fake services do not validate AEC
quality, Android threading behavior, Quest audio routing or interruption latency.

`dotnet run --project tests/native-narration/Narration.csproj` additionally tests
shared microphone lease ownership and narration audio persistence.
