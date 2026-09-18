#!/usr/bin/env python3
"""Generate the gorf-dronebot demo tracks.

Four fixed chiptune/glitch tracks for testing the visualizer without any live
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


TRACKS = [
    ("demo-01-overworld-run", "Overworld Run — 140 BPM cheerful chiptune, C major, verse/build/drop/outro", track_overworld),
    ("demo-02-boss-protocol", "Boss Protocol — 160 BPM aggressive boss theme, A minor, half-time verse into full assault", track_boss),
    ("demo-03-glitch-machine", "Glitch Machine — 128 BPM glitch chip, sparse blips into full chaos", track_glitch),
    ("demo-04-title-screen", "Title Screen — 92 BPM dreamy pads, 8-bar drift into a gentle crest (no snare, ever)", track_title),
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
