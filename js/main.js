import * as THREE from 'three';
import { CONFIG } from './config.js';
import { initBackground, updateBackground } from './scene/background.js';
import { initRobot, updateRobot, setTurntable, isTurntableOn } from './scene/robot.js';
import { initEmbers, updateEmbers } from './scene/embers.js';
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
initHUD();

// Live audio analysis fills sub/mid/high/energy/kick/snare/section each frame
// (step 8). Heat stays on the manual slider until step 9 maps audio to the bot.
const audioState = {
  sub: 0, mid: 0, high: 0,
  energy: 0, kick: 0, snare: 0,
  section: 'verse', // verse | build | drop
  time: 0,
  heat: 0.25,  // 0 = cool indigo, 1 = inferno
  pulse: 0,    // 0..1 sun pulse
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
});

// --- Keys ---
window.addEventListener('keydown', (e) => {
  if (e.key === 'h' || e.key === 'H') toggleHUD();
  else if (e.key === 't' || e.key === 'T') toggleSpin();
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

// --- Main loop (delta-time clamped) ---
const clock = new THREE.Clock();

function tick() {
  requestAnimationFrame(tick);
  const dt = Math.min(clock.getDelta(), 0.05);
  const t = clock.elapsedTime;

  // Live FFT analysis → sub/mid/high/kick/snare/energy/section.
  updateAudio(dt, audioState);
  audioState.time = t;
  audioState.pulse = Math.pow(Math.sin(t * 2.2) * 0.5 + 0.5, 2.0) * 0.35;
  const heatSlider = document.getElementById('heat-slider');
  audioState.heat = heatSlider ? parseFloat(heatSlider.value) : 0.25;

  updateBackground(scene, dt, audioState);
  updateRobot(dt, audioState);
  updateEmbers(dt, audioState);
  updateHUD(dt, audioState);

  renderer.render(scene, camera);
}

tick();
