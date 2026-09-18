import * as THREE from 'three';
import { CONFIG } from '../config.js';

// Step 16: cinematography, not a tripod. Slow orbital drift around the
// robot + subtle handheld noise; drop detection pushes in; any section
// change gently reframes; mouse-drag orbits manually and auto-resumes
// after a few idle seconds. The camera always looks at the robot.

let azBase = 0, elBase = 0, distBase = 15;
let azManual = 0, elManual = 0;
let dragging = false, px = 0, py = 0, lastInteract = -100;
let dolly = 1, dollyTarget = 1;
let prevSection = 'verse';
let reframeAz = 0, reframeEl = 0;
const _look = new THREE.Vector3();

export function initCamera(camera, canvas) {
  const p = new THREE.Vector3(...CONFIG.camera.pos);
  _look.set(...CONFIG.camera.lookAt);
  distBase = p.distanceTo(_look);
  azBase = Math.atan2(p.x - _look.x, p.z - _look.z);
  elBase = Math.asin(THREE.MathUtils.clamp((p.y - _look.y) / distBase, -1, 1));

  canvas.addEventListener('pointerdown', (e) => {
    dragging = true;
    px = e.clientX;
    py = e.clientY;
    try { canvas.setPointerCapture(e.pointerId); } catch (_) { /* noop */ }
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    azManual -= (e.clientX - px) * 0.005;
    elManual = THREE.MathUtils.clamp(elManual + (e.clientY - py) * 0.003, -0.45, 0.55);
    px = e.clientX;
    py = e.clientY;
    lastInteract = performance.now() / 1000;
  });
  const end = () => { dragging = false; };
  canvas.addEventListener('pointerup', end);
  canvas.addEventListener('pointercancel', end);
}

export function updateCamera(dt, audioState, camera) {
  const c = CONFIG.camera;
  const t = audioState.time;

  // Section change: drop pushes in, anything reframes the shot a little.
  if (audioState.section !== prevSection) {
    dollyTarget = audioState.section === 'drop' ? c.dropPush : 1;
    reframeAz = (Math.random() - 0.5) * 2 * c.reframeJitter;
    reframeEl = (Math.random() - 0.5) * 0.12;
    prevSection = audioState.section;
  }
  dolly += (dollyTarget - dolly) * Math.min(1, dt * 0.7);

  // Manual orbit decays back to the directed shot after idle.
  const now = performance.now() / 1000;
  if (!dragging && now - lastInteract > c.manualIdle) {
    const k = Math.max(0, 1 - dt * 0.9);
    azManual *= k;
    elManual *= k;
  }

  const az = azBase + Math.sin(t * c.driftSpeed) * c.driftAmp + reframeAz + azManual;
  let el = elBase + Math.sin(t * c.driftSpeed * 0.63 + 1.2) * 0.035 + reframeEl + elManual;
  el = THREE.MathUtils.clamp(el, -0.06, 0.65); // never under the floor
  const dist = distBase * dolly;
  const hx = (Math.sin(t * 1.7) + Math.sin(t * 2.93 + 1.3)) * 0.5 * c.handheld;
  const hy = (Math.sin(t * 2.31 + 0.7) + Math.sin(t * 3.71 + 2.1)) * 0.5 * c.handheld;

  camera.position.set(
    _look.x + Math.sin(az) * Math.cos(el) * dist + hx,
    _look.y + Math.sin(el) * dist + hy,
    _look.z + Math.cos(az) * Math.cos(el) * dist
  );
  camera.lookAt(_look);
}
