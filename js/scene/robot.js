import * as THREE from 'three';
import { CONFIG } from '../config.js';
import { SurfaceSampler } from '../util/sample.js';

// The mech: Gundam-chunky proportions, IG-88-inspired sensor head.
// Rendered as a dark physical core + burning wireframe/point-cloud ghost.
// `coherence` (0..1) drives disintegration: 1 = tight ghost, 0 = embers.
// Eyes never disperse.

let robotGroup, mechGroup, sampler;
let pointsMat, wireMat, eyeMat, fireLight;
let coherence = 1;
let turntableOn = true; // R8: user-toggleable turntable

export function setTurntable(on) { turntableOn = !!on; }
export function isTurntableOn() { return turntableOn; }

function part(geo, x, y, z, mat, opts = {}) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  if (opts.rx) m.rotation.x = opts.rx;
  if (opts.ry) m.rotation.y = opts.ry;
  if (opts.rz) m.rotation.z = opts.rz;
  m.updateMatrix();
  mechGroup.add(m);
  sampler.add(geo, m.matrix);
  return m;
}

function buildMech() {
  const dark = new THREE.MeshStandardMaterial({
    color: CONFIG.palette.bot, roughness: 0.5, metalness: 0.8,
  });
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

  // Arms: big shoulders, heavy forearms
  for (const s of [-1, 1]) {
    part(new THREE.BoxGeometry(1.15, 1.15, 1.15), s * 1.85, 5.6, 0, dark);
    part(new THREE.CylinderGeometry(0.34, 0.38, 1.35, 10), s * 1.85, 4.45, 0, dark);
    part(new THREE.BoxGeometry(0.6, 1.25, 0.65), s * 1.85, 3.15, 0, dark);
    part(new THREE.BoxGeometry(0.55, 0.55, 0.55), s * 1.85, 2.3, 0, dark);
  }

  // IG-88 head: horizontal cylinder + glowing sensor band + antennae
  part(new THREE.CylinderGeometry(0.26, 0.26, 0.45, 10), 0, 6.15, 0, dark);
  part(new THREE.CylinderGeometry(0.48, 0.52, 0.75, 14), 0, 6.65, 0, dark, { rx: Math.PI / 2 });
  part(new THREE.CylinderGeometry(0.53, 0.53, 0.14, 14), 0, 6.65, 0.12, glow, { rx: Math.PI / 2 });
  for (const s of [-1, 1]) {
    part(new THREE.CylinderGeometry(0.03, 0.03, 0.7, 6), s * 0.3, 7.2, -0.1, dark, { rz: -s * 0.15 });
  }
  // Physical eye meshes (the never-dispersing eye POINTS are separate)
  for (const s of [-1, 1]) {
    part(new THREE.SphereGeometry(0.09, 10, 10), s * 0.18, 6.68, 0.44, glow);
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
      uSize: { value: CONFIG.robot.pointSize },
      uDisperse: { value: CONFIG.robot.disperse },
      uCyan: { value: new THREE.Color(CONFIG.palette.cyan) },
      uWhite: { value: new THREE.Color(0xeaf6ff) },
      uFireMid: { value: new THREE.Color(CONFIG.palette.fireMid) },
      uFireEdge: { value: new THREE.Color(CONFIG.palette.fireEdge) },
    },
    vertexShader: `
      ${DISPERSE_GLSL}
      uniform float uSize;
      void main() {
        vec3 p = disperseOffset(position);
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;
        gl_PointSize = uSize * (140.0 / -mv.z);
      }
    `,
    fragmentShader: `
      uniform vec3 uCyan, uWhite, uFireMid, uFireEdge;
      uniform float uHeat;
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
      uDisperse: { value: CONFIG.robot.disperse },
      uCyan: { value: new THREE.Color(CONFIG.palette.cyan) },
      uFire: { value: new THREE.Color(CONFIG.palette.fireMid) },
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
      uniform float uHeat, uOpacity;
      varying float vDisp;
      varying float vSeed;
      void main() {
        vec3 col = mix(uCyan, uFire, clamp(uHeat * 0.7 + vDisp * 0.6, 0.0, 1.0));
        float alpha = (1.0 - vDisp * 0.85) * uOpacity;
        gl_FragColor = vec4(col, alpha);
      }
    `,
  });
  for (const child of [...mechGroup.children]) {
    if (!child.isMesh) continue;
    const wg = new THREE.WireframeGeometry(child.geometry);
    wg.applyMatrix4(child.matrix);
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
  g.setAttribute('position', new THREE.BufferAttribute(
    new Float32Array([-0.18, 6.68, 0.47, 0.18, 6.68, 0.47]), 3));
  eyeMat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: {
      uSize: { value: CONFIG.robot.eyeSize },
      uColor: { value: new THREE.Color(CONFIG.robot.eyeColor) },
      uTime: { value: 0 },
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
      uniform float uTime;
      void main() {
        vec2 pc = gl_PointCoord - 0.5;
        float d = length(pc) * 2.0;
        float core = smoothstep(0.5, 0.05, d);
        float halo = smoothstep(1.0, 0.2, d) * 0.5;
        float flick = 0.9 + 0.1 * sin(uTime * 23.0);
        vec3 col = mix(uColor, vec3(1.0, 0.95, 0.85), core);
        gl_FragColor = vec4(col * flick, clamp(core + halo, 0.0, 1.0));
      }
    `,
  });
  const eyes = new THREE.Points(g, eyeMat);
  eyes.frustumCulled = false;
  mechGroup.add(eyes); // NOTE: no dispersal — eyes never disperse, per spec
}

export function initRobot(scene) {
  robotGroup = new THREE.Group();
  robotGroup.position.set(...CONFIG.robot.pos);
  mechGroup = new THREE.Group();
  robotGroup.add(mechGroup);
  sampler = new SurfaceSampler();
  turntableOn = CONFIG.robot.turntable;

  scene.add(new THREE.AmbientLight(0x2a3a66, 0.7));
  const key = new THREE.DirectionalLight(0xffd9a8, 1.4);
  key.position.set(6, 12, 9);
  scene.add(key);
  const rim = new THREE.DirectionalLight(CONFIG.palette.cyan, 0.8);
  rim.position.set(-8, 6, -10);
  scene.add(rim);
  fireLight = new THREE.PointLight(CONFIG.palette.fireMid, 3, 30, 1.6);
  fireLight.position.set(0, 4, 4);
  robotGroup.add(fireLight);

  buildMech();
  buildGhost();
  buildWireframe();
  buildEyes();
  scene.add(robotGroup);

  return { group: mechGroup, getCoherence, sampleSurfacePoint };
}

export function getCoherence() {
  return coherence;
}

export function sampleSurfacePoint(out) {
  return sampler.sampleToVector(out);
}

export function updateRobot(dt, audioState) {
  const t = audioState.time;
  // TEMP mapping until the audio engine lands (step 8): heat slider drives
  // disintegration so it can be tested now. Audio will drive this later.
  const target = THREE.MathUtils.clamp(
    1 - audioState.heat * 0.95 + Math.sin(t * 0.8) * 0.06, 0, 1);
  coherence += (target - coherence) * Math.min(1, dt * 2.5);

  if (turntableOn) robotGroup.rotation.y += dt * CONFIG.robot.turntableSpeed;
  mechGroup.rotation.z = Math.sin(t * 0.7) * 0.035;
  mechGroup.rotation.x = Math.sin(t * 0.53) * 0.02;
  mechGroup.position.y = Math.sin(t * 0.9) * 0.1;

  for (const m of [pointsMat, wireMat]) {
    m.uniforms.uTime.value = t;
    m.uniforms.uCoherence.value = coherence;
    m.uniforms.uHeat.value = audioState.heat;
  }
  eyeMat.uniforms.uTime.value = t;
  fireLight.intensity = 2 + audioState.heat * 9 + audioState.pulse * 20;
}
