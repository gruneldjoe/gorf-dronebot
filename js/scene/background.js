import * as THREE from 'three';
import { CONFIG } from '../config.js';
import { registerPaletteColor, getPaletteColor } from './palette.js';

// Step 17: palette-shift helper — registers the live color and returns it.
const pal = (key, hex) => registerPaletteColor(key, new THREE.Color(hex));

// Seeded RNG so silhouettes are stable between loads.
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

let skyMat, sunMesh, sunBaseSize, parallaxLayers = [], floorMat, floorScroll = 0;
// Step 10: decaying kick bump added to the sun scale, driven by pulseSun().
let sunKick = 0;
// R17: day/night — an 8-minute cycle; the sun dips and pales into a moon.
let dnT = 0.15; // start mid-morning
const DN_CYCLE = 480; // seconds
const NIGHT_TOP = new THREE.Color(0x020309);
const NIGHT_HOR = new THREE.Color(0x05070f);
const NIGHT_HOT = new THREE.Color(0x0a0f22);
const MOON_CORE = new THREE.Color(0xe8f0ff);
const MOON_GLOW = new THREE.Color(0x9db8e8);
// R19: vox swell — the presence band breathes the sun (stem-approx).
let voxSwell = 0;
export function addVoxSwell(v) {
  voxSwell = Math.min(1, voxSwell + v * 0.12);
}

export function pulseSun(strength) {
  sunKick = Math.min(1.5, sunKick + strength * CONFIG.sun.kickGain);
}

function makeSky() {
  const geo = new THREE.SphereGeometry(CONFIG.sky.radius, 32, 16);
  skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      // R17: owned colors — copied from the palette registry each frame so
      // day/night can lerp them without mutating registered colors.
      uTop: { value: new THREE.Color() },
      uHorizon: { value: new THREE.Color() },
      uHotHorizon: { value: new THREE.Color() },
      uHeat: { value: 0 },
    },
    vertexShader: `
      varying vec3 vPos;
      void main() {
        vPos = position;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform vec3 uTop, uHorizon, uHotHorizon;
      uniform float uHeat;
      varying vec3 vPos;
      void main() {
        float h = normalize(vPos).y;
        vec3 horizon = mix(uHorizon, uHotHorizon, uHeat);
        vec3 col = mix(horizon, uTop, smoothstep(-0.02, 0.55, h));
        col = mix(vec3(0.008, 0.008, 0.02), col, smoothstep(-0.25, 0.0, h));
        gl_FragColor = vec4(col, 1.0);
      }
    `,
  });
  return new THREE.Mesh(geo, skyMat);
}

function makeSun() {
  const mat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    fog: false,
    uniforms: {
      uCore: { value: new THREE.Color() },
      uGlow: { value: new THREE.Color() },
    },
    vertexShader: `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform vec3 uCore, uGlow;
      varying vec2 vUv;
      void main() {
        vec2 p = vUv - 0.5;
        float d = length(p) * 2.0;
        // Chrono Trigger sun: hard disc edge, soft glow
        float disc = smoothstep(0.42, 0.38, d);
        float glow = smoothstep(1.0, 0.25, d) * 0.55;
        vec3 col = uCore * disc + uGlow * glow;
        float a = clamp(disc + glow, 0.0, 1.0);
        gl_FragColor = vec4(col, a);
      }
    `,
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mat);
  sunBaseSize = CONFIG.sun.size;
  mesh.scale.setScalar(sunBaseSize);
  mesh.position.set(...CONFIG.sun.pos);
  return mesh;
}

function makeSilhouetteTexture(kind, color, seed) {
  const rnd = mulberry32(seed);
  const c = document.createElement('canvas');
  c.width = 1024; c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = color;
  if (kind === 'ridge') {
    g.beginPath();
    g.moveTo(0, 128);
    let y = 55 + rnd() * 30;
    for (let x = 0; x <= 1024; x += 24) {
      y += (rnd() - 0.5) * 34;
      y = Math.max(18, Math.min(112, y));
      g.lineTo(x, y);
    }
    g.lineTo(1024, 128);
    g.closePath();
    g.fill();
  } else {
    // ruined city: blocky towers, some with antenna spires
    g.beginPath();
    g.moveTo(0, 128);
    let x = 0;
    while (x < 1024) {
      const w = 30 + rnd() * 70;
      const h = 30 + rnd() * 70;
      g.lineTo(x, 128 - h);
      g.lineTo(x + w, 128 - h);
      if (rnd() < 0.4) {
        // antenna spire
        g.lineTo(x + w * 0.5, 128 - h - 18 - rnd() * 22);
        g.lineTo(x + w * 0.5 + 3, 128 - h);
      }
      g.lineTo(x + w, 128);
      x += w + rnd() * 26;
    }
    g.lineTo(1024, 128);
    g.closePath();
    g.fill();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function makeParallaxLayer(cfg) {
  const tex = makeSilhouetteTexture(cfg.kind, cfg.color, cfg.seed);
  const mat = new THREE.MeshBasicMaterial({
    map: tex, transparent: true, fog: false, depthWrite: false,
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(cfg.width, cfg.height), mat);
  mesh.position.set(0, cfg.y, cfg.z);
  return { mesh, tex, speed: cfg.speed };
}

function makeFloor() {
  const geo = new THREE.PlaneGeometry(CONFIG.floor.size, CONFIG.floor.size);
  floorMat = new THREE.ShaderMaterial({
    fog: false,
    uniforms: {
      uGridScale: { value: CONFIG.floor.gridScale },
      uScroll: { value: 0 },
      uHeat: { value: 0 },
      uCool: { value: pal('floorCool', CONFIG.palette.floorCool) },
      uHot: { value: pal('floorHot', CONFIG.palette.floorHot) },
      uBase: { value: pal('floorBase', CONFIG.palette.floorBase) },
      uFadeK: { value: CONFIG.floor.fadeK },
      uLineIntensity: { value: CONFIG.floor.lineIntensity },
      uRobotPos: { value: new THREE.Vector3(...CONFIG.robot.pos) },
    },
    vertexShader: `
      varying vec3 vWorld;
      void main() {
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWorld = wp.xyz;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }
    `,
    fragmentShader: `
      varying vec3 vWorld;
      uniform float uGridScale, uScroll, uHeat, uFadeK, uLineIntensity;
      uniform vec3 uCool, uHot, uBase, uRobotPos;
      void main() {
        vec2 gp = vec2(vWorld.x, vWorld.z + uScroll) / uGridScale;
        vec2 q = abs(fract(gp - 0.5) - 0.5) / fwidth(gp);
        float line = 1.0 - min(min(q.x, q.y), 1.0);
        float dist = distance(vWorld.xz, cameraPosition.xz);
        float fade = exp(-dist * uFadeK);
        vec3 gridCol = mix(uCool, uHot, uHeat);
        vec3 col = uBase + gridCol * line * fade * uLineIntensity;
        // glow pooling under the robot
        float rd = distance(vWorld.xz, uRobotPos.xz);
        col += gridCol * exp(-rd * 0.22) * 0.4 * (0.35 + uHeat);
        gl_FragColor = vec4(col, 1.0);
      }
    `,
  });
  const mesh = new THREE.Mesh(geo, floorMat);
  mesh.rotation.x = -Math.PI / 2;
  return mesh;
}

export function initBackground(scene) {
  // R17: register sky/sun colors so palette cycling re-tints them. The
  // shaders hold owned copies, refreshed from the registry every frame,
  // so day/night can lerp without mutating registered colors.
  for (const [k, hex] of [
    ['skyTop', CONFIG.palette.skyTop],
    ['skyHorizon', CONFIG.palette.skyHorizon],
    ['skyHorizonHot', CONFIG.palette.skyHorizonHot],
    ['sunCore', CONFIG.palette.sunCore],
    ['sunGlow', CONFIG.palette.sunGlow],
  ]) pal(k, hex);
  scene.add(makeSky());
  sunMesh = makeSun();
  scene.add(sunMesh);
  for (const cfg of CONFIG.parallax.layers) {
    const layer = makeParallaxLayer(cfg);
    parallaxLayers.push(layer);
    scene.add(layer.mesh);
  }
  scene.add(makeFloor());
}

export function updateBackground(scene, dt, audioState) {
  const t = audioState.time;
  // R17: day/night — 8-minute cycle; the sun dips and pales into a moon.
  dnT = (dnT + dt / DN_CYCLE) % 1;
  const elev = Math.sin(dnT * Math.PI * 2);
  const nightAmt = THREE.MathUtils.smoothstep(-elev, 0.05, 0.45);
  const skyU = skyMat.uniforms;
  skyU.uTop.value.copy(getPaletteColor('skyTop')).lerp(NIGHT_TOP, nightAmt);
  skyU.uHorizon.value.copy(getPaletteColor('skyHorizon')).lerp(NIGHT_HOR, nightAmt);
  skyU.uHotHorizon.value.copy(getPaletteColor('skyHorizonHot')).lerp(NIGHT_HOT, nightAmt);
  const sunU = sunMesh.material.uniforms;
  sunU.uCore.value.copy(getPaletteColor('sunCore')).lerp(MOON_CORE, nightAmt);
  sunU.uGlow.value.copy(getPaletteColor('sunGlow')).lerp(MOON_GLOW, nightAmt);
  sunMesh.position.y = 14 + Math.max(0, elev) * 24;

  // Sun pulse: gentle sine + decaying kick bump (step 10) + vox breathing
  // (R19 stem-approx); the moon runs a touch smaller.
  sunKick *= Math.exp(-dt * CONFIG.sun.kickDecay);
  voxSwell *= Math.exp(-dt * 3.0);
  const s = sunBaseSize * (1 - nightAmt * 0.25)
    * (1 + audioState.pulse * CONFIG.sun.pulseAmount * 3 + sunKick + voxSwell * 0.15);
  sunMesh.scale.setScalar(s);

  // Parallax scroll — layers wrap seamlessly via RepeatWrapping
  for (const layer of parallaxLayers) {
    layer.tex.offset.x = (t * layer.speed * 0.004) % 1;
  }

  // Mode-7 floor scroll + heat
  floorScroll += dt * CONFIG.floor.scrollSpeed * (0.6 + audioState.energy * 2.0);
  floorMat.uniforms.uScroll.value = floorScroll;
  floorMat.uniforms.uHeat.value = audioState.sceneHeat;

  // Sky warms with heat
  skyMat.uniforms.uHeat.value = audioState.sceneHeat;
}
