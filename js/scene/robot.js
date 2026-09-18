import * as THREE from 'three';
import { CONFIG } from '../config.js';
import { SurfaceSampler } from '../util/sample.js';
import { registerPaletteColor, getPaletteColor } from './palette.js';

// Step 17: palette-shift helper — registers the live color and returns it.
const pal = (key, hex) => registerPaletteColor(key, new THREE.Color(hex));

// The mech: Gundam-chunky proportions, IG-88-inspired sensor head.
// Rendered as a dark physical core + burning wireframe/point-cloud ghost.
// `coherence` (0..1) drives disintegration: 1 = tight ghost, 0 = embers.
// Eyes never disperse.

let robotGroup, mechGroup, sampler;
let pointsMat, wireMat, eyeMat, fireLight;
let coherence = 1;
let turntableOn = true; // R8: user-toggleable turntable
let swayOn = true; // R11: user-toggleable mid-driven sway
// Step 21b: drop shatter — reform spring timer (null when idle).
let reformT = null;
const REFORM_DUR = 0.9;
// Step 9: pivot groups for head + arms (identity at build, rotated at runtime)
let headGroup, armL, armR;
// Step 9: audio-follow state
let prevKick = 0;
let subS = 0, midS = 0, highS = 0;
let headTiltX = 0, headTiltZ = 0;

// R12: mech chassis variants — same ghost soul, different silhouettes.
// w/h/s reshape the whole mechGroup (ghost points + wireframe follow);
// seraph gets wing planes.
export const CHASSIS = {
  ghost:  { w: 1.0,  h: 1.0,  s: 1.0,  wings: false },
  scout:  { w: 0.72, h: 1.12, s: 0.88, wings: false },
  brute:  { w: 1.32, h: 0.94, s: 1.14, wings: false },
  seraph: { w: 0.85, h: 1.05, s: 1.0,  wings: true },
};
export const CHASSIS_ORDER = ['ghost', 'scout', 'brute', 'seraph'];
let chassis = 'ghost';
try { chassis = localStorage.getItem('gorf.mech.chassis.v1') || 'ghost'; } catch (_) { /* private mode */ }
if (!CHASSIS[chassis]) chassis = 'ghost';
// R26: persistent wear — scorch that carries across sessions. It remembers.
const SCORCH = new THREE.Color(0x2a1408);
let wear = 0;
try { wear = parseFloat(localStorage.getItem('gorf.mech.wear.v1')) || 0; } catch (_) { /* private mode */ }
wear = Math.min(1, Math.max(0, wear));
let wearSavedAt = 0;
let wingL = null, wingR = null;
let sceneRef = null, lightsBuilt = false;

export function setTurntable(on) { turntableOn = !!on; }
export function isTurntableOn() { return turntableOn; }
export function setSway(on) { swayOn = !!on; }
export function isSwayOn() { return swayOn; }

function part(geo, x, y, z, mat, opts = {}) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  if (opts.rx) m.rotation.x = opts.rx;
  if (opts.ry) m.rotation.y = opts.ry;
  if (opts.rz) m.rotation.z = opts.rz;
  const parent = opts.group || mechGroup;
  parent.add(m);
  // Bake the pivot group's bind-pose transform so surface sampling and the
  // wireframe stay in mechGroup space while parts live in pivot groups.
  m.updateMatrix();
  parent.updateMatrix();
  const baked = new THREE.Matrix4().multiplyMatrices(parent.matrix, m.matrix);
  sampler.add(geo, baked);
  m.userData.baked = baked;
  return m;
}

function buildMech() {
  // Pivot groups: identity at build time (so baked surface sampling stays
  // valid), rotated at runtime for sway/head-tilt/arm-swing.
  headGroup = new THREE.Group();
  headGroup.position.set(0, 6.1, 0); // neck pivot
  mechGroup.add(headGroup);
  armL = new THREE.Group();
  armL.position.set(-1.85, 5.6, 0); // shoulder pivots
  mechGroup.add(armL);
  armR = new THREE.Group();
  armR.position.set(1.85, 5.6, 0);
  mechGroup.add(armR);

  const dark = new THREE.MeshStandardMaterial({
    color: pal('bot', CONFIG.palette.bot), roughness: 0.5, metalness: 0.8,
  });
  dark.color.lerp(SCORCH, wear * 0.45); // R26: scorch remembers past sets
  const glow = new THREE.MeshStandardMaterial({
    color: 0x140a04, emissive: 0xff5a2a, emissiveIntensity: 2.2,
  });

  // Legs: chunky feet, armored shins, heavy thighs
  for (const s of [-1, 1]) {
    part(new THREE.BoxGeometry(0.85, 0.45, 1.25), s * 0.68, 0.22, 0.15, dark);
    part(new THREE.BoxGeometry(0.72, 1.5, 0.85), s * 0.68, 1.15, 0, dark);
    part(new THREE.CylinderGeometry(0.48, 0.55, 1.5, 10), s * 0.68, 2.55, 0, dark);
  }
  part(new THREE.BoxGeometry(1.7, 0.9, 1.05), 0, 3.55, 0, dark);   // hips
  part(new THREE.BoxGeometry(2.3, 1.7, 1.4), 0, 4.85, 0, dark);    // torso
  part(new THREE.BoxGeometry(2.55, 0.75, 1.6), 0, 5.55, 0, dark);  // chest armor

  // Arms: big shoulders, heavy forearms (positions relative to shoulder pivot)
  for (const s of [-1, 1]) {
    const arm = s < 0 ? armL : armR;
    part(new THREE.BoxGeometry(1.15, 1.15, 1.15), 0, 0, 0, dark, { group: arm });
    part(new THREE.CylinderGeometry(0.34, 0.38, 1.35, 10), 0, -1.15, 0, dark, { group: arm });
    part(new THREE.BoxGeometry(0.6, 1.25, 0.65), 0, -2.45, 0, dark, { group: arm });
    part(new THREE.BoxGeometry(0.55, 0.55, 0.55), 0, -3.3, 0, dark, { group: arm });
  }

  // IG-88 head: horizontal cylinder + glowing sensor band + antennae
  // (positions relative to neck pivot at y=6.1)
  const hg = { group: headGroup };
  part(new THREE.CylinderGeometry(0.26, 0.26, 0.45, 10), 0, 0.05, 0, dark, hg);
  part(new THREE.CylinderGeometry(0.48, 0.52, 0.75, 14), 0, 0.55, 0, dark, { ...hg, rx: Math.PI / 2 });
  part(new THREE.CylinderGeometry(0.53, 0.53, 0.14, 14), 0, 0.55, 0.12, glow, { ...hg, rx: Math.PI / 2 });
  for (const s of [-1, 1]) {
    part(new THREE.CylinderGeometry(0.03, 0.03, 0.7, 6), s * 0.3, 1.1, -0.1, dark, { ...hg, rz: -s * 0.15 });
  }
  // Physical eye meshes (the never-dispersing eye POINTS are separate)
  for (const s of [-1, 1]) {
    part(new THREE.SphereGeometry(0.09, 10, 10), s * 0.18, 0.58, 0.44, glow, hg);
  }

  // R12: seraph wings — ember-lit planes on the back, flapped at runtime.
  wingL = wingR = null;
  if (CHASSIS[chassis].wings) {
    const wingGeo = new THREE.PlaneGeometry(2.6, 1.1);
    const wingMat = new THREE.MeshStandardMaterial({
      color: 0x140a04, emissive: 0xff5a2a, emissiveIntensity: 1.2,
      transparent: true, opacity: 0.85, side: THREE.DoubleSide,
    });
    for (const s of [-1, 1]) {
      const w = new THREE.Mesh(wingGeo, wingMat);
      w.position.set(s * 1.9, 5.9, -0.9);
      w.rotation.y = s * 0.55;
      w.rotation.z = s * 0.25;
      mechGroup.add(w);
      if (s < 0) wingL = w; else wingR = w;
    }
  }
}

// Dispersal chunk shared by the point cloud and wireframe shaders.
const DISPERSE_GLSL = `
  uniform float uTime;
  uniform float uCoherence;
  uniform float uDisperse;
  attribute float aRand;
  attribute float aSeed;
  varying float vDisp;
  varying float vSeed;
  float disperseFactor() {
    return smoothstep(uCoherence, uCoherence + 0.22, aRand);
  }
  vec3 disperseOffset(vec3 p) {
    float d = disperseFactor();
    vDisp = d;
    vSeed = aSeed;
    p.y += d * uDisperse * (0.6 + aSeed * 0.8);
    p.x += sin(uTime * 2.5 + aSeed * 43.0) * d * 0.5;
    p.z += cos(uTime * 2.1 + aSeed * 31.0) * d * 0.5;
    return p;
  }
`;

function buildGhost() {
  const N = CONFIG.robot.pointCount;
  const positions = new Float32Array(N * 3);
  const rands = new Float32Array(N);
  const seeds = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    sampler.sample(positions, i);
    rands[i] = Math.random();
    seeds[i] = Math.random();
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  g.setAttribute('aRand', new THREE.BufferAttribute(rands, 1));
  g.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 1));

  pointsMat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: {
      uTime: { value: 0 },
      uCoherence: { value: 1 },
      uHeat: { value: 0 },
      uMid: { value: 0 },
      uSize: { value: CONFIG.robot.pointSize },
      uDisperse: { value: CONFIG.robot.disperse },
      uCyan: { value: pal('cyan', CONFIG.palette.cyan) },
      uWhite: { value: new THREE.Color(0xeaf6ff) },
      uFireMid: { value: pal('fireMid', CONFIG.palette.fireMid) },
      uFireEdge: { value: pal('fireEdge', CONFIG.palette.fireEdge) },
    },
    vertexShader: `
      ${DISPERSE_GLSL}
      uniform float uSize;
      uniform float uMid;
      void main() {
        vec3 p = disperseOffset(position);
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;
        gl_PointSize = uSize * (0.8 + 0.5 * uMid) * (140.0 / -mv.z);
      }
    `,
    fragmentShader: `
      uniform vec3 uCyan, uWhite, uFireMid, uFireEdge;
      uniform float uHeat, uMid;
      varying float vDisp;
      varying float vSeed;
      void main() {
        vec2 pc = gl_PointCoord - 0.5;
        float d = length(pc) * 2.0;
        float a = smoothstep(1.0, 0.25, d);
        vec3 solid = mix(uCyan, uWhite, 0.35 + 0.3 * vSeed);
        vec3 ember = mix(uFireMid, uFireEdge, vSeed);
        vec3 col = mix(solid, ember, clamp(vDisp * 1.2, 0.0, 1.0));
        col = mix(col, uFireMid, uHeat * 0.35 * (1.0 - vDisp));
        col *= 0.85 + 0.5 * uMid;
        float alpha = a * (1.0 - vDisp * 0.35);
        gl_FragColor = vec4(col, alpha);
      }
    `,
  });
  const points = new THREE.Points(g, pointsMat);
  points.frustumCulled = false;
  mechGroup.add(points);
}

function buildWireframe() {
  wireMat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: {
      uTime: { value: 0 },
      uCoherence: { value: 1 },
      uHeat: { value: 0 },
      uMid: { value: 0 },
      uDisperse: { value: CONFIG.robot.disperse },
      uCyan: { value: pal('cyan', CONFIG.palette.cyan) },
      uFire: { value: pal('fireMid', CONFIG.palette.fireMid) },
      uOpacity: { value: CONFIG.robot.wireOpacity },
    },
    vertexShader: `
      ${DISPERSE_GLSL}
      void main() {
        vec3 p = disperseOffset(position);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
      }
    `,
    fragmentShader: `
      uniform vec3 uCyan, uFire;
      uniform float uHeat, uOpacity, uMid;
      varying float vDisp;
      varying float vSeed;
      void main() {
        vec3 col = mix(uCyan, uFire, clamp(uHeat * 0.7 + vDisp * 0.6, 0.0, 1.0));
        float alpha = (1.0 - vDisp * 0.85) * uOpacity * (0.7 + 0.6 * uMid);
        gl_FragColor = vec4(col, alpha);
      }
    `,
  });
  const meshes = [];
  mechGroup.traverse((o) => { if (o.isMesh) meshes.push(o); });
  for (const child of meshes) {
    const wg = new THREE.WireframeGeometry(child.geometry);
    wg.applyMatrix4(child.userData.baked);
    const n = wg.attributes.position.count;
    const rands = new Float32Array(n);
    const seeds = new Float32Array(n);
    for (let i = 0; i < n; i++) { rands[i] = Math.random(); seeds[i] = Math.random(); }
    wg.setAttribute('aRand', new THREE.BufferAttribute(rands, 1));
    wg.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 1));
    const lines = new THREE.LineSegments(wg, wireMat);
    lines.frustumCulled = false;
    mechGroup.add(lines);
  }
}

function buildEyes() {
  const g = new THREE.BufferGeometry();
  // Relative to headGroup (neck pivot at y=6.1) so the eyes follow head tilt.
  g.setAttribute('position', new THREE.BufferAttribute(
    new Float32Array([-0.18, 0.58, 0.47, 0.18, 0.58, 0.47]), 3));
  eyeMat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: {
      uSize: { value: CONFIG.robot.eyeSize },
      uColor: { value: new THREE.Color(CONFIG.robot.eyeColor) },
      uTime: { value: 0 },
      uHigh: { value: 0 },
    },
    vertexShader: `
      uniform float uSize;
      void main() {
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mv;
        gl_PointSize = uSize * (140.0 / -mv.z);
      }
    `,
    fragmentShader: `
      uniform vec3 uColor;
      uniform float uTime, uHigh;
      void main() {
        vec2 pc = gl_PointCoord - 0.5;
        float d = length(pc) * 2.0;
        float core = smoothstep(0.5, 0.05, d);
        float halo = smoothstep(1.0, 0.2, d) * 0.5;
        float flick = 0.85 + 0.15 * sin(uTime * 23.0)
          + uHigh * 0.6 * sin(uTime * 61.0 + 1.7);
        vec3 col = mix(uColor, vec3(1.0, 0.95, 0.85), core);
        col *= 1.0 + uHigh * 0.8;
        gl_FragColor = vec4(col * flick, clamp(core + halo, 0.0, 1.0));
      }
    `,
  });
  const eyes = new THREE.Points(g, eyeMat);
  eyes.frustumCulled = false;
  headGroup.add(eyes); // NOTE: no dispersal — eyes never disperse, per spec
}

export function initRobot(scene) {
  sceneRef = scene;
  robotGroup = new THREE.Group();
  robotGroup.position.set(...CONFIG.robot.pos);
  mechGroup = new THREE.Group();
  robotGroup.add(mechGroup);
  sampler = new SurfaceSampler();
  turntableOn = CONFIG.robot.turntable;
  swayOn = CONFIG.robot.sway;

  // R12: chassis rebuilds re-run init — lights are built once.
  if (!lightsBuilt) {
    scene.add(new THREE.AmbientLight(0x2a3a66, 0.7));
    const key = new THREE.DirectionalLight(0xffd9a8, 1.4);
    key.position.set(6, 12, 9);
    scene.add(key);
    const rim = new THREE.DirectionalLight(pal('cyan', CONFIG.palette.cyan), 0.8);
    rim.position.set(-8, 6, -10);
    scene.add(rim);
    lightsBuilt = true;
  }
  fireLight = new THREE.PointLight(pal('fireMid', CONFIG.palette.fireMid), 3, 30, 1.6);
  fireLight.position.set(0, 4, 4);
  robotGroup.add(fireLight);

  buildMech();
  buildGhost();
  buildWireframe();
  buildEyes();
  scene.add(robotGroup);

  return { group: mechGroup, getCoherence, sampleSurfacePoint };
}

// R12: chassis switching — dispose the old body, build the new one.
export function getChassis() { return chassis; }
export function cycleChassis() {
  const next = CHASSIS_ORDER[(CHASSIS_ORDER.indexOf(chassis) + 1) % CHASSIS_ORDER.length];
  setChassis(next);
  return next;
}
export function setChassis(name) {
  if (!CHASSIS[name] || name === chassis) return chassis;
  chassis = name;
  try { localStorage.setItem('gorf.mech.chassis.v1', name); } catch (_) { /* private mode */ }
  if (sceneRef && robotGroup) {
    const duelWas = isDuelOn();
    if (duelWas) setDuel(false);
    const tt = turntableOn, sw = swayOn; // rebuild must not reset user toggles
    sceneRef.remove(robotGroup);
    robotGroup.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => m.dispose());
    });
    initRobot(sceneRef);
    setTurntable(tt);
    setSway(sw);
    if (duelWas) setDuel(true);
  }
  return chassis;
}

// R26: wear persists across sessions (throttled writes).
export function getWear() { return wear; }
export function addWear(x) {
  wear = Math.min(1, Math.max(0, wear + x));
  const now = performance.now();
  if (now - wearSavedAt > 5000) {
    wearSavedAt = now;
    try { localStorage.setItem('gorf.mech.wear.v1', String(wear)); } catch (_) { /* private mode */ }
  }
}

// R16: stereo duel — a second mech cloned from the live one. Shader
// materials are cloned so it gets independent uniforms (own coherence);
// standard materials stay shared. Driven by the right channel.
let duelGroup = null, duelMats = [], duelCoherence = 1, duelPrevKick = 0;
export function isDuelOn() { return !!duelGroup; }
export function setDuel(on) {
  on = !!on;
  if (on === !!duelGroup) return on;
  if (on) {
    duelGroup = robotGroup.clone(true);
    duelGroup.traverse((o) => {
      if (o.material && o.material.uniforms) {
        o.material = o.material.clone();
        // Re-point color uniforms at the LIVE registry colors so the duel
        // mech follows palette shifts instead of freezing its birth colors.
        const u = o.material.uniforms;
        const remap = { uCyan: 'cyan', uFireMid: 'fireMid', uFireEdge: 'fireEdge', uFire: 'fireMid' };
        for (const [uni, key] of Object.entries(remap)) {
          const live = getPaletteColor(key);
          if (u[uni] && live) u[uni].value = live;
        }
        duelMats.push(o.material);
      }
    });
    duelGroup.position.x = 8.5;
    duelGroup.rotation.y = -0.5;
    sceneRef.add(duelGroup);
  } else {
    sceneRef.remove(duelGroup);
    duelGroup.traverse((o) => {
      if (o.material && o.material.uniforms) o.material.dispose();
    });
    duelGroup = null;
    duelMats = [];
    duelCoherence = 1;
  }
  return on;
}

// drive = { energy, kick } derived from the right channel (see main.js).
export function updateDuel(dt, t, drive) {
  if (!duelGroup) return;
  const kickEdge = drive.kick > 0.6 && duelPrevKick <= 0.6;
  duelPrevKick = drive.kick;
  if (kickEdge) duelCoherence = 1;
  else duelCoherence = Math.max(0, duelCoherence - dt * CONFIG.robot.coherenceDecay * 1.15);
  for (const m of duelMats) {
    if (m.uniforms.uCoherence) m.uniforms.uCoherence.value = duelCoherence;
    if (m.uniforms.uTime) m.uniforms.uTime.value = t;
    if (m.uniforms.uHeat) m.uniforms.uHeat.value = drive.heat;
    if (m.uniforms.uMid) m.uniforms.uMid.value = drive.mid;
  }
  duelGroup.rotation.y += dt * CONFIG.robot.turntableSpeed * 0.8;
  duelGroup.position.y = Math.sin(t * 0.9 + 2.0) * 0.1;
}

export function getCoherence() {
  return coherence;
}

// Step 19: manual eruption (Space) snaps the ghost back together.
export function snapCoherence() {
  coherence = 1;
  reformT = null;
}

// Step 21b: drop shatter. Coherence slams to 0 (embers erupt via the
// (1-coherence) spawn rate); the ghost then springs back with an overshoot.
export function shatterCoherence() {
  if (reformT !== null) return; // already shattering — don't retrigger
  coherence = 0;
  reformT = 0;
}

function easeOutBack(t) {
  const c1 = 1.70158, c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
}

export function sampleSurfacePoint(out) {
  return sampler.sampleToVector(out);
}

export function updateRobot(dt, audioState) {
  const t = audioState.time;
  const live = !!audioState.live;

  // Smoothed bands follow the music without jitter.
  const sk = Math.min(1, dt * 3);
  subS += (audioState.sub - subS) * sk;
  midS += (audioState.mid - midS) * sk;
  highS += (audioState.high - highS) * sk;

  // Coherence: a kick onset snaps the ghost together (fast attack), then it
  // burns apart between beats. No source → idle breathing around half-formed.
  const kickEdge = audioState.kick > 0.6 && prevKick <= 0.6;
  prevKick = audioState.kick;
  if (live) {
    if (kickEdge) {
      // Step 10: broadcast the beat so effects (shockwave, camera, sun) fire.
      if (audioState.events) audioState.events.push({ type: 'kick', strength: audioState.kick });
      // Step 21b: during shatter-reform the spring owns coherence; kicks
      // still broadcast but don't cut the reform short.
      if (reformT === null) coherence = 1;
    }
    if (reformT !== null) {
      reformT += dt / REFORM_DUR;
      if (reformT >= 1) {
        reformT = null;
        coherence = 1;
      } else {
        coherence = Math.min(1, Math.max(0, easeOutBack(reformT)));
      }
    } else {
      coherence = Math.max(0, coherence - dt * CONFIG.robot.coherenceDecay);
    }
  } else {
    const idleTarget = 0.55 + Math.sin(t * 0.8) * 0.08;
    coherence += (idleTarget - coherence) * Math.min(1, dt * 1.2);
  }

  if (turntableOn) robotGroup.rotation.y += dt * CONFIG.robot.turntableSpeed;

  // Slow sway: torso roll driven by smoothed mids. R11: toggleable.
  const swayAmp = swayOn ? (0.02 + midS * CONFIG.robot.swayGain) : 0;
  mechGroup.rotation.z = Math.sin(t * 0.9) * swayAmp;
  mechGroup.rotation.x = Math.sin(t * 0.63 + 1.3) * swayAmp * 0.6;

  // Arms swing gently with the mids.
  const armSwing = 0.05 + midS * 0.22;
  armL.rotation.x = Math.sin(t * 1.1) * armSwing;
  armR.rotation.x = Math.sin(t * 1.1 + Math.PI) * armSwing;
  armL.rotation.z = 0.06 + midS * 0.10;
  armR.rotation.z = -0.06 - midS * 0.10;

  // Head tilts toward the hottest band: sub = heavy nod, high = looks up.
  const tiltZTarget = THREE.MathUtils.clamp((highS - subS) * 0.45, -0.35, 0.35);
  const tiltXTarget = THREE.MathUtils.clamp(subS * 0.14 - highS * 0.12, -0.2, 0.25);
  headTiltZ += (tiltZTarget - headTiltZ) * sk;
  headTiltX += (tiltXTarget - headTiltX) * sk;
  headGroup.rotation.z = headTiltZ;
  headGroup.rotation.x = headTiltX;

  // Idle breathing: subtle scale oscillation, stronger with no source.
  // R12: chassis proportions ride along with the breathing scale.
  const breathe = 1 + Math.sin(t * 1.4) * 0.012 * (live ? 0.4 : 1.0);
  const V = CHASSIS[chassis];
  mechGroup.scale.set(V.s * V.w * breathe, V.s * V.h * breathe, V.s * V.w * breathe);
  mechGroup.position.y = Math.sin(t * 0.9) * 0.1;

  // R12: seraph wing flap, stronger with the mids.
  if (wingL) {
    const flap = Math.sin(t * 2.1) * (0.22 + midS * 0.3);
    wingL.rotation.y = -0.55 - flap;
    wingR.rotation.y = 0.55 + flap;
  }

  for (const m of [pointsMat, wireMat]) {
    m.uniforms.uTime.value = t;
    m.uniforms.uCoherence.value = coherence;
    m.uniforms.uHeat.value = audioState.sceneHeat;
    m.uniforms.uMid.value = midS;
  }
  eyeMat.uniforms.uTime.value = t;
  eyeMat.uniforms.uHigh.value = highS;
  fireLight.intensity = 2 + audioState.sceneHeat * 9 + audioState.pulse * 20
    + audioState.kick * 8;
}
