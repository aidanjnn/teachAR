"""Launch the WebXR development server independently of the terminal session."""
import os
import json
import hashlib
from pathlib import Path
import subprocess
import time
import urllib.request

root=Path(__file__).resolve().parent
python=Path(os.environ.get('TRAIL_PYTHON',root/'.venv/bin/python'))
port=int(os.environ.get('PORT','4321'))
origin=f'http://127.0.0.1:{port}'
source_id=hashlib.sha256(str(root).encode()).hexdigest()
if not python.exists():
    raise SystemExit('Run pnpm setup:webxr from the repository root first.')

subprocess.run(['node', str(root/'prepare-vendor.mjs')], cwd=root, check=True)

def running():
    try:
        with urllib.request.urlopen(origin+'/api/health',timeout=1) as response:
            payload=json.load(response)
            if payload.get('source_id')!=source_id:raise SystemExit('Another checkout owns this port. Stop it or choose a different PORT.')
            return response.status==200
    except Exception:
        return False

if running():
    print(f'TeachAR WebXR already running: {origin}/tutorial')
    raise SystemExit(0)
runtime=root/'.runtime';runtime.mkdir(mode=0o700,exist_ok=True)
with (runtime/'server.log').open('ab') as log:
    process=subprocess.Popen([str(python),str(root/'server.py')],cwd=root,
        stdin=subprocess.DEVNULL,stdout=log,stderr=log,start_new_session=True,env=os.environ.copy())
(runtime/'server.pid').write_text(str(process.pid))
for _ in range(30):
    if running():
        print(f'TeachAR WebXR running in background (PID {process.pid}): {origin}/tutorial')
        print(f'Quest: http://localhost:{port}/tutorial')
        break
    if process.poll() is not None:
        raise SystemExit('Server exited. See .runtime/server.log.')
    time.sleep(.1)
else:
    raise SystemExit('Server not ready. See .runtime/server.log.')
