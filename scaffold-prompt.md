# Scaffold prompt — gorf-dronebot

You are building **gorf-dronebot**: a real-time, audio-reactive "burning
robot" visualizer for the browser. Source of truth is `spec.md` in this repo
— if this prompt and the spec disagree, the spec wins and you flag the
conflict instead of guessing.

Build it **one step at a time, in order**. After each step, run it and
confirm the "Done when" criteria before moving on. Do not skip ahead. Small
steps, verified working, then the next.

## Build order: MVP first

**MVP = steps 1–16, 19–22** (everything needed for live playback: title
screen → demo track or live input → real-time reactive visualizer). Build
and verify all MVP steps before touching anything post-MVP.

**Post-MVP = step 17 (MIDI), step 18 (recorder)**, plus: personal track
library, color grading controls. Do not build these during MVP — but keep
the module seams clean so they slot in later (e.g. `js/input/midi.js` and
`js/input/recorder.js` stay as empty stubs with their interfaces sketched).

## Vision (from spec + discussion)

A robot rendered as a burning wireframe/point cloud in a dark void, caught in
an endless loop: **coherent → dispersing into embers → reforming on the
beat**. Its eyes never disperse. The vibe is 90s SNES games — mode-7
scrolling floor, parallax silhouettes, a giant bass-pulsing sun/moon, limited
saturated palette (indigo night, orange/magenta fire, cyan accents) — but not
pixel art. Silhouette-first composition: the robot is a dark shape rim-lit by
its own fire.

## Locked decisions (don't bikeshed these)

- **No build step.** Vanilla JS + `<script type="importmap">`, Three.js pinned
  via CDN (jsdelivr, e.g. `three@0.160.0`). Static files only — must run from
  `file://`-ish static hosting, GitHub Pages, and as a Muse artifact, with
  zero tooling.
- **File layout:**
  ```
  index.html
  css/style.css
  js/main.js            — boot, loop, wiring
  js/config.js          — all tunables in one place
  js/audio/engine.js    — inputs, FFT, band split
  js/audio/detect.js    — kick onset, energy/drop detection
  js/scene/background.js — sky, sun/moon, parallax, mode-7 floor
  js/scene/robot.js     — body build, point cloud, wireframe, coherence
  js/scene/particles.js — embers, flame jets, shockwave rings
  js/scene/camera.js    — drift, punch, drop zoom
  js/scene/post.js      — bloom, composite (haze, vignette, CRT)
  js/ui/title.js        — press-start screen + menu
  js/ui/hud.js          — meters, selectors, MIDI learn panel
  js/input/midi.js      — Web MIDI learn + triggers
  js/input/recorder.js  — MediaRecorder capture
  assets/demo/*.ogg     — already in repo, do not regenerate
  ```
- **AudioContext must start from a user gesture.** The title screen
  ("PRESS START") is that gesture — don't work around it, use it.
- Demo tracks in `assets/demo/` are fixtures. Never modify them.
- Dan's open questions (spec Q1–Q4) are unresolved — pick sensible defaults,
  note them in code comments as `// DECISION NEEDED:`, keep moving.

## Global conventions

- Every tunable (particle counts, decay rates, colors, thresholds) lives in
  `js/config.js`. No magic numbers scattered in modules.
- Every module exposes `init()`, `update(dt, audioState)`, and where relevant
  `setQuality(level)`. `main.js` owns the loop and passes a single
  `audioState` object: `{ sub, mid, high, energy, kick (bool/impulse),
  snare, section: 'verse'|'build'|'drop', time }`.
- 60fps target on a typical laptop. If a step hurts perf, note it and move
  on — there's a dedicated performance step later.
- Commit after each working step (Dan reviews/pushes; you just commit
  locally).

---

## Step 1 — Skeleton

**Goal:** Project boots, Three.js loads, blank canvas resizes correctly.

**Build:**
- `index.html` with importmap (pinned three), canvas, `css/style.css`
  (black background, canvas fills viewport).
- `js/main.js`: renderer, scene, camera, resize handler, `requestAnimationFrame`
  loop with delta-time clamp.
- `js/config.js` with a first handful of tunables (colors, camera fov).

**Done when:** Opening `index.html` (via any static server) shows a black
fullscreen canvas, no console errors, and resizing the window keeps it
fullscreen.

## Step 2 — Core loop + debug HUD

**Goal:** Frame timing visible, module pattern established.

**Build:**
- FPS meter (simple rolling average, drawn in a corner div).
- `js/ui/hud.js` skeleton: collapsible panel, monospace, SNES-ish styling
  (chunky borders, limited palette).
- Wire the `audioState` object through the loop with dummy values
  (sine-based fake energy) so later steps can develop against it.

**Done when:** FPS number updates live; HUD panel toggles with `H`; the fake
`audioState` is flowing into `update()` calls.

## Step 3 — Sky, sun, parallax

**Goal:** The SNES background reads instantly, even silent.

**Build:**
- Gradient sky shader (deep indigo → near-black horizon glow).
- Giant sun/moon: radial-gradient sprite on the horizon, slow pulse driven
  by a `pulse` param (audio later; sine for now).
- Two parallax silhouette layers (distant mountains, ruined city): generate
  silhouettes on offscreen canvas, scroll at different rates, wrap seamlessly.

**Done when:** Static scene already looks like a SNES title screen backdrop;
layers scroll at visibly different speeds; sun pulses gently.

## Step 4 — Mode-7 floor

**Goal:** Infinite grid rushing toward the camera, F-Zero energy.

**Build:**
- Large plane with a custom shader: grid lines in world space, scrolling
  toward camera with time; fade to fog with distance.
- Floor color uniform lerped by a `heat` param (indigo → orange/magenta).
- Subtle reflection fake: vertical gradient glow under the robot's position.

**Done when:** Grid scrolls smoothly toward the viewer; `heat` slider in HUD
visibly shifts the floor from cool indigo to hot magenta.

## Step 5 — Robot body

**Goal:** A chunky mech exists as geometry.

**Build:**
- Build a humanoid mech from Three.js primitives with **Gundam-chunky
  proportions** (big shoulders, heavy legs, blocky torso) and **IG-88-inspired
  styling**: cylindrical sensor head with a glowing band, twin photoreceptor
  eyes (these become the never-dispersing eye points later).
- **Keep the body very dark / desaturated gunmetal.** The fire effect must
  read hard against the bot's colors — contrast is a requirement, not a
  preference.
- Merge into one geometry group; store per-part transforms for later sway.
- Dark material, nearly black — it will be rim-lit by its own fire later.

**Done when:** The mech stands centered on the floor, reads as a strong dark
silhouette against the sun, proportions feel heavy and dramatic.

## Step 6 — Point cloud + wireframe + coherence

**Goal:** The wireframe-ghost look, manually drivable.

**Build:**
- Sample N points on the mech's surfaces → `THREE.Points` with a custom
  shader (round soft points, heat color ramp).
- `EdgesGeometry` per part, merged → wireframe lines with additive blending.
- **Coherence system:** per-point `bodyPos` + precomputed `dispersedPos`
  (upward drift + random spread). Uniform `uCoherence` 0..1 lerps between
  them; wireframe opacity follows coherence.
- Eyes: two separate bright points, NOT part of the disperse system.
- HUD slider drives `uCoherence` manually for now.

**Done when:** Dragging the slider from 1→0 visibly disintegrates the robot
into rising embers and fades the wireframe; eyes stay locked; 1 snaps it
back together.

> Palette call (locked): near-black gunmetal bot, white-orange-magenta
> fire, cyan reserved for wireframe accents / eyes / verse sections. A color
> tweak pass is a post-MVP item — don't gold-plate this now.

## Step 7 — Ember particles

**Goal:** Fire that lives and dies.

**Build:**
- Pooled particle system (fixed max, e.g. 4000): spawn at body surface points,
  rise with turbulence, cool white→orange→red→dark over life, die.
- `emissionRate` param; per-particle heat attribute drives the color ramp in
  the shader.
- Additive blending, soft round sprites.

**Done when:** Cranking `emissionRate` fills the air with rising embers that
visibly cool as they climb; zero rate leaves clean air; no allocation churn
(pool reuse only).

## Step 8 — Audio engine

**Goal:** Real analysis from real inputs.

**Build:**
- `js/audio/engine.js`: AudioContext, AnalyserNode (fftSize 2048).
- Inputs: audio file picker, mic (`getUserMedia`), line-in (device selector
  via `enumerateDevices`), and demo-track loader (fetch ogg → decode →
  buffer source, looped).
- Band split per spec: sub (20–120Hz), mid (120–2k), high (2k+), normalized
  0..1 with smoothing.
- `js/audio/detect.js`: kick onset via sub-band spectral flux + threshold;
  snare-ish onset via high-mid flux; `energy` = smoothed overall level;
  `section` = verse/build/drop from energy envelope and its derivative.

**Done when:** HUD shows live sub/mid/high meters bouncing for each input
type; kick flashes a beat indicator on actual kicks; playing
`demo-01-overworld-run.ogg` shows clearly different meter behavior than
`demo-04-title-screen.ogg`.

## Step 9 — Audio drives the robot

**Goal:** The beat cycle comes alive.

**Build:**
- Kick impulse → `uCoherence` snaps to 1 (fast attack), then decays toward 0
  between beats (decay rate in config).
- Mids → wireframe brightness + point size.
- Slow sway: torso/arms rotation driven by smoothed mids; head tilts toward
  the hottest band.
- Eye flicker with highs.
- Idle "breathing": subtle scale/position oscillation when energy is low.

**Done when:** Playing a demo track, the robot visibly shatters between
kicks and snaps together on them; sway and glow follow the music; muting the
tab leaves it breathing gently.

## Step 10 — Shockwaves + camera punch + sun pulse

**Goal:** Every kick lands physically.

**Build:**
- Pooled expanding rings on the floor per kick (shader: fading ring,
  additive).
- Camera punch: impulse on kick added to camera offset, decays exponentially.
- Sun/moon scale pulse on kick; floor `heat` nudged by energy.

**Done when:** Kicks thump — ring expands, camera kicks, sun throbs — all in
sync with the beat indicator from Step 8.

## Step 11 — Flame jets

**Goal:** Snares and fills vent fire.

**Build:**
- Shoulder/back vent emitters: cone-shaped burst particles on snare onset,
  bigger on fills (rapid successive onsets).
- Reuse the ember particle system with different spawn params (directional,
  shorter life, hotter colors).

**Done when:** Snare hits spit visible flame jets from the shoulders;
`demo-02-boss-protocol.ogg` (dense drums) looks dramatically fierier than
`demo-04`.

## Step 12 — Palette grading by section

**Goal:** Verse/build/drop each have a color story.

**Build:**
- `section` from detect.js drives a grade: verse = deep indigo/cyan accents,
  build = warming (orange creeps in), drop = full inferno (magenta/orange,
  denser fog).
- Lerp over ~2s to avoid pops. Fog density + floor heat follow the same
  grade.

**Done when:** Scrubbing through a track, the whole scene's color temperature
visibly shifts with the musical sections; transitions are smooth.

## Step 13 — Post: bloom + composite

**Goal:** Glow, haze, and the CRT option.

**Build:**
- UnrealBloomPass (from three/addons) at modest strength — fire and eyes
  should bloom, the dark mech should not.
- Final composite ShaderPass: heat-haze distortion (noise, scaled by
  energy), vignette, and toggleable CRT (scanlines + slight chromatic
  aberration). CRT off by default.

**Done when:** Embers and eyes glow; drop sections shimmer with heat haze;
toggling CRT gives a convincing retro-monitor feel without pixelation.

## Step 14 — Title screen

**Goal:** "PRESS START" — the SNES front door and the audio-gesture.

**Build:**
- Overlay: game-style title `GORF DRONEBOT`, blinking `PRESS START`,
  menu (Demo tracks / Audio file / Mic / Line-in / Options).
- Selecting anything starts the AudioContext and drops into the visualizer.
- Background scene idles behind the menu (slow drift, gentle embers).

**Done when:** Cold load shows the title over the live background; pressing
start with a demo track selected goes straight into a reacting visualizer;
no audio-permission hacks needed.

## Step 15 — Demo mode selector

**Goal:** One-click testing, no live audio.

**Build:**
- In-menu and in-HUD track list of the 4 bundled oggs (name, BPM, vibe from
  `assets/demo/README.md`).
- Switching tracks crossfades analysis (no clicks/pops in the visuals).

**Done when:** All four tracks selectable from the title menu and the HUD;
each plays looped through the full analysis path.

## Step 16 — Camera system

**Goal:** Cinematography, not just a tripod.

**Build:**
- Slow orbital drift around the robot + subtle handheld noise.
- Drop detection → slow push-in; section change → gentle reframe.
- Manual orbit with mouse drag (auto-resumes after idle).

**Done when:** A full demo track plays like a directed shot — drifting,
punching on kicks, pushing in on the drop — without ever losing the robot.

## Step 17 — MIDI

**Goal:** Dan's DDJ-FLX10 can trigger the fire.

**Build:**
- Web MIDI: device list, learn mode (click a trigger in HUD, move a
  knob/pad).
- At least 4 mappable triggers: manual eruption (coherence snap + jets),
  camera punch, palette shift, CRT toggle.

**Done when:** MIDI learn binds a controller knob and twisting it visibly
fires an eruption; bindings persist in `localStorage`.

## Step 18 — Recorder

**Goal:** Social-ready clips.

**Build:**
- `canvas.captureStream(60)` + `MediaStreamAudioDestinationNode` →
  MediaRecorder → downloadable `.webm`.
- HUD record button with timer; fixed 1080p-ish canvas option for export.

**Done when:** Recording 10s of a demo track produces a `.webm` with both
video and the track's audio in sync.

## Step 19 — Keyboard shortcuts + help

**Goal:** Playable without touching the mouse.

**Build:**
- `Space` = manual eruption, `C` = CRT toggle, `H` = HUD, `F` = fullscreen,
  `1–4` = demo tracks, `M` = MIDI learn.
- Help overlay listing them, SNES-manual styling.

**Done when:** All shortcuts work from the visualizer; help overlay is
legible and styled.

## Step 20 — Performance pass

**Goal:** Solid 60fps on a real laptop.

**Build:**
- Auto quality scaler: monitors FPS, steps particle counts / bloom
  resolution / pixel ratio down (and back up) through 3 tiers.
- Manual quality override in HUD.
- Profile the worst offenders (likely bloom + particle overdraw) and note
  results in a comment.

**Done when:** Forced heavy scene holds 60fps via auto-scaling; tier changes
are invisible-ish (no popping).

## Step 21 — Drop shatter + tuning pass

**Goal:** The money moment.

**Build:**
- On drop detection: full shatter (coherence → 0 instantly, massive ember
  burst, jets, rings), then reform bigger (brief coherence overshoot/scale
  pop).
- Play every demo track end-to-end; tune thresholds, decays, and grade
  timings in `config.js` until kicks land and drops erupt.

**Done when:** `demo-03-glitch-machine.ogg`'s chaotic sections look chaotic
and `demo-04-title-screen.ogg` stays dreamy — the visualizer clearly
"hears" the difference.

## Step 22 — Ship

**Goal:** Someone else can run it.

**Build:**
- `README.md`: what it is, how to run (any static server / `npx serve`),
  controls, MIDI, demo mode.
- GitHub Pages: confirm it works from a `gh-pages` branch or `/docs`
  folder — no build step means this should just work; verify.
- Muse artifact: package the static app as an artifact so Dan can run and
  view it right in the chat environment.
- Final commit, everything tidy.

**Done when:** Fresh clone → `npx serve` → title screen → demo track →
fire. No console errors.

---

## Acceptance bar for the whole thing

Play `demo-02-boss-protocol.ogg` fullscreen: the robot shatters and reforms
on every kick, snares vent flame, the drop erupts, and the palette burns
from indigo to inferno. Then `demo-04-title-screen.ogg`: same robot, same
scene, but it breathes slow and dreamy. If both of those are true, it works.
