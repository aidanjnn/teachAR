# Native voice capture and echo cancellation

Android coaching uses `AudioRecord` at 48 kHz mono PCM16 with the
`VOICE_COMMUNICATION` source. `TrailVoiceCapture.java` attaches Android
`AcousticEchoCanceler` to that recorder's actual audio session, checks successful
enabling, and reports the capability in the voice panel. Unsupported, null or
failed AEC explicitly requires headphones. This is a device capability report,
not evidence that speaker echo is cancelled on Quest.

The adapter feeds bounded 10 ms blocks into the pinned Unity.WebRTC
`AudioStreamTrack.SetData` API. The Java worker keeps at most twelve blocks and
drops oldest audio when Unity falls behind. It continues draining while muted,
discards in-flight reads across mute changes, and clears queued samples. Stop
invalidates the worker session, stops recording, waits at most 500 ms for the
worker, releases recording/effect resources, and restores the prior Android audio
mode unless another component changed it. Source loss closes the live transport.
Pause, focus loss, disable and destruction release capture. The process-wide
`MicrophoneLease` excludes simultaneous Android voice and Unity narration; a failed
acquisition never releases another owner's microphone.

Existing native permission handling retries after an explicit permission grant.
The APK already declares `RECORD_AUDIO` and `MODIFY_AUDIO_SETTINGS`; this change
adds no permissions, dependencies or provider behavior. The Editor microphone path
remains diagnostic and explicitly requires headphones. Input stays enabled during
coach playback, preserving the existing provider interruption path; this is not
playback-triggered input muting.

The pinned Unity.WebRTC custom AudioSource path uses a dummy native audio device
and forwards PCM to track sinks without processing a playback reference.
`Loopback=false` only disables local microphone monitoring. Android session-bound
AEC is therefore an additional capture implementation, not an existing WebRTC
feature that was enabled by a flag.

Automated evidence: real Android SDK Java compilation, synthetic Java lifecycle
checks (`tests/android-voice`), shared-lease/narration harness, and C# Android-branch
compilation against installed Unity assemblies. These do not establish device AEC
availability or effectiveness, Unity speaker routing into the hardware reference,
full duplex quality, audible interruption or operation alongside XR/hands/casting.
Those require real Quest runs. If enabled hardware AEC does not cancel Unity
speaker output, headphones are the bounded fallback; the stronger implementation
would move capture and playback into one native WebRTC audio device module.

API sources:
- [Android AcousticEchoCanceler](https://developer.android.com/reference/android/media/audiofx/AcousticEchoCanceler)
- [VOICE_COMMUNICATION](https://developer.android.com/reference/android/media/MediaRecorder.AudioSource#VOICE_COMMUNICATION)
- [Android AudioManager](https://developer.android.com/reference/android/media/AudioManager#MODE_IN_COMMUNICATION)
- [Pinned Unity native track source](https://github.com/Unity-Technologies/com.unity.webrtc/blob/13da9f51bd450a77bd5e99557ab3f3c0656ee9a1/Plugin~/WebRTCPlugin/UnityAudioTrackSource.cpp)
