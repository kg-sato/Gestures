---
name: make-motion
description: Improves how something in this Roblox game moves (a leap, a pop, a flight, a camera move, a UI transition) using the project's Motion module (springs, echo copies for glare and blur, area-keeping squash), checks it in Studio with a recording, and records the result in Obsidian. Use when the user says an animation feels stiff, cheap, floaty, robotic or not smooth, asks for more glare, blur, smear or impact, or types /make-motion <thing>.
---

# Make it move well (motion loop)

Research and rules: `Roblox Dev/Research/VFX and Animation/Animation Craft and Capabilities.md` (read sections 1, 2 and 6 first). Earlier notes: `Animation and Juice Playbook.md`, `Smooth Motion and Blur Playbook.md`. Module: `Studio_Export/Motion.luau` = `ReplicatedStorage.Shared.Motion`.

Top priority for the user: smoothness, motion blur and sound. Done means: a before and after recording at the same moment, the named fault gone in the frames, a sound cue on every impact, and a blind grade of 8 or more on motion and timing.

## Loop
1. **Find the motion and record it** before changing anything: `Hunyuan3D/.venv/Scripts/python.exe tools/record_window.py out.mp4 <seconds> 15 "Roblox Studio"` in the background, then trigger it in Play (MCP `execute_luau`, Client). Turn off ScreenGuis and blur effects if they cover a 3D motion, and pin the camera with a RenderStepped loop so the subject is in frame.
2. **Name the fault** in one line, using a principle: no anticipation, no overshoot, instant full-speed start, linear easing, fast object with no smear, glow that is a flat neon, re-tweens that lose speed.
3. **Pick the tool:**
   - fast object (moves more than its own width per frame) -> `Motion.echoModel` / `Motion.echoGui` (3 copies, gap 2), or a Trail;
   - glow on a line or shape -> two ghost copies, 2.6x and 5x thicker, much fainter, nudged a few cm;
   - something chasing a value -> `Motion.follower(f, z, r)`: f = speed, z < 1 wobble, r < 0 anticipation, r > 1 overshoot;
   - arrival or impact -> `Motion.pop(gui, 0.2)` (keeps area) or a Back-out tween with about 10% overshoot.
3b. **Sound:** every launch, impact and arrival gets a cue (`SoundCatalog`), started on the impact frame, not after the tween. Log cue name and time in the evidence; how it sounds stays UNVERIFIED.
4. **Respect Reduced Motion:** skip echoes, smears and pops when `SETTINGS.reducedMotion` is on.
5. **Check in Play and record again** at the same moment. Build a 4-frame sheet from the motion frames (frame-difference > ~0.8 finds them). Report what reads and what does not; feel stays UNVERIFIED until the user judges it.
5b. **Blind grade:** a fresh Opus subagent sees only the before and after sheets (unlabelled) and `Roblox Dev/Research/Harsh Grading.md` (recipe: "Blind grading" in `Overnight/WORKER_BRIEF.md`). Target 8 on motion and timing; under 8, fix the top fault and re-grade with a new subagent up to 8 rounds, until 8 or more (the user, 2026-11-01).
6. **Mirror and record:** push through the 127.0.0.1:8798 file server in Edit mode, check every touched script matches `Studio_Export/`, stop the server, leave Studio in Edit mode. Add a line to the note's section 7 and to `Roblox Dev/Session Log.md`.

## Rules
- GameClient is near the 200k character limit: put new code in modules; call them with `require(...)` inline rather than new top-level locals.
- Never commit or push without the user's OK. Uploads (textures, audio) are pre-approved since 2026-10-28; log every id.
