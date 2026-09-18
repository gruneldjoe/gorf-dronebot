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
- R9. Demo track character: demo-01 (overworld, 140 BPM) and demo-04 (title
  screen, 92 BPM) currently feel too similar; regenerate/tweak the generator
  so each of the four tracks has a distinct sonic identity (tempo, mood,
  density, timbre). (Dan, 2026-09-17)
- R10. Effect toggles: HUD buttons to individually enable/disable the
  kick-driven effects — shockwave rings, camera punch, sun pulse. All
  default on. (Dan, 2026-09-17)
- R11. Sway toggle: HUD button to enable/disable the mid-driven torso sway.
  Default on. (Dan, 2026-09-17)
- R12. Mech chassis variants: selectable procedural robot bodies — scout,
  brute, seraph — same ghost soul, different silhouettes. (Dan, 2026-09-18)
- R13. Performance mode: one-key fullscreen ritual, every pixel of UI
  hidden. (Dan, 2026-09-18)
- R14. Auto-director: the camera cuts like a concert film, driven by
  section changes. (Dan, 2026-09-18)
- R15. Bullet-time trigger: brief slow-motion dilation on demand.
  (Dan, 2026-09-18)
- R16. Stereo duel: two mechs, left channel vs right channel, battling
  for coherence. (Dan, 2026-09-18)
- R17. Day/night cycle: the sun sets into a moon across a long set.
  (Dan, 2026-09-18)
- R18. Personal track library: Dan's own music, with metadata/artwork and
  per-track visual presets, persisted locally. (Dan, 2026-09-18)
- R19. Stem-reactive mapping: kick drives coherence, snare drives jets,
  vox (presence band) drives the sun. True stems where available,
  band-approximated otherwise. (Dan, 2026-09-18)
- R20. Key-follow: the palette breathes with the musical key (spectral
  centroid → palette selection). (Dan, 2026-09-18)
- R21. Vertical 9:16 export crop for Shorts/TikTok. (Dan, 2026-09-18)
- R22. GIF burst: one trigger, six seconds, straight to a looped GIF.
  (Dan, 2026-09-18)
- R23. Photo mode: freeze frame, hide UI, hi-res still download.
  (Dan, 2026-09-18)
- R24. OVERDRIVE meter: room energy (mic) fills it; full meter detonates
  a frame-whiting mega-eruption. (Dan, 2026-09-18)
- R25. Crowd mode: audience noise raises the HEAT bias. (Dan, 2026-09-18)
- R26. Persistent mech: scorch/wear carries across sessions (localStorage).
  It remembers. (Dan, 2026-09-18)
- R27. Konami code easter egg. (Dan, 2026-09-18)

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

Shipped: rendered clip export (step 18 — `.webm` recorder), DDJ performance
visuals (step 17 — MIDI learn + triggers). Remaining / new ideas:

- Personal track library (Dan's own music, organized in-app).
- Color grading controls / tweak pass.
- Beat-reactive FX polish pass: shockwave rings, camera punch, sun pulse
  tuning (tracked action item).
- Trigger highlight refinement + creative trigger expansion (tracked).
- Full brainstorm list lives in section 14.

## 13. Working conventions

- **README is the living manual.** Every functional change — new control,
  new toggle, new source, new effect, changed default — updates the
  `Functionality` section of `README.md` in the same commit. If the
  README doesn't describe it, it didn't happen.
- **Ship rhythm.** Push to `main` every 3 commits. `post-mvp` is the
  workbench; `main` stays demo-ready. Count commits since the last main
  push — on every third commit, push the working tree to both `post-mvp`
  and `main`.
- **Button-state pattern.** HUD buttons come in two flavors, and they must
  never be confused:
  - *Toggle buttons* (SPIN, SWAY, CRT, FX RINGS/PUNCH/SUN, …) carry the
    `on` CSS class while their state is ON — cyan glow highlight. The
    `refresh*` function for every future toggle wires
    `classList.toggle('on', isOn)` alongside the ON/OFF label.
  - *One-shot triggers* (TRIG ERUPT/PUNCH/PAL/CRT, SRC FILE/MIC/STOP, …)
    fire an action and return to rest. They NEVER hold a persistent
    highlight — no `.on`, no latched glow. Momentary flash only.
  - Stateful processes with their own indicator (REC's `.rec-on` while
    rolling) keep their dedicated class; they are neither toggles nor
    one-shots.

## 14. Post-MVP brainstorm (2026-09-18 — vibe session)

Raw idea fuel. Nothing here is committed; the good stuff graduates to
requirements.

**Performance / DJ**
- Full DDJ-FLX10 factory mapping: performance pads → triggers, knobs →
  HEAT/bloom/sway, jog wheel → camera orbit.
- Loop-roll shatter: rolling a beat loop in Rekordbox auto-fires
  escalating eruptions until you release.
- NDI / Syphon output for Resolume and VJ rigs — the robot as a live
  visual instrument.
- Setlist mode: queue tracks, visuals auto-crossfade between them.
- Gig profile vs studio profile: one-tap settings presets.

**Visuals**
- Unlockable mech chassis — same soul, new bodies (scout, brute, seraph).
- Performance mode: all UI evaporates, pure fullscreen ritual.
- Auto-director: the camera cuts and pushes like a concert film, driven
  by section changes.
- Time-dilation trigger: brief slow-mo "bullet time" on demand.
- Stereo duel: two mechs, left channel vs right, battling for coherence.
- Sun → moon: full day/night cycle across a long set.

**Audio**
- Personal track library with metadata, artwork, and per-track visual
  presets.
- Stem-reactive mode: kick drives coherence, snare drives jets, vox
  drives the sun.
- Key detection: the palette modulates with the musical key.

**Export / socials**
- Vertical 9:16 crop mode for Shorts/TikTok.
- GIF burst: one trigger, six seconds, straight to a loop.
- Photo mode: freeze frame + hide UI + hi-res still.

**Chaos / fun**
- OVERDRIVE meter: fill it with room energy (mic input), detonate a
  mega-eruption that whites out the frame.
- Crowd mode: audience noise raises the HEAT for you.
- Persistent mech: the robot remembers — scorch marks and dents carry
  across sessions.
- Konami code. You know what it does.

## 15. Potential future improvements

Not requirements — parked ideas, no commitment. The Performance/DJ set
lives here until the gig demands it.

**Performance / DJ**
- Full DDJ-FLX10 factory mapping — pads become detonation buttons, knobs
  ride the HEAT and bloom, jog wheel orbits the camera.
- Loop-roll shatter — hold a loop in Rekordbox and the eruptions escalate
  until you let go.
- NDI/Syphon out to Resolume — the robot as a live visual instrument in
  a real VJ rig.
- Setlist mode — queue tracks, visuals crossfade themselves between songs.
- Gig profile vs studio profile — one tap, whole rig reconfigures.
