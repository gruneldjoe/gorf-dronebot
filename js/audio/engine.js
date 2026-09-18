// Audio engine: real-time FFT analysis from file / mic / line-in / demo tracks.
// Owns one AudioContext + AnalyserNode (fftSize 2048). Sources route through
// the analyser; a monitor gain decides what reaches the speakers (demo/file =
// audible, mic/line = analyser only, no feedback).
// Per-frame, updateAudio(dt, state) fills the shared audioState consumed by
// the visualizer: sub/mid/high (0..1, AGC + smoothed), kick/snare (onset
// impulses, decay), energy, section.
import { createDetector } from './detect.js';

export const DEMO_TRACKS = [
  { n: 1, label: 'OVERWORLD', file: 'demo-01-overworld-run.ogg' },
  { n: 2, label: 'BOSS', file: 'demo-02-boss-protocol.ogg' },
  { n: 3, label: 'GLITCH', file: 'demo-03-glitch-machine.ogg' },
  { n: 4, label: 'TITLE', file: 'demo-04-title-screen.ogg' },
];

let ctx = null;
let analyser = null;
let monitorGain = null;
let freqData = null;
let detector = null;
let currentNodes = [];   // disconnected on source switch
let currentStream = null;
let sourceName = 'none';

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
  detector = createDetector({ subLo, subHi, snrLo, snrHi });
}

function disconnectCurrent() {
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
  for (const k of Object.keys(bands)) {
    bands[k].peak = 0.02;
    bands[k].val = 0;
  }
  if (detector) detector.reset();
}

async function playBuffer(audioBuf, name) {
  await ensureCtx();
  disconnectCurrent();
  const src = ctx.createBufferSource();
  src.buffer = audioBuf;
  src.loop = true;
  src.connect(analyser);
  src.start();
  monitorGain.gain.value = 1; // audible
  currentNodes = [src];
  sourceName = name;
}

export async function useDemo(n) {
  const track = DEMO_TRACKS.find((t) => t.n === n);
  if (!track) return;
  const res = await fetch(`assets/demo/${track.file}`);
  if (!res.ok) throw new Error(`demo fetch failed: ${res.status}`);
  const buf = await res.arrayBuffer();
  await ensureCtx();
  const audioBuf = await ctx.decodeAudioData(buf);
  await playBuffer(audioBuf, `demo-${n} ${track.label}`);
}

export async function useFile(file) {
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
}
