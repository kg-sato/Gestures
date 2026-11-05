---
name: feature-brief
description: Runs the user's feature-brief template before ANY new feature, map zone, screen, character, effect or system in this Roblox game. Asks the vision, references and design-brief questions, saves the answers as a brief, then builds in stages with screenshot checks. Use whenever the user asks for something new to be built or reworked, or types /feature-brief <name>. Skip only for bug fixes and one-line tweaks.
---

# Feature brief (the user's standing workflow, 2026-11-04)

Source: the user's "How to Build Roblox Maps Using AI" template (`Overnight/refs/map-making/map_making.txt`), generalised from maps to every feature. The user wants to be asked these questions every time and then hand over everything needed. Do not start building before the brief exists.

## Step 0: look first (no questions yet)
Read what already exists so the questions are short: `Roblox Dev/Design/Game Design Doc.md`, the vault note for the area, the relevant scripts/instances in Studio (inspect, do not edit), and any earlier brief in `Roblox Dev/Design/Briefs/`. Pre-fill every answer you can from the project (see defaults below) and ask only about what is missing.

## Step 0a: SHOW THE FORM ARTIFACT (the user, 2026-11-04, standing rule)
Whenever the user tells you to implement/build/rework a feature, FIRST open the Brief Form artifact for them: `Artifact` action `open`, url `https://claude.ai/artifact/JBQHtbaYYCpVxJxTAoD13N`. Do this in the first message of the turn, before any other work. Then read their answers with `ArtifactData` (collection `forms`, docs `global` and `f-<slug>`; avatar block is `avatar-characters`). If the feature has no block yet, add one with `ArtifactData` (`set` on `forms/f-<slug>`, same field shape as the others), tell the user in one line to fill it in, and stop.

## Step 0a2: export finished forms to .md (the user, 2026-11-05)
The artifact is the user's input tool; the .md in `Roblox Dev/Design/Briefs/` is my cheap context (no HTML cost). Rule: when I read the form (new-feature request or "read the brief form"), for each block with `ready: true` whose snapshot is missing or older than the doc's `updatedAt`, rewrite `Briefs/<Title>.md` once (fields as bullets, refs as a link list, header says exported + date). Not-ready blocks are not exported. `Global Brief.md` is refreshed the same way. Never poll, never re-export unchanged blocks. From then on read the .md, not the artifact, unless the user says the form changed.

## Step 0a3: one form per part
Every feature, screen, character group or system we build gets its own block in the form (create it with `ArtifactData` set on `forms/f-<slug>`, prefilled from the vault and marked `???` only where I truly need the user). When there is spare time, add blocks for the not-yet-covered parts; do not wait for the user to ask.

## Step 0b: the form comes first
Use the artifact's `global` doc plus the feature doc as the brief. (`Roblox Dev/Design/Briefs/Brief Form.md` is the old Obsidian copy; the artifact wins.) Ask only about fields still marked `???`. Skip Step 1 questions that the form already answers.

## Step 1: ask, in ONE message, with proposed defaults (only for what the form lacks)
Number the questions; the user may answer "default" to any. Use this order:

**A. Vision (1 to 3 sentences = the feature statement)**
1. Theme: what is it? (environment, character, screen, system)
2. Visual style: default = xianxia ink-wash (navy ink, silver line art, one gold accent), simulator-style readability.
3. Atmosphere: peaceful, mysterious, dangerous, magical?
4. Colours: palette (default: ink navy, silver, white, one gold accent).
5. Gameplay: how will players interact with it, and what does the player do/feel in the first 10 seconds?

**B. References**
6. Inspiration the user already has (images, links, game names). If none, say so: per the project rule REFERENCE FIRST you find your own, save them with URLs in `Overnight/refs/<feature>/`, and grade against them. Ask which features to copy from each ("copy the mood and colours, not the shapes").

**C. Design brief**
7. WHERE: exact position/size, the existing part/screen/zone to build on, config keys (e.g. `Config.Zones`).
8. FEELING and WHY: the purpose, e.g. "players run through here during chases, keep the middle open".
9. WHAT: the specific list of props, features, states, animations, sounds.
10. STYLE RULES: materials, lighting, colour, shapes; consistency with existing content (match heights, scale, UI kit tokens).
11. LIMITS: part/triangle/memory budgets (meshes under 20,000 tris), what must not be blocked, mobile (iPhone 15 landscape smallest, no gamepad), server decides currency/rewards/purchases/inventory/cooldowns.
12. PROTECT: which objects/scripts/systems may be edited and which must stay untouched (default: everything not named).
13. HOW TO WORK: stages and the order (terrain/layout, then structures, then details, then lighting/effects; for UI: layout, art, motion, wiring), and where the user wants screenshot checkpoints ("after each stage send a screenshot from X and wait for my OK", or "do all stages and show the final").
14. DONE means: the observable checks that prove it works (what you will capture and what the user will play).

Keep the message compact; group related items; propose a default after each question so the user can reply fast.

## Step 2: write the brief
Save the answers as `Roblox Dev/Design/Briefs/<Feature>.md` (current state, not a diary; the template headings above; links as `[[wikilinks]]`). Add one line to `Roblox Dev/Backlog.md` pointing to it. If a brief for this feature exists, update it instead.

## Step 3: build by the seven rules
1. Be specific: build exactly what the brief says. 2. Use the references (and say which features come from which). 3. Honour scale/layout numbers. 4. Keep one visual style. 5. Keep gameplay readable and reachable. 6. Protect existing work: inspect Studio first, never delete or modify scripts, systems or sections the brief does not name; group new objects in named folders; efficient construction (no needless parts). 7. Build in stages, test each in Studio (Play, captures, console), and give the user the checkpoint they asked for before moving on.

Then follow the project's normal verification (Studio captures, blind grade via Gemini/Codex, vault updates). Report each criterion from "DONE means" as met / unmet / unverified.
