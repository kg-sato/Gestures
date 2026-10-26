# Active brief: Donut Lab

User reported buggy controls and requested a single donut, with gestures affecting
its surface/topology. Simplify the active UI to one fixed-position torus. Retain
previous experiments as reference, and keep changes local/uncommitted.

Acceptance:
- Only the donut is active; no extra-part/assembly/preset manipulation controls.
- One pinch edits tube thickness or ripple, with an explicit tool selector.
- Two pinches edit hole radius and surface twist; no rigid object translation.
- Stable identities, input filtering, acquire/release debounce, batch updates,
  safe tracking-loss pauses and fresh baselines on one/two-hand/recovery transitions.
- Mouse sculpt and orbit have distinct ownership; interrupted drags end cleanly.
- Changes affect vertex buffers; normals/seams remain smooth; visible wire mesh and
  detail levels expose actual tessellation. The torus keeps its hole.
- Whole-session undo, JSON save/open, deformed GLB/PNG exports, camera lifecycle,
  local-only runtime, responsive controls and static subpath build still work.

New active modules: donut-shape.js (pure surface), donut-gestures.js (stable input),
donut-scene.js (Three rendering) and donut-document.js (portable editing document).
The previous spatial studio is saved in design/spatial-art-studio/. Its physics
and model source remain available for reference and historical unit tests.

Verification: npm test, Python unittest, tests/donut-browser.mjs on local server
and static build. Real Brio hand feel is separate from generated input evidence.


## Extension: AR Catch

User confirmed the revised sculpt controls are much better, then requested a
researched hand-to-hand throwing/catching feature. Add an exclusive Catch mode
using the same donut: stable pinch pickup, buffered-velocity release, gravity
and bounces, swept catches by the other hand, visible catch window/trail, score
and safe loss/blur/disconnect behavior. Preserve sculpted geometry and return
it unchanged when leaving Catch. Verify raw-landmark handoffs, actual mouse
throws, counter/reset behavior and static subpath hosting. Research links live
in research/AR-CATCH.md. This remains local, with no commit/push requested.
