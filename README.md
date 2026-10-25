# Gestures — holographic workbench

A local hand-controlled workbench over the Logitech Brio camera: grab, rotate,
resize, toss and magnetically connect translucent objects on a virtual surface.
Only camera controls, compact inputs and the tutorial appear on the page.

## Run

Double-click `Start Gestures.cmd` or run `.\.venv\Scripts\python.exe server.py`
from this folder in PowerShell. Open http://127.0.0.1:8765, select Brio 100 and
click Connect camera. Camera permission is required; no microphone is requested.
All camera data, inference, models and rendering stay local.

Fresh checkout: run `powershell -NoProfile -File scripts/setup.ps1` with Python
and Node.js installed. Dependencies and the hand model are pinned locally.

## Controls

- Pinch thumb/index over a visible object for 80 ms to grab its whole assembly.
- Move one pinched hand to translate without changing depth.
- Add a second pinch: hand separation resizes; the hand-to-hand angle rotates.
  Release either hand to return to one-hand movement without a jump.
- Open the remaining pinch to toss. Throw speed is capped at 4 scene units/s.
- Amber connector points and a ghost preview show a magnetic attachment.
  Release deliberately to snap; collisions alone never attach.
- Depth moves the selected assembly closer or farther. Detach separates the
  selected amber part; Delete removes it. Add supports a maximum of 12 parts.
- Gravity starts on. Freeze pauses physics while the camera remains live.
  Space toggles Freeze; R restores the four starter parts; Delete removes selection.
- Tracking loss holds the assembly for 150 ms, then releases without throwing.
  Blur and camera disconnection also release safely.

Uniform scale is limited to 0.6–2 times original size and capped for the assembly.
State lasts only for the page session. The surface is virtual; the application
has no real-desk calibration, room mapping, depth estimation or real-world collisions.

## Verification and sources

```powershell
npm.cmd test
.\.venv\Scripts\python.exe -m unittest discover -s tests -p "test_*.py" -v
```

For browser checks, start a second server with `--port 8766`, then run
`npm.cmd run test:browser`. The tests use a generated camera and never open the
user's Brio. See `build/workbench-browser-results.json` for the latest generated result.

[AR research](docs/research/AR.md) records the alternatives and upstream sources.
[Third-party notices](THIRD_PARTY_NOTICES.md) retain licence/attribution details.
The renderer uses locally installed Three.js 0.186.1, cannon-es 0.20.0 and MediaPipe Tasks 1.1.1.

The previous drawing UI is preserved under `design/drawing-studio/`. Its saved
browser document is untouched; it is not the active website. ESP32 firmware,
serial client and backups remain in the project; the current AR UI uses native
USB webcams. The default ESP32 safety hold is unchanged.

See `docs/STATUS.md` for historical hardware preparation and current
verification boundaries.
