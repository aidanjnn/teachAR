#!/bin/sh
# Software-only regression suite; no headset or paid-provider acceptance.
set -eu
cd "$(dirname "$0")"
trail_python="${TRAIL_PYTHON:-.venv/bin/python}"
if [ ! -x "$trail_python" ]; then
  echo 'Create .venv and install requirements.txt first; see README.md.'
  exit 1
fi
node prepare-vendor.mjs
node --test tests/*.test.mjs
"$trail_python" -m unittest discover -s tests -q
"$trail_python" tests/run-browser.py
echo 'All software checks passed. No hardware acceptance or paid inference was performed.'
