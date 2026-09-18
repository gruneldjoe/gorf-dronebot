import * as THREE from 'three';
import { CONFIG } from '../config.js';

// Step 11: flame jets. Shoulder/back vent emitters fire cone-shaped bursts
// on snare onsets; rapid successive onsets (a fill) trigger a bigger
// all-vent eruption. Own particle pool in the ember style — additive
// points, hotter palette, directional velocities, shorter life.
// Positions live in mech-local space so jets inherit sway/turntable.

let geo, lifeFracAttr;
let positions, vels, life, maxLife, sizes, seeds, lifeFrac;
let count;
let budget; // step 20: active particle budget (quality scaler); <= count
let prevSnare = 0;
let onsetTimes = [];
const _dir = new THREE.Vector3();

function spawnOne(vent, power) {
  const cfg = CONFIG.jets;
  for (let i = 0; i < budget; i++) {
    if (life[i] > 0) continue;
    positions[i * 3] = vent.pos[0] + (Math.random() - 0.5) * 0.3;
    positions[i * 3 + 1] = vent.pos[1] + (Math.random() - 0.5) * 0.3;
    positions[i * 3 + 2] = vent.pos[2] + (Math.random() - 0.5) * 0.3;
    _dir.set(vent.dir[0], vent.dir[1], vent.dir[2]).normalize();
    const speed = (cfg.speed[0] + Math.random() * (cfg.speed[1] - cfg.speed[0])) * (0.7 + 0.6 * power);
    const js = cfg.spread * speed * 0.35; // cone jitter
    vels[i * 3] = _dir.x * speed + (Math.random() - 0.5) * js;
    vels[i * 3 + 1] = _dir.y * speed + (Math.random() - 0.5) * js;
    vels[i * 3 + 2] = _dir.z * speed + (Math.random() - 0.5) * js;
    maxLife[i] = cfg.life[0] + Math.random() * (cfg.life[1] - cfg.life[0]);
    life[i] = maxLife[i] * (0.8 + 0.4 * power);
    lifeFrac[i] = 1;
    sizes[i] = 0.6 + Math.random() * 0.6;
    seeds[i] = Math.random();
    return;
  }
}

function burst(ventIdxs, n, power) {
  for (const vi of ventIdxs) {
    for (let k = 0; k < n; k++) spawnOne(CONFIG.jets.vents[vi], power);
  }
}

// Step 20: cap the simulated/drawn particles (quality scaler).
export function setJetBudget(n) {
  budget = Math.max(0, Math.min(n, count));
  for (let i = budget; i < count; i++) {
    life[i] = 0;
    positions[i * 3 + 1] = -999;
    lifeFrac[i] = 0;
  }
}

export function initJets(robotApi) {
  count = CONFIG.jets.count;
  budget = count;
  positions = new Float32Array(count * 3);
  vels = new Float32Array(count * 3);
  life = new Float32Array(count);
  maxLife = new Float32Array(count);
  sizes = new Float32Array(count);
  seeds = new Float32Array(count);
  lifeFrac = new Float32Array(count);
  for (let i = 0; i < count; i++) positions[i * 3 + 1] = -999; // parked

  geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3).setUsage(THREE.DynamicDrawUsage));
  lifeFracAttr = new THREE.BufferAttribute(lifeFrac, 1).setUsage(THREE.DynamicDrawUsage);
  geo.setAttribute('aLife', lifeFracAttr);
  geo.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 1).setUsage(THREE.DynamicDrawUsage));

  const mat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: {
      uHot: { value: new THREE.Color(0xffffff) },
      uMid: { value: new THREE.Color(0xffb03c) },
      uDark: { value: new THREE.Color(0xff2a1a) },
    },
    vertexShader: `
      attribute float aLife;
      attribute float aSize;
      attribute float aSeed;
      varying float vLife;
      varying float vSeed;
      void main() {
        vLife = aLife;
        vSeed = aSeed;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mv;
        gl_PointSize = aSize * (140.0 / -mv.z);
      }
    `,
    fragmentShader: `
      uniform vec3 uHot, uMid, uDark;
      varying float vLife;
      varying float vSeed;
      void main() {
        vec2 pc = gl_PointCoord - 0.5;
        float d = length(pc) * 2.0;
        float a = smoothstep(1.0, 0.15, d);
        float flick = 0.75 + 0.25 * sin(vSeed * 61.0 + vLife * 31.0);
        vec3 col = mix(uDark, uMid, smoothstep(0.0, 0.5, vLife));
        col = mix(col, uHot, smoothstep(0.5, 0.92, vLife));
        gl_FragColor = vec4(col * flick, a * clamp(vLife * 1.6, 0.0, 1.0));
      }
    `,
  });

  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  robotApi.group.add(points);
}

// Manual eruption — Space key (step 19) and drop shatter (step 21).
export function triggerEruption(power = 1) {
  burst([0, 1, 2, 3], Math.floor(CONFIG.jets.fillBurst * power), power);
}

export function updateJets(dt, audioState) {
  const t = audioState.time;
  const cfg = CONFIG.jets;

  // Snare onset edge; fills = 4+ onsets inside 0.7s.
  const snareEdge = audioState.snare > cfg.snareThreshold && prevSnare <= cfg.snareThreshold;
  prevSnare = audioState.snare;
  if (snareEdge && audioState.live) {
    onsetTimes.push(t);
    onsetTimes = onsetTimes.filter((x) => t - x < 0.7);
    if (onsetTimes.length >= 4) {
      burst([0, 1, 2, 3], cfg.fillBurst, 1);
      onsetTimes.length = 0;
    } else {
      burst([0, 1], cfg.burst, 0.6 + audioState.snare * 0.4);
    }
  }

  for (let i = 0; i < budget; i++) {
    if (life[i] <= 0) continue;
    life[i] -= dt;
    if (life[i] <= 0) {
      positions[i * 3 + 1] = -999;
      lifeFrac[i] = 0;
      continue;
    }
    const drag = 1 - 2.0 * dt;
    vels[i * 3] *= drag;
    vels[i * 3 + 1] = vels[i * 3 + 1] * drag + 2.5 * dt; // slight lift
    vels[i * 3 + 2] *= drag;
    positions[i * 3] += vels[i * 3] * dt;
    positions[i * 3 + 1] += vels[i * 3 + 1] * dt;
    positions[i * 3 + 2] += vels[i * 3 + 2] * dt;
    lifeFrac[i] = life[i] / maxLife[i];
  }

  geo.attributes.position.needsUpdate = true;
  lifeFracAttr.needsUpdate = true;
  geo.attributes.aSize.needsUpdate = true;
  geo.attributes.aSeed.needsUpdate = true;
}
