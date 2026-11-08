# Six camera effects: replacement proposal

Status: approved and implemented locally. The user selected six selectable live-camera effects and supplied six unique reference videos. This supersedes the jelly sculpture as the active experience. It does not authorize copying paid assets or introducing a manual 3D editor.

## Intended result

One full-screen live camera canvas with six named effect choices, camera selection/connect/disconnect and fullscreen. A compact selector at the top/side provides immediate switching; no bottom status toolbar or permanent tutorial launcher. The introduction appears once per page load. No autoplay sound. Gesture interaction remains the primary creative input.

The references include roundups and duplicate particle subjects, so they do not map one-to-one to six unique effects. The following six are a concrete proposed selection based on observed clips, not a verified popularity ranking:

| Effect | Visible result | Proposed hand action | Evidence boundary |
| --- | --- | --- | --- |
| Cover Window | A fine framed box reveals original album-style camera art: limited color, high-contrast type/texture and graphic cutouts. | Two hands frame/resize the window; a confirmed pinch-release cycles original cover treatments. | Inspired by `DfPsUnVv7ld`; exact branded album artwork and face masks are excluded from the first implementation. |
| Risograph | Live camera becomes textured overlapping print inks with slight registration offsets. | Hand separation adjusts the ink offset within a safe bound; a pinch-release cycles coordinated palettes. | Built from the observed short lesson and long risograph tutorial, with original texture equivalents. |
| CRT | Curved-screen camera treatment with scanlines, restrained RGB separation and a subtle phosphor appearance. | Hand movement steers a local distortion field; it settles when hands stop. | Aesthetic named/shown in `DdEjvN9OvjX`; browser shader construction is ours. No full-screen flashing. |
| One-bit Print | Camera becomes a crisp black/white dither with readable midtones and a controlled paper border. | Hand separation changes dot scale; pinch-release reverses ink/paper polarity. | One-bit dither is shown in the aesthetics roundup; not claimed to recreate his private algorithm. |
| Liquid Motion | Camera pixels bend in a bounded fluid-like trail around moving hands and decay back to a clean image. | Move hands to stir; stop to let the displacement settle. | Liquid-displacement tutorial recommendation appears in `DcYxgbYud6A`. A hand-driven displacement field is a proposed browser approximation, not a full fluid solver. |
| Particle Morph | Colored point-cloud forms scatter inside a light cage, then gather into the next form. | Hold a confirmed pinch to scatter; release to advance and reform once. | Supported by both particle reels and the full morphing tutorial. Use original procedural forms first; no unlicensed model downloads. |

These gesture assignments are design proposals. Tracking loss, hand-ID swaps, disconnect, hidden tab and effect changes cancel active gestures without creating a cycle/morph event. Do not enforce the obsolete eight-jelly-pieces behavior in the new active experience; preserve its source/history as reference.

## Approaches

The user chose a selectable six-effect camera experience over gesture-only switching. A manual selector makes each effect discoverable, lets each mode use hand gestures for its artwork and avoids accidental mode changes. Automatic switching is excluded. A node editor or external TouchDesigner runtime would add setup and break the simple browser camera flow, so the implementation stays in the existing vanilla JavaScript/Three.js/MediaPipe stack.

## Implementation boundaries

Reuse `web/webcam-source.js`, local `web/tracker-worker.js`, stable hand identities and one-inference back pressure. Separate capture/tracking lifecycle, normalized interaction state, active effect renderer and compact UI. Only the active effect runs. Keep source/crop/mirror mapping consistent across camera and landmarks.

Use GPU image passes for the camera filters and one GPU-interpolated point cloud for particle morphing. Texture dimensions follow the camera input; tracking continues using a smaller copy. Avoid per-pixel JavaScript loops and per-particle objects. Profile before choosing particle count or promising a frame rate. Use deterministic locally generated texture/shape data where practical. Preserve unrelated edits and leave all changes uncommitted.

Particle Morph keeps the unfiltered live camera visibly behind the colored procedural forms and cage, matching the supplied demo's composition. Shapes have their own original colors; camera pixels do not supply particle geometry or colors in this version. The camera remains visible in Cover Window outside the framed graphic region as well. These are proposed implementation choices, not additional user requirements.

The exact Freeze blend formula used in the risograph tutorial needs a current primary documentation lookup before porting it; the node name has been visually verified. Other approximate effects must be labeled as inspired interpretations in development notes, not claimed as exact copies.

Reduced motion keeps the selected print/filter appearance and essential contact feedback while suppressing decorative oscillation, scatter travel and screen warps. Disabled camera states show an honest connect prompt rather than a prerecorded scene presented as live input.

## Observable acceptance and checks

1. Exactly six selectable effects replace the jelly in the active UI; switching changes visible pixels and behavior immediately, preserves the live stream and cancels old state. Check generated-camera renders and synthetic input for each mode.
2. Each mode has the distinct visual result above. Inspect desktop, tablet and phone screenshots; inspect frame sequences for input, reversal and decay. A compile-only check is insufficient.
3. Pinch hold/release produces one event; loss/disconnect/mode changes never produce an event. Exercise deterministic landmark sequences, crossings and missing-hand cases.
4. All camera tracks/bitmaps/render targets are released appropriately; reconnect works; only one inference is pending. Test shutdown/reconnect and repeated switching.
5. Selector has labels, selected state, visible keyboard focus, native keyboard operation and narrow-screen fit. Intro dismissal remains once per page load. Check reduced motion and loading/error/disconnected states.
6. Run the updated active browser checks through `scripts/test-frontend-skills.ps1`, plus `npm test` and `npm run build`; preserve historical tests as reference rather than claiming old jelly assertions verify new effects.
7. Record software timing and frame pacing under the same generated workload for each mode. Report physical webcam performance and parity with the creator as unverified unless separately tested under `docs/CAMERA.md`.

## Approved selection and implementation steps

The user approved this six-effect set and the proposed interactions. There is no reliable view-based ranking for the complete archive. This proposal does not substitute like counts for views.

1. Implement bounded gesture state and six GPU render modes independently, then integrate the shared camera lifecycle and selector.
2. Replace active jelly UI/tests/documentation while retaining historical source and test files.
3. Run unit/server/build checks and generated-camera visual/behavior checks, inspect screenshots, fix failures and review the final diff.

An independent builder review asked how Particle Morph relates to the camera image. The explicit camera-background composition above resolves that implementation ambiguity.

## Implementation verification

- Met: six selectable GPU treatments, original cover/paper textures and 14,000-point procedural morphs; same-stream switching; once-per-load introduction; stable hand input and confirmed release actions; cancellation on loss/change; reduced motion; camera permission recovery and reconnect cleanup.
- Met: 125 Node unit tests, nine loopback server tests, static build and generated-camera browser checks. Browser evidence is in `build/frontend-skills/20261108-164530-4cd811/`: desktop/tablet/phone/reduced-motion screenshots, fixed-portrait renders, pixel comparisons and software timing samples. No uncaught JavaScript/shader errors or external runtime requests were observed.
- Visual review found and fixed disconnected-screen contrast, dither cycling, camera-source texture reallocation and an old-playback reconnect race. Tests cover these regressions. Mirroring/cropping is compared to an independently mirrored source image; a second-size solid fixture verifies that no previous GPU pixels survive a source-size change.
- Taste findings were reviewed separately: cream paper, ink borders, intro shadow and treatment index/swatch styling preserve the established identity. The covered-text finding was fixed by hiding the disconnected prompt while the introduction is open. The hidden accessible h1/title-size and tabular-number findings do not identify visible product failures.
- Unverified: physical webcam responsiveness/fidelity, exposure-to-display latency, exact TouchDesigner blend parity and account-wide popularity ranking. Freeze is an inspired conventional quadratic finish; the original locked project and post-processing were not copied. Liquid is bounded displacement, not a physical fluid solver. Particle forms are original procedural forms, not the creator's dragon/character assets.
- Changes remain uncommitted. No installation, publishing, deployment or physical camera/serial access was performed during implementation.
