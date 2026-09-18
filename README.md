# GORF DRONEBOT

A burning robot audio visualizer. A wireframe ghost mech disintegrates into embers on the beat and reforms — 90s SNES vibes (mode-7 floor, parallax layers, giant sun), not pixel art.

## Run it

Open `index.html` in a browser (or the Muse artifact preview). Press **START** (click/tap) — browsers require a user gesture before audio plays.

Pick a demo track (keys `1`–`4`), or drop in your own audio file.

> GitHub Pages is pending — the repo is private and the current plan
> doesn't cover Pages for private repos. Make it public (or upgrade)
> to get a live site.

## Demo tracks

Four chiptune tracks, synthesized in Python (`tools/gen_demo_tracks.py`), each with a real verse/build/drop/outro arrangement:

| # | Title | Vibe |
|---|-------|------|
| 1 | OVERWORLD | Cheerful chiptune run — 140 BPM |
| 2 | BOSS | Aggressive boss protocol — 160 BPM |
| 3 | GLITCH | Bitcrushed machine — 128 BPM |
| 4 | TITLE | Dreamy pads, never drops — 92 BPM |

Regenerate them with `python3 tools/gen_demo_tracks.py` (needs `numpy`, outputs OGG via `ffmpeg`).

## Controls

| Key | Action |
|-----|--------|
| `SPACE` | Manual eruption (snap the ghost back together) |
| `1`–`4` | Demo tracks |
| `C` | CRT monitor on/off |
| `H` | HUD on/off |
| `F` | Fullscreen |
| `T` | Turntable spin on/off |
| `?` | Field manual |

## How it works

- **Audio** (`js/audio/`): real-time FFT via Web Audio `AnalyserNode`. Onset detector (`detect.js`) finds kicks (sub-band flux + sharpness + sub-dominance gates), snares, and section. Demo tracks use **time-based sections** — the player knows each track's BPM and 16-bar arrangement, so verse/build/drop come from the audio clock, exact.
- **Robot** (`js/scene/robot.js`): point-cloud/wireframe mech. `coherence` 0–1 drives disintegration — kicks snap it together, it burns apart between beats. On drop: **shatter** — coherence slams to 0, embers erupt, jets fire, shockwave, then it springs back with an overshoot.
- **FX** (`js/scene/`): embers, flame jets, shockwave rings, mode-7 floor, parallax sun.
- **Post** (`js/post/`): bloom + CRT shader, quality scaler.

## Project docs

- `spec.md` — requirements R1–R11, decisions, MVP scope
- `scaffold-prompt.md` — the 22-step build plan
