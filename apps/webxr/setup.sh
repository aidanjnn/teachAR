#!/bin/sh
set -eu
cd "$(dirname "$0")"
node prepare-vendor.mjs
if [ ! -x .venv/bin/python ]; then
  "${TRAIL_PYTHON:-python3}" -m venv .venv
fi
# Retry interrupted installs and refresh dependencies when requirements change.
if ! cmp -s requirements.txt .venv/trail-requirements.txt; then
  .venv/bin/python -m pip install -r requirements.txt
  cp requirements.txt .venv/trail-requirements.txt
fi
