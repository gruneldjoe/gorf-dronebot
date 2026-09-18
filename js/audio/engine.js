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
// R16: stereo duel — per-channel analysers fed by a splitter (tapped in
// parallel; the main mono analyser path is untouched).
let splitter = null, analyserL = null, analyserR = null;
let freqL = null, freqR = null;
const stereo = { l: 0, r: 0 };
// R15: bullet-time — buffer sources we can pitch-drop with playbackRate.
let playSources = [];
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
  vox: { fLo: 2000, fHi: 6000, lo: 86, hi: 300, peak: 0.02, val: 0 }, // R19: presence band
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

  // R16: stereo tap — parallel to the mono path, never in it.
  splitter = ctx.createChannelSplitter(2);
  analyserL = ctx.createAnalyser();
  analyserR = ctx.createAnalyser();
  analyserL.fftSize = 512;
  analyserR.fftSize = 512;
  analyserL.smoothingTimeConstant = 0;
  analyserR.smoothingTimeConstant = 0;
  freqL = new Uint8Array(analyserL.frequencyBinCount);
  freqR = new Uint8Array(analyserR.frequencyBinCount);
  splitter.connect(analyserL, 0);
  splitter.connect(analyserR, 1);
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
  playSources = []; // R15
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
  if (splitter) src.connect(splitter); // R16: stereo tap
  src.start();
  if (activeDemo) demoT0 = ctx.currentTime;
  const t2 = ctx.currentTime;
  monitorGain.gain.cancelScheduledValues(t2);
  monitorGain.gain.setValueAtTime(0.0001, t2);
  monitorGain.gain.linearRampToValueAtTime(1, t2 + 0.15); // audible
  currentNodes = [src];
  playSources = [src]; // R15: bullet-time pitch control
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
  await useBlob(await file.arrayBuffer(), `file: ${file.name.slice(0, 24)}`);
}

// R18: personal track library — play a stored blob through the same path.
export async function useBlob(buf, name) {
  activeDemo = null;
  await ensureCtx();
  const audioBuf = await ctx.decodeAudioData(buf.slice(0));
  await playBuffer(audioBuf, name);
}

async function useStream(stream, name) {
  await ensureCtx();
  disconnectCurrent();
  const src = ctx.createMediaStreamSource(stream);
  src.connect(analyser);
  if (splitter) src.connect(splitter); // R16: stereo tap
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

// Step 18: recorder tap — a MediaStreamDestination fed by the same master
// gain that drives the speakers, so recordings capture exactly what's heard.
let recDest = null;
export function getRecordStream() {
  if (!ctx || !monitorGain) return null;
  if (!recDest) {
    recDest = ctx.createMediaStreamDestination();
    monitorGain.connect(recDest);
  }
  return recDest.stream;
}

export async function listInputDevices() {
  if (!navigator.mediaDevices?.enumerateDevices) return [];
  const all = await navigator.mediaDevices.enumerateDevices();
  return all.filter((d) => d.kind === 'audioinput');
}

// R15: bullet-time pitch drop for buffer sources (demo/file). Streams ignore it.
export function setPlaybackRate(r) {
  for (const s of playSources) {
    try { s.playbackRate.value = r; } catch (_) { /* gone */ }
  }
}

// R16: smoothed per-channel energies for the stereo duel.
export function getStereo() { return stereo; }

// Fill state with live analysis (or zeros when no source is active).
export function updateAudio(dt, state) {
  state.live = currentNodes.length > 0;
  if (!ctx || !analyser || currentNodes.length === 0) {
    state.sub = 0;
    state.mid = 0;
    state.high = 0;
    state.vox = 0;
    state.energy = 0;
    state.kick = 0;
    state.snare = 0;
    state.centroid = 0;
    state.section = 'verse';
    stereo.l = 0;
    stereo.r = 0;
    return;
  }
  analyser.getByteFrequencyData(freqData);
  for (const k of ['sub', 'mid', 'high', 'vox']) {
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
  // R20: spectral centroid 0..1 — key-follow input.
  let wsum = 0, fsum = 0;
  for (let i = 1; i < freqData.length; i += 2) {
    const v = freqData[i] / 255;
    wsum += v;
    fsum += v * i;
  }
  const cTarget = wsum > 0.05 ? (fsum / wsum) / freqData.length : 0;
  state.centroid = (state.centroid || 0) + (cTarget - (state.centroid || 0)) * Math.min(1, dt * 2);
  // R16: per-channel energy for the duel.
  if (analyserL && freqL) {
    analyserL.getByteFrequencyData(freqL);
    analyserR.getByteFrequencyData(freqR);
    let sl = 0, sr = 0;
    for (let i = 1; i < freqL.length; i++) { sl += freqL[i]; sr += freqR[i]; }
    sl = sl / freqL.length / 255;
    sr = sr / freqR.length / 255;
    const k = Math.min(1, dt * 4);
    stereo.l += (sl - stereo.l) * k;
    stereo.r += (sr - stereo.r) * k;
  }
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
