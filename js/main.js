import * as THREE from 'three';
import { CONFIG } from './config.js';
import { initBackground, updateBackground } from './scene/background.js';
import { initRobot, updateRobot, setTurntable, isTurntableOn, setSway, isSwayOn } from './scene/robot.js';
import { initEmbers, updateEmbers } from './scene/embers.js';
import { initJets, updateJets } from './scene/jets.js';
import { initPost, onPostResize, updatePost, setCrt, isCrtOn } from './post/fx.js';
import { initEffects, updateEffects, setEffect, isEffectOn } from './scene/effects.js';
import { initHUD, updateHUD, toggleHUD, getSourceUI, refreshLineInputs, setSourceName } from './ui/hud.js';
import {
  useDemo, useFile, useMic, useLine, stopSource,
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
initHUD();
const composer = initPost(renderer, scene, camera);

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
  } catch (err) {
    setSourceName('error: ' + (err.name || 'failed'));
    console.warn('audio source failed', err);
  }
}
srcUI.fileBtn.addEventListener('click', () => srcUI.fileInput.click());
srcUI.fileInput.addEventListener('change', () => {
  if (srcUI.fileInput.files[0]) selectSource(() => useFile(srcUI.fileInput.files[0]));
});
srcUI.micBtn.addEventListener('click', () => selectSource(() => useMic()));
srcUI.stopBtn.addEventListener('click', () => {
  stopSource();
  setSourceName(getSourceName());
});
srcUI.demoBtns.forEach((b) =>
  b.addEventListener('click', () =>
    selectSource(() => useDemo(parseInt(b.dataset.demo, 10))))
);
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

// --- Keys ---
window.addEventListener('keydown', (e) => {
  if (e.key === 'h' || e.key === 'H') toggleHUD();
  else if (e.key === 't' || e.key === 'T') toggleSpin();
  else if (e.key === 'c' || e.key === 'C') toggleCrt();
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
  updateEffects(dt, audioState, camera);
  updateEmbers(dt, audioState);
  updateJets(dt, audioState);
  updateHUD(dt, audioState);
  updatePost(dt, audioState);

  composer.render();
}

tick();
