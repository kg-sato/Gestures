# AR concept research — 2026-10-24

The user replaced the drawing objective with a fun sci-fi camera experience and
requested only camera, tutorial and inputs on the website.

Considered:

1. Hand-controlled particle holograms: continuous control, satisfying at ordinary
   webcam frame rates, and many working open-source precedents. Selected.
2. Floating 3D objects or a miniature solar system: feasible, but object selection
   and menus add UI beyond the requested minimal playground.
3. Hand lasers/energy beams: visually direct, but less expressive as the only toy.
   The selected effect includes a two-hand light connection.

Primary implementation references inspected:

- Wlarskog, `gesture-particles`: MIT, copyright 2026 William Larskog. Its README
  describes hand-controlled formations, compression/dispersion, energy and GPU
  particles. Its licence was read. Research inspiration only; its shader code
  and application were not copied.
  https://github.com/Wlarskog/gesture-particles
- `collidingScopes/the-force`: public gesture/particle demo; README says MIT, but
  a standalone LICENSE was not found in the inspected root. Used as a visual
  reference, not copied source.
  https://github.com/collidingScopes/the-force
- `ppongtong/gesture-particle`: documents orb, scatter, pinch and two-hand-style
  browser interaction concepts. Research inspiration only, no source copied.
  https://github.com/ppongtong/gesture-particle
- Three.js official API docs and locally pinned package, MIT. Actual rendering
  uses WebGLRenderer, BufferGeometry, ShaderMaterial, Points and torus/ring meshes.
  https://threejs.org/docs/
- Google's MediaPipe Hand Landmarker and worker example remain the actual reused
  hand-tracking implementation, with the retained Apache licence and notices.

Delivered concept: a 6500-particle field composited over the live camera, with
orb/galaxy/portal formations. Pinch gathers; open palm disperses and pulses;
two hands control scale/rotation/position; fist compresses. The renderer and
new geometry-only gesture controller were implemented for this project.

No social-media videos or unlicensed source were copied. Dependencies and model
are served locally; no frames are uploaded. This is camera-overlay AR, not a
world-tracked headset or a claim of reliable monocular depth measurement.
