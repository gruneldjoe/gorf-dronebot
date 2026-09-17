import * as THREE from 'three';
import { CONFIG } from '../config.js';

// Ember particle pool. Embers spawn on the mech surface and rise as the
// robot disintegrates. Spawn rate scales with (1 - coherence) * heat.
// Positions live in mech-local space so they inherit sway/turntable.

let geo, lifeFracAttr;
let positions, vels, life, maxLife, sizes, seeds, lifeFrac;
let count;
let samplerFn, getCoherenceFn;
const _v = new THREE.Vector3();

function respawn(i) {
  samplerFn(_v);
  positions[i * 3] = _v.x;
  positions[i * 3 + 1] = _v.y;
  positions[i * 3 + 2] = _v.z;
  const sp = CONFIG.embers.spread;
  vels[i * 3] = (Math.random() - 0.5) * sp;
  vels[i * 3 + 1] = CONFIG.embers.rise[0] + Math.random() * (CONFIG.embers.rise[1] - CONFIG.embers.rise[0]);
  vels[i * 3 + 2] = (Math.random() - 0.5) * sp;
  maxLife[i] = CONFIG.embers.life[0] + Math.random() * (CONFIG.embers.life[1] - CONFIG.embers.life[0]);
  life[i] = maxLife[i];
  lifeFrac[i] = 1;
  sizes[i] = CONFIG.embers.size[0] + Math.random() * (CONFIG.embers.size[1] - CONFIG.embers.size[0]);
  seeds[i] = Math.random();
}

export function initEmbers(robotApi) {
  samplerFn = robotApi.sampleSurfacePoint;
  getCoherenceFn = robotApi.getCoherence;
  count = CONFIG.embers.count;

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
      uHot: { value: new THREE.Color(0xfff3d6) },
      uMid: { value: new THREE.Color(CONFIG.palette.fireMid) },
      uDark: { value: new THREE.Color(0x7a1020) },
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
        float flick = 0.7 + 0.3 * sin(vSeed * 47.0 + vLife * 25.0);
        vec3 col = mix(uDark, uMid, smoothstep(0.0, 0.55, vLife));
        col = mix(col, uHot, smoothstep(0.55, 0.95, vLife));
        gl_FragColor = vec4(col * flick, a * clamp(vLife * 1.5, 0.0, 1.0));
      }
    `,
  });

  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  robotApi.group.add(points);
}

export function updateEmbers(dt, audioState) {
  const coherence = getCoherenceFn();
  const target = Math.floor(count * (1 - coherence) * (0.2 + 0.8 * audioState.heat));
  const t = audioState.time;
  let active = 0;

  for (let i = 0; i < count; i++) {
    if (life[i] <= 0) continue;
    life[i] -= dt;
    if (life[i] <= 0) {
      positions[i * 3 + 1] = -999;
      lifeFrac[i] = 0;
      continue;
    }
    vels[i * 3 + 1] += 1.5 * dt; // buoyancy
    const drag = 1 - 0.7 * dt;
    vels[i * 3] *= drag;
    vels[i * 3 + 1] *= drag;
    vels[i * 3 + 2] *= drag;
    positions[i * 3] += (vels[i * 3] + Math.sin(t * 3 + seeds[i] * 20) * 0.35) * dt;
    positions[i * 3 + 1] += vels[i * 3 + 1] * dt;
    positions[i * 3 + 2] += vels[i * 3 + 2] * dt;
    lifeFrac[i] = life[i] / maxLife[i];
    active++;
  }

  let toSpawn = Math.min(target - active, 40); // per-frame spawn cap
  if (toSpawn > 0) {
    for (let i = 0; i < count && toSpawn > 0; i++) {
      if (life[i] <= 0) { respawn(i); toSpawn--; }
    }
  }

  geo.attributes.position.needsUpdate = true;
  lifeFracAttr.needsUpdate = true;
  geo.attributes.aSize.needsUpdate = true;
  geo.attributes.aSeed.needsUpdate = true;
}
