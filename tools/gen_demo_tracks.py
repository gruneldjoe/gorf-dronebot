#!/usr/bin/env python3
"""Generate the gorf-dronebot demo tracks.

Ten fixed chiptune/glitch tracks for testing the visualizer without any live
audio input. Synthesized with numpy (square/triangle/saw voices, noise drums,
bitcrush + stutter glitch processing), written as 22050 Hz mono WAV, then
converted to OGG Vorbis for the web.

Deterministic: the RNG seed is fixed, so re-running produces identical
tracks. These are fixtures — they are generated once and committed, they do
not change per run.
"""

import os
import subprocess
import wave

import numpy as np

SR = 22050
SEED = 20260917
OUT_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "assets", "demo")


def freq(midi):
    return 440.0 * 2.0 ** ((midi - 69) / 12.0)


def osc(kind, t, f, duty=0.5, vib=None, bend_to=1.0):
    if bend_to != 1.0:
        f = f * (1.0 + (bend_to - 1.0) * (t / t[-1]))
    if vib:
        rate, depth = vib
        f = f * (1.0 + depth * np.sin(2.0 * np.pi * rate * t))
    ph = (t * f) % 1.0
    if kind == "square":
        return np.where(ph < duty, 1.0, -1.0)
    if kind == "tri":
        return 4.0 * np.abs(ph - 0.5) - 1.0
    if kind == "saw":
        return 2.0 * ph - 1.0
    raise ValueError(kind)


def hp_noise(n):
    nz = np.random.randn(n)
    return np.diff(nz, prepend=nz[0])


class Track:
    def __init__(self, bpm, bars):
        self.bpm = bpm
        self.step = 60.0 / bpm / 4.0  # 16th-note step in seconds
        self.bars = bars
        n = int(bars * 16 * self.step * SR) + SR
        self.buf = {v: np.zeros(n) for v in ("lead", "bass", "arp", "pad", "dr")}

    def at(self, bar, step):
        return (bar * 16 + step) * self.step

    def note(self, voice, bar, step, dur_steps, midi, vol=0.35, kind="square",
             decay=5.0, duty=0.5, vib=None, bend_to=1.0, attack=0.004):
        dur = dur_steps * self.step
        n = int(dur * SR)
        t = np.arange(n) / SR
        w = osc(kind, t, freq(midi), duty, vib, bend_to)
        env = (1.0 - np.exp(-t / attack)) * np.exp(-t * decay)
        # Release ramp: fade the last 20 ms to zero so voices never click off
        # mid-envelope (those clicks read as phantom kick drums to the onset
        # detector — found in step 21 tuning).
        r = min(n, int(0.020 * SR))
        if r > 1:
            env[-r:] *= np.linspace(1.0, 0.0, r)
        i0 = int(self.at(bar, step) * SR)
        self.buf[voice][i0:i0 + n] += vol * w * env

    def kick(self, bar, step, vol=0.85):
        n = int(0.14 * SR)
        t = np.arange(n) / SR
        f = 40.0 + 120.0 * np.exp(-t * 40.0)
        ph = np.cumsum(f) / SR
        w = np.sin(2.0 * np.pi * ph) * np.exp(-t * 28.0)
        i0 = int(self.at(bar, step) * SR)
        self.buf["dr"][i0:i0 + n] += vol * w

    def snare(self, bar, step, vol=0.5, dur=0.12):
        n = int(dur * SR)
        t = np.arange(n) / SR
        nz = hp_noise(n) * np.exp(-t * 25.0)
        tone = np.sin(2.0 * np.pi * 180.0 * t) * np.exp(-t * 30.0)
        i0 = int(self.at(bar, step) * SR)
        self.buf["dr"][i0:i0 + n] += vol * (0.7 * nz / (np.abs(nz).max() + 1e-6) + 0.3 * tone)

    def hat(self, bar, step, vol=0.14, open_=False):
        dur = 0.20 if open_ else 0.04
        n = int(dur * SR)
        t = np.arange(n) / SR
        nz = hp_noise(n) * np.exp(-t * (18.0 if open_ else 70.0))
        i0 = int(self.at(bar, step) * SR)
        self.buf["dr"][i0:i0 + n] += vol * nz / (np.abs(nz).max() + 1e-6)

    def ride(self, bar, step, vol=0.16):
        # Metallic sustained ping for drops: broadband, sits in the mix.
        n = int(0.5 * SR)
        t = np.arange(n) / SR
        nz = hp_noise(n) * np.exp(-t * 9.0)
        tone = np.sin(2.0 * np.pi * 5200.0 * t) * np.exp(-t * 14.0)
        w = nz / (np.abs(nz).max() + 1e-6) + 0.4 * tone
        i0 = int(self.at(bar, step) * SR)
        self.buf["dr"][i0:i0 + n] += vol * w / (np.abs(w).max() + 1e-6)

    def crash(self, bar, step, vol=0.4):
        n = int(0.6 * SR)
        t = np.arange(n) / SR
        nz = hp_noise(n) * np.exp(-t * 4.0)
        i0 = int(self.at(bar, step) * SR)
        self.buf["dr"][i0:i0 + n] += vol * nz / (np.abs(nz).max() + 1e-6)

    def sweep(self, bar, step, dur_steps, vol=0.25, up=True):
        n = int(dur_steps * self.step * SR)
        t = np.arange(n) / SR
        ramp = (t / (n / SR)) if up else (1.0 - t / (n / SR))
        nz = hp_noise(n) * ramp
        i0 = int(self.at(bar, step) * SR)
        self.buf["dr"][i0:i0 + n] += vol * nz / (np.abs(nz).max() + 1e-6)


def bitcrush(x, bits):
    q = 2.0 ** (bits - 1)
    return np.round(x * q) / q


def highpass(x, cutoff=150.0):
    """Gentle FFT highpass with a quadratic knee. Keeps pad/bus content out
    of the kick detector's sub band (20-120 Hz) without an audible edge."""
    X = np.fft.rfft(x)
    freqs = np.fft.rfftfreq(len(x), 1.0 / SR)
    below = freqs < cutoff
    X[below] *= np.clip((freqs[below] / cutoff) ** 2, 0.0, 1.0)
    return np.fft.irfft(X, len(x))


def stutter(buf, step_dur, bar, src_step, src_len, dst_step, dst_len):
    s0 = int((bar * 16 + src_step) * step_dur * SR)
    sn = int(src_len * step_dur * SR)
    i0 = int((bar * 16 + dst_step) * step_dur * SR)
    n = int(dst_len * step_dur * SR)
    src = buf[s0:s0 + sn].copy()
    buf[i0:i0 + n] = np.tile(src, int(np.ceil(n / sn)))[:n]


def master(track, gains=None, crush_bits=None):
    gains = gains or {}
    mix = sum(track.buf[v] * gains.get(v, 1.0) for v in track.buf)
    mix = np.tanh(mix * 1.1)
    if crush_bits:
        mix = bitcrush(mix, crush_bits)
    peak = np.abs(mix).max()
    if peak > 0:
        # Peak 0.62 (-4dB): leaves headroom in the AnalyserNode byte spectrum
        # so section density differences aren't crushed by bin saturation.
        mix = mix / peak * 0.62
    f = int(0.03 * SR)
    ramp = np.linspace(0.0, 1.0, f)
    mix[:f] *= ramp
    mix[-f:] *= ramp[::-1]
    return mix.astype(np.float32)


def write_wav(path, x):
    pcm = (np.clip(x, -1.0, 1.0) * 32767).astype(np.int16)
    with wave.open(path, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(pcm.tobytes())


def to_ogg(wav_path, ogg_path):
    subprocess.run(
        ["ffmpeg", "-y", "-loglevel", "error", "-i", wav_path,
         "-c:a", "libvorbis", "-q:a", "4", ogg_path],
        check=True,
    )


# ---------------------------------------------------------------- tracks ---

def section_of(bar):
    """16-bar arrangement: 4 verse / 4 build / 4 drop / 4 outro."""
    if bar < 4:
        return 'V'
    if bar < 8:
        return 'B'
    if bar < 12:
        return 'D'
    return 'O'


def track_overworld():
    """demo-01: cheerful 140 BPM chiptune, C major. Square lead, triangle bass.
    V: groove, no snare. B: snare + arp enter. D: full + octave lead, extra
    kick. O: stripped back."""
    t = Track(bpm=140, bars=16)
    roots = [48, 43, 45, 41]  # C G Am F
    mel = [
        [(0, 2, 76), (2, 2, 79), (4, 2, 84), (6, 2, 79), (8, 2, 76), (10, 2, 79), (12, 4, 72)],
        [(0, 2, 81), (2, 2, 79), (4, 2, 77), (6, 2, 79), (8, 2, 81), (10, 2, 84), (12, 4, 79)],
        [(0, 2, 81), (2, 2, 84), (4, 2, 88), (6, 2, 84), (8, 2, 81), (10, 2, 79), (12, 4, 76)],
        [(0, 2, 77), (2, 2, 81), (4, 2, 77), (6, 2, 76), (8, 2, 74), (10, 2, 76), (12, 4, 77)],
        [(0, 2, 76), (2, 2, 79), (4, 2, 84), (6, 2, 79), (8, 2, 76), (10, 2, 79), (12, 4, 76)],
        [(0, 2, 84), (2, 2, 81), (4, 2, 79), (6, 2, 81), (8, 2, 84), (10, 2, 88), (12, 4, 91)],
        [(0, 2, 88), (2, 2, 86), (4, 2, 84), (6, 2, 81), (8, 2, 79), (10, 2, 81), (12, 4, 84)],
        [(0, 2, 79), (2, 2, 81), (4, 2, 84), (6, 2, 79), (8, 2, 76), (10, 2, 74), (12, 4, 72)],
    ]
    for bar in range(16):
        sec = section_of(bar)
        root = roots[(bar % 8) % 4]
        notes = mel[bar % 8]
        for step in range(0, 16, 2):
            fifth = root + 7 if (bar % 4 == 3 and step >= 8) else root
            t.note("bass", bar, step, 2, fifth, vol=0.42 if sec == 'D' else 0.38,
                   kind="tri", decay=7.0)
        if sec == 'D':  # drop = full lead + octave + arp (the payoff)
            for step, dur, midi in notes:
                t.note("lead", bar, step, dur, midi, vol=0.30, kind="square",
                       decay=4.0, vib=(5.5, 0.004))
                t.note("lead", bar, step, dur, midi + 12, vol=0.16,
                       kind="square", decay=4.0)
            tones = [root + 12, root + 16, root + 19, root + 24]
            for step in range(16):
                t.note("arp", bar, step, 1, tones[step % 4], vol=0.10,
                       kind="square", duty=0.25, decay=9.0)
        else:  # V / O / B: sparse lead (build = tension, not content)
            for step, dur, midi in notes[::2]:
                t.note("lead", bar, step, dur, midi, vol=0.24, kind="square",
                       decay=5.0, vib=(5.5, 0.004))
        for step in (0, 4, 8, 12):
            t.kick(bar, step)
        if sec == 'D':
            t.kick(bar, 14, vol=0.7)
        if sec in ('B', 'D'):
            for step in (4, 12):
                t.snare(bar, step)
        if sec == 'B' and bar == 7:  # snare roll into the drop
            for step in range(16):
                t.snare(bar, step, vol=0.20 + 0.025 * step, dur=0.06)
        for step in (range(16) if sec in ('B', 'D') else range(0, 16, 2)):
            t.hat(bar, step, vol=0.10 if sec == 'D' else 0.12, open_=(step == 14))
        if sec == 'D':  # ride ping through the drop — broadband density
            for step in range(0, 16, 2):
                t.ride(bar, step, vol=0.13)
        if bar == 7:
            t.sweep(bar, 0, 16, vol=0.22, up=True)
        if bar == 8:
            t.crash(bar, 0)
    return master(t)


def track_boss():
    """demo-02: aggressive 160 BPM boss theme, A minor. Driving 16th bass.
    V: half-time menace. B: backbeat + snare roll into the drop. D: full
    assault. O: half-time comedown."""
    t = Track(bpm=160, bars=16)
    prog = [(45, [69, 72, 76, 74, 72]), (45, [69, 72, 76, 79, 76]),
            (41, [65, 69, 72, 70, 69]), (40, [64, 68, 71, 69, 68])]
    for bar in range(16):
        sec = section_of(bar)
        root, stabs = prog[bar % 4]
        for step in range(16):
            note = root + (12 if step in (6, 14) else 0)
            t.note("bass", bar, step, 1, note, vol=0.42 if sec == 'D' else 0.36,
                   kind="tri", decay=10.0)
        stab_steps = ((0, 4, 8, 11, 14) if sec == 'D'
                      else (0, 4, 8, 12) if sec == 'B' else (0, 8))
        for i, step in enumerate(stab_steps):
            t.note("lead", bar, step, 3 if i < 3 else 2, stabs[i % len(stabs)],
                   vol=0.34, kind="square", decay=6.0)
            if sec == 'D':  # octave scream on top in the drop
                t.note("lead", bar, step, 2, stabs[i % len(stabs)] + 12,
                       vol=0.22, kind="square", decay=6.0)
        kick_steps = ((0, 4, 8, 12, 14) if sec == 'D'
                      else (0, 4, 8, 12) if sec == 'B' else (0,))
        for step in kick_steps:
            t.kick(bar, step)
        if sec in ('B', 'D'):
            for step in (4, 12):
                t.snare(bar, step, vol=0.55)
        if (sec == 'B' and bar == 7) or (sec == 'D' and bar == 11):
            for step in range(16):  # snare roll build
                t.snare(bar, step, vol=0.20 + 0.025 * step, dur=0.06)
        for step in (range(16) if sec in ('B', 'D') else range(0, 16, 2)):
            t.hat(bar, step, vol=0.09)
        if sec == 'D':
            for step in range(0, 16, 2):
                t.ride(bar, step, vol=0.14)
        if bar == 7:
            t.sweep(bar, 0, 16, vol=0.22, up=True)
        if bar == 8:
            t.crash(bar, 0)
    return master(t)


def track_glitch():
    """demo-03: 128 BPM glitch chip. Tritone bass, bitcrushed blips, stutters.
    V: sparse blips. B: density rises. D: full chaos. O: glitch-out."""
    t = Track(bpm=128, bars=16)
    rng = np.random.default_rng(SEED)
    blip_pool = [76, 77, 82, 83, 88, 70]
    for bar in range(16):
        sec = section_of(bar)
        root = 40 if bar % 2 == 0 else 46  # E / Bb tritone swap
        bass_steps = (0, 3, 6, 10, 12) if sec in ('B', 'D') else (0, 10)
        for step in bass_steps:
            t.note("bass", bar, step, 2, root, vol=0.42, kind="saw",
                   decay=6.0, bend_to=0.94)
        nblips = {'V': 4, 'B': 4, 'D': 7, 'O': 4}[sec]
        steps = rng.choice(16, size=nblips, replace=False)
        for step in steps:
            t.note("lead", bar, int(step), 1, int(rng.choice(blip_pool)),
                   vol=0.32 if sec == 'D' else 0.28, kind="square",
                   decay=12.0)
        kick_steps = ((0, 7, 10) if sec == 'D' else (0, 10)
                      if sec == 'B' else (0,))
        for step in kick_steps:
            t.kick(bar, step, vol=0.8)
        if sec in ('B', 'D'):
            for step in (4, 15):
                t.snare(bar, step, vol=0.45)
        if (sec == 'B' and bar == 7) or (sec == 'D' and bar == 11):
            for step in range(16):
                t.snare(bar, step, vol=0.25 + 0.03 * step, dur=0.06)
        for step in range(16):
            hatp = {'V': 0.35, 'B': 0.5, 'D': 0.65, 'O': 0.35}[sec]
            if rng.random() < hatp:
                t.hat(bar, step, vol=0.08)
        if sec == 'D':
            for step in range(0, 16, 2):
                t.ride(bar, step, vol=0.11)
    t.crash(8, 0)
    t.buf["lead"] = bitcrush(t.buf["lead"], 5)
    mix = master(t, crush_bits=7)
    for bar in (5, 8, 12):
        stutter(mix, t.step, bar, src_step=8, src_len=4, dst_step=8, dst_len=8)
    return mix


def track_title():
    """demo-04: dreamy 92 BPM title screen. Detuned pads, slow arps, sparse lead.
    Pads are voiced an octave up so the sub band stays kick-only (the kick
    detector stays honest). V: 8 bars of weightless drift. B: arp thickens.
    D: gentle crest — still no snare, no hats, never a banger."""
    t = Track(bpm=92, bars=16)
    chords = [[48, 52, 55, 59], [45, 48, 52, 55], [41, 45, 48, 52], [43, 47, 50, 55]]
    chords_up = [[m + 12 for m in c] for c in chords]  # keep sub band kick-only
    melody = [(0, 0, 16, 72), (2, 0, 16, 76), (4, 0, 16, 79), (6, 0, 16, 77),
              (8, 0, 16, 81), (10, 0, 16, 79), (12, 0, 16, 76), (14, 0, 24, 72)]
    for bar in range(16):
        sec = 'V' if bar < 8 else 'B' if bar < 12 else 'D'
        chord = chords_up[bar % 4]
        padvol = 0.11 if sec == 'D' else 0.09
        for midi in chord:
            t.note("pad", bar, 0, 16, midi, vol=padvol, kind="square",
                   decay=0.5, attack=0.8)
            t.note("pad", bar, 0, 16, midi, vol=0.05, kind="tri",
                   decay=0.5, attack=0.8)
        arp_every = 4 if sec == 'V' else 2
        for i, step in enumerate(range(0, 16, arp_every)):
            t.note("arp", bar, step, 2, chord[i % 4] + 12, vol=0.09,
                   kind="tri", decay=6.0, attack=0.025)  # soft attack: dreamy, no pluck transient
        if sec == 'D':  # shimmer — high sparkle, still no drums beyond soft kicks
            for i, step in enumerate(range(16)):
                t.note("arp", bar, step, 1, chord[i % 4] + 24, vol=0.07,
                       kind="tri", decay=8.0, attack=0.025)
        if sec == 'V' and bar % 4 == 0:
            t.kick(bar, 0, vol=0.35)
        elif sec == 'B' and bar % 2 == 0:
            t.kick(bar, 0, vol=0.38)
        elif sec == 'D':
            t.kick(bar, 0, vol=0.42)
            t.kick(bar, 8, vol=0.36)
        if bar in (7, 11):
            t.sweep(bar, 8, 8, vol=0.14, up=True)
    for bar, step, dur, midi in melody:
        t.note("lead", bar, step, dur, midi, vol=0.22, kind="tri",
               decay=1.2, attack=0.025, vib=(5.0, 0.006))
    t.buf["pad"] = highpass(t.buf["pad"])  # keep the sub band kick-only
    return master(t)


def track_neon():
    """demo-05: 118 BPM synthwave cruiser, D minor. Driving 8th-note bass,
    gated arena snare, neon saw lead. V: groove + pads. B: lead enters.
    D: full neon. O: pads + sparse lead."""
    t = Track(bpm=118, bars=16)
    ARR = 'VVVVBBBBDDDDOOOO'
    sec = lambda bar: ARR[bar]  # noqa: E731
    roots = [38, 34, 41, 36]  # Dm Bb F C
    chords_up = [[62, 65, 69], [58, 62, 65], [65, 69, 72], [60, 64, 67]]
    mel = [
        [(0, 2, 74), (2, 2, 77), (4, 2, 81), (6, 2, 79), (8, 2, 77), (10, 2, 76), (12, 4, 74)],
        [(0, 2, 77), (2, 2, 81), (4, 2, 84), (6, 2, 81), (8, 2, 79), (10, 2, 77), (12, 4, 76)],
        [(0, 2, 81), (2, 2, 79), (4, 2, 77), (6, 2, 76), (8, 2, 74), (10, 2, 76), (12, 4, 77)],
        [(0, 2, 76), (2, 2, 77), (4, 2, 81), (6, 2, 79), (8, 2, 77), (10, 2, 74), (12, 4, 72)],
    ]
    for bar in range(16):
        s = sec(bar)
        root = roots[bar % 4]
        for step in range(0, 16, 2):  # driving 8th bass
            octv = root + 12 if (s == 'D' and step % 8 == 6) else root
            t.note("bass", bar, step, 2, octv, vol=0.36, kind="saw", decay=8.0)
        if s in ('V', 'B'):  # detuned pads, voiced up
            for midi in chords_up[bar % 4]:
                t.note("pad", bar, 0, 16, midi, vol=0.07, kind="saw",
                       decay=0.6, attack=0.5)
                t.note("pad", bar, 0, 16, midi, vol=0.04, kind="tri",
                       decay=0.6, attack=0.5)
        if s == 'D':
            for step, dur, midi in mel[bar % 4]:
                t.note("lead", bar, step, dur, midi, vol=0.30, kind="saw",
                       decay=4.0, vib=(5.5, 0.005))
                t.note("lead", bar, step, dur, midi + 12, vol=0.14,
                       kind="saw", decay=4.0)
        elif s == 'B':
            for step, dur, midi in mel[bar % 4][::2]:
                t.note("lead", bar, step, dur, midi, vol=0.24, kind="saw",
                       decay=5.0, vib=(5.5, 0.005))
        elif s == 'O' and bar % 2 == 0:
            step, dur, midi = mel[bar % 4][0]
            t.note("lead", bar, step, dur * 2, midi, vol=0.18, kind="saw",
                   decay=2.0, vib=(5.0, 0.006))
        for step in ((0, 4, 8, 12) if s in ('B', 'D') else (0, 8)):
            t.kick(bar, step, vol=0.85)
        if s in ('B', 'D'):
            for step in (4, 12):
                t.snare(bar, step, vol=0.55, dur=0.25)  # gated arena snare
        if s == 'B' and bar == 7:
            for step in range(16):
                t.snare(bar, step, vol=0.20 + 0.025 * step, dur=0.06)
        hat_steps = (range(16) if s == 'D'
                     else range(0, 16, 2) if s == 'B' else range(0, 16, 4))
        for step in hat_steps:
            t.hat(bar, step, vol=0.09, open_=(step == 14))
        if s == 'D':
            for step in range(0, 16, 2):
                t.ride(bar, step, vol=0.12)
        if bar == 7:
            t.sweep(bar, 0, 16, vol=0.22, up=True)
        if bar == 8:
            t.crash(bar, 0)
    t.buf["pad"] = highpass(t.buf["pad"])
    return master(t)


def track_halftime():
    """demo-06: 150 BPM halftime trap, F# minor. Booming 808s, sparse kicks,
    triplet hats in the drop, dark bell lead. The verse barely holds the
    robot together; the drop slams it shut."""
    t = Track(bpm=150, bars=16)
    ARR = 'VVVVVVBBBBDDDDOO'
    sec = lambda bar: ARR[bar]  # noqa: E731
    roots = [30, 30, 28, 33]  # F#1 F#1 E1 A1
    bell = [[(0, 3, 66), (4, 3, 69), (8, 3, 71), (12, 4, 73)],
            [(0, 3, 69), (4, 3, 71), (8, 3, 76), (12, 4, 74)]]
    for bar in range(16):
        s = sec(bar)
        root = roots[bar % 4]
        for step, dur in ((0, 10), (10, 6)):  # 808 boom
            t.note("bass", bar, step, dur, root, vol=0.50, kind="tri",
                   decay=1.6, attack=0.01)
        if s == 'D':
            t.note("bass", bar, 7, 3, root, vol=0.40, kind="tri",
                   decay=2.0, bend_to=0.97)
        for step in ((0, 7, 10) if s == 'D' else (0, 10)):
            t.kick(bar, step, vol=0.9)
        if s in ('B', 'D'):
            t.snare(bar, 8, vol=0.55)  # halftime backbeat
        if s == 'D':
            for step in range(16):
                t.hat(bar, step, vol=0.10 if step % 2 == 0 else 0.06)
            for i, step in enumerate((12, 13, 14, 15)):  # triplet-ish roll tail
                t.hat(bar, step, vol=0.08 + 0.02 * i)
        elif s == 'B':
            for step in range(0, 16, 2):
                t.hat(bar, step, vol=0.09, open_=(step == 14))
        if s == 'D':
            for step, dur, midi in bell[bar % 2]:
                t.note("lead", bar, step, dur, midi, vol=0.30, kind="square",
                       decay=9.0)
                t.note("lead", bar, step, dur, midi - 12, vol=0.12,
                       kind="tri", decay=9.0)
        elif s in ('V', 'B') and bar % 2 == 0:
            step, dur, midi = bell[bar % 2][0]
            t.note("lead", bar, step, dur, midi, vol=0.22, kind="square",
                   decay=10.0)
        if s == 'D':
            for step in (0, 8):
                t.ride(bar, step, vol=0.10)
        if bar == 9:
            t.sweep(bar, 0, 16, vol=0.22, up=True)
        if bar == 10:
            t.crash(bar, 0)
    return master(t)


def track_jungle():
    """demo-07: 172 BPM jungle/breaks. Chopped synthesized break, Reese bass,
    ragga stabs, stutter edits in the drop. The fastest thing in the library
    — coherence stays pinned."""
    t = Track(bpm=172, bars=16)
    ARR = 'VVBBBBDDDDDDOOOO'
    sec = lambda bar: ARR[bar]  # noqa: E731
    reese = [28, 28, 31, 26]  # E1 E1 G1 D1
    stabs = [[57, 60, 64], [55, 59, 62], [57, 60, 64], [53, 57, 60]]
    for bar in range(16):
        s = sec(bar)
        root = reese[(bar // 2) % 4]
        long = 16 if s in ('V', 'O') else 8
        t.note("bass", bar, 0, long, root, vol=0.40, kind="saw",
               decay=1.2, attack=0.02)
        t.note("bass", bar, 0, long, root, vol=0.30, kind="saw",
               decay=1.2, attack=0.02, vib=(6.0, 0.006))  # detune layer
        if s in ('B', 'D'):
            t.note("bass", bar, 8, 8, root + 3, vol=0.36, kind="saw",
                   decay=1.4, attack=0.02)
        for step in (0, 10):
            t.kick(bar, step, vol=0.8)
        if s == 'D':
            t.kick(bar, 7, vol=0.7)
        for step in [4, 12] + ([7, 14] if s in ('B', 'D') else []):
            t.snare(bar, step, vol=0.5 if step in (4, 12) else 0.28, dur=0.09)
        for step in range(16):
            t.hat(bar, step, vol=0.11 if step % 4 == 2 else 0.07)
        if s in ('B', 'D'):
            for step in (2, 6, 11, 14):
                for midi in stabs[bar % 4]:
                    t.note("lead", bar, step, 2, midi, vol=0.16,
                           kind="square", decay=8.0)
        elif s == 'V':
            for midi in stabs[bar % 4]:
                t.note("lead", bar, 8, 3, midi, vol=0.14, kind="square",
                       decay=8.0)
        if s == 'D' and bar % 2 == 1:
            for step in range(12, 16):
                t.snare(bar, step, vol=0.25 + 0.04 * (step - 12), dur=0.06)
        if bar == 5:
            t.sweep(bar, 0, 16, vol=0.22, up=True)
        if bar == 6:
            t.crash(bar, 0)
    mix = master(t)
    for bar in (7, 9, 10):  # chop edits in the drop
        stutter(mix, t.step, bar, src_step=4, src_len=2, dst_step=12, dst_len=4)
    return mix


def track_void():
    """demo-08: 100 BPM dark ambient techno, C# minor. Drone pads, sparse
    industrial kicks, metallic pings, a slow choir-like lead. The comedown."""
    t = Track(bpm=100, bars=16)
    ARR = 'VVVVVBBBBBBDDDOO'
    sec = lambda bar: ARR[bar]  # noqa: E731
    rng = np.random.default_rng(SEED + 8)
    chord = [61, 64, 68, 74]  # C#m(add9), voiced up — sub stays kick-only
    choir_mel = [(0, 16, 73), (4, 16, 71), (8, 16, 69), (12, 16, 68)]
    for bar in range(16):
        s = sec(bar)
        for midi in chord:
            t.note("pad", bar, 0, 16, midi, vol=0.10, kind="saw",
                   decay=0.4, attack=1.2)
            t.note("pad", bar, 0, 16, midi + 1, vol=0.05, kind="tri",
                   decay=0.4, attack=1.2)  # detune shimmer
        for step in ((0, 4, 8, 12) if s == 'D'
                     else (0, 8) if s == 'B' else (0,)):
            t.kick(bar, step, vol=0.75 if s == 'D' else 0.6)
        if bar % 2 == 0:
            t.ride(bar, 8, vol=0.12)
        if s == 'D' and bar % 2 == 1:
            t.ride(bar, 0, vol=0.10)
        for step in range(16):
            if rng.random() < (0.30 if s == 'D' else 0.12):
                t.hat(bar, step, vol=0.06)
        if s in ('B', 'D'):
            for step, dur, midi in choir_mel:
                t.note("lead", bar, step, dur, midi, vol=0.20, kind="tri",
                       decay=1.0, attack=0.1, vib=(4.5, 0.008))
        elif s == 'V' and bar % 4 == 3:
            step, dur, midi = choir_mel[0]
            t.note("lead", bar, step, dur, midi, vol=0.14, kind="tri",
                   decay=1.0, attack=0.2, vib=(4.5, 0.008))
        if bar == 10:
            t.sweep(bar, 0, 16, vol=0.18, up=True)
        if bar == 11:
            t.crash(bar, 0)
    t.buf["pad"] = highpass(t.buf["pad"])
    return master(t)


def track_hyper():
    """demo-09: 150 BPM hyperpop chip, A major. Bouncy square bass, pitched
    16th arps, chippy lead. Pure sugar — the palette cleanser."""
    t = Track(bpm=150, bars=16)
    ARR = 'VVVVBBBBDDDDOOOO'
    sec = lambda bar: ARR[bar]  # noqa: E731
    roots = [45, 41, 43, 43]  # A2 F2 G2 G2
    arp_chords = [[69, 73, 76, 81], [65, 69, 72, 77],
                  [67, 71, 74, 79], [67, 71, 74, 79]]
    mel = [
        [(0, 2, 81), (2, 2, 79), (4, 2, 76), (6, 2, 79), (8, 2, 81), (10, 2, 84), (12, 4, 81)],
        [(0, 2, 79), (2, 2, 76), (4, 2, 74), (6, 2, 76), (8, 2, 79), (10, 2, 81), (12, 4, 79)],
        [(0, 2, 84), (2, 2, 81), (4, 2, 79), (6, 2, 81), (8, 2, 84), (10, 2, 88), (12, 4, 86)],
        [(0, 2, 81), (2, 2, 79), (4, 2, 76), (6, 2, 74), (8, 2, 76), (10, 2, 79), (12, 4, 76)],
    ]
    for bar in range(16):
        s = sec(bar)
        root = roots[bar % 4]
        for step in range(0, 16, 2):  # bouncy bass
            b = root + (12 if step % 8 == 4 else 0)
            t.note("bass", bar, step, 2, b, vol=0.36, kind="square",
                   decay=8.0, duty=0.4)
        arp = arp_chords[bar % 4]
        for i, step in enumerate(range(16)):  # pitched 16th arp
            t.note("arp", bar, step, 1, arp[i % 4] + (12 if i % 8 >= 4 else 0),
                   vol=0.09, kind="square", duty=0.25, decay=10.0)
        if s == 'D':
            for step, dur, midi in mel[bar % 4]:
                t.note("lead", bar, step, dur, midi, vol=0.28, kind="square",
                       decay=5.0, vib=(6.0, 0.004))
                t.note("lead", bar, step, dur, midi + 12, vol=0.13,
                       kind="square", decay=5.0)
        elif s in ('B', 'V'):
            for step, dur, midi in mel[bar % 4][::2]:
                t.note("lead", bar, step, dur, midi, vol=0.22, kind="square",
                       decay=6.0, vib=(6.0, 0.004))
        for step in ((0, 4, 8, 12) if s in ('B', 'D') else (0, 8)):
            t.kick(bar, step, vol=0.85)
        if s in ('B', 'D'):
            for step in (4, 12):
                t.snare(bar, step, vol=0.5, dur=0.08)  # clap-ish
        if s == 'B' and bar == 7:
            for step in range(16):
                t.snare(bar, step, vol=0.20 + 0.025 * step, dur=0.06)
        for step in (range(16) if s == 'D' else range(0, 16, 2)):
            t.hat(bar, step, vol=0.09, open_=(step == 14))
        if s == 'D':
            for step in range(0, 16, 2):
                t.ride(bar, step, vol=0.11)
        if bar == 7:
            t.sweep(bar, 0, 16, vol=0.22, up=True)
        if bar == 8:
            t.crash(bar, 0)
    t.buf["lead"] = bitcrush(t.buf["lead"], 6)
    return master(t)


def track_descent():
    """demo-10: 132 BPM epic closer, E minor. Sparse piano-ish motif, a huge
    6-bar drop — the biggest in the library — then a stripped comedown."""
    t = Track(bpm=132, bars=16)
    ARR = 'VVVBBBBBDDDDDDOO'
    sec = lambda bar: ARR[bar]  # noqa: E731
    motif = [(0, 4, 64), (4, 4, 67), (8, 4, 71), (12, 4, 69),
             (0, 4, 67), (4, 4, 71), (8, 4, 74), (12, 4, 71)]
    roots = [40, 36, 38, 43]  # E2 C2 D2 G2
    epic = [[(0, 4, 76), (4, 4, 79), (8, 4, 83), (12, 4, 81)],
            [(0, 4, 79), (4, 4, 83), (8, 4, 86), (12, 4, 83)]]
    for bar in range(16):
        s = sec(bar)
        root = roots[bar % 4]
        if s in ('V', 'O') or (s == 'B' and bar < 6):  # piano-ish motif
            half = motif[:4] if bar % 2 == 0 else motif[4:]
            for step, dur, midi in half:
                t.note("lead", bar, step, dur, midi, vol=0.26, kind="tri",
                       decay=2.5, attack=0.02, vib=(5.0, 0.004))
        if s in ('B', 'D'):  # sub weight
            for step in range(0, 16, 4):
                t.note("bass", bar, step, 4, root - 12, vol=0.44,
                       kind="tri", decay=3.0)
        else:
            t.note("bass", bar, 0, 8, root - 12, vol=0.30, kind="tri",
                   decay=2.0)
        if s == 'D':
            for step in (0, 4, 8, 12):
                t.kick(bar, step, vol=0.9)
            t.kick(bar, 14, vol=0.7)
            for step, dur, midi in epic[bar % 2]:  # epic octave saw lead
                t.note("lead", bar, step, dur, midi, vol=0.30, kind="saw",
                       decay=3.0, vib=(5.5, 0.005))
                t.note("lead", bar, step, dur, midi + 12, vol=0.15,
                       kind="saw", decay=3.0)
            for step in (4, 12):
                t.snare(bar, step, vol=0.55, dur=0.2)
            for step in range(16):
                t.hat(bar, step, vol=0.09, open_=(step == 14))
            for step in range(0, 16, 2):
                t.ride(bar, step, vol=0.13)
        elif s == 'B':
            for step in (0, 8):
                t.kick(bar, step, vol=0.7)
            if bar >= 6:  # tom-ish build + snare roll into the drop
                for step in (0, 3, 6, 10, 12, 14):
                    t.kick(bar, step, vol=0.55)
                for step in range(8, 16):
                    t.snare(bar, step, vol=0.18 + 0.03 * (step - 8), dur=0.06)
            for step in range(0, 16, 2):
                t.hat(bar, step, vol=0.08)
        elif bar % 2 == 0:  # V / O: feather-light
            t.kick(bar, 0, vol=0.4)
        if bar == 7:
            t.sweep(bar, 0, 16, vol=0.25, up=True)
        if bar == 8:
            t.crash(bar, 0)
    return master(t)


TRACKS = [
    ("demo-01-overworld-run", "Overworld Run — 140 BPM cheerful chiptune, C major, verse/build/drop/outro", track_overworld),
    ("demo-02-boss-protocol", "Boss Protocol — 160 BPM aggressive boss theme, A minor, half-time verse into full assault", track_boss),
    ("demo-03-glitch-machine", "Glitch Machine — 128 BPM glitch chip, sparse blips into full chaos", track_glitch),
    ("demo-04-title-screen", "Title Screen — 92 BPM dreamy pads, 8-bar drift into a gentle crest (no snare, ever)", track_title),
    ("demo-05-neon-highway", "Neon Highway — 118 BPM synthwave cruiser, D minor, driving 8ths + gated snare", track_neon),
    ("demo-06-halftime-graveyard", "Halftime Graveyard — 150 BPM halftime trap, F# minor, booming 808s", track_halftime),
    ("demo-07-jungle-circuit", "Jungle Circuit — 172 BPM jungle breaks, chopped break + Reese bass", track_jungle),
    ("demo-08-void-choir", "Void Choir — 100 BPM dark ambient techno, C# minor drone + industrial kicks", track_void),
    ("demo-09-hyper-popcorn", "Hyper Popcorn — 150 BPM hyperpop chip, A major sugar rush", track_hyper),
    ("demo-10-final-descent", "Final Descent — 132 BPM epic closer, E minor, the biggest drop in the library", track_descent),
]


def main():
    np.random.seed(SEED)
    os.makedirs(OUT_DIR, exist_ok=True)
    for slug, desc, fn in TRACKS:
        print(f"rendering {slug} ...")
        mix = fn()
        wav = os.path.join(OUT_DIR, slug + ".wav")
        ogg = os.path.join(OUT_DIR, slug + ".ogg")
        write_wav(wav, mix)
        to_ogg(wav, ogg)
        os.remove(wav)
        dur = len(mix) / SR
        size = os.path.getsize(ogg)
        print(f"  {desc}\n  -> {ogg} ({dur:.1f}s, {size/1024:.0f} KB)")
    print("done.")


if __name__ == "__main__":
    main()
