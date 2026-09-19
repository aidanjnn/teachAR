#!/bin/sh
set -eu
cd "$(dirname "$0")"
if [ -x tools/platform-tools/adb ]; then
  quest_adb=./tools/platform-tools/adb
elif command -v adb >/dev/null 2>&1; then
  quest_adb=adb
else
  echo 'Install Android SDK Platform Tools, or put them in tools/platform-tools.'
  exit 1
fi
"$quest_adb" devices
"$quest_adb" reverse tcp:4321 tcp:4321
echo 'Ready. In Quest Browser open http://localhost:4321/camera and tap Enable camera.'
