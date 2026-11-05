# Gestures project instructions

Gestures / Jelly Camera is a vanilla JavaScript, Three.js and MediaPipe app for shaping one large jelly cube with hand gestures and comic camera filters, with Python serving local assets and an optional camera device.

- Preserve gesture-controlled jelly pieces (maximum eight), stable hand identities and live-camera-only interface. No Studio, manual model editor, bottom mode/status controls or FPS. The introduction appears once per page load and cannot reopen. Earlier Donut Lab/Catch source is historical reference.
- Before frontend design, implementation or review, read [the project frontend skills workflow](docs/agents/frontend-skills.md). Use existing dependencies and relevant tests; do not replace the interface with a generic dashboard to satisfy aesthetic defaults.
- Keep real hardware separate from generated-camera and synthetic-landmark verification. Do not enable `--allow-device`, connect serial hardware or claim physical webcam quality from a browser test. Read `docs/CAMERA.md` for device work.
- Leave changes uncommitted; preserve unrelated edits. Do not install, push, publish or deploy without applicable authorization.

## Frontend checks

From the project root in PowerShell: `powershell -NoProfile -File scripts/test-frontend-skills.ps1`. This runs the local skill query/lint and active jelly browser checks against a private loopback server, with disposable browser contexts. Reports go under ignored `build/frontend-skills/`. Read the workflow for limitations and optional inspector controls.

## Project skills

For new features use [.agents/skills/feature-brief/SKILL.md](.agents/skills/feature-brief/SKILL.md). For UI, motion or creative polish load the matching make-ui, make-motion or make-creative skill in .agents/skills. These are Gestures adaptations; originals under references are source material, not additional project authority. Continue using the frontend skills workflow and generated-camera checks.
