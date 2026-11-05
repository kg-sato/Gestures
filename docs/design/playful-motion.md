# Cartoon Donut Lab — revised design for approval

Reference inspected: https://www.instagram.com/p/DduZ0caN--x/ by estrellaxlo. Observed two browser video frames and read the creator caption: gesture-controlled image/filter strips, colorful mixed-media textures, ASCII/thermal/bitmap filters, MediaPipe hand input. The reference is inspiration, not a request to duplicate its assets or full filter engine.

## Direction
A cartoon art toy: warm paper-colored Studio background, dark ink outlines, rounded chunky controls with solid offset edges, coral/cyan/lime accents and readable labels. Live camera stays the primary background when connected. Preserve one donut, controls, pointer access, exact shape/history/export and input ownership.

## Visible changes
- A new selectable Comic finish gives the donut simplified light/shadow bands and a dark contour. Existing finishes and saved artwork remain available; no imported models.
- Compact sticker-like panels and a mode selector with a sliding puck. Presses compress briefly and spring back; panel entrances move as one unit.
- Catch: a short comic burst around the caught donut plus a score pop. Visual feedback is event driven and does not change the donut pose, grab offset or physics.
- Native tutorial/export dialogs receive readable cartoon treatment and short entrances. Keyboard focus/Escape remain immediate.
- Reduced motion uses fades/static catch feedback; no decorative idle wobble on the sculpt target.

## Boundaries and validation
No full camera-filter engine in this pass. No external runtime assets/services, sound autoplay, hardware operations, dependency install or publication. Test existing sculpt/catch/history/export/generated-camera suites, native keyboard flow, interruption/repeated effects, reduced motion and narrow layout. Capture desktop/mobile and motion samples. User judges final style/feel; generated camera does not prove real webcam quality.
