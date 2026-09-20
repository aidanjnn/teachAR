import base64
import hashlib
import json
import os
import threading
import time
import uuid
import secrets
import ai_verifier
from progression import CheckpointGate
from auto_checks import AutoChecks, loop as auto_loop
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse
from telemetry_config import public_config

import cv2
import numpy as np
from vision import validate_boxes, label_boxes, verify

ROOT = Path(__file__).resolve().parent
SOURCE_ID = hashlib.sha256(str(ROOT).encode()).hexdigest()
LOCK = threading.Lock()
STATE = {"frame":None, "jpeg":None, "frame_id":0, "received":0., "reference":None,
         "reference_jpeg":None, "revision":0, "boxes":None, "result":None, "source":"none", "selected_source":"quest"}
EVENTS = []
AI_BUDGET = None
AI_TOKEN = secrets.token_urlsafe(32)
AI_GATE = CheckpointGate()
AUTO_AI = AutoChecks()
AI_LATEST = None


def runtime_path(name):
    return Path(os.environ.get('TRAIL_RUNTIME_DIR', ROOT/'.runtime')) / name


def save_reference_cache():
    """Called under LOCK. Save setup only, never revive a frame as live evidence."""
    path=runtime_path('reference-cache.json')
    if STATE['reference_jpeg'] is None or not STATE['boxes']:
        path.unlink(missing_ok=True)
        return
    path.parent.mkdir(mode=0o700,parents=True,exist_ok=True)
    temporary=path.with_suffix('.tmp')
    temporary.write_text(json.dumps(dict(jpeg=base64.b64encode(STATE['reference_jpeg']).decode(),
        boxes=STATE['boxes'],selected_source=STATE['selected_source'])))
    temporary.chmod(0o600)
    temporary.replace(path)


def restore_reference_cache():
    path=runtime_path('reference-cache.json')
    if not path.exists():
        return
    saved=json.loads(path.read_text())
    reference,jpeg=decode_image(saved['jpeg'])
    boxes=validate_boxes(saved['boxes'],reference.shape)
    kind=saved['selected_source']
    if kind not in ('quest','laptop','upload'):
        raise ValueError('Invalid cached source.')
    with LOCK:
        STATE.update(reference=reference,reference_jpeg=jpeg,boxes=boxes,selected_source=kind,
            revision=STATE['revision']+1,frame=None,jpeg=None,received=0.,result=None,source='none')


def ai_ready():
    with LOCK:
        return STATE['reference'] is not None and bool(STATE['boxes']) and STATE['frame'] is not None and time.monotonic()-STATE['received']<=3


def run_ai_check():
    global AI_LATEST
    with LOCK:
        requested_revision=STATE['revision']
    try:
        answer=inspect_ai()
        with LOCK:
            if answer['revision']==STATE['revision']:
                AI_LATEST={k:answer[k] for k in ['verdict','message','frame_id','revision','captured_at_unix_ms','usage','slots']}
        return answer
    except Exception as error:
        with LOCK:
            if requested_revision==STATE['revision']:
                AI_LATEST={'verdict':'error','message':str(error)[:300] if isinstance(error,ValueError) else 'AI check failed. No automatic retry.',
                           'revision':requested_revision,'captured_at_unix_ms':round(time.time()*1000)}
        raise



def ai_status():
    if AI_BUDGET is None:
        return {"enabled":False,"configured":False}
    return AI_BUDGET.status()


def inspect_ai():
    if AI_BUDGET is None:
        raise ValueError('AI checker is not initialized.')
    with LOCK:
        if STATE['reference'] is None or not STATE['boxes']:
            raise ValueError('Save a reference and mark the plushies first.')
        if STATE['frame'] is None or time.monotonic()-STATE['received']>3:
            raise ValueError('AI needs a fresh frame. Keep the Quest camera visible.')
        ref,current,boxes=STATE['reference'],STATE['frame'],STATE['boxes']
        revision,frame_id,captured=STATE['revision'],STATE['frame_id'],STATE['received']
    result=ai_verifier.inspect(ref,current,boxes,AI_BUDGET)
    local_result=verify(ref,current,boxes)
    result['local_comparison']={'verdict':local_result['verdict'],'slots':local_result['slots']}
    if (result['verdict']=='pass' and local_result['verdict']=='fail') or (result['verdict']=='fail' and local_result['verdict']=='pass'):
        result['ai_observation_verdict']=result['verdict']
        result.update(verdict='unknown',message='AI and local vision disagree. Do not advance; inspect the toys and capture another view.')
    now=time.monotonic()
    with LOCK:
        if revision!=STATE['revision']:
            event('ai_discarded',request_id=result['request_id'],reason='reference changed',usage=result['usage'])
            raise ValueError('Reference changed during AI inspection. Result discarded; request usage was recorded.')
        age=now-captured
        observed_verdict=result['verdict']
        if age>12:
            result.update(verdict='unknown',message='AI result arrived too late for guidance. Inspect the historical snapshot or capture a new view.')
        candidate=AI_GATE.observe(('plushie-arrangement',revision),frame_id,captured,now,result['verdict'])
        result.update(frame_id=frame_id,revision=revision,age_ms=round(age*1000),
            captured_at_unix_ms=round((time.time()-age)*1000),observation_verdict=observed_verdict,
            implementation='OpenAI snapshot inspection; not motion tracking',
            checkpoint={'schema_version':1,'task_id':'plushie-arrangement','step_id':'arrange',
                        'evidence_candidate':candidate,'automatic_advance':False,
                        'needs_live_pose_gate':True})
        STATE['result']=result
        event('ai_check',**result)
    return dict(result,snapshot=base64.b64encode(ai_verifier.bounded_jpeg(current)).decode())



def event(kind, **data):
    EVENTS.append({"time":time.time(), "event":kind, **data})
    del EVENTS[:-300]


def decode_image(encoded):
    if not isinstance(encoded,str) or len(encoded)>2_800_000:
        raise ValueError("Image exceeds 2 MB.")
    raw = base64.b64decode(encoded, validate=True)
    # Header dimensions are inspected before OpenCV allocates decoded pixels.
    import io
    from PIL import Image
    with Image.open(io.BytesIO(raw)) as header:
        if header.format not in ("JPEG","PNG") or header.width>1600 or header.height>1600:
            raise ValueError("Use JPEG/PNG no larger than 1600 pixels per side.")
    image = cv2.imdecode(np.frombuffer(raw,np.uint8),cv2.IMREAD_COLOR)
    if image is None:
        raise ValueError("Invalid image.")
    return image, cv2.imencode(".jpg",image,[cv2.IMWRITE_JPEG_QUALITY,85])[1].tobytes()


def inspect_current():
    with LOCK:
        if STATE["reference"] is None or STATE["boxes"] is None:
            raise ValueError("Save a reference and mark all three plushies first.")
        if STATE["frame"] is None or time.monotonic()-STATE["received"]>3:
            raise ValueError("No fresh camera frame. Reconnect the camera or upload a new image.")
        ref, current = STATE["reference"], STATE["frame"]
        boxes = STATE["boxes"]
        revision, frame_id, received = STATE["revision"], STATE["frame_id"], STATE["received"]
    result = verify(ref,current,boxes)
    # This image belongs to the checked frame, not the newer live stream.
    inspection = current.copy()
    for item in result.get("detections",[]):
        polygon=np.int32(item["polygon"])
        color=(100,230,140) if item['kind']=='toy' else (240,190,80)
        cv2.polylines(inspection,[polygon],True,color,2)
        px,py=polygon[0]
        cv2.putText(inspection,item['name'],(max(0,int(px)),max(20,int(py)-8)),cv2.FONT_HERSHEY_SIMPLEX,.6,color,2)
    snapshot=base64.b64encode(cv2.imencode('.jpg',inspection,[cv2.IMWRITE_JPEG_QUALITY,85])[1]).decode()
    with LOCK:
        # A live camera can deliver another frame during inference. Results
        # describe their captured frame, never a timeless claim about the scene.
        if revision != STATE["revision"] or time.monotonic()-received>3:
            raise ValueError("Discarded outdated result. Check again.")
        result.update(frame_id=frame_id, revision=revision, age_ms=round((time.monotonic()-received)*1000),
                      implementation="local SIFT object matching and stationary tissue geometry — no semantic AI")
        STATE["result"] = result
        event("check", **result)
    return dict(result, snapshot=snapshot)


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *args):
        pass

    def send(self, status, payload, content_type="application/json"):
        data = json.dumps(payload).encode() if content_type=="application/json" else payload
        self.send_response(status)
        self.send_header("Content-Type",content_type)
        self.send_header("Content-Length",str(len(data)))
        self.send_header("Cache-Control","no-store")
        self.send_header("X-Content-Type-Options","nosniff")
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self):
        if not self.valid_host():
            return self.send(403,{"error":"Local host required."})
        path = urlparse(self.path).path
        if path=="/api/health":
            return self.send(200,{"app":"trail-browser-prototype","source_id":SOURCE_ID})
        if path=="/api/telemetry/config":
            origin = self.headers.get("Origin")
            if self.headers.get("Sec-Fetch-Site") not in (None, "same-origin", "none") or (origin and origin != f"http://{self.headers.get('Host')}"):
                return self.send(403,{"error":"Local same-origin requests only."})
            return self.send(200,public_config())
        if path=="/api/ai/status":
            with LOCK:
                latest=dict(AI_LATEST) if AI_LATEST and AI_LATEST['revision']==STATE['revision'] else None
                if latest:
                    latest['age_ms']=max(0,round(time.time()*1000)-latest['captured_at_unix_ms'])
                capture=dict(revision=STATE['revision'],frame_id=STATE['frame_id'],source=STATE['selected_source'],
                    has_reference=STATE['reference'] is not None and bool(STATE['boxes']),
                    age_ms=round((time.monotonic()-STATE['received'])*1000) if STATE['received'] else None)
            self.send(200,dict(ai_status(),token=AI_TOKEN,automatic=AUTO_AI.status(),latest=latest,ready=ai_ready(),capture=capture))
        elif path=="/api/state":
            with LOCK:
                self.send(200,{"frame_id":STATE["frame_id"], "age_ms":round((time.monotonic()-STATE["received"])*1000) if STATE["received"] else None,
                    "has_reference":STATE["reference"] is not None, "revision":STATE["revision"], "boxes":STATE["boxes"],
                    "label_boxes":label_boxes(STATE["boxes"],STATE["reference"].shape) if STATE["boxes"] else [],
                    "source":STATE["source"], "selected_source":STATE["selected_source"], "shape":list(STATE["frame"].shape[:2]) if STATE["frame"] is not None else None})
        elif path in ("/api/frame.jpg","/api/reference.jpg"):
            with LOCK:
                data = STATE["jpeg" if path=="/api/frame.jpg" else "reference_jpeg"]
            self.send(200,data,"image/jpeg") if data else self.send(404,{"error":"No image yet"})
        elif path=="/api/log":
            with LOCK:
                self.send(200,list(EVENTS))
        else:
            files = {"/tutorial.css":"tutorial.css","/tutorial-design.mjs":"tutorial-design.mjs","/tutorial-feedback.mjs":"tutorial-feedback.mjs","/tutorial-select.mjs":"tutorial-select.mjs","/tutorial-shell.mjs":"tutorial-shell.mjs","/tutorial-ui.mjs":"tutorial-ui.mjs","/tutorial-follow.mjs":"tutorial-follow.mjs","/tutorial-assist.mjs":"tutorial-assist.mjs","/":"tutorial.html","/lab":"index.html","/camera":"camera.html","/app.js":"app.js","/camera.js":"camera.js","/style.css":"style.css","/ai-monitor.js":"ai-monitor.js",
                     "/narration.mjs":"narration.mjs","/narration-core.mjs":"narration-core.mjs","/camera-snapshot.mjs":"camera-snapshot.mjs","/tutorial-review.mjs":"tutorial-review.mjs","/tutorial":"tutorial.html","/tutorial-core.mjs":"tutorial-core.mjs","/tutorial-guide.mjs":"tutorial-guide.mjs","/tutorial-store.mjs":"tutorial-store.mjs",
                     "/hands":"hands.html","/hand-guide.mjs":"hand-guide.mjs","/motion-core.mjs":"motion-core.mjs",
                     "/ar":"ar.html","/ar.js":"ar.js","/ar-state.mjs":"ar-state.mjs","/ar.css":"ar.css",
                     "/workspace-assist.mjs":"workspace-assist.mjs","/live-voice.mjs":"live-voice.mjs","/fluid-capture.mjs":"fluid-capture.mjs","/spatial-controls.mjs":"spatial-controls.mjs",
                     "/holographic-hand.mjs":"holographic-hand.mjs","/experience-entry.mjs":"experience-entry.mjs",
                     "/assets/hands/left.glb":"assets/hands/left.glb","/assets/hands/right.glb":"assets/hands/right.glb",
                     "/vendor/GLTFLoader.js":"vendor/GLTFLoader.js","/vendor/SkeletonUtils.js":"vendor/SkeletonUtils.js","/vendor/BufferGeometryUtils.js":"vendor/BufferGeometryUtils.js",
                     "/vendor/three.module.js":"vendor/three.module.js","/vendor/three.core.js":"vendor/three.core.js",
                     "/voice-actions.mjs":"voice-actions.mjs","/voice-commands.mjs":"voice-commands.mjs","/command-audio-worklet.js":"command-audio-worklet.js",
                     "/tutorial-coach.mjs":"tutorial-coach.mjs","/local-commands.mjs":"local-commands.mjs","/tutorial-coach-panel.mjs":"tutorial-coach-panel.mjs","/narration-labels.mjs":"narration-labels.mjs","/instruction-voice.mjs":"instruction-voice.mjs","/vendor/trail-coach.js":"vendor/trail-coach.js"}
            files.update({f"/{name}":name for name in (
                "telemetry.mjs", "telemetry-sentry.mjs", "telemetry-runtime.mjs",
                "telemetry-panel.mjs", "telemetry-friction.mjs", "telemetry.css",
                "vendor/sentry.mjs", "vendor/SENTRY-LICENSE.txt")})
            if path not in files:
                return self.send(404,{"error":"Not found"})
            file = ROOT/"public"/files[path]
            mime = "model/gltf-binary" if file.suffix==".glb" else "text/javascript" if file.suffix in (".js",".mjs") else "text/css" if file.suffix==".css" else "text/plain" if file.suffix==".txt" else "text/html"
            self.send(200,file.read_bytes(),mime+"; charset=utf-8")

    def valid_host(self):
        return self.headers.get('Host') in (f'127.0.0.1:{self.server.server_port}',f'localhost:{self.server.server_port}')

    def do_POST(self):
        if not self.valid_host() or self.headers.get('Sec-Fetch-Site')=='cross-site':
            return self.send(403,{"error":"Local same-origin requests only."})
        if self.headers.get('Content-Type','').split(';')[0]!='application/json':
            return self.send(415,{"error":"JSON requests required."})
        origin = self.headers.get("Origin")
        if origin and urlparse(origin).netloc != self.headers.get("Host"):
            return self.send(403,{"error":"Use this app's own origin."})
        try:
            length = int(self.headers.get("Content-Length","0"))
            if not 0 < length <= 3_000_000:
                raise ValueError("Request too large or empty.")
            body = json.loads(self.rfile.read(length))
            if not isinstance(body,dict):
                raise ValueError("Expected a JSON object.")
            path = urlparse(self.path).path
            if path=="/api/frame":
                agent = self.headers.get("User-Agent","").lower()
                kind = "upload" if body.get("source")=="upload" else ("quest" if "oculusbrowser" in agent or "quest" in agent else "laptop")
                with LOCK:
                    if kind != STATE["selected_source"]:
                        return self.send(409,{"error":f"Checker is listening to {STATE['selected_source']}, not {kind}. Change Camera source on the laptop if intended."})
                frame,jpeg = decode_image(body.get("image"))
                source = {"upload":"uploaded image", "quest":"Quest headset camera", "laptop":"laptop / other browser camera"}[kind]
                with LOCK:
                    if kind != STATE["selected_source"]:
                        return self.send(409,{"error":"Camera source changed. Frame discarded."})
                    STATE.update(frame=frame,jpeg=jpeg,frame_id=STATE["frame_id"]+1,received=time.monotonic(),source=source,result=None)
                    frame_id = STATE["frame_id"]
                self.send(200,{"frame_id":frame_id})
            elif path=="/api/source":
                AUTO_AI.set_enabled(False)
                kind = body.get("source_kind")
                if kind not in ("quest","laptop","upload"):
                    raise ValueError("Choose Quest, laptop, or uploaded images.")
                with LOCK:
                    if kind != STATE["selected_source"]:
                        STATE.update(selected_source=kind,frame=None,jpeg=None,received=0.,reference=None,
                                     reference_jpeg=None,boxes=None,result=None,source="none",revision=STATE["revision"]+1)
                        event("source_changed",source_kind=kind)
                        save_reference_cache()
                self.send(200,{"ok":True})
            elif path=="/api/reference":
                AUTO_AI.set_enabled(False)
                with LOCK:
                    if STATE["frame"] is None or time.monotonic()-STATE["received"]>3:
                        raise ValueError("Capture a fresh camera image first.")
                    STATE.update(reference=STATE["frame"].copy(),reference_jpeg=STATE["jpeg"],boxes=None,result=None,revision=STATE["revision"]+1)
                    event("reference_saved",revision=STATE["revision"])
                    save_reference_cache()
                self.send(200,{"ok":True})
            elif path=="/api/boxes":
                AUTO_AI.set_enabled(False)
                with LOCK:
                    if STATE["reference"] is None or body.get("revision")!=STATE["revision"]:
                        raise ValueError("Reference changed; reload and mark boxes again.")
                    boxes = validate_boxes(body.get("boxes"),STATE["reference"].shape)
                    STATE.update(boxes=boxes,result=None,revision=STATE["revision"]+1)
                    event("boxes_saved",boxes=boxes)
                    save_reference_cache()
                self.send(200,{"ok":True})
            elif path=="/api/ai/auto":
                if not secrets.compare_digest(self.headers.get('X-Tester-Token',''),AI_TOKEN):
                    return self.send(403,{"error":"Reload before changing automatic AI checks."})
                enabled=body.get('enabled')
                if enabled is True and (not ai_ready() or not ai_status().get('enabled')):
                    raise ValueError('Enable the camera, save reference boxes, and check the API allowance before starting auto AI.')
                AUTO_AI.set_enabled(enabled)
                self.send(200,AUTO_AI.status())
            elif path=="/api/ai/check":
                if not secrets.compare_digest(self.headers.get('X-Tester-Token',''),AI_TOKEN):
                    return self.send(403,{"error":"Reload the checker before requesting AI inspection."})
                self.send(200,run_ai_check())
            elif path=="/api/check":
                self.send(200,inspect_current())
            else:
                self.send(404,{"error":"Not found"})
        except (ValueError,TypeError,KeyError,cv2.error) as error:
            self.send(400,{"error":str(error)[:300]})


def restore_reference(directory):
    """Explicit local recovery only; never restore a frame as fresh camera evidence."""
    directory=Path(directory)
    saved=json.loads((directory/'state.json').read_text())
    jpeg=(directory/'reference.jpg').read_bytes()
    reference=cv2.imdecode(np.frombuffer(jpeg,np.uint8),cv2.IMREAD_COLOR)
    if reference is None:
        raise ValueError('Saved reference could not be decoded.')
    boxes=validate_boxes(saved['boxes'],reference.shape)
    kind=saved.get('selected_source','quest')
    if kind not in ('quest','laptop','upload'):
        raise ValueError('Invalid restored source.')
    with LOCK:
        STATE.update(reference=reference,reference_jpeg=jpeg,boxes=boxes,
                     revision=STATE['revision']+1,selected_source=kind,
                     frame=None,jpeg=None,received=0.,result=None,source='none')
        event('reference_restored',boxes=boxes)


if __name__=="__main__":
    if os.environ.get('RESTORE_REFERENCE_DIR'):
        restore_reference(os.environ['RESTORE_REFERENCE_DIR'])
        with LOCK:
            save_reference_cache()
    else:
        restore_reference_cache()
    AI_BUDGET=ai_verifier.Budget(runtime_path('ai-budget.sqlite3'))
    port = int(os.environ.get("PORT","4321"))
    server = ThreadingHTTPServer(("127.0.0.1",port),Handler)
    auto_stop=threading.Event()
    threading.Thread(target=auto_loop,args=(AUTO_AI,ai_ready,ai_status,run_ai_check,auto_stop),daemon=True).start()
    print(f"Trail WebXR: http://localhost:{port}/tutorial\nLegacy camera lab: http://localhost:{port}/lab\nLoopback development server. Hand guidance needs no API key. Ctrl-C to stop.",flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        AUTO_AI.set_enabled(False)
        auto_stop.set()
        server.server_close()
