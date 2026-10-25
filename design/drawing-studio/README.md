# Gestures — Air studio

A local Windows drawing playground using an ESP32-CAM and finger gestures.
The MB base sends JPEGs over USB serial; the PC tracks hands in a browser worker.
No webcam or Wi-Fi password is needed.

**Hardware hold:** the user reported unusual heat. The default launcher disables
camera access pending inspection. Mouse preview works while disconnected and is
explicitly labelled. No firmware has been flashed; live camera accuracy is unverified.

## Run on this PC

Double-click **Start Gestures.cmd**, then open http://127.0.0.1:8765 in Firefox
or another modern browser. Alternatively, from this project's PowerShell terminal:

```powershell
.\.venv\Scripts\python.exe server.py
```

Ctrl+C stops the server. Use `--port 8766` if needed. Drawings are saved per browser
origin, so save an editable project before changing browsers or ports.

For a fresh checkout (Python and Node.js required):

```powershell
powershell -NoProfile -File scripts/setup.ps1
.\.venv\Scripts\python.exe server.py
```

Setup installs project-local pinned dependencies and downloads Google's versioned
hand model with SHA-256 verification. It changes no system execution policy or
global packages. Runtime assets and inference stay local and work offline.

## Gestures

| Action | Gesture |
| --- | --- |
| Draw | Pinch thumb and index finger; move your index fingertip |
| Lift pen | Release the pinch |
| Delete strokes | Pinch thumb and middle finger; move the middle fingertip over a stroke |
| Grow / shrink | Pinch with both hands; spread / bring them together |
| Rotate / move whole creation | Keep both pinches and twist / move both hands |
| Move one stroke | Choose Move, pinch near a stroke and drag |

Toolbar controls colours, brush width, undo/redo, mirroring, camera overlay and
landmarks. Fine-tune smoothing and pinch sensitivity under setup controls.
Use even lighting and keep the whole hand visible. Delayed frames, tracking
loss, hidden/inactive tabs and pause end the active stroke.

Mouse/touch use the same tools. D/V/E select Draw/Move/Erase; Ctrl+Z and
Ctrl+Shift+Z undo/redo; Delete removes the selected stroke; Ctrl+mouse wheel
resizes artwork. Clear is undoable.

Save project downloads editable JSON. Open validates it before changing existing
work. Export PNG creates a 1600 x 1200 image without the camera feed. Artwork
autosaves locally; raw camera frames are not recorded.

## Camera setup — currently held

Read [camera setup, firmware and USB protocol](docs/CAMERA.md). The firmware
targets an AI-Thinker-compatible original ESP32-CAM/OV2640. Listing titles alone
do not prove its pin map or electrical condition. The MB base is a serial adapter;
plugging it in does not make it a USB webcam. Upload comes after hardware clearance.

`scripts/setup_firmware.ps1` prepares an isolated compiler and builds; it never
flashes or probes a board. Default capture is QVGA JPEG at 921600 baud. Actual
camera FPS, serial reliability and image quality still require device testing.

Only after the physical issue is resolved and firmware is verified, start with
`--allow-device` to permit an explicit connection in the studio. Do not use that
flag to bypass the overheating hold. Built-in COM ports are excluded and firmware
identity is checked before capture.

## Verification

```powershell
npm.cmd test
.\.venv\Scripts\python.exe -m unittest discover -s tests -p "test_*.py" -v
npm.cmd run test:browser
```

Browser tests expect the held server on port 8765 and use installed Edge
headlessly (`GESTURES_BROWSER` overrides the executable). They use Google's
sample image at ignored `build/test-hand.jpg`; provenance is in the notices.
Tests don't prove live hardware accuracy. See [current status](docs/STATUS.md).

## Layout and sources

- `web/`: studio, hand-tracking worker and editable vector scene.
- `server.py`: loopback server and USB camera broker.
- `scripts/device.py`: bounded explicit-port protocol; no import-time device access.
- `firmware/GesturesCamera/`: USB JPEG firmware.
- `models/manifest.json`: model provenance/checksum; binary downloaded by setup.
- `tests/`: gesture, protocol, server and browser checks.
- `build/`, `.tools/`, `.venv/`, `node_modules/`: ignored local output/dependencies.

[Third-party notices](THIRD_PARTY_NOTICES.md) credit MediaPipe's Apache-licensed
worker and Tomasz Hawro's MIT Virtual Painter primitives. Original notices are
retained. Setup and launch never commit, push or publish the project.
