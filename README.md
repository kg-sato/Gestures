# Gestures — Camera Experiments

Six selectable live-camera effects, shaped by your hands. Built with vanilla JavaScript, Three.js and local MediaPipe. Video stays on your computer; there is no cloud inference or microphone capture.

## Run on Windows

Existing installations: double-click **Start Gestures.cmd** and open **http://127.0.0.1:8765/**. The desktop shortcut starts or reuses the local server and opens your default browser. If you already had a server running before this update, close that server and relaunch so it picks up the new module routes.

For a fresh setup, install Python and Node.js, then run `powershell -NoProfile -File scripts/setup.ps1` from this repository. Setup downloads the libraries and hand model; subsequent runs serve them locally.

Choose your camera and connect. The introduction appears once per page load. The effect selector, camera controls and fullscreen remain available; there is no model editor or debug toolbar.

## Six treatments

| Treatment | What you see | What to try |
| --- | --- | --- |
| Cover Window | Original album-style camera art inside a fine frame | Frame with two hands; pinch and release to change the cover |
| Risograph | Three misregistered print inks and paper grain | Spread your hands to separate the inks; pinch and release for another palette |
| CRT | Scanlines, a curved screen and restrained RGB separation | Move your hands through the signal, then let it settle |
| One-bit Print | Black-and-white dither with a paper border | Spread your hands to change dot scale; pinch and release to reverse ink and paper |
| Liquid Motion | Bounded hand-driven image displacement | Stir the image with your hands, then stop to let it clear |
| Particle Morph | Original colored point-cloud forms inside a fine cage | Hold a pinch to scatter; release to gather the next form |

Keep hands well lit and visible. A pinch needs a brief deliberate hold and release. Tracking loss, disconnecting or changing effects cancels an unfinished gesture without advancing the palette or particle form. Reduced-motion preferences suppress warps/scatter travel while retaining the selected treatment and useful state changes.

These are original browser interpretations informed by the supplied wxll.hx references. They do not include paid project files, copied album art, exact proprietary post-processing or a verified ranking by views. See the [video study](docs/design/wxll-hx-video-study.md) and [approved design](docs/design/six-camera-effects-proposal.md).

## Camera and performance

Capture requests 1080p at up to 30 fps, with a same-device compatibility fallback. The GPU samples the negotiated camera image; a separate 640-pixel-wide copy feeds local hand tracking. Only one inference is pending at a time. Modes switch without restarting the stream. Camera exposure, actual capture rate, GPU/CPU delegate and browser affect results.

Private inspection metrics record software capture-copy, inference, result age and frame intervals. They are not exposure-to-display latency measurements. Generated-camera tests cannot establish physical webcam feel or parity with the reference clips. Serial/device hardware remains disabled by default; see [CAMERA.md](docs/CAMERA.md) before hardware work.

If the camera is busy, close other camera tabs/apps and reconnect. Grant camera permission in your browser. The app retries a smaller format once on the same device and never silently changes cameras.

## Verify and build

```powershell
npm test
python -m unittest discover -s tests -p test_server.py
powershell -NoProfile -File scripts/test-frontend-skills.ps1
npm run build
```

The frontend runner starts its own private loopback server, uses generated video and synthetic landmarks, and saves browser screenshots, pixel comparisons and software timing reports under ignored `build/frontend-skills/`. It never opens your physical webcam. `npm run test:browser` and `npm run test:effects-browser` run the active suite against `GESTURES_TEST_URL` (default `http://127.0.0.1:8777/`).

`npm run build` creates a self-contained `dist/` for root or subpath hosting; it does not publish. Camera access requires a secure context such as localhost or HTTPS. Historical jelly browser tests remain available via `test:jelly-browser` for the old experience and are not the active regression suite.

## Project structure

- `web/effect-input.js`: stable hand matching, confirmed pinch edges, bounded controls and cancellation.
- `web/camera-effects.js`: GPU camera filters, original textures/cover typography and procedural particle morphing.
- `web/app.js`: selector, camera/worker lifecycle, normalized coordinate mapping and private inspection metrics.
- `web/webcam-source.js`: capture preferences, cancellation and recovery.
- `web/tracker-worker.js`: local two-hand inference with GPU attempt and CPU fallback.
- `server.py`: local asset routes and optional historical hardware bridge.

Jelly/Donut/Catch source and unit tests remain as historical reference; drawing storage and private hardware backups are untouched. Private configuration, downloaded models, reference videos, research environments and generated builds remain ignored. Third-party notices are in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
