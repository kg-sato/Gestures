# Jelly comic camera — replacement experience

User request: replace Donut Lab with a single live-camera jelly sculpture. This explicitly supersedes the older instructions to retain Studio, AR Catch, manual editing and donut-specific tools in the active UI.

## Interface
- One live camera view with a large soft rounded cube of jelly in front of it.
- Minimal camera selection/connect/disconnect and fullscreen controls. No Studio switch, export/model editor, FPS/debug, bottom status or mode controls.
- A right-side introduction appears on each page load, dismisses once, and cannot be reopened until reload. No permanent tutorial button.
- Gestures sculpt; no pointer sculpt or sliders. This is the intended meaning of no manual model editing.

## Gesture and shape proposal
- One thumb/index pinch locally pulls the jelly; release gives a damped wobble.
- Two pinches stretch/squash using hand separation and orientation; moving the hands continuously deforms the jelly with bounded dimensions and volume-like compensation.
- Stretch into a wide ribbon: speed-line comic frame.
- Squash into a pancake: halftone SPLAT effect across the camera.
- Twist into a knot-like form: swirling color/comic overlay.
- Small comic streaks respond to movement; large effects require stable shape recognition, cooldown and leaving/reentering the shape so jitter cannot repeatedly trigger them.

## Engineering and evidence
Reuse Three.js, stable hand identities, palm-relative pinch hysteresis, local MediaPipe worker and single-frame back pressure. Keep camera lifecycle/error recovery. Preserve Donut/Catch files as historical reference and existing stored data; do not force incompatible new code through obsolete mode assertions. Update active browser checks to the jelly job and retain old test suites as reference.

No external service, dependency install, hardware/serial access, sound autoplay, commit or push. Reduced-motion disables large travelling/swirl effects, avoids rapid full-screen flashes and retains readable static feedback. Test actual rounded-cube vertices, bounded deformation, synthetic hand sequences, loss/recovery, trigger cooldown, tutorial lifecycle, camera errors/shutdown, reduced motion, mobile fit and local-only requests. Physical webcam feel remains separate from generated-camera evidence.

## Tactile jelly interactions — approved detailed user request

Jelly is alpha-transparent over the DOM camera canvas (physical transmission alone cannot reveal a canvas behind WebGL). Pinch stretches a targeted piece; index/middle-finger open-close scissors split it into two distinct bounded pieces (maximum eight). Two open palms approaching compress a piece. One open palm near a screen edge compresses against that edge. A stable closing fist over a smaller sliced piece morphs that piece into a sphere. Each action has its own camera filter: stretch/ribbon speed color; slice manga cut; squish underwater; ball warm halftone. Gesture features are palm-relative, stable/rearmed and tracking-loss safe. No pointer model editing or restored toolbars. Verify actual synthetic landmark transitions plus rendering/filter changes. Preserve pieces on camera disconnect; reload starts fresh.

## Piece interaction and comic base

Index-only pointing over a piece acquires a drag after 90ms, preserves offset and locks to a stable hand ID. Changing pose/loss releases without a throw. Pieces have bounded damped screen-plane velocities, mass-weighted overlap separation and low restitution; held pieces push others. The model uses fixed 120Hz steps (at most eight per tick). This is approximate camera-plane contact, not 3D soft-body physics or merging. A persistent ink/posterization camera filter and cached print-dot pattern precede every distinct action filter. No new controls or manual pointer editing.
