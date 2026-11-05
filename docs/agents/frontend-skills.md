# Jelly Camera frontend workflow

The user replaced Donut Lab with one large gesture-shaped jelly in a live camera view. Preserve the local worker/back-pressure and webcam lifecycle. No Studio, manual editor, debug/FPS or bottom controls. Introduction appears once per load. Old Donut/Catch UI is archived under design/donut-lab/.

Load the applicable .agents/skills/make-ui, make-motion and make-creative skills. Read docs/design/jelly-camera.md. Gesture sculpting supersedes older skill references to donut controls, pointer editing or history.

Run `powershell -NoProfile -File scripts/test-frontend-skills.ps1`, `npm test` and `npm run build`. The runner uses a private server, generated camera, local MediaPipe and tests/jelly-browser.mjs, with screenshots at desktop/tablet/phone widths. Reports go to ignored build/frontend-skills/. Taste findings are review leads; the cartoon palette and ink shadows are intentional. Check shape recognition/loss/rebasing/cooldown through tests/jelly-model.test.mjs.

Validate tutorial dismissal/reload, no manual editing, actual vertex deformation, camera filter appearance, shutdown, reduced motion, mobile fit, console and external requests. Generated camera and synthetic hands never prove physical webcam feel. Leave changes local unless asked to commit. Close only owned review processes.
