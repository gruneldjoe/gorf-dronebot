// Audio engine: real-time FFT analysis from file / mic / line-in / demo tracks.
// Owns one AudioContext + AnalyserNode (fftSize 2048). Sources route through
// the analyser; a monitor gain decides what reaches the speakers (demo/file =
// audible, mic/line = analyser only, no feedback).
// Per-frame, updateAudio(dt, state) fills the shared audioState consumed by
// the visualizer: sub/mid/high (0..1, AGC + smoothed), kick/snare (onset
// impulses, decay), energy, section.
import { createDetector } from './detect.js';

export const DEMO_TRACKS = [
  // arr: 16-bar arrangement, one section per bar. The demo player computes
  // the section from the audio clock (step 21) — exact for composed tracks,
  // unlike the audio-guessing detector which stays as fallback for user audio.
  { n: 1, label: 'OVERWORLD', file: 'demo-01-overworld-run.ogg', bpm: 140, vibe: 'cheerful chiptune',
    arr: 'VVVVBBBBDDDDOOOO' },
  { n: 2, label: 'BOSS', file: 'demo-02-boss-protocol.ogg', bpm: 160, vibe: 'aggressive boss theme',
    arr: 'VVVVBBBBDDDDOOOO' },
  { n: 3, label: 'GLITCH', file: 'demo-03-glitch-machine.ogg', bpm: 128, vibe: 'bitcrushed glitch',
    arr: 'VVVVBBBBDDDDOOOO' },
  { n: 4, label: 'TITLE', file: 'demo-04-title-screen.ogg', bpm: 92, vibe: 'dreamy pads',
    arr: 'VVVVVVVVBBBBBBBB' }, // gentle crest, never drops — no shatter
];

let ctx = null;
let analyser = null;
let monitorGain = null;
let freqData = null;
let detector = null;
let currentNodes = [];   // disconnected on source switch
let currentStream = null;
let sourceName = 'none';
// Time-based section tracking for demo tracks (step 21). The detector's
// audio-guessed section is overridden when a demo is playing.
let activeDemo = null;   // DEMO_TRACKS entry, or null for file/mic/line
let demoT0 = 0;          // ctx.currentTime when the demo buffer started

// Per-band analysis state. Bin ranges are computed from the real sample rate
// once the context exists.
const bands = {
  sub: { fLo: 20, fHi: 120, lo: 1, hi: 5, peak: 0.02, val: 0 },
  mid: { fLo: 120, fHi: 2000, lo: 6, hi: 85, peak: 0.02, val: 0 },
  high: { fLo: 2000, fHi: 20000, lo: 86, hi: 1023, peak: 0.02, val: 0 },
};

async function ensureCtx() {
  if (ctx) {
    if (ctx.state === 'suspended') await ctx.resume();
    return;
  }
  ctx = new (window.AudioContext || window.webkitAudioContext)();
  analyser = ctx.createAnalyser();
  analyser.fftSize = 2048;
  analyser.smoothingTimeConstant = 0; // we do our own smoothing
  freqData = new Uint8Array(analyser.frequencyBinCount);
  monitorGain = ctx.createGain();
  analyser.connect(monitorGain);
  monitorGain.connect(ctx.destination);

  const binHz = ctx.sampleRate / analyser.fftSize;
  const range = (fLo, fHi) => [
    Math.max(1, Math.ceil(fLo / binHz)),
    Math.min(freqData.length - 1, Math.floor(fHi / binHz)),
  ];
  for (const k of Object.keys(bands)) {
    const [lo, hi] = range(bands[k].fLo, bands[k].fHi);
    bands[k].lo = lo;
    bands[k].hi = hi;
  }
  const [snrLo, snrHi] = range(2000, 8000);
  const [subLo, subHi] = [bands.sub.lo, bands.sub.hi];
  const [midLo, midHi] = [bands.mid.lo, bands.mid.hi];
  detector = createDetector({ subLo, subHi, snrLo, snrHi, midLo, midHi });
}

function disconnectCurrent(opts = {}) {
  for (const n of currentNodes) {
    try {
      if (n.stop) n.stop();
    } catch (_) { /* already stopped */ }
    try {
      n.disconnect();
    } catch (_) { /* already disconnected */ }
  }
  currentNodes = [];
  if (currentStream) {
    currentStream.getTracks().forEach((t) => t.stop());
    currentStream = null;
  }
  // Soft switch (demo → demo): keep band peaks + detector state so the
  // analysis crossfades instead of popping. Hard switch resets everything.
  if (!opts.soft) {
    for (const k of Object.keys(bands)) {
      bands[k].peak = 0.02;
      bands[k].val = 0;
    }
    if (detector) detector.reset();
  }
}

async function playBuffer(audioBuf, name, opts = {}) {
  await ensureCtx();
  // Step 15: quick monitor fade around the swap — no clicks in the audio,
  // no pops in the analysis.
  const t = ctx.currentTime;
  monitorGain.gain.cancelScheduledValues(t);
  monitorGain.gain.setValueAtTime(Math.max(0.0001, monitorGain.gain.value), t);
  monitorGain.gain.linearRampToValueAtTime(0.0001, t + 0.08);
  await new Promise((r) => setTimeout(r, 90));
  disconnectCurrent({ soft: opts.soft });
  const src = ctx.createBufferSource();
  src.buffer = audioBuf;
  src.loop = true;
  src.connect(analyser);
  src.start();
  if (activeDemo) demoT0 = ctx.currentTime;
  const t2 = ctx.currentTime;
  monitorGain.gain.cancelScheduledValues(t2);
  monitorGain.gain.setValueAtTime(0.0001, t2);
  monitorGain.gain.linearRampToValueAtTime(1, t2 + 0.15); // audible
  currentNodes = [src];
  sourceName = name;
}

export async function useDemo(n) {
  const track = DEMO_TRACKS.find((t) => t.n === n);
  if (!track) return;
  activeDemo = track;
  const res = await fetch(`assets/demo/${track.file}`);
  if (!res.ok) throw new Error(`demo fetch failed: ${res.status}`);
  const buf = await res.arrayBuffer();
  await ensureCtx();
  const audioBuf = await ctx.decodeAudioData(buf);
  await playBuffer(audioBuf, `demo-${n} ${track.label}`, { soft: true });
}

export async function useFile(file) {
  activeDemo = null; // back to audio-guessed sections
  const buf = await file.arrayBuffer();
  await ensureCtx();
  const audioBuf = await ctx.decodeAudioData(buf);
  await playBuffer(audioBuf, `file: ${file.name.slice(0, 24)}`);
}

async function useStream(stream, name) {
  await ensureCtx();
  disconnectCurrent();
  const src = ctx.createMediaStreamSource(stream);
  src.connect(analyser);
  monitorGain.gain.cancelScheduledValues(ctx.currentTime);
  monitorGain.gain.value = 0; // analyser only — no feedback
  currentNodes = [src];
  currentStream = stream;
  sourceName = name;
}

export async function useMic(deviceId) {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: deviceId ? { deviceId: { exact: deviceId } } : true,
  });
  await useStream(stream, deviceId ? 'line-in' : 'mic');
}

export async function useLine(deviceId) {
  await useMic(deviceId); // line-in is just another audioinput device
}

export function stopSource() {
  disconnectCurrent();
  sourceName = 'none';
}

export function getSourceName() {
  return sourceName;
}

export async function listInputDevices() {
  if (!navigator.mediaDevices?.enumerateDevices) return [];
  const all = await navigator.mediaDevices.enumerateDevices();
  return all.filter((d) => d.kind === 'audioinput');
}

// Fill state with live analysis (or zeros when no source is active).
export function updateAudio(dt, state) {
  state.live = currentNodes.length > 0;
  if (!ctx || !analyser || currentNodes.length === 0) {
    state.sub = 0;
    state.mid = 0;
    state.high = 0;
    state.energy = 0;
    state.kick = 0;
    state.snare = 0;
    state.section = 'verse';
    return;
  }
  analyser.getByteFrequencyData(freqData);
  for (const k of ['sub', 'mid', 'high']) {
    const b = bands[k];
    let sum = 0;
    for (let i = b.lo; i <= b.hi; i++) sum += freqData[i];
    const raw = sum / (b.hi - b.lo + 1) / 255;
    // AGC: normalize against a slowly-decaying peak so meters bounce at any
    // input level. Floor keeps silence at zero instead of amplifying noise.
    b.peak = Math.max(raw, b.peak * 0.995, 0.02);
    const norm = raw / b.peak;
    const attack = norm > b.val ? 0.6 : 0.12; // fast attack, slow release
    b.val += (norm - b.val) * attack;
    state[k] = Math.min(1, Math.max(0, b.val));
  }
  detector.update(freqData, dt, state);
  // Demo tracks: section from the audio clock, not from guessing.
  // The buffer is 16 bars + 1s tail; the tail reads as outro ('O'→'verse').
  if (activeDemo && demoT0 > 0) {
    const secPerBar = (60 / activeDemo.bpm) * 4;
    const loopDur = secPerBar * 16 + 1;
    const elapsed = (ctx.currentTime - demoT0) % loopDur;
    const bar = Math.min(15, Math.floor(elapsed / secPerBar));
    const s = activeDemo.arr[bar];
    state.section = s === 'D' ? 'drop' : s === 'B' ? 'build' : 'verse';
  }
}
