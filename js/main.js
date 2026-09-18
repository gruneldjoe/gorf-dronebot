import * as THREE from 'three';
import { CONFIG } from './config.js';
import { initBackground, updateBackground } from './scene/background.js';
import { initRobot, updateRobot, setTurntable, isTurntableOn, setSway, isSwayOn, snapCoherence } from './scene/robot.js';
import { initEmbers, updateEmbers } from './scene/embers.js';
import { initJets, updateJets, triggerEruption } from './scene/jets.js';
import { initPost, onPostResize, updatePost, setCrt, isCrtOn, getBloomPass } from './post/fx.js';
import { initQuality, updateQuality, setQualityMode } from './post/quality.js';
import { initTitle, dismissTitle, isTitleUp } from './ui/title.js';
import { initHelp, toggleHelp } from './ui/help.js';
import { initEffects, updateEffects, setEffect, isEffectOn } from './scene/effects.js';
import { initCamera, updateCamera } from './scene/camera.js';
import { initHUD, updateHUD, toggleHUD, getSourceUI, refreshLineInputs, setSourceName } from './ui/hud.js';
import {
  useDemo, useFile, useMic, useLine, stopSource, DEMO_TRACKS,
  listInputDevices, updateAudio, getSourceName,
} from './audio/engine.js';

// --- Renderer ---
const canvas = document.getElementById('scene');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);

// --- Scene & camera ---
const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(CONFIG.palette.fog, 0.008);

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
  if (e.key === 'h' || e.key === 'H') toggleHUD();
  else if (e.key === 't' || e.key === 'T') toggleSpin();
  else if (e.key === 'c' || e.key === 'C') toggleCrt();
  else if (e.key === 'f' || e.key === 'F') toggleFullscreen();
  else if (e.key === ' ') { e.preventDefault(); snapCoherence(); triggerEruption(1); }
  else if (e.key === '?') toggleHelp();
  else if (e.key >= '1' && e.key <= '4') playDemo(parseInt(e.key, 10));
});

// R8: turntable toggle — button + T key.
const spinBtn = document.getElementById('spin-toggle');
function refreshSpinBtn() {
  spinBtn.textContent = isTurntableOn() ? 'ON' : 'OFF';
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
  swayBtn.textContent = isSwayOn() ? 'ON' : 'OFF';
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
  crtBtn.textContent = isCrtOn() ? 'ON' : 'OFF';
}
function toggleCrt() {
  setCrt(!isCrtOn());
  refreshCrtBtn();
}
crtBtn.addEventListener('click', toggleCrt);
refreshCrtBtn();

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
  const refresh = () => { btn.textContent = label + ' ' + (isEffectOn(name) ? 'ON' : 'OFF'); };
  btn.addEventListener('click', () => { setEffect(name, !isEffectOn(name)); refresh(); });
  refresh();
}

// --- Main loop (delta-time clamped) ---
const clock = new THREE.Clock();

function tick() {
  requestAnimationFrame(tick);
  const dt = Math.min(clock.getDelta(), 0.05);
  const t = clock.elapsedTime;

  // Live FFT analysis → sub/mid/high/kick/snare/energy/section.
  updateAudio(dt, audioState);
  audioState.events.length = 0; // cleared each frame; robot pushes kick events
  audioState.time = t;
  audioState.pulse = Math.pow(Math.sin(t * 2.2) * 0.5 + 0.5, 2.0) * 0.35;
  const heatSlider = document.getElementById('heat-slider');
  audioState.heat = heatSlider ? parseFloat(heatSlider.value) : 0.25;

  // Step 12: section grade lerps toward its target (~2s, no pops); the
  // slider stays authoritative — the grade can only push heat up.
  const g = CONFIG.grade;
  const gradeTarget = audioState.section === 'drop' ? g.drop
    : audioState.section === 'build' ? g.build : g.verse;
  audioState.grade += (gradeTarget - audioState.grade) * Math.min(1, dt * g.lerpRate);
  audioState.sceneHeat = Math.min(1, Math.max(audioState.heat, audioState.grade * g.sectionBoost));
  scene.fog.density = g.fogBase + audioState.sceneHeat * g.fogGain;

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
