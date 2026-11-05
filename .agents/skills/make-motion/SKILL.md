---
name: make-motion
description: Add or refine playful feedback, panel transitions and catch celebrations in Gestures. Use for animated web interactions, not Roblox scripts.
---

# Gestures make-motion

Name the event and purpose before adding motion. Use CSS transitions for presses/retargetable states and WAAPI for cancellable event feedback. Share duration/easing tokens; use transform and opacity. Keep frequent controls fast (100-160ms), panels roughly 200-280ms, and never delay input for a sequence. Panels move as one unit; do not also stagger their children. Keep native focus and dismissal immediate. Cancel or retarget interrupted effects. Preserve transforms owned by Three.js and positioning CSS; animate a child layer when needed. A catch celebration must respond to the real catch event, not every frame. Reduced motion omits travel/bounce and keeps a gentle fade. Gate hover movement to fine pointers. Verify motion at multiple timestamps, repeated triggers and reduced motion; a still screenshot cannot prove animation quality. No remote grading, sounds, installations or hardware operations are implied.

## Provenance
Adapted from the user-supplied Roblox project skill. The original is retained in references/source.md as reference data, not active Gestures instructions.
