#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/../.."
unity_android="${UNITY_ANDROID_DIR:-/Applications/Unity/Hub/Editor/6000.3.24f1/PlaybackEngines/AndroidPlayer}"
java_bin="$unity_android/OpenJDK/bin"
android_jar="${ANDROID_JAR:-$unity_android/SDK/platforms/android-35/android.jar}"
output=$(mktemp -d)
trap 'rm -rf "$output"' EXIT
source_file=apps/quest/Assets/Plugins/Android/TrailVoiceCapture.java
# Real Android APIs first; synthetic Android services below exercise lifecycle without hardware.
"$java_bin/javac" -Xlint:all -classpath "$android_jar" -d "$output/real" "$source_file"
"$java_bin/javac" -Xlint:all -d "$output/test" "$source_file" tests/android-voice/stubs/android/content/*.java tests/android-voice/stubs/android/media/*.java tests/android-voice/stubs/android/media/audiofx/*.java tests/android-voice/CaptureTest.java
"$java_bin/java" -cp "$output/test" CaptureTest
