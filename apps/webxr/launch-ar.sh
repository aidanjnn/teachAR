#!/bin/sh
set -eu
cd "$(dirname "$0")"
if [ ! -x .venv/bin/python ]; then
  echo 'Run pnpm setup:webxr from the repository root first.'
  exit 1
fi
.venv/bin/python start-background.py
if [ -x tools/platform-tools/adb ]; then
  quest_adb=./tools/platform-tools/adb
else
  quest_adb=adb
fi
quest_port="${PORT:-4321}"
"$quest_adb" reverse "tcp:$quest_port" "tcp:$quest_port"
quest_path="${1:-tutorial}"
case "$quest_path" in ar|hands|tutorial) ;; *) echo 'Usage: sh launch-ar.sh [ar|hands|tutorial]'; exit 1;; esac
"$quest_adb" shell am start -a android.intent.action.VIEW -d "http://localhost:$quest_port/$quest_path" com.oculus.browser
echo "Quest: http://localhost:$quest_port/$quest_path"
echo 'Choose Create tutorial or Follow tutorial, then enter AR. Camera and API keys are optional.'
echo 'Keep the USB cable connected and the laptop awake.'
