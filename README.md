# GORF DRONEBOT

A burning robot audio visualizer. A wireframe ghost mech disintegrates into embers on the beat and reforms — 90s SNES vibes (mode-7 floor, parallax layers, giant sun), not pixel art.

## Run it

Live at **https://gruneldjoe.github.io/gorf-dronebot/** — or open `index.html` locally.

Press **START** (click/tap) — browsers require a user gesture before audio plays.

Pick a demo track (keys `1`–`4`), or drop in your own audio file.

## Demo tracks

Four chiptune tracks, synthesized in Python (`tools/gen_demo_tracks.py`), each with a real verse/build/drop/outro arrangement:

| # | Title | Vibe |
|---|-------|------|
| 1 | OVERWORLD | Cheerful chiptune run — 140 BPM |
| 2 | BOSS | Aggressive boss protocol — 160 BPM |
| 3 | GLITCH | Bitcrushed machine — 128 BPM |
| 4 | TITLE | Dreamy pads, never drops — 92 BPM |

Regenerate them with `python3 tools/gen_demo_tracks.py` (needs `numpy`, outputs OGG via `ffmpeg`).

## Functionality

Everything the app does, what it looks like, and why you'd touch it.

### Audio sources

| Source | Effect | Use |
|--------|--------|-----|
| `1`–`4` / DEMO select | Plays one of the four built-in demo tracks. The player knows each track's BPM and 16-bar arrangement, so verse/build/drop/outro come from the audio clock — exact, not guessed. | Instant gratification, testing, DJ-less demoing. |
| FILE | Loads any audio file from disk into the engine. | Visualize your own tracks or mixes. |
| MIC | Live microphone input through the onset detector. | Clap, beatbox, or play an instrument at it — the robot reacts to you. |
| LINE | Picks a system audio input device (interface, loopback, etc.). | Feed a DJ mixer, DAW output, or another app straight in. |
| STOP | Kills the current source. | Silence / switch sources cleanly. |

### The robot

- **Wireframe ghost mech** — a 6000-point ghost cloud + wireframe shell, near-black gunmetal so the fire reads hard against it. This is the whole show.
- **Coherence (0–1)** — the core mechanic. Every detected kick snaps the robot together (coherence jumps up); between beats it burns apart and drifts upward as embers. Hard-hitting music = solid robot. Sparse music = it barely holds form.
- **Drop-shatter** — when a drop section hits, coherence slams to 0: the robot explodes into embers, shoulder jets erupt, a shockwave fires, then it springs back together with an overshoot. The money shot.
- **Manual eruption** (`SPACE`) — snaps coherence back to full and fires the jets by hand. Use it to punctuate a moment or rescue the robot mid-breakdown.
- **Eyes** — two ember-orange eye points that never disperse. The ghost is always watching.
- **Turntable** (`T` / SPIN toggle) — slow turntable rotation of the model so you can review it from all sides. Default on.
- **Sway** (SWAY toggle) — mid-frequency-driven torso rock (roll + pitch). Makes the robot feel like it's riding the groove instead of standing at attention. Default on, recently bumped +20%.

### Beat-reactive FX (FX row: RINGS / PUNCH / SUN — all toggleable, all default on)

- **Shockwave rings** — an expanding floor ring fires on every kick, scaled by kick strength. Gives each kick a physical footprint on the mode-7 floor.
- **Camera punch** — quick dolly-in + FOV kick on each beat, decaying exponentially so it snaps back. Makes drops feel like the camera got shoved.
- **Sun pulse** — the horizon sun swells with each kick on top of its slow ambient pulse. The whole sky breathes with the track.

### Cinematography

- **Drift + handheld** — the camera slowly orbits (azimuth drift) with a touch of handheld noise so the frame never feels frozen.
- **Drop push-in** — on section changes into a drop, the camera dollies closer. Drops feel bigger without touching the robot.
- **Reframe jitter** — small azimuth nudge on every section change, so verse/build/drop each get a slightly fresh angle.
- **Manual orbit** — drag to orbit yourself; after 4 idle seconds the auto-drift resumes.

### Stage

- **Mode-7 floor** — scrolling perspective grid, cool cyan in verses, hot magenta in drops. The floor color follows the section grade.
- **Parallax layers** — two scrolling background silhouettes (ridge + city) at different depths behind the sun. Pure SNES.
- **Giant sun** — sits on the horizon, ambient pulse + kick swell (see Sun pulse).
- **Fog + heat grade** — a global "grade" lerps toward verse/build/drop heat targets; fog density and scene heat follow it over ~2 seconds so transitions never pop.
- **HEAT slider** — manual bias on top of the audio-driven heat. Crank it to force the scene hot regardless of what the detector thinks.

### Palettes

Four full-scene color variants, re-tinted live with no rebuilds: **inferno** (default — white-orange-magenta fire), **toxic** (acid green), **glacier** (ice blue), **ultraviolet** (purple). Cycle with the PAL trigger.

### Post-processing

- **Bloom** — fire, embers, and the sun glow. Threshold and strength tuned so the robot stays readable.
- **CRT** (`C` / CRT toggle / CRT trigger) — scanlines + phosphor vibe. Off by default.
- **Quality** (QUALITY select: AUTO / HIGH / MED / LOW) — pixel ratio, ember/jet counts, and bloom on/off. AUTO drops tiers if the frame rate sags, so it stays smooth on weak GPUs.

### HUD

- **FPS meter** — color-coded (cyan ≥55, orange ≥30, red below). Your first stop if something feels off.
- **SUB / MID / HIGH band meters** — live frequency-band levels feeding the whole show. If the robot isn't reacting, these tell you whether the detector hears anything.
- **Beat dot** — flashes on every detected kick. The ground truth for "is the onset detector hearing the beat."
- **Section label** — current detected section (verse/build/drop/outro). Drives the grade, floor color, and drop-shatter.
- **Source name** — what audio is currently loaded.
- `H` hides the whole HUD for clean recording.

### Triggers (TRIG row)

Four big buttons, each fires its action when clicked:

- **ERUPT** — drop-shatter + full jet eruption + shockwave, on demand.
- **PUNCH** — camera punch, on demand.
- **PAL** — cycle to the next palette.
- **CRT** — toggle the CRT shader.

**MIDI learn** — shift+click any TRIG button (or press `M` to arm ERUPT), then move a knob or hit a pad on your controller; note-ons and CCs ≥64 fire it. The MIDI row lists connected devices (DDJ-FLX10, etc.) with a live status readout. Bindings persist in localStorage. Built for live DJ use: map ERUPT to a performance pad and detonate the robot on your drops.

### Recorder

- **● REC** button (or `R`) — captures the canvas at 60fps plus the master audio tap and auto-downloads `gorf-dronebot-<timestamp>.webm` when you stop. Live timer while rolling.
- **1080p checkbox** — resizes the render buffer to 1920×1080 for the take, restores your window size after. For clean clip exports.

### Field manual

`?` opens the in-app help overlay — every shortcut and trigger on one SNES-styled card.

## Controls

| Key | Action |
|-----|--------|
| `SPACE` | Manual eruption (snap the ghost back together) |
| `1`–`4` | Demo tracks |
| `C` | CRT monitor on/off |
| `H` | HUD on/off |
| `F` | Fullscreen |
| `T` | Turntable spin on/off |
| `M` | MIDI learn: ERUPT (shift+click any TRIG button to learn that one) |
| `R` | Record a `.webm` clip (HUD REC button; 1080p checkbox for export size) |
| `?` | Field manual |

### MIDI

Connect a controller (DDJ-FLX10, etc.) — it shows up in the HUD's MIDI
selector. Shift+click a TRIG button, then move a knob or hit a pad to bind
it. Four mappable actions: **ERUPT** (drop-shatter + jets + shockwave),
**PUNCH** (camera punch), **PAL** (palette cycle: inferno → toxic →
glacier → ultraviolet), **CRT** (scanlines). Bindings persist in
localStorage. Clicking a TRIG button fires it by hand.

## How it works

- **Audio** (`js/audio/`): real-time FFT via Web Audio `AnalyserNode`. Onset detector (`detect.js`) finds kicks (sub-band flux + sharpness + sub-dominance gates), snares, and section. Demo tracks use **time-based sections** — the player knows each track's BPM and 16-bar arrangement, so verse/build/drop come from the audio clock, exact.
- **Robot** (`js/scene/robot.js`): point-cloud/wireframe mech. `coherence` 0–1 drives disintegration — kicks snap it together, it burns apart between beats. On drop: **shatter** — coherence slams to 0, embers erupt, jets fire, shockwave, then it springs back with an overshoot.
- **FX** (`js/scene/`): embers, flame jets, shockwave rings, mode-7 floor, parallax sun.
- **Post** (`js/post/`): bloom + CRT shader, quality scaler.

## Project docs

- `spec.md` — requirements R1–R11, decisions, MVP scope
- `scaffold-prompt.md` — the 22-step build plan
