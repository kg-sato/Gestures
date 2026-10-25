# Active brief: holographic workbench

Implement the user-approved 2026-10-24 plan: four holographic parts over the Brio
feed; perspective selection, one/two-hand manipulation, gravity and compound
magnetic assemblies. UI contains camera, compact inputs and tutorial only.

Architecture:
- web/workbench-hands.js: stable identities, palm-relative .30/.44 pinch hysteresis,
  80 ms acquisition, 150 ms loss grace and safe release events.
- web/workbench-model.js: cannon-es 0.20.0, gravity -3, friction .4, restitution .45,
  fixed 120 Hz and maximum 8 substeps; graph of parts and single-use connectors;
  compound bodies, pose-preserving rebuilds, snapping and overlap rejection.
- web/ar-scene.js: Three perspective raycasting and depth planes; offset-preserving
  grab, two-hand rotation/scale and bounded final-120-ms throws; ghost previews.
- web/app.js: local webcam/worker back-pressure, compact controls, lifecycle resets.

Boundaries: 12 parts; .6–2 scale plus assembly cap; session-only workbench state;
no extra backend API, imported models, voice or real-world surface inference.
Drawing source/storage and firmware backups stay untouched. Particle source is
preserved in design/particle-playground/.

Verification: npm test; Python unittest; tests/browser.mjs uses a generated camera
and actual WebGL to check controls and transformations; Brio demonstrations need
human hand input and are recorded separately in STATUS.md.
