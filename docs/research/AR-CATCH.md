# AR Catch research — 2026-10-25

The user requested an implementable webcam hand-to-hand throwing game, following
the improved single-donut sculpting controls. These are primary-source examples,
inspected online; their XR SDKs are not dependencies of this project.

## References

- Meta, [Adding Hand Tracking to First Steps](https://developers.meta.com/vr/blog/adding-hand-tracking-to-first-steps/).
  Explains hysteresis/debounced release, recent motion buffers and the difficulty
  of using the exact final hand sample when fingers open or tracking is occluded.
  Applied here: buffer stable held positions, freeze a velocity estimate when
  opening begins, then launch only on a confirmed visible release. Tracking loss
  safely releases at rest instead of inventing a throw.
- Three.js, [WebXR ball shooter source](https://github.com/mrdoob/three.js/blob/master/examples/webxr_xr_ballshooter.html).
  Demonstrates Three objects with explicit position/velocity updates, gravity and
  bounded motion. Applied here: a normalized camera-plane point simulation with
  a Three-rendered donut, fixed 120 Hz steps, gravity, damped bounces and a trail.
- A-Frame, [versioned 1.7 pinch-grab example](https://aframe.io/docs/1.7.0/components/hand-tracking-grab-controls.html).
  Demonstrates pinch-based grabbing with proximity/collider feedback. Applied
  here: the existing stable filtered pinch tracker gates a forgiving grab/catch
  distance, and visible receiving circles show the interaction region.

These examples target XR devices. Adapting their interaction patterns to webcam
landmarks is a project implementation choice, not a claim that they directly
provide webcam depth or real-world hand collisions. No application source was copied.

## Local implementation

`web/ar-catch.js` owns idle/held/flying state, grab offsets, stable-pose velocity
regression over the last 160 ms, throw bounds, receiving-hand cooldowns, swept
catch tests, scoring, misses and safe resets. It reuses `DonutGestures` for stable
hand identities, filtered points and debounced pinch state. Sculpting and Catch
are exclusive input modes. The same donut geometry/material is shown compactly
on the camera plane; flight state is not saved into the artwork document.

Catch is forgiving within a normalized screen-space window. Actual gesture feel
still depends on webcam cadence, lighting and hand separation. Unit and browser
fixtures cannot establish physical-camera accuracy by themselves.
