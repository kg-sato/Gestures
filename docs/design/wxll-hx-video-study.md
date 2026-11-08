# wxll.hx: actual-video study

This follow-up supersedes the access limitations in the initial study. Six unique Instagram videos supplied by the user were retrieved anonymously with the existing yt-dlp Python module. The repeated `DdEjvN9OvjX` link was deduplicated. No browser cookies, login credentials, paywall access or paid extraction service was used.

## Access and installed capability

- Installed and read [youtube-fetcher](https://github.com/JimmySadek/video-fetcher-to-markdown), including its read-only browser media-link extractor. Installation verified at `C:/Users/kgsat/.codex/skills/youtube-fetcher/SKILL.md`. Automatic skill discovery can use it on the next turn.
- Actual successful retrieval used `python -m yt_dlp` with anonymous requests outside the network-restricted sandbox. The skill adds a repeatable capture/transcript/contact-sheet workflow; it does not grant Instagram permissions.
- ffmpeg was already present. Faster-whisper and its CPU model were installed into a dedicated environment under ignored `build/instagram-study/`, with no application dependency or global Python changes. A PyAV decoding incompatibility was worked around by decoding audio with ffmpeg and passing PCM samples directly to the transcriber.
- All six files were probed as valid video with audio. Twelve timestamped frames across each clip were visually inspected. Four clips were processed for local speech transcription; one music-only roundup returned no speech. Machine transcripts contain obvious recognition mistakes and were cross-checked against frames and long-form captions where relevant.
- The creator's own Instagram profile Links dialog directly links [YouTube @w409h](https://www.youtube.com/@w409h) and [TikTok @3.27wx](https://www.tiktok.com/@3.27wx). The three videos exposed on the YouTube Videos tab were retrieved with full English automatic captions and video-only streams. All three caption files were read; selected tutorial frames were inspected. This is not a claim that every frame of every tutorial or the complete Instagram archive was watched.
- Raw videos, metadata, transcripts and image sheets remain in ignored `build/instagram-study/` for local reference. No reference footage or creator artwork was added to the application or committed.

## The six supplied reels

| Reference | Duration / encoded video | Observed content | Role in the replacement |
| --- | --- | --- | --- |
| [DfPsUnVv7ld](https://www.instagram.com/wxll.hx/reel/DfPsUnVv7ld/) | 11.00 s, 1080×682, 30 fps | A hand-related wireframe box frames a sequence of album-cover treatments. The person remains visible through stylized cover imagery. | Spatially framed camera/cover composition and strong graphic transformations. |
| [DdHJARUOxkq](https://www.instagram.com/wxll.hx/reel/DdHJARUOxkq/) | 28.93 s, 1080×608, 30 fps | Five-step risograph lesson: texture, monochrome/levels, recolor, offset/multiply, final paper and color adjustment. | Direct construction reference for the print effect, corroborated by the long tutorial. |
| [DdEjvN9OvjX](https://www.instagram.com/wxll.hx/reel/DdEjvN9OvjX/) | 7.80 s, 1080×608, 30 fps | Names aesthetics: CRT, receipt paper, depth map, blob tracking, datamosh, one-bit dither and night vision. It is an inspiration roundup, not a complete implementation lesson for each style. | Names and visual references for CRT and one-bit dither; shader algorithms would be our implementation. |
| [DcYxgbYud6A](https://www.instagram.com/wxll.hx/reel/DcYxgbYud6A/) | 11.03 s, 1080×608, 30 fps | Recommends tutorials for particle disintegration, motion-reactive liquid displacement, white visuals, hand-attracted particles, Ryoji Ikeda-style graphics and an exploding star. | Discovery/reference for liquid displacement; it does not teach its full algorithm. |
| [DbOGgvEuMpm](https://www.instagram.com/wxll.hx/reel/DbOGgvEuMpm/) | 64.34 s, 720×1280, 30 fps | Point-cloud import/conversion and a switch/instancing workflow. Shows Blender/tooling and point-sprite setup; the speech transcript has substantial transcription errors. | Asset preparation lesson, supported by the detailed particle tutorial. No commands shown in the video were executed. |
| [DbvoKzfOsWA](https://www.instagram.com/wxll.hx/reel/DbvoKzfOsWA/) | 12.23 s, 1080×690, 30 fps | Hand-framed particle objects alternate between recognizable colored forms and dispersed clouds, with a fine wireframe cage. | Main visual/behavior reference for scatter and morph. |

The metadata exposes like counts but **not view counts** for these downloads. At capture, likes ranged from 780 on the short risograph lesson to 311,175 on the aesthetics roundup. Likes are not views, and these numbers do not establish his account-wide top five or an objective low-attention effect. The user supplied this reference set after the earlier ranking limitation; treat it as the selected research set rather than inventing a popularity ranking.

## What the long-form lessons teach

### Risograph — 18:55

[Full source](https://www.youtube.com/watch?v=F4VqH7VEw5s)

1. At 3:05–5:10, derive dimensions from the input and fit every texture to them. Keep coordinate mapping and resolution consistent.
2. At 5:49–8:54, lower source and paper opacity and combine with pin light. Paper is part of tone construction, not merely an overlay added at the end.
3. At 9:01–11:25, make a high-contrast monochrome base and tune levels/gamma. He explicitly treats numeric settings as empirical.
4. At 11:26–14:52, build three lookup/ramp ink layers—pink, blue and orange.
5. At 14:55–15:47, multiply those ink layers and offset two in opposite directions. This supplies the misregistration associated with printed color separations.
6. At 15:48–16:36, adjust saturation and ramps. At 16:36–17:51, add final cardstock texture. A frame at 17:48 visibly confirms that the final Composite operation is **Freeze**, matching the spoken word that initially looked like a caption error. Browser translation must verify the operator formula rather than assume multiply for this final step.
7. At 18:09–18:28, restore shadow/coat detail with levels. A convincing effect must retain useful subject detail across camera exposure changes.

Application transfer: GPU camera sampling, stable local paper texture, monochrome levels, separately sampled color ramps, subtle opposite UV offsets and ink multiplication. Use original/licensed textures. Exact artist RGB values and copyrighted cover assets are not required for an inspired implementation.

### Cyanotype — 16:46

[Full source](https://www.youtube.com/watch?v=5ozEu9vtoPQ)

At 2:40–5:44, mirror/crop and dynamic resolution are handled upstream. At 5:47–10:18, levels, paper pin-light, monochrome and further contrast establish a print base. At 10:35–12:25, a fitted dirty-scan texture is combined using **difference**; the inspected frame at 12:24 shows the Difference operation in the menu. At 13:39–15:18, the final lookup maps dark/light tones to blue/white. At 15:24–15:45, reversing the base or ramp changes ink/paper polarity.

Application transfer: keep the paper and dirty-scan layers distinct; use an explicit LUT after tonal/texture construction. His nearest-pixel viewer setting is not a general instruction to use nearest filtering for every image texture. This lesson informs the shared print pipeline; cyanotype would be an optional alternative effect, not silently a seventh mode.

### Particle morphing — 27:52

[Full source](https://www.youtube.com/watch?v=sE716KGZw0w)

- At 1:46–5:20, normalize input sample counts so every point has a destination. His 800×800 example is 640,000 samples and is explicitly hardware-dependent, not a browser performance target.
- At 5:28–8:54, process color consistently with position and blend both using the same progress. Validate actual color encoding instead of blindly copying the captioned divide-by-127 setting.
- At 10:06–13:25, render instanced point sprites. Browser transfer: one bounded `THREE.Points` geometry and GPU interpolation, rather than a mesh per particle or CPU updates to all positions every frame.
- At 14:18–14:49 and 22:34–23:10, **holding expands/scatters the current shape; releasing advances the destination and removes the scatter**. Two separate parameters are essential. A generic wobble or unrelated random respawn would miss the demonstrated interaction.
- At 16:04–17:30, rise and fall response can differ; expansion is slower and recovery/morph quicker. Retarget from the current displayed value.
- At 17:54–20:25, a decreasing transition advances a wrapped counter once. Browser transfer: one confirmed release edge, with cancellation on tracking loss/disconnect/mode change. Never let lost tracking manufacture a release action.
- At 20:52–22:54, noise displacement is added to original point positions. A zero scatter value must recover the target form exactly.
- At 25:06–26:07, a fine cage and unshaded corner markers provide structure. At 27:13–27:41, time-varying noise introduces restrained living movement.

Application transfer recommendations are our engineering decisions, not claims that the creator uses Three.js. His private post-processing chain remains outside the public lesson.

## Motion and latency limits

All six downloaded reels are encoded at 30 fps. This establishes the captured file cadence only. It says nothing conclusive about his original capture rate, inference time, display refresh rate, dropped frames, end-to-end latency or hardware. Frame sequences show responsive-looking relationships but do not support a millisecond latency claim. A camera recording of a monitor can hide or add delay and social-media editing can alter cadence.

For Gestures, preserve one pending inference, separate camera resolution from tracking input resolution, record actual capture/dispatch/result/render timing privately and compare modes on the same machine. Prioritize stable contact and continuous response over decorative animation; measure false triggers alongside latency. Physical-camera feel remains unverified until separately authorized hardware testing.

## Status at the end of the research pass

Met: repeatable anonymous access to all six supplied reels; valid local video/audio; timestamped visual sampling; local short-lesson transcription; creator channel verified via his own link; all three long tutorial caption sets read and key frames checked; relevant missing skill installed and used.

Unverified: complete creator archive, top-five ranking by views, exact private assets/post-processing, continuous real-time viewing of every tutorial frame and physical latency parity. The subsequent approved implementation and its validation are recorded in [the six-effect design](six-camera-effects-proposal.md).
