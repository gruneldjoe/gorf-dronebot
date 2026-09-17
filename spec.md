# gorf-dronebot — spec

Burning robot audio visualizer. A robot rendered as a burning wireframe /
point cloud, constantly disintegrating into embers and reforming on the beat.

## 1. Concept

The robot is never fully solid. It lives in a loop: **coherent** (points
snapped to the body, wireframe glowing) → **dispersing** (points drift upward
as embers, wireframe fades) → **reforming** (snaps back on the beat). The only
parts that never disperse are the eyes — two bright points that stay locked
no matter how hard the body shatters. That's the soul of the thing.

Not an explosion. Combustion as a natural state: this thing runs on fire.

## 2. Art direction — 90s SNES vibe (not pixel art)

The *feeling* of a SNES game, translated, not literal pixels:

- **Mode-7 floor.** The ground is an infinite scrolling grid/road plane
  rushing toward the camera, F-Zero style. Tinted by the music's energy —
  cool indigo at rest, heating toward orange/magenta as things intensify.
- **Parallax background.** Two or three layers of distant silhouettes
  (ruined city, mountain ridge) scrolling at different rates behind the
  robot, plus one giant low sun/moon on the horizon that pulses with the bass.
  Chrono Trigger title screen energy.
- **Limited saturated palette.** Deep indigo night sky, hot orange/magenta
  fire, cyan accents. Strong complementary color story, SNES-style.
- **Silhouette-first composition.** The robot reads as a dark shape rim-lit
  by its own fire against the bright horizon.
- **Optional CRT treatment.** Subtle scanlines + vignette as a toggleable
  post effect. Off by default; there if the vibe needs it.
- **Color grading follows the song.** Verse = cool indigo, build = warming up,
  drop = full orange/magenta inferno.

## 3. The robot

- Humanoid mech silhouette, built from a sampled point cloud + wireframe
  edges. Gundam-chunky proportions (big shoulders, heavy legs, blocky
  torso), IG-88-inspired styling: cylindrical sensor head with a glowing
  band, twin photoreceptor eyes.
- Body kept very dark/desaturated gunmetal so the fire reads hard against
  it. The effect must always be clearly visible against the bot's colors.
- **Beat cycle:** kick transient → snap to coherent + shockwave ring on the
  floor + camera punch. Between beats → decay into embers. Drop → violent
  full shatter, then reform bigger.
- **Eyes:** two bright points, always coherent. Slight flicker with the hats.
- Secondary motion: slow sway driven by mids, head tracking the "hottest"
  frequency band.

## 4. Fire & particles

- Embers: points that detach from the body, rise, cool from white → orange →
  red → dark, then die. Emission rate follows the highs.
- Flame jets: shoulder/back vents that fire on snare hits and fills.
- Floor ring: shockwave that expands outward from the robot on every kick.
- Heat haze: screen-space distortion, scaled by overall energy. Subtle at
  rest, heavy on the drop.

## 5. Audio reactivity map

| Source              | Drives                                              |
|---------------------|-----------------------------------------------------|
| Kick / sub-bass     | Reform pulse, floor shockwave, camera punch, sun pulse |
| Mids (synths/vox)   | Wireframe brightness, robot sway                    |
| Highs (hats/shakers)| Ember/spark emission rate, eye flicker              |
| Overall energy      | Fire scale, fog density, palette heat, haze amount   |
| Drop detection      | Full shatter + reform, inferno grading              |

## 6. Tech

- **Renderer:** Three.js + custom shaders (points, wireframe, heat
  distortion, mode-7 floor). Target: real-time 60fps in a desktop browser.
- **Audio analysis:** Web Audio FFT, band-split as above. Kick detection via
  onset in the sub band; drop detection via energy delta.
- **Inputs:** audio file, mic, line-in (e.g. from Rekordbox). MIDI-mappable
  triggers (eruption, camera move, palette shift) for the DDJ-FLX10.
- **Outputs:** fullscreen for live sets; record mode exporting clips for
  socials.
- **Delivery:** static web app. Can be hosted as a Muse artifact or on
  GitHub Pages later.

## 7. Decisions log

- 2026-09-17 — Direction: **wireframe ghost** (option 3 of 3). Chosen by Dan.
- 2026-09-17 — Vibe: 90s SNES inspiration, not pixel art. Applies to the
  background as well as the robot.
- 2026-09-17 — Repo `gruneldjoe/gorf-dronebot` created (private). Spec-first
  workflow: requirements and decisions tracked here.
- 2026-09-17 — Demo mode: 4 fixed generated chiptune/glitch tracks bundled
  in `assets/demo/` (fixtures, generated once). Requested by Dan.
- 2026-09-17 — MVP = live playback: title screen → demo track or live input
  → real-time reactive visualizer. Post-MVP, in order: rendered clip export
  for socials, then DDJ performance visuals. (Dan)
- 2026-09-17 — Robot style: Gundam-chunky body, IG-88-inspired detailing
  (cylindrical sensor head, twin photoreceptor eyes); body stays dark so the
  fire reads hard against it. (Dan)
- 2026-09-17 — Timing reference: the 4 demo tracks. Personal track library
  (Dan's own music) is post-MVP. (Dan)
- 2026-09-17 — Palette call (Samantha): near-black gunmetal bot,
  white-orange-magenta fire, cyan reserved for wireframe accents / eyes /
  verse sections. Color tweak pass tracked as a post-MVP item.
- 2026-09-17 — Ship both: Muse artifact (Dan runs/views it right here) and
  GitHub Pages. (Dan)

## 8. Requirements

- R1. Real-time render loop at 60fps on a typical laptop (degrade
  gracefully: particle counts scale down first).
- R2. Beat-coherent reform: the snap-back must land on the kick transient,
  not drift.
- R3. Three inputs at minimum: audio file, mic, line-in.
- R4. (Post-MVP — DDJ visuals) MIDI learn for at least 4 manual triggers.
- R5. (Post-MVP — clip export) Record mode exports a video clip usable for
  socials.
- R6. SNES vibe checklist: mode-7 floor, parallax layers, giant sun/moon,
  limited palette, silhouette composition — all present in v1.
- R7. Demo mode: 4 bundled tracks selectable in-app, routed through the same
  FFT analysis path as live input. Works with no mic/line-in.
- R8. Turntable toggle: a HUD button (plus keyboard shortcut) to turn the
  robot's turntable rotation on/off. Default on.

## 9. Open questions (resolved 2026-09-17)

- Q1. Priority → MVP is live playback; post-MVP, in order: rendered clips
  for socials, then DDJ performance visuals.
- Q2. Robot silhouette → Gundam-chunky body, IG-88-inspired styling; body
  stays dark so the fire pops against it.
- Q3. Timing reference → the 4 demo tracks; Dan's own tracks become a
  post-MVP personal library.
- Q4. Palette → Samantha's call (see decisions log); color tweak pass
  tracked as a post-MVP item.

## 10. Demo mode

No live audio required to test. Four fixed synthy tracks ship in
`assets/demo/` (OGG Vorbis), generated once by `tools/gen_demo_tracks.py`
(deterministic — same seed, same output) and committed as fixtures. They
never change per run:

- **demo-01-overworld-run** — 140 BPM cheerful chiptune, C major (28s)
- **demo-02-boss-protocol** — 160 BPM aggressive boss theme, A minor (25s)
- **demo-03-glitch-machine** — 128 BPM glitch chip, bitcrushed + stuttered (31s)
- **demo-04-title-screen** — 92 BPM dreamy pads and sparse lead (43s)

The app offers a track selector that feeds the chosen file straight into the
same FFT analysis path as live input, so demo mode exercises the real
reactivity chain. See `assets/demo/README.md`.

## 11. MVP scope

v1 = live playback. Title screen → pick a demo track or a live input →
real-time reactive visualizer at 60fps. In scope: R1, R2, R3, R6, R7.
Out of scope until post-MVP: R4 (DDJ visuals), R5 (clip export).

## 12. Post-MVP / future enhancements

- Rendered clip export for socials (record mode → downloadable video).
- DDJ performance visuals (MIDI learn + triggers from the DDJ-FLX10).
- Personal track library (Dan's own music, organized in-app).
- Color grading controls / tweak pass.
