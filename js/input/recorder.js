// Step 18 — Recorder: canvas.captureStream(60) + the audio engine's master
// tap -> MediaRecorder -> downloadable .webm. HUD button with live timer;
// optional 1080p export size (renderer is resized for the take, restored after).

let canvas = null;
let getAudioStream = null;
let onTick = null;   // (seconds, recording) -> HUD timer
let onState = null;  // (recording) -> HUD button state

let recorder = null;
let chunks = [];
let combined = null;
let startT = 0;
let timerId = null;
let mime = '';

function pickMime() {
  const cands = [
    'video/webm;codecs=vp9,opus',
    'video/webm;codecs=vp8,opus',
    'video/webm',
  ];
  for (const c of cands) {
    try {
      if (window.MediaRecorder && MediaRecorder.isTypeSupported(c)) return c;
    } catch (_) {}
  }
  return '';
}

function stamp() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

export function initRecorder({ canvas: cv, getAudioStream: gas, onTick: tick, onState: state }) {
  canvas = cv;
  getAudioStream = gas;
  onTick = tick;
  onState = state;
  mime = pickMime();
}

export function isRecording() { return !!recorder; }

export function recorderMime() { return mime || 'video/webm'; }

export async function startRecording() {
  if (recorder) return false;
  if (!canvas.captureStream) {
    if (onState) onState(false, 'captureStream unsupported');
    return false;
  }
  const tracks = [...canvas.captureStream(60).getVideoTracks()];
  try {
    const audio = getAudioStream && getAudioStream();
    if (audio) tracks.push(...audio.getAudioTracks());
  } catch (_) { /* audio tap optional — video-only take */ }

  combined = new MediaStream(tracks);
  chunks = [];
  try {
    recorder = new MediaRecorder(combined, mime ? { mimeType: mime, videoBitsPerSecond: 12_000_000 } : undefined);
  } catch (err) {
    if (onState) onState(false, 'recorder failed to start');
    return false;
  }
  recorder.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };
  recorder.onstop = finishRecording;
  recorder.start(250);
  startT = performance.now();
  clearInterval(timerId);
  timerId = setInterval(() => {
    if (onTick) onTick((performance.now() - startT) / 1000, true);
  }, 250);
  if (onState) onState(true);
  return true;
}

export function stopRecording() {
  if (!recorder) return;
  const r = recorder;
  recorder = null;
  clearInterval(timerId);
  timerId = null;
  if (onTick) onTick(0, false);
  r.stop(); // -> onstop -> finishRecording
  for (const t of combined.getTracks()) t.stop();
  combined = null;
  if (onState) onState(false);
}

function finishRecording() {
  if (!chunks.length) return;
  const blob = new Blob(chunks, { type: recorderMime() });
  chunks = [];
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `gorf-dronebot-${stamp()}.webm`;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 4000);
}
