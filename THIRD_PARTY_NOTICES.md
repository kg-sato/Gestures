# Sources and attribution

Gestures reuses existing open-source hand tracking rather than training a new
model. All inference runs on the PC; the ESP32-CAM captures JPEGs only.

- **MediaPipe Tasks Vision 1.1.1**, Google / MediaPipe Authors. Apache-2.0.
  Installed through the pinned npm lockfile; runtime assets are served locally.
  https://github.com/google-ai-edge/mediapipe
  https://developers.google.com/edge/mediapipe/solutions/vision/hand_landmarker/web_js
- **MediaPipe web worker example**, Copyright 2026 The MediaPipe Authors.
  Apache-2.0. `web/tracker-worker.js` adapts task initialization, worker inference
  and transferable image cleanup; changes are documented in that source file.
  https://github.com/google-ai-edge/mediapipe-samples-web/blob/main/src/workers/hand-landmarker.worker.ts
- **Virtual Painter**, Copyright (c) 2023 Tomasz Hawro. MIT. The fingertip-distance
  and midpoint primitives in `web/gesture-engine.js` are JavaScript adaptations
  of the inspected Python source; gesture state, smoothing and editable scene
  behavior were implemented for this application. The MIT notice is retained
  in that module and `licenses/Virtual-Painter-MIT.txt`.
  https://github.com/thawro/python-virtual-painter
  Inspected source blob: `fe5a58e85f9ae9b412a8ad3f7001df7a147bb874`.
- **Espressif camera driver and Arduino ESP32 examples**, Apache-2.0.
  Firmware uses the camera API and verified AI-Thinker pin map; it implements
  its own serial transport rather than copying an unrelated camera server.
  https://github.com/espressif/esp32-camera
  https://github.com/espressif/arduino-esp32

Full Apache licence: `licenses/Apache-2.0.txt`. Third-party packages retain their
respective licence terms. This document does not assign a licence to the user's
original project.

The optional browser verification uses Google's published `woman_hands.jpg`
example under ignored `build/`. It is a test fixture, not a camera capture or
part of the application experience:
https://github.com/google-ai-edge/mediapipe-samples/blob/main/examples/hand_landmarker/python/hand_landmarker.ipynb

Research also inspected public gesture/air-drawing demonstrations and discussions
on Reddit to identify common interactions. Those posts are inspiration only;
no social-media video or unlicensed code was copied.

## AR renderer

Three.js 0.186.1, Copyright 2010–2026 Three.js Authors, MIT. Full licence retained
in licenses/Three-MIT.txt. Its local module/core builds are served by the app.
The hand-controlled particle-field concept was researched from the references
in docs/research/AR.md; their application/shader source was not copied. The new
AR renderer and pose controller are project implementations.

## Workbench physics

cannon-es 0.20.0, cannon.js Authors, MIT. Pinned in package-lock.json;
locally served from its distribution ES module. Full licence retained in
licenses/Cannon-es-MIT.txt. https://github.com/pmndrs/cannon-es
