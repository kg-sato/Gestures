# Gestures implementation status

Date: 2026-10-24. Active project: this repository.
Earlier work was copied from the initial `Projects/GestureCanvas` folder;
that historical folder was preserved. Make future changes in this project.

## Verified

- Local server and model/WASM assets load without external runtime requests.
  Hardware access is held by default.
- 14 gesture/document tests pass: pinch hysteresis, smoothing, hand identity,
  tracking loss, grow/shrink/move transforms, hit testing, history and imports.
- 17 Python tests pass: eight serial protocol checks plus nine loopback-server
  checks. No physical serial device is opened in tests.
- 17 browser checks pass: actual model initialization, hardware hold, local-only
  requests, drawing/history, persistence, PNG export, clear/import safety,
  mobile layout, browser errors, sample inference, gesture drawing/growth/shrink/
  deletion, undo, queue/stale-frame safeguards and the injected focus guard.
- Actual inference identifies two hands with 21 landmarks each in Google's
  sample. One headless run measured 2629 ms cold then 10, 8 and 8 ms warm.
  These are sample inference times, not live camera latency/FPS. Initialization
  now warms up on a discarded blank image; later measurements are recorded in
  ignored `build/browser-results.json`.
- Desktop/mobile screenshots and exported PNG generated under ignored `build/`;
  the rendered desktop layout was inspected.

## Hardware evidence and hold

The user reports the whole top side becoming unusually hot and unplugged it.
Photos IMG_5805–IMG_5810 show an ESP-32S camera module and ESP32-CAM-MB base.
No obvious scorching was visible; photos do not establish electrical health or
complete pin mapping. Only built-in COM1 was visible at two earlier host scans.
No probe, firmware upload or capture command was sent.

Awaiting heat timing/power-source details and sufficient physical inspection to
resolve the fault. Do not reconnect a potentially faulty board as a software test.

## Required before completion

1. Resolve overheating and confirm camera/base compatibility.
2. Identify the USB serial device and preserve any wanted firmware.
3. Verify/install camera firmware on the confirmed board.
4. Capture actual frames; measure camera FPS and end-to-end frame age.
5. Demonstrate draw/release, erase, two-hand grow/shrink/rotate and move with the
   user's hands. Tune against actual lighting and image quality.
6. Verify tracking loss, disconnection and blur behavior with the real camera.

The objective remains open until live hardware and interaction requirements are
verified. Fixture checks cannot substitute for accurate, responsive live drawing.
Local-server delivery satisfies the requested local-server-or-EXE choice.

## Firmware build

Arduino CLI 1.5.1 and Espressif core 3.3.12 compiled the firmware for
`esp32:esp32:esp32cam`. The checked official CLI archive SHA-256 is recorded in
`build/firmware/toolchain.json`. Build output reports 372853 bytes program usage
and 34164 bytes global variables. Artifacts are in `build/firmware/artifacts/`;
`verification.json` records hashes and proves source equality across the folder
migration. The merged image is 4 MiB. This is compilation, not device validation.

## Supervised live test — 2026-10-24

The user reconnected the camera and explicitly requested testing after researching
normal warmth. Temperature was not measured. The persistent launcher/hold remains
unchanged; only the current server session uses `--allow-device`.

Windows identified CH340 USB serial COM5. Esptool identified ESP32-D0WD-V3 revision
3.1 and 4 MB flash. Original 4 MiB flash was read successfully before installation;
backup/checksum/installation provenance are in ignored `build/camera-backups/`.
The compiled merged firmware was written and its device hash verified. Handshake
reports protocol 1, PSRAM present and camera ready. A real QVGA JPEG was captured.
Twenty USB captures averaged 57.3 ms (17.4 fps); the live studio subsequently showed
about 21 fps with 6–7 ms inference while no hand was in view. These readings depend
on scene content and are not a claim about fingertip accuracy.

The real in-app browser is connected to COM5 and displays the actual camera.
Awaiting the user positioning a hand and demonstrating the editing gestures.

## Finger-selection correction — 2026-10-24

The user confirmed real hand drawing works, but reported index/middle confusion
in both draw and erase. Source inspection found two concrete issues: the cursor
always used the index tip, including middle-pinch erase, and simultaneous near
contacts always gave index pinch priority. Middle erase now uses landmark 12;
index draw uses landmark 8. The nearer clearly contacted tip wins; ambiguous
contacts hover rather than drawing. Switching fingers resets cursor smoothing.
Two targeted regression cases were added (16 engine tests pass). Live user
confirmation of improved accuracy remains required; no replacement camera was
recommended or purchased on the assumption this fixes model-level occlusion.

## Current AR direction — 2026-10-24

The user explicitly replaced drawing with a sci-fi camera toy. Active UI now has
only camera, tutorial and compact effect inputs. Drawing sources and prior browser
checks are preserved in design/drawing-studio; saved drawing storage is untouched.
Three.js 0.186.1 renders 6500 particles in orb/galaxy/portal formations, driven by
a new pure hand-pose controller. Research and upstream licence distinctions are
recorded in docs/research/AR.md. Third-party library code remains attributed.

Current checks: six AR geometry/control tests plus 16 preserved drawing-engine
tests, 17 host tests and nine AR browser checks pass. Browser checks use actual
WebGL and MediaPipe with a generated test camera; they verify capture, transforms,
formations, freeze, reset, tutorial, phone layout, local-only requests and errors.
They do not alone establish live accuracy with the user's Brio; live inspection
is the next check. No original camera or saved drawing data was deleted.

## AR live camera inspection

The updated minimal page is loaded at 127.0.0.1:8765 and connected to the real
Logitech Brio 100. A screenshot in build/ar-logitech-live.png shows the full
camera image with the cyan particle orb and compact camera/effect/tutorial inputs.
No hand was in view at that capture, so it proves camera compositing and rendered
appearance, not every physical gesture. Formation geometry was subsequently
cached to reduce per-frame trigonometry; all nine browser checks still pass.

Final optimized AR view was inspected again on the real Brio at about 20 FPS;
no hand was in frame at inspection. The separate regression server was stopped.
At this check, the user-facing server was running on port 8765.


## 2026-10-24 — holographic workbench implementation

Met in automated checks: perspective WebGL parts over local webcam, whole-assembly
selection, offset-preserving grab, two-hand scale/rotation and transitions, explicit
depth, bounded throws, gravity/floor/bounce/stack/sleep, freeze/resume, free connector
preview/alignment/occupancy/cycle exclusion, overlap rejection, compound body rebuild,
ring/module connectors, detach/delete, scale/capacity bounds, safe loss/blur/disconnect,
compact mobile inputs, keyboard tutorial, local-only runtime and camera shutdown.

Evidence: `npm test` 44/44 (including 17 physics/assembly and 5 new hand-tracker cases),
Python unittest 17/17, generated-camera Edge/WebGL `tests/browser.mjs` 12/12.
Browser evidence: build/workbench-browser-results.json, workbench-desktop.png and
workbench-mobile.png. Tests make generated webcam input, never opening the real Brio.
Initial HTTP tests required rerun outside socket-restricted sandbox; rerun passed.

Live Brio 100 connects and camera+workbench render (build/workbench-brio-live.png).
Observed embedded-browser sample: 52 no-hand inferences, 5.2 ms mean inference,
5.4 ms mean result age, 0.5 ms render CPU, but camera callbacks approximately 1 FPS.
This does not establish usable foreground responsiveness; background throttling is
suspected, not confirmed. Human grab/toss/two-hand/snap/detach demonstration remains
unverified. Desktop notification delivered (enabled, present in Windows history).
User hand-test question pending. Do not report full live interaction validation.

Preserved particle sources in design/particle-playground. Drawing storage and
hardware firmware/backups untouched. cannon-es MIT notice copied to licenses/.
No new backend API/service; added only exact static JS module routes.


Live update after focusing/testing: Brio sample shows 2 HANDS at 15 FPS, 155
inferences, mean inference 12.9 ms, mean result age 16.2 ms, render CPU .3 ms.
The latest screenshot visibly includes a larger rotated amber block, confirming
live hand input changed the workbench selection/transform. This improves the earlier
1 FPS observation; foreground responsiveness is still a limited sample, not a
repeatable benchmark or total camera-to-display latency measurement. Human confirmation
of grab/toss/snap/detach and tracking feel remains pending.

## 2026-10-25 — Spatial Art Studio

User chose Abstract digital art for the portfolio direction. Expanded the existing
Three.js renderer with OrbitControls, TransformControls, physical materials,
local RoomEnvironment reflections, shadows, six procedural forms, per-axis dimension
editing, explicit transforms, a turntable, three authored compositions, undo/redo,
duplication and export/import controls. Studio opens without camera permission;
Live camera preserves the hand workbench. Physics starts paused for the composition,
with hand/direct editing still available; Play physics enables simulation.

Added a self-contained static distribution build to dist/ (ignored by Git), with
relative asset paths, local hand model and libraries. Browser checks confirm it
runs under /Gestures/ without the Python backend. The worker resolves WASM/model
URLs from import.meta.url so nested hosting works. The local server adds only exact
static routes and an exact import-map CSP hash; USB access behavior stays unchanged.

Verification on this implementation: 16 art browser checks pass locally and under
/Gestures/, including actual transform-handle dragging, parametric editing, materials,
undo/redo, JSON round-trip, GLB binary structure, PNG, generated camera, physics controls,
mobile layout, shutdown, and no external runtime requests. The 12 existing hand/assembly
browser checks pass with updated studio defaults. Actual Brio hand feel for the new
art UI is not verified in this task. Generated webcam checks are distinct evidence.

Changes are prepared locally for review. This task does not commit, push or deploy them.

Final checks: 54 JavaScript tests, 17 Python tests, 16 art browser checks locally
and in the static subpath build, plus 12 hand/assembly browser regression checks.
Interrupted gizmo drags release without snapping; Depth edits are undoable; shadow
render targets are disposed with the scene. Preview is running on localhost:8765.

## 2026-10-25 — Donut Lab and AR Catch

User requested removal of other parts and gestures that deform the donut, then
confirmed the revised controls were much better. Active page now has one periodic
torus surface, gesture-driven thickness/radius/twist/ripple, explicit mesh detail
and wire topology, filtered/debounced batched input, safe loss recovery and distinct
mouse sculpt/orbit ownership. Prior studio sources live in design/spatial-art-studio/.

User then requested online research and a hand-to-hand AR Catch feature. Added a
separate Catch mode for the same donut, using buffered release velocity, fixed-step
flight, gravity/bounces, receiving-hand proximity and swept path catch tests,
trail/score/streak, a mouse throw option and safe cancellation on loss/blur/disconnect.
Sculpt geometry is preserved across Catch mode. Research references and adaptation
notes are in docs/research/AR-CATCH.md (Meta, Three.js and versioned A-Frame examples).
No SDK or external runtime service was introduced.

Current checks: 94 JavaScript unit tests, 17 Python server/protocol tests, 16 donut
browser checks and 9 AR Catch browser checks pass. Static /Gestures/ build also passes
Catch's 9 checks and the core sculpting suite (15 checks before the added hologram
regression assertion). Browser tests verify actual pointer throws, simulated raw-hand
handoff, swept catches, renderer projection, score/reset, sculpt preservation, generated
MediaPipe input, camera shutdown, exports, mobile fit and no external runtime requests.
Results are in ignored build/donut-browser-results.json and ar-catch-browser-results.json.

Live sculpt sample: Brio showed15 FPS, 2 hands, 10.7 ms mean inference over1959 samples;
user confirmed the control improvement. AR Catch's physical Brio handoff remains
unverified: browser no longer listed the Brio at handoff time (only virtual cameras).
Requested reconnection in chat and sent the authorized desktop notification; Windows
reports it enabled and present in notification history. The preview is left ready in
Live camera / AR Catch. Current donut settings were saved under ignored
build/donut-before-ar-catch.json and restored through the controls before refreshing.

Static build is prepared in dist/. All current changes remain local and uncommitted.
