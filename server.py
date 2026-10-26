"""Gestures local studio: USB camera bridge and private, same-origin static assets."""
import argparse
import base64
import hashlib
import re
import hmac
import json
import mimetypes
from pathlib import Path
import secrets
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, unquote, urlsplit

ROOT = Path(__file__).resolve().parent
MAX_REQUEST = 4096
STATIC = {"/": ROOT / "web/index.html"}
for name in ("index.html", "style.css", "app.js", "tracker-worker.js", "gesture-engine.js", "webcam-source.js", "ar-controls.js", "ar-scene.js", "workbench-model.js", "workbench-hands.js", "art-meshes.js", "art-presets.js", "studio-editor.js", "scene-document.js", "favicon.svg", "donut-shape.js", "donut-scene.js", "donut-gestures.js", "donut-document.js", "ar-catch.js"):
    STATIC["/" + name] = ROOT / "web" / name
STATIC["/models/hand_landmarker.task"] = ROOT / "models/hand_landmarker.task"
STATIC["/node_modules/cannon-es/dist/cannon-es.js"] = ROOT / "node_modules/cannon-es/dist/cannon-es.js"
VISION = ROOT / "node_modules/@mediapipe/tasks-vision"
STATIC["/vendor/vision_bundle.mjs"] = VISION / "vision_bundle.mjs"
for name in ("three.module.js", "three.core.js"):
    STATIC["/vendor/three/" + name] = ROOT / "node_modules/three/build" / name
for name in ("controls/OrbitControls.js", "controls/TransformControls.js", "exporters/GLTFExporter.js", "environments/RoomEnvironment.js"):
    STATIC["/vendor/addons/" + name] = ROOT / "node_modules/three/examples/jsm" / name
IMPORT_MAP = re.search(r'<script type="importmap">(.*?)</script>', (ROOT / "web/index.html").read_text(encoding="utf-8"), re.S).group(1)
IMPORT_MAP_HASH = base64.b64encode(hashlib.sha256(IMPORT_MAP.encode()).digest()).decode()
for file in (VISION / "wasm").glob("*"):
    if file.suffix in (".js", ".wasm"):
        STATIC["/vendor/wasm/" + file.name] = file


def usb_ports():
    try:
        from serial.tools.list_ports import comports
    except ImportError:
        return []
    return [{"port": item.device, "name": item.description, "vid": item.vid, "pid": item.pid}
            for item in comports() if item.vid is not None]


class CameraBroker:
    def __init__(self, allow_device=False):
        self.allow_device = allow_device
        self.lock = threading.Condition()
        self.control = threading.Lock()
        self.stop = threading.Event()
        self.thread = None
        self.camera = None
        self.image = b""
        self.sequence = 0
        self.captured_at = 0
        self.fps = 0
        self.error = ("Select the camera's USB port and connect." if allow_device else
                      "Camera access is on hold while the reported overheating is checked.")
        self.port = None
        self.connecting = False

    def status(self):
        with self.lock:
            age = time.monotonic() - self.captured_at if self.captured_at else None
            return {"connected": self.camera is not None and age is not None and age < 2,
                    "connecting": self.connecting, "port": self.port, "sequence": self.sequence,
                    "frame_age_ms": round(age * 1000) if age is not None else None,
                    "fps": round(self.fps, 1), "error": self.error,
                    "hardware_hold": not self.allow_device,
                    "model_ready": STATIC["/models/hand_landmarker.task"].is_file()}

    def connect(self, port):
        if not self.allow_device:
            raise ValueError("Hardware access is on hold. Inspect the overheating issue first; see docs/CAMERA.md.")
        if port not in {item["port"] for item in usb_ports()}:
            raise ValueError("Select an attached USB serial camera; built-in COM ports are excluded")
        with self.control:
            self._disconnect()
            from scripts.device import SerialCamera
            self.connecting = True
            try:
                camera = SerialCamera(port)
                self.camera = camera
                self.port = port
                self.error = ""
                self.stop.clear()
                self.thread = threading.Thread(target=self._capture, daemon=True)
                self.thread.start()
            except Exception:
                self.connecting = False
                self.error = "Cannot open the camera. Check firmware and close other serial programs."
                raise

    def _capture(self):
        previous = time.monotonic()
        try:
            while not self.stop.is_set():
                capture_started = time.monotonic()
                image = self.camera.capture()
                now = time.monotonic()
                interval = now - previous
                previous = now
                with self.lock:
                    self.image = image
                    self.sequence += 1
                    # Include capture and serial transfer in conservative age.
                    self.captured_at = capture_started
                    self.fps = (0.8 * self.fps + 0.2 / interval) if self.fps else 1 / interval
                    self.connecting = False
                    self.lock.notify_all()
        except Exception as exc:
            with self.lock:
                self.error = f"Camera stopped: {type(exc).__name__}. Reconnect after checking the device."
                self.image = b""
                self.connecting = False
                self.lock.notify_all()
        finally:
            camera, self.camera = self.camera, None
            if camera:
                camera.close()

    def _disconnect(self):
        self.stop.set()
        if self.thread and self.thread.is_alive():
            self.thread.join(timeout=6)
            if self.thread.is_alive():
                raise RuntimeError("Camera request is still stopping; try again shortly")
        if self.camera:
            self.camera.close()
        with self.lock:
            self.camera = None
            self.image = b""
            self.port = None
            self.captured_at = 0
            self.fps = 0
            self.connecting = False
            self.error = "Camera disconnected" if self.allow_device else "Camera access is on hold while overheating is checked."
            self.lock.notify_all()

    def disconnect(self):
        with self.control:
            self._disconnect()


def make_server(port=8765, broker=None):
    broker = broker or CameraBroker()
    token = secrets.token_urlsafe(32)

    class Handler(BaseHTTPRequestHandler):
        protocol_version = "HTTP/1.1"

        def setup(self):
            super().setup()
            self.connection.settimeout(8)

        def send(self, status, body, kind="application/json", extra=None):
            if isinstance(body, dict):
                body = json.dumps(body).encode()
            elif isinstance(body, str):
                body = body.encode()
            self.send_response(status)
            for key, value in {"Content-Type": kind, "Content-Length": str(len(body)),
                               "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff",
                               "Referrer-Policy": "no-referrer", "X-Frame-Options": "DENY",
                               "Content-Security-Policy": f"default-src 'self'; script-src 'self' 'wasm-unsafe-eval' 'sha256-{IMPORT_MAP_HASH}'; worker-src 'self'; connect-src 'self'; img-src 'self' blob: data:; style-src 'self'; object-src 'none'; frame-ancestors 'none'",
                               **(extra or {})}.items():
                self.send_header(key, value)
            self.end_headers()
            try:
                self.wfile.write(body)
            except (BrokenPipeError, ConnectionResetError):
                pass

        def guard(self, write=False):
            expected = f"127.0.0.1:{self.server.server_port}"
            if self.headers.get("Host") not in (expected, f"localhost:{self.server.server_port}"):
                self.send(403, {"error": "Invalid local host"})
                return False
            origin = self.headers.get("Origin")
            if origin is not None and origin not in (f"http://{expected}", f"http://localhost:{self.server.server_port}"):
                self.send(403, {"error": "Invalid origin"})
                return False
            if write and not hmac.compare_digest(self.headers.get("X-Gestures-Token", ""), token):
                self.send(403, {"error": "Reload the studio to authorize this request"})
                return False
            return True

        def do_GET(self):
            if not self.guard():
                return
            route = urlsplit(self.path)
            path = unquote(route.path)
            if path == "/api/status":
                self.send(200, {**broker.status(), "token": token})
            elif path == "/api/ports":
                self.send(200, {"ports": usb_ports()})
            elif path == "/api/frame.jpg":
                try:
                    after = int(parse_qs(route.query).get("after", ["-1"])[0])
                except ValueError:
                    self.send(400, {"error": "Invalid frame number"})
                    return
                with broker.lock:
                    if broker.sequence <= after and broker.camera:
                        broker.lock.wait(timeout=1)
                    if not broker.image or time.monotonic() - broker.captured_at > 2:
                        self.send(503, {"error": "No fresh camera frame"})
                        return
                    image, sequence = broker.image, broker.sequence
                    age = round((time.monotonic() - broker.captured_at) * 1000)
                self.send(200, image, "image/jpeg", {"X-Frame-Sequence": str(sequence), "X-Frame-Age-Ms": str(age)})
            elif path in STATIC and STATIC[path].is_file():
                target = STATIC[path]
                kind = {".mjs": "text/javascript", ".js": "text/javascript", ".wasm": "application/wasm", ".task": "application/octet-stream"}.get(target.suffix)
                self.send(200, target.read_bytes(), kind or mimetypes.guess_type(str(target))[0] or "application/octet-stream")
            else:
                self.send(404, {"error": "Not found"})

        def do_POST(self):
            if not self.guard(write=True):
                return
            try:
                if self.headers.get("Transfer-Encoding"):
                    raise ValueError("Transfer encoding is unsupported")
                lengths = self.headers.get_all("Content-Length", [])
                if len(lengths) != 1 or not lengths[0].isdigit():
                    raise ValueError("A single content length is required")
                length = int(lengths[0])
                if length > MAX_REQUEST:
                    raise ValueError("Request too large")
                body = json.loads(self.rfile.read(length))
                if not isinstance(body, dict):
                    raise ValueError("Expected JSON object")
                if self.path == "/api/connect":
                    broker.connect(body.get("port"))
                elif self.path == "/api/disconnect":
                    broker.disconnect()
                else:
                    self.send(404, {"error": "Not found"})
                    return
                self.send(200, broker.status())
            except (ValueError, OSError, RuntimeError, ImportError) as exc:
                self.send(409, {"error": str(exc)[:220]})

        def log_message(self, *args):
            pass

    server = ThreadingHTTPServer(("127.0.0.1", port), Handler)
    server.daemon_threads = True
    server.broker = broker
    return server


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--port", type=int, default=8765)
    parser.add_argument("--allow-device", action="store_true", help="Only after overheating has been investigated; permits explicit camera connection in UI")
    args = parser.parse_args()
    server = make_server(args.port, CameraBroker(args.allow_device))
    print(f"Gestures studio: http://127.0.0.1:{server.server_port}", flush=True)
    print("Device access held" if not args.allow_device else "Device access enabled; choose camera in studio", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.broker.disconnect()
        server.server_close()


if __name__ == "__main__":
    main()
