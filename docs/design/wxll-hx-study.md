# wxll.hx reference study for Gestures

> Follow-up: anonymous video access subsequently succeeded. The original access limits below describe the first research pass, not the current capability. See [the actual-video study](wxll-hx-video-study.md) for the six supplied reels, full tutorial captions, inspected frames and corrected technical findings.

Research date: 2026-11-08. Purpose: extract useful interaction, material and latency principles for the existing live-camera jelly experience. This is research and a source audit, not a redesign or a measured performance improvement.

## Coverage and evidence limits

The public Instagram grid was inspected in an isolated browser. Opening a reel produced a signup/login gate. No reel playback, frame-by-frame motion analysis, complete archive, paid tutorial, or paid `.toe` file was available. The grid screenshot is in ignored `build/wxll-grid.png`. Public Patreon descriptions were read for seven technical projects, plus the creator's sitemap and an official Derivative event listing. Public captions indexed by third parties provided additional discovery leads; those are weaker evidence than creator-authored pages.

Consequently, neither his exact latency nor sustained frame rate, hardware, implementation details behind the paywall, or the quality of every work is established. Do not call this a study of all his videos. Do not treat an attractive still or a smooth social-media clip as an end-to-end latency measurement.

## Creator-authored project map

| Project | What the accessible description establishes | Useful transfer to Gestures (recommendation) |
| --- | --- | --- |
| [Cyber Hand Webs](https://www.patreon.com/wxllhx/posts/cyber-hand-webs-149133084) | MediaPipe supplies hand data; this example builds webs using SOPs rather than POPs. The annotated project is locked. | Make the hand-to-object relationship spatially legible. A restrained contact cue can explain acquisition without exposing a landmark skeleton everywhere. |
| [Face Masks](https://www.patreon.com/wxllhx/posts/face-masks-in-149127273) | Uses Torin Blankensmith's MediaPipe plugin to attach virtual masks. | Stable registration matters as much as texture detail. Test crop, mirror, aspect ratio and reacquisition before adding surface polish. |
| [Depth Perspective Window](https://www.patreon.com/wxllhx/posts/depth-window-in-149159171) | Creates perspective/depth from tx/ty input; the teaching example uses a mouse. | Use a consistent camera and spatial mapping to create depth. This does not establish that his example estimates physical depth or requires a depth camera. |
| [Time Machine / Blob Tracking Glitch](https://www.patreon.com/wxllhx/posts/time-machine-152390998) | Accepts live or recorded video; the example is configured for 1280×720 and may need node resolution changes. | Treat temporal effects as deliberate bounded buffers, independent of the newest tracking frame. Budget memory and avoid turning an artistic delay into delayed control. |
| [Live Risograph](https://www.patreon.com/wxllhx/posts/live-risograph-161276779) | Accepts images/video/webcam input and scales to source resolution; includes texture references. | Develop one coherent print treatment: palette, contrast, dot scale, grain and registration should agree. Test skin, shadows and highlights; do not just stack filters. |
| [Live Cyanotype](https://www.patreon.com/wxllhx/posts/live-cyanotype-161961375) | Accepts live camera input, adapts to source resolution and includes texture assets/references. | A restricted palette plus intentional texture can produce a strong material identity without complicated geometry. Preserve Gestures' comic identity rather than copying the blue palette. |
| [Morphing Pointclouds](https://www.patreon.com/wxllhx/posts/morphing-in-162931179) | Accepts two `.ply` point clouds, including unequal point counts; includes example models. | Normalize scale and keep transitions continuous when inputs differ. The actual correspondence/morph algorithm is not visible and must not be guessed. |

The [official Derivative event listing](https://derivative.ca/event/datlabnyc-touchdesigner-event-15-zerospace/74242) identifies William Hu as @wxll.hx and lists his talk, “Creating Interactive Channel Racks: an Intro to POPs.” This corroborates his TouchDesigner practice; it does not identify the implementation of every Instagram effect.

[Indexed public captions](https://pictame.com/ar/instagram/wxll.hx/6658809664) additionally mention point-cloud dissipation, cloth, ASCII, portals, invisibility, thermal imagery, hand webs and an interactive drum pad. These are catalogue leads, not inspected video evidence or verified algorithms. Do not attribute techniques proposed by commenters to the creator.

## What is visible, and what is inferred

The inspected grid shows a recognizable person and room behind the work, conspicuous hand/geometry relationships, and a print-like image treatment in another thumbnail. This supports a modest composition observation: the camera image remains part of the artwork, and each thumbnail has a recognizable primary effect. It cannot establish fluid movement, tracking precision, occlusion quality or fine texture stability.

The following are design recommendations synthesized from these project descriptions and the installed motion skills, not claims about his private implementation:

1. **Keep cause and effect together.** Acquisition, deformation and the first visible feedback should happen at the same contact location. Keep grab offset and stable hand ownership. Avoid a filter that announces success before the model changes.
2. **Separate contact from follow-through.** While held, a piece should feel attached to the hand. Soft recovery can continue after release and must be interruptible by a new grab. Test active deformation response separately from release wobble. Preserve the current rule that pose loss releases without a throw.
3. **Give each event one visual lead.** For a slice, the split is the lead; a cut accent supports it; the room remains recognizable. Do not make all overlays equally dominant. New input must remain usable during effects.
4. **Build material consistency.** Grain, ink edges, highlights, alpha and dot spacing should look intentional at desktop and phone sizes. Texture should not obscure fingertips or make adjacent pieces indistinguishable.
5. **Keep quality independent of tracking resolution.** Render a detailed camera image while feeding a smaller copy into inference. Expensive visual effects should not make hand data older.
6. **Handle imperfect input explicitly.** Hand crossings, edge crops, one hand leaving, darkness, fast reversals and reacquisition matter more to the physical illusion than adding particles. Avoid predicting a gesture through tracking loss.
7. **Respect reduced motion.** Keep useful state/contact feedback; reduce screen travel, oscillation and full-frame warps. Do not add controls, a manual editor, sound autoplay or a persistent debug HUD.

## Latency: what the current project actually does

Source inspection, not a physical-camera benchmark:

| Stage | Existing behavior | Implication / investigation |
| --- | --- | --- |
| Capture: `web/webcam-source.js:11` | Requests 1920×1080, ideal and maximum 30 fps; fallback requests a smaller format. Uses video-frame callbacks where supported. | A 60 Hz display loop cannot create 60 fresh camera samples per second. At 30 fps, nominal sample spacing is about 33.3 ms; this is not total system latency. |
| Dispatch: `web/app.js:12` | Retains the latest camera bitmap; sends a 640-pixel-wide copy; allows one pending inference. | Already avoids a backlog of old inference frames and separates display quality from model input size. |
| Inference: `web/tracker-worker.js:18` | Local two-hand model, GPU attempt with CPU fallback and a discarded warmup frame. | Actual device delegate and runtime need measurement. No reason to install TouchDesigner merely to obtain MediaPipe. |
| Result handling: `web/app.js:11` | Rejects obsolete generations and results older than 500 ms. | The cutoff is a stale-result safeguard, not a latency target. |
| Recognition: `web/donut-gestures.js:62` and `:95` | Adaptive pinch smoothing; 100 ms pinch confirmation and 70 ms release confirmation. | Confirmation prevents false triggers but adds intentional onset/release delay. Do not remove it blindly. |
| Acquisition: `web/jelly-model.js:26` | Pointing smoothing, 90 ms acquisition hold and preserved grab offset; other gestures have their own confirmation windows. | Measure recognition separately from continuous tracking. Gesture safety and contact response have different tradeoffs. |
| Deformation: `web/jelly-scene.js:15` | Shapes pass through a spring even during active manipulation. | Candidate for a feel comparison: stronger attachment while held, soft recovery on release. No change or improvement is claimed. |
| Geometry: `web/jelly-scene.js:17` | CPU vertex deformation, normal and bounding-sphere recomputation per rendered piece. | Profile at eight pieces before choosing shader deformation or conditional updates. |
| Compositing: `web/app.js:19`, `web/index.html:7` | Full-resolution canvas effects plus SVG filtering. | Profile effect-on/effect-off and high-resolution inputs; costly filtering may compete with rendering. |

The worker already returns `inferenceMs`, but the app does not retain it. `sourceAgeMs` defaults to zero because the sender does not provide it. The capture timestamp is recorded after bitmap creation, so current result age omits that preceding work. Frame/inference counters do not provide a latency distribution.

The [MediaPipe TouchDesigner release notes](https://github.com/torinmb/mediapipe-touchdesigner/releases) independently document worker offloading, dropping stale results and removing duplicate hand inference. These are useful architectural lessons. They do not establish which plugin version the creator used or prove equivalent latency in this browser project.

### Measurement sequence before any optimization

1. Record capture callback, bitmap-ready, dispatch, inference duration, result arrival, recognition transition and first affected render. Keep clocks comparable across worker boundaries; report the timestamp basis. Browser timestamps remain a software proxy for exposure-to-display latency.
2. Collect median and tail latency plus frame-time distributions in the same scene: one piece and eight pieces, idle/drag/stretch/slice, effects on/off. Record browser, capture settings, resolution and actual GPU/CPU delegate. Separate warmup from steady state.
3. For hardware verification, follow `docs/CAMERA.md` under separate authorization. Film the real hand and displayed result together with a high-frame-rate external camera. Compare onset and continuous following; do not subtract a guessed display or camera delay.
4. Compare proposed changes on the same hardware and workload. Include false acquisitions, accidental slices, hand crossing/loss and fast reversal. Lower software latency is insufficient if control becomes unstable.
5. Use generated camera and synthetic landmarks for deterministic behavior checks only. They cannot establish physical-camera feel or parity with the reference videos.

## Skills from the attachment

The attachment is a names/descriptions inventory, not a skill archive or download manifest. Installations were therefore limited to identifiable original upstream packages with a concrete project use.

Installed from [emilkowalski/skills](https://github.com/emilkowalski/skills), using Codex's GitHub skill installer:

| Skill | Project use |
| --- | --- |
| `apple-design` | Direct manipulation, grab offset, interruption and responsiveness. Apply interaction principles without replacing the comic visual identity or inventing throw behavior. |
| `emil-design-eng` | Restraint, readable feedback and UI craftsmanship. |
| `animate` | Purposeful control/panel motion, inexpensive tools and reduced-motion handling. |
| `choreograph` | One visual lead per event; feedback coordinated without delaying input. |

Installed under `C:/Users/kgsat/.codex/skills/`; their `SKILL.md` files were inspected. They are available to automatic skill discovery on the next turn. Relevant principles were applied to this research synthesis. No new animation library or application dependency was installed.

Already available: `ui-ux-pro-max`, `design-taste-frontend`, browser automation, inline visualization, and the project-specific `make-ui`, `make-motion`, and `make-creative` skills. The project motion skill remains the closer authority for this application's controls and Three.js boundaries. Generic skill examples must not override project requirements, imply all animation is compositor-only, or turn UI timing tables into latency guarantees.

Not installed: Roblox Studio skills (wrong runtime), Sonner (React toast integration unnecessary here), Gemini/cloud/security/Antigravity administration skills (no task-specific need), and `impeccable` (overlaps the existing design review tools; the attachment provides no exact source/version). No arbitrary similarly named package was substituted.

## Completion and remaining work

- Met: attached inventory reviewed; relevant missing motion skills installed and read back; seven creator project descriptions mapped to Gestures; independent read-only latency audit checked against source; evidence limits recorded.
- Unverified: full Instagram archive, reel motion/latency, paid project internals, physical webcam quality, and comparative performance.
- No application behavior changed, no physical camera opened, and no commit, push or deployment performed. Application tests were not run because this deliverable changes only research documentation and installs agent instructions.
- Most useful next implementation work: add private latency measurements, then compare held deformation and release recovery using the existing checks. This is a recommendation, not a measured fix or an approved redesign.
