import * as THREE from 'three';
import { CONFIG } from './config.js';
import { initBackground, updateBackground } from './scene/background.js';
import { initRobot, updateRobot, setTurntable, isTurntableOn } from './scene/robot.js';
import { initEmbers, updateEmbers } from './scene/embers.js';
import { initHUD, updateHUD, toggleHUD } from './ui/hud.js';

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

// Temporary fake audio state until the real audio engine lands (step 8).
// Drives background params so visuals can be developed/tested now.
const audioState = {
  sub: 0, mid: 0, high: 0,
  energy: 0, kick: 0, snare: 0,
  section: 'verse', // verse | build | drop
  time: 0,
  heat: 0.25,  // 0 = cool indigo, 1 = inferno
  pulse: 0,    // 0..1 sun pulse
};

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

  // Fake drive: gentle breathing so the scene feels alive pre-audio.
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
