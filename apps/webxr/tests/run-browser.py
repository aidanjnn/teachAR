"""Run browser regressions against an owned, temporary, provider-disabled server."""
import hashlib
import json
import os
from pathlib import Path
import socket
import subprocess
import sys
import tempfile
import time
import urllib.request

root = Path(__file__).resolve().parents[1]
source_id = hashlib.sha256(str(root).encode()).hexdigest()
with tempfile.TemporaryDirectory(prefix="trail-browser-tests-") as runtime:
    with socket.socket() as listener:
        listener.bind(("127.0.0.1", 0))
        port = listener.getsockname()[1]
    origin = f"http://127.0.0.1:{port}"
    env = dict(os.environ, PORT=str(port), TRAIL_RUNTIME_DIR=runtime,
               TRAIL_TEST_ORIGIN=origin, OPENAI_API_KEY="", OPENAI_API_KEY_FILE=os.devnull,
               SENTRY_ENABLED="false", SENTRY_BROWSER_DSN="", SENTRY_REPLAY_ENABLED="false")
    env.pop("RESTORE_REFERENCE_DIR", None)
    with open(Path(runtime)/"server.log", "w+") as log:
        server = subprocess.Popen([sys.executable, str(root/"server.py")],
                                  cwd=root, env=env, stdout=log, stderr=log)
        try:
            for _ in range(100):
                if server.poll() is not None:
                    raise RuntimeError("Isolated test server exited before becoming ready")
                try:
                    with urllib.request.urlopen(origin+"/api/health", timeout=1) as response:
                        if json.load(response).get("source_id") == source_id:
                            break
                except (OSError, ValueError):
                    pass
                time.sleep(.1)
            else:
                raise RuntimeError("Isolated test server did not become ready")
            for test in sorted((root/"tests").glob("browser-*.cjs")):
                subprocess.run(["node", str(test)], cwd=root, env=env, check=True)
        except Exception:
            log.flush()
            log.seek(0)
            print(log.read()[-6000:], file=sys.stderr)
            raise
        finally:
            server.terminate()
            try:
                server.wait(timeout=5)
            except subprocess.TimeoutExpired:
                server.kill()
                server.wait()
