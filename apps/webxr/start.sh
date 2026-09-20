#!/bin/sh
set -eu
cd "$(dirname "$0")"
sh setup.sh
exec .venv/bin/python server.py
