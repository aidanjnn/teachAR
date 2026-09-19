#!/bin/sh
set -eu
cd "$(dirname "$0")"
if [ ! -x .venv/bin/python ]; then
  echo 'Run sh start.sh once to install the tester, then run this command again.'
  exit 1
fi
.venv/bin/python start-background.py
if [ -x tools/platform-tools/adb ]; then
  quest_adb=./tools/platform-tools/adb
else
  quest_adb=adb
fi
"$quest_adb" reverse tcp:4321 tcp:4321
quest_path="${1:-tutorial}"
case "$quest_path" in ar|hands|tutorial) ;; *) echo 'Usage: sh launch-ar.sh [ar|hands|tutorial]'; exit 1;; esac
"$quest_adb" shell am start -a android.intent.action.VIEW -d "http://localhost:4321/$quest_path" com.oculus.browser
echo "Quest: http://localhost:4321/$quest_path — close old camera-sender tabs."
echo 'Hand mode: Enter hand guidance; camera is optional for the final image check.'
echo 'Keep the USB cable connected and the laptop awake. Exit AR pauses paid checks.'
