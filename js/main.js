import * as THREE from 'three';
import { CONFIG } from './config.js';
import { initBackground, updateBackground, addVoxSwell } from './scene/background.js';
import { initRobot, updateRobot, setTurntable, isTurntableOn, setSway, isSwayOn, snapCoherence, shatterCoherence, getChassis, cycleChassis, setDuel, isDuelOn, updateDuel, addWear } from './scene/robot.js';
import { initEmbers, updateEmbers } from './scene/embers.js';
import { initJets, updateJets, triggerEruption } from './scene/jets.js';
import { initPost, onPostResize, updatePost, setCrt, isCrtOn, getBloomPass } from './post/fx.js';
import { initQuality, updateQuality, setQualityMode } from './post/quality.js';
import { initTitle, dismissTitle, isTitleUp } from './ui/title.js';
import { initHelp, toggleHelp } from './ui/help.js';
import { initEffects, updateEffects, setEffect, isEffectOn, spawnShockwave } from './scene/effects.js';
import { initCamera, updateCamera, directorCut } from './scene/camera.js';
import { registerPaletteColor, applyPalette, currentPalette, PALETTE_ORDER, cyclePalette } from './scene/palette.js';
import { initHUD, updateHUD, toggleHUD, getSourceUI, getMidiUI, getRecorderUI, getPostUI, refreshLineInputs, setSourceName } from './ui/hud.js';
import { initMidi, armLearn, cancelLearn, isLearning, getBinding, describeBinding } from './input/midi.js';
import { initRecorder, startRecording, stopRecording, isRecording } from './input/recorder.js';
import { punchCamera } from './scene/effects.js';
import { captureGif } from './input/gif.js';
import { addFiles, listTracks, getTrack, updatePreset } from './input/library.js';
import {
  useDemo, useFile, useBlob, useMic, useLine, stopSource, DEMO_TRACKS,
  listInputDevices, updateAudio, getSourceName, getRecordStream,
  getStereo, setPlaybackRate,
} from './audio/engine.js';

// --- Renderer ---
const canvas = document.getElementById('scene');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true }); // R22: GIF burst grabs frames off-rAF
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);

// --- Scene & camera ---
const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(CONFIG.palette.fog, 0.008);
registerPaletteColor('fog', scene.fog.color); // step 17: palette shift

const camera = new THREE.PerspectiveCamera(
  CONFIG.camera.fov,
  window.innerWidth / window.innerHeight,
  CONFIG.camera.near,
  CONFIG.camera.far
);
camera.position.set(...CONFIG.camera.pos);
camera.lookAt(...CONFIG.camera.lookAt);

// --- Modules ---
initBackground(scene);
const robotApi = initRobot(scene);
initEmbers(robotApi);
initJets(robotApi);
initEffects(scene);
initCamera(camera, renderer.domElement);
initHUD();
initHelp();
const composer = initPost(renderer, scene, camera);
initQuality({ renderer, composer, bloomPass: getBloomPass() });

// Step 20: manual quality override (AUTO = the scaler decides).
document.getElementById('quality-select').addEventListener('change', (e) => {
  setQualityMode(e.target.value);
});

// Live audio analysis fills sub/mid/high/energy/kick/snare/section each frame.
// Heat stays on the manual slider until step 12 maps it to section/energy.
const audioState = {
  sub: 0, mid: 0, high: 0,
  energy: 0, kick: 0, snare: 0,
  section: 'verse', // verse | build | drop
  time: 0,
  heat: 0.25,  // 0 = cool indigo, 1 = inferno (manual slider)
  grade: 0.15, // step 12: smoothed section grade (verse .15 / build .55 / drop 1)
  sceneHeat: 0.25, // step 12: max(slider, grade*boost) — what shaders/fog see
  pulse: 0,    // 0..1 sun pulse
  events: [],  // per-frame beat events (robot pushes, effects consumes)
};

// Step 21b: track section transitions for the drop shatter.
let prevSection = 'verse';

// --- Audio source wiring ---
const srcUI = getSourceUI();
async function selectSource(fn) {
  try {
    await fn();
    setSourceName(getSourceName());
    refreshLineInputs(listInputDevices); // device labels appear after mic permission
    return true;
  } catch (err) {
    setSourceName('error: ' + (err.name || 'failed'));
    console.warn('audio source failed', err);
    return false;
  }
}
srcUI.fileBtn.addEventListener('click', () => srcUI.fileInput.click());
srcUI.fileInput.addEventListener('change', async () => {
  if (srcUI.fileInput.files[0]
    && await selectSource(() => useFile(srcUI.fileInput.files[0]))) dismissTitle();
});
srcUI.micBtn.addEventListener('click', () => selectSource(() => useMic()));
srcUI.stopBtn.addEventListener('click', () => {
  stopSource();
  setSourceName(getSourceName());
});
// Step 15: demo track selector — populated from DEMO_TRACKS (name, BPM,
// vibe). playDemo keeps the select in sync no matter where the track was
// picked (title menu, HUD, or keyboard).
async function playDemo(n) {
  srcUI.demoSelect.value = String(n);
  return selectSource(() => useDemo(n));
}
for (const t of DEMO_TRACKS) {
  const opt = document.createElement('option');
  opt.value = t.n;
  opt.textContent = `${t.n} · ${t.label} — ${t.bpm} BPM`;
  opt.title = t.vibe;
  srcUI.demoSelect.appendChild(opt);
}
srcUI.demoSelect.addEventListener('change', () => {
  if (srcUI.demoSelect.value) playDemo(parseInt(srcUI.demoSelect.value, 10));
});
srcUI.lineSelect.addEventListener('change', () => {
  if (srcUI.lineSelect.value) selectSource(() => useLine(srcUI.lineSelect.value));
});
refreshLineInputs(listInputDevices);

// --- Resize ---
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  onPostResize();
});

// --- Keys (step 19) ---
function toggleFullscreen() {
  if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
  else document.documentElement.requestFullscreen().catch(() => {});
}
window.addEventListener('keydown', (e) => {
  if (isTitleUp()) return; // title screen owns the keyboard until dismissed
  trackKonami(e.key); // R27 — runs for every key, alongside the rest
  if (e.key === 'h' || e.key === 'H') toggleHUD();
  else if (e.key === 't' || e.key === 'T') toggleSpin();
  else if (e.key === 'c' || e.key === 'C') toggleCrt();
  else if (e.key === 'f' || e.key === 'F') toggleFullscreen();
  else if (e.key === ' ') { e.preventDefault(); snapCoherence(); triggerEruption(1); }
  else if (e.key === '?') toggleHelp();
  else if (e.key >= '1' && e.key <= '4') playDemo(parseInt(e.key, 10));
  else if (e.key === 'p' || e.key === 'P') togglePerfMode(); // R13
  else if (e.key === 'o' || e.key === 'O') takePhoto(); // R23
  else if (e.key === 'g' || e.key === 'G') fireGif(); // R22
  else if (e.key === 'b' || e.key === 'B') fireBulletTime(); // R15
  else if (e.key === 'x' || e.key === 'X') detonateOverdrive(); // R24
  else if (e.key === 'm' || e.key === 'M') { // step 17: arm MIDI learn for ERUPT (M again cancels)
    if (isLearning('erupt')) cancelLearn(); else armLearn('erupt');
    refreshTrigBtns();
  }
  else if (e.key === 'r' || e.key === 'R') toggleRecord(); // step 18
});

// R8: turntable toggle — button + T key.
const spinBtn = document.getElementById('spin-toggle');
function refreshSpinBtn() {
  const on = isTurntableOn();
  spinBtn.textContent = on ? 'ON' : 'OFF';
  spinBtn.classList.toggle('on', on); // UI pattern: toggles highlight while ON
}
function toggleSpin() {
  setTurntable(!isTurntableOn());
  refreshSpinBtn();
}
spinBtn.addEventListener('click', toggleSpin);
refreshSpinBtn();

// R11: sway toggle — off switch for the mid-driven torso rock.
const swayBtn = document.getElementById('sway-toggle');
function refreshSwayBtn() {
  const on = isSwayOn();
  swayBtn.textContent = on ? 'ON' : 'OFF';
  swayBtn.classList.toggle('on', on); // UI pattern: toggles highlight while ON
}
function toggleSway() {
  setSway(!isSwayOn());
  refreshSwayBtn();
}
swayBtn.addEventListener('click', toggleSway);
refreshSwayBtn();

// CRT toggle — button + C key (step 13; full shortcut map lands in step 19).
const crtBtn = document.getElementById('crt-toggle');
function refreshCrtBtn() {
  const on = isCrtOn();
  crtBtn.textContent = on ? 'ON' : 'OFF';
  crtBtn.classList.toggle('on', on); // UI pattern: toggles highlight while ON
}
function toggleCrt() {
  setCrt(!isCrtOn());
  refreshCrtBtn();
}
crtBtn.addEventListener('click', toggleCrt);
refreshCrtBtn();

// --- Step 17: MIDI triggers ---
// Four mappable actions. Click a TRIG button to fire it by hand;
// shift+click arms MIDI learn (next note/CC from the controller binds).
function fireTrigger(action) {
  if (action === 'erupt') { shatterCoherence(); triggerEruption(2.0); spawnShockwave(2.0); }
  else if (action === 'punch') punchCamera(1.0);
  else if (action === 'palette') {
    const p = cyclePalette();
    midiUI.statusEl.textContent = `palette: ${p}`;
  }
  else if (action === 'crt') toggleCrt();
}

const midiUI = getMidiUI();
function refreshTrigBtns() {
  for (const b of midiUI.trigBtns) {
    const a = b.dataset.trig;
    b.classList.toggle('learning', isLearning(a));
    b.classList.toggle('bound', !!getBinding(a));
    const d = describeBinding(a);
    b.title = d === '—'
      ? 'click: fire · shift+click: MIDI learn'
      : `${d} · click: fire · shift+click: re-learn`;
  }
}
for (const b of midiUI.trigBtns) {
  b.addEventListener('click', (e) => {
    const a = b.dataset.trig;
    if (e.shiftKey) {
      if (isLearning(a)) cancelLearn(); else armLearn(a);
    } else {
      if (isLearning(a)) cancelLearn();
      fireTrigger(a);
    }
    refreshTrigBtns();
  });
}
refreshTrigBtns();

initMidi({
  onTrigger: (action) => fireTrigger(action),
  onStatus: (t) => { midiUI.statusEl.textContent = t; refreshTrigBtns(); },
  onDevices: (names) => {
    midiUI.deviceSelect.innerHTML = names.length
      ? names.map((n, i) => `<option value="${i}"></option>`).join('')
      : '<option value="">-- no midi --</option>';
    [...midiUI.deviceSelect.options].forEach((o, i) => { if (names[i]) o.textContent = names[i]; });
  },
});

// --- Step 18: Recorder ---
const recUI = getRecorderUI();
function setRecordSize() {
  let w = window.innerWidth, h = window.innerHeight;
  if (postUI.v916.checked) { w = 1080; h = 1920; } // R21: vertical crop for Shorts/TikTok
  else if (recUI.hd1080.checked) { w = 1920; h = 1080; }
  renderer.setSize(w, h, false); // buffer only — CSS keeps it full-window
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  onPostResize();
}
initRecorder({
  canvas,
  getAudioStream: getRecordStream,
  onTick: (s, rec) => {
    const m = Math.floor(s / 60);
    recUI.timerEl.textContent = rec ? `${m}:${String(Math.floor(s % 60)).padStart(2, '0')}` : '';
  },
  onState: (rec, err) => {
    recUI.recBtn.classList.toggle('rec-on', rec);
    recUI.recBtn.textContent = rec ? '■ STOP' : '● REC';
    if (err) recUI.timerEl.textContent = err;
  },
});
async function toggleRecord() {
  if (isRecording()) {
    stopRecording();
    setRecordSize();
  } else {
    setRecordSize();
    await startRecording();
  }
}
recUI.recBtn.addEventListener('click', toggleRecord);

// --- R12-R27: post-MVP systems ---
const postUI = getPostUI();
let keyFollow = false, crowdMode = false, directorOn = false;
let crowdHeat = 0;
let overdrive = 0; // R24: 0..1, fills with room energy
let timeScale = 1, bulletT = 0; // R15: bullet-time
let slowT = 0; // R15: dilated shared clock — everything time-based slows together
let lastKeyEval = 0;
let gifBusy = false;
let perfMode = false;

// R24: white-out flash for the overdrive detonation.
function flashWhite() {
  const f = document.getElementById('flash');
  f.style.transition = 'none';
  f.style.opacity = '1';
  requestAnimationFrame(() => requestAnimationFrame(() => {
    f.style.transition = 'opacity 0.5s ease-out';
    f.style.opacity = '0';
  }));
}

function detonateOverdrive() {
  if (overdrive < 0.4) return;
  overdrive = 0;
  shatterCoherence();
  triggerEruption(4.0);
  spawnShockwave(3.0);
  punchCamera(2.0);
  flashWhite();
  addWear(0.05); // R26: detonations scorch the mech
}

// MODE toggles — UI pattern: short label + .on glow while ON.
function wireModeToggle(btn, get, set) {
  const refresh = () => btn.classList.toggle('on', !!get());
  btn.addEventListener('click', () => { set(!get()); refresh(); });
  refresh();
}
wireModeToggle(postUI.keyBtn, () => keyFollow, (v) => { keyFollow = v; });
wireModeToggle(postUI.crowdBtn, () => crowdMode, (v) => { crowdMode = v; });
wireModeToggle(postUI.dirBtn, () => directorOn, (v) => { directorOn = v; });
wireModeToggle(postUI.duelBtn, () => isDuelOn(), (v) => setDuel(v));

// R12: chassis cycle.
postUI.mechBtn.title = `chassis: ${getChassis()} — click to cycle`;
postUI.mechBtn.addEventListener('click', () => {
  const c = cycleChassis();
  postUI.mechBtn.title = `chassis: ${c} — click to cycle`;
});

// R18: personal track library (IndexedDB).
const libFileInput = document.createElement('input');
libFileInput.type = 'file';
libFileInput.accept = 'audio/*';
libFileInput.multiple = true;
libFileInput.style.display = 'none';
document.body.appendChild(libFileInput);
async function refreshLibrary() {
  const tracks = await listTracks().catch(() => []);
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  postUI.libSelect.innerHTML = '<option value="">-- library --</option>' +
    tracks.map((t) => `<option value="${t.id}">${esc(t.name)}</option>`).join('');
}
postUI.libAdd.addEventListener('click', () => libFileInput.click());
libFileInput.addEventListener('change', async () => {
  const added = await addFiles([...libFileInput.files]).catch(() => []);
  libFileInput.value = '';
  await refreshLibrary();
  if (added.length) setSourceName(`library: +${added.length} track(s)`);
});
postUI.libSelect.addEventListener('change', async () => {
  const id = parseInt(postUI.libSelect.value, 10);
  if (!id) return;
  const rec = await getTrack(id).catch(() => null);
  if (!rec) return;
  const buf = await rec.blob.arrayBuffer();
  if (await selectSource(() => useBlob(buf, `library: ${rec.name}`))) {
    if (rec.palette) applyPalette(rec.palette);
    if (rec.heat != null) {
      const hs = document.getElementById('heat-slider');
      if (hs) hs.value = rec.heat;
    }
    dismissTitle();
  }
});
postUI.libSet.addEventListener('click', async () => {
  const id = parseInt(postUI.libSelect.value, 10);
  if (!id) return;
  const hs = document.getElementById('heat-slider');
  await updatePreset(id, {
    palette: currentPalette(),
    heat: hs ? parseFloat(hs.value) : 0.25,
  }).catch(() => {});
  setSourceName('preset saved');
});
refreshLibrary();

// R23: photo mode — hide UI, render 2x, download a still.
function takePhoto() {
  const hud = document.getElementById('hud');
  const wasHidden = hud.style.display === 'none';
  hud.style.display = 'none';
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setSize(w * 2, h * 2, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  onPostResize();
  composer.render();
  const url = renderer.domElement.toDataURL('image/png');
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  onPostResize();
  if (!wasHidden) hud.style.display = '';
  const a = document.createElement('a');
  a.href = url;
  a.download = `gorf-dronebot-${Date.now()}.png`;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => document.body.removeChild(a), 2000);
}
postUI.photoBtn.addEventListener('click', takePhoto);

// R22: GIF burst — 6 seconds at 12fps, 320px wide, looped.
function fireGif() {
  if (gifBusy) return;
  gifBusy = true;
  postUI.gifBtn.classList.add('on');
  setSourceName('capturing GIF…');
  captureGif({
    canvas: renderer.domElement, seconds: 6, fps: 12, width: 320,
    onDone: (blob) => {
      gifBusy = false;
      postUI.gifBtn.classList.remove('on');
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `gorf-dronebot-${Date.now()}.gif`;
      document.body.appendChild(a);
      a.click();
      setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 4000);
      setSourceName(getSourceName());
    },
  });
}
postUI.gifBtn.addEventListener('click', fireGif);

// R15: bullet-time — visual slow-mo + pitch drop on buffer sources.
function fireBulletTime() {
  if (bulletT > 0) return;
  bulletT = 2.2;
  timeScale = 0.22;
  setPlaybackRate(0.5);
}

// R13: performance mode — fullscreen ritual, every pixel of UI gone.
function togglePerfMode() {
  perfMode = !perfMode;
  const hud = document.getElementById('hud');
  if (perfMode) {
    hud.style.display = 'none';
    document.body.classList.add('perfhide');
    document.documentElement.requestFullscreen().catch(() => {});
  } else {
    hud.style.display = '';
    document.body.classList.remove('perfhide');
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
  }
}

// R27: Konami code. You know what it does.
const KONAMI = ['ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight', 'b', 'a'];
let konamiIdx = 0;
function trackKonami(key) {
  if (key === KONAMI[konamiIdx]) {
    konamiIdx++;
    if (konamiIdx === KONAMI.length) {
      konamiIdx = 0;
      applyPalette('ultraviolet');
      overdrive = 1;
      detonateOverdrive();
      setSourceName('KONAMI // OVERDRIVE');
    }
  } else {
    konamiIdx = key === KONAMI[0] ? 1 : 0;
  }
}

// --- Title screen (step 14): HUD stays hidden until a source is picked.
const hudEl = document.getElementById('hud');
hudEl.style.display = 'none';
initTitle({
  onDemo: async (i) => { if (await playDemo(i)) dismissTitle(); },
  onFile: () => srcUI.fileInput.click(),
  onMic: async () => { if (await selectSource(() => useMic())) dismissTitle(); },
  onLine: () => dismissTitle(),
  onToggleCrt: () => toggleCrt(),
  isCrtOn,
  onDismiss: () => { hudEl.style.display = ''; },
});

// R10: per-effect toggles — shockwave rings, camera punch, sun pulse.
for (const [id, name] of [['fx-shockwaves', 'shockwaves'], ['fx-punch', 'cameraPunch'], ['fx-sun', 'sunPulse']]) {
  const btn = document.getElementById(id);
  const label = btn.textContent;
  const refresh = () => {
    const on = isEffectOn(name);
    btn.textContent = label + ' ' + (on ? 'ON' : 'OFF');
    btn.classList.toggle('on', on); // UI pattern: toggles highlight while ON
  };
  btn.addEventListener('click', () => { setEffect(name, !isEffectOn(name)); refresh(); });
  refresh();
}

// --- Main loop (delta-time clamped) ---
const clock = new THREE.Clock();

function tick() {
  requestAnimationFrame(tick);
  const rawDt = Math.min(clock.getDelta(), 0.05);
  // R15: bullet-time — ease the time scale back to 1 as the effect ends.
  if (bulletT > 0) {
    bulletT -= rawDt;
    const k = Math.max(0, bulletT / 2.2);
    timeScale = 0.22 + 0.78 * (1 - k * k);
    if (bulletT <= 0) { timeScale = 1; setPlaybackRate(1); }
  }
  const dt = Math.min(rawDt * timeScale, 0.05);
  const t = clock.elapsedTime;
  slowT += dt; // R15: the shared clock runs at the dilated rate — true slow-mo
  audioState.time = slowT;

  // Live FFT analysis → sub/mid/high/kick/snare/energy/section.
  updateAudio(dt, audioState);
  audioState.events.length = 0; // cleared each frame; robot pushes kick events
  audioState.pulse = Math.pow(Math.sin(slowT * 2.2) * 0.5 + 0.5, 2.0) * 0.35;
  const heatSlider = document.getElementById('heat-slider');
  audioState.heat = heatSlider ? parseFloat(heatSlider.value) : 0.25;
  // R25: crowd mode — audience noise raises the HEAT bias.
  const crowdTarget = (crowdMode && audioState.live) ? audioState.high * 0.6 : 0;
  crowdHeat += (crowdTarget - crowdHeat) * Math.min(1, dt * 1.5);

  // Step 21b: drop shatter — on section → drop transition, the ghost
  // disintegrates (coherence 0 → ember eruption), jets erupt, and a
  // max-power shockwave fires. The reform spring (robot.js) brings it back.
  if (audioState.section !== prevSection) {
    if (directorOn) directorCut(); // R14: concert-film cut on section change
    if (audioState.section === 'drop') {
      shatterCoherence();
      triggerEruption(2.0);
      spawnShockwave(2.0);
      audioState.events.push({ type: 'shatter', strength: 2.0 });
      addWear(0.03); // R26: drops scorch the mech
    }
  }
  prevSection = audioState.section;

  // Step 12: section grade lerps toward its target (~2s, no pops); the
  // slider stays authoritative — the grade can only push heat up.
  const g = CONFIG.grade;
  const gradeTarget = audioState.section === 'drop' ? g.drop
    : audioState.section === 'build' ? g.build : g.verse;
  audioState.grade += (gradeTarget - audioState.grade) * Math.min(1, dt * g.lerpRate);
  audioState.sceneHeat = Math.min(1, Math.max(audioState.heat, audioState.grade * g.sectionBoost, crowdHeat));
  scene.fog.density = g.fogBase + audioState.sceneHeat * g.fogGain;

  // R24: OVERDRIVE fills with room energy; a full meter detonates itself.
  if (audioState.live) overdrive = Math.min(1, overdrive + (audioState.high * 0.22 + audioState.vox * 0.14) * dt);
  overdrive = Math.max(0, overdrive - dt * 0.03);
  if (overdrive >= 1) detonateOverdrive();
  postUI.odriveFill.style.width = `${Math.round(overdrive * 100)}%`;

  // R20: key-follow — the palette breathes with the spectral centroid.
  if (keyFollow && audioState.live && t - lastKeyEval > 4) {
    lastKeyEval = t;
    const want = PALETTE_ORDER[Math.min(3, Math.floor((audioState.centroid || 0) * 4))];
    if (want !== currentPalette()) applyPalette(want);
  }

  addVoxSwell(audioState.vox || 0); // R19: presence band breathes the sun

  // R16: stereo duel — the second mech battles for the right channel.
  if (isDuelOn()) {
    const s = getStereo();
    const bal = s.r / (s.l + s.r + 0.001);
    updateDuel(dt, t, {
      kick: audioState.kick * (0.35 + 0.65 * bal),
      heat: audioState.sceneHeat,
      mid: audioState.mid * (0.5 + bal),
    });
  }

  updateBackground(scene, dt, audioState);
  updateRobot(dt, audioState);
  updateCamera(dt, audioState, camera); // owns base position; punch offsets on top
  updateEffects(dt, audioState, camera);
  updateEmbers(dt, audioState);
  updateJets(dt, audioState);
  updateHUD(dt, audioState);
  updatePost(dt, audioState);
  updateQuality(dt);

  composer.render();
}

tick();
