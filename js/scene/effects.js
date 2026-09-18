import * as THREE from 'three';
import { CONFIG } from '../config.js';
import { pulseSun } from './background.js';

// Step 10: kick-driven spectacle.
// - Shockwave rings expand across the mode-7 floor on every kick.
// - Camera punch: a quick dolly-in + FOV kick that decays exponentially.
// - Sun pulse: background's sun gets a decaying scale bump per kick.
let rings = [];
let punch = 0;
let baseFov = null;

// R10: per-effect toggles, all default on.
const flags = {
  shockwaves: CONFIG.effects.shockwaves,
  cameraPunch: CONFIG.effects.cameraPunch,
  sunPulse: CONFIG.effects.sunPulse,
};

export function setEffect(name, on) {
  if (!(name in flags)) return;
  flags[name] = !!on;
  if (name === 'shockwaves' && !flags.shockwaves) {
    for (const r of rings) { r.active = false; r.mesh.visible = false; }
  }
  if (name === 'cameraPunch' && !flags.cameraPunch) punch = 0;
}

export function isEffectOn(name) {
  return !!flags[name];
}

function makeRing() {
  const geo = new THREE.RingGeometry(0.92, 1.0, 72);
  const mat = new THREE.MeshBasicMaterial({
    color: CONFIG.palette.fireMid,
    transparent: true,
    opacity: 0,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
    fog: false,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.set(CONFIG.robot.pos[0], 0.06, CONFIG.robot.pos[2]);
  mesh.visible = false;
  return { mesh, age: 0, strength: 0, active: false };
}

export function initEffects(scene) {
  for (let i = 0; i < CONFIG.effects.ringPool; i++) {
    const r = makeRing();
    rings.push(r);
    scene.add(r.mesh);
  }
}

function spawnRing(strength) {
  const r = rings.find((r) => !r.active) || rings[0];
  r.active = true;
  r.age = 0;
  r.strength = strength;
  r.mesh.visible = true;
}

// Step 21b: drop shatter fires a max-power shockwave directly.
export function spawnShockwave(strength = 2.0) {
  if (flags.shockwaves) spawnRing(strength);
}

const _dir = new THREE.Vector3();

export function updateEffects(dt, audioState, camera) {
  if (baseFov === null) baseFov = camera.fov;

  // Consume beat events broadcast by the robot module.
  for (const ev of audioState.events) {
    if (ev.type === 'kick') {
      if (flags.shockwaves) spawnRing(ev.strength);
      if (flags.cameraPunch) punch = Math.min(1.2, punch + ev.strength * 0.9);
      if (flags.sunPulse) pulseSun(ev.strength);
    }
  }

  // Shockwave rings: ease-out expand + fade.
  const { ringLife, ringMaxRadius } = CONFIG.effects;
  for (const r of rings) {
    if (!r.active) continue;
    r.age += dt;
    const k = Math.min(1, r.age / ringLife);
    const eased = 1 - Math.pow(1 - k, 2);
    r.mesh.scale.setScalar(0.5 + eased * ringMaxRadius);
    r.mesh.material.opacity = (1 - k) * 0.55 * (0.4 + r.strength * 0.6);
    if (k >= 1) {
      r.active = false;
      r.mesh.visible = false;
    }
  }

  // Camera punch: additive dolly toward the robot + FOV kick, exponential
  // decay. Step 16: the camera system owns the base position, so this only
  // offsets on top each frame — no position snapping.
  punch *= Math.exp(-dt * CONFIG.effects.punchDecay);
  if (flags.cameraPunch && punch > 0.001) {
    camera.getWorldDirection(_dir);
    camera.position.addScaledVector(_dir, punch * CONFIG.effects.punchGain);
  }
  const targetFov = baseFov - (flags.cameraPunch ? punch * CONFIG.effects.fovKick : 0);
  if (Math.abs(camera.fov - targetFov) > 0.001) {
    camera.fov = targetFov;
    camera.updateProjectionMatrix();
  }
}
