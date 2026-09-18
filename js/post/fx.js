import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { CONFIG } from '../config.js';

// Step 13: post chain — RenderPass → UnrealBloom → composite → Output.
// The composite pass does heat-haze distortion (scaled by energy),
// vignette, and toggleable CRT (scanlines + chromatic aberration).

let composer, compositePass;
let crtOn = CONFIG.post.crt;

const CompositeShader = {
  uniforms: {
    tDiffuse: { value: null },
    uTime: { value: 0 },
    uHaze: { value: 0 },
    uCrt: { value: 0 },
    uResolution: { value: new THREE.Vector2(1, 1) },
  },
  vertexShader: `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    uniform sampler2D tDiffuse;
    uniform float uTime, uHaze, uCrt;
    uniform vec2 uResolution;
    varying vec2 vUv;
    float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
    float vnoise(vec2 p) {
      vec2 i = floor(p), f = fract(p);
      vec2 u = f * f * (3.0 - 2.0 * f);
      return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x),
                 mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
    }
    void main() {
      vec2 uv = vUv;
      // Heat haze: animated wavy distortion, strongest low-center (over the fire).
      float n1 = vnoise(vec2(uv.x * 9.0, uv.y * 7.0 - uTime * 2.6));
      float n2 = vnoise(vec2(uv.x * 15.0 + 5.0, uv.y * 11.0 - uTime * 4.2));
      float mask = smoothstep(1.0, 0.15, distance(uv, vec2(0.5, 0.32)));
      uv += (vec2(n1, n2) - 0.5) * uHaze * 0.014 * (0.35 + 0.65 * mask);
      vec3 col;
      if (uCrt > 0.5) {
        float ab = 0.0018;
        col.r = texture2D(tDiffuse, uv + vec2(ab, 0.0)).r;
        col.g = texture2D(tDiffuse, uv).g;
        col.b = texture2D(tDiffuse, uv - vec2(ab, 0.0)).b;
        col *= 0.86 + 0.14 * sin(vUv.y * uResolution.y * 3.14159);
      } else {
        col = texture2D(tDiffuse, uv).rgb;
      }
      float d = distance(vUv, vec2(0.5, 0.5));
      col *= mix(0.62, 1.0, smoothstep(0.92, 0.32, d));
      gl_FragColor = vec4(col, 1.0);
    }
  `,
};

export function initPost(renderer, scene, camera) {
  composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const p = CONFIG.post;
  composer.addPass(new UnrealBloomPass(
    new THREE.Vector2(window.innerWidth, window.innerHeight),
    p.bloomStrength, p.bloomRadius, p.bloomThreshold));
  compositePass = new ShaderPass(CompositeShader);
  compositePass.uniforms.uCrt.value = crtOn ? 1 : 0;
  composer.addPass(compositePass);
  composer.addPass(new OutputPass());
  onPostResize();
  return composer;
}

export function onPostResize() {
  if (!composer) return;
  composer.setSize(window.innerWidth, window.innerHeight);
  compositePass.uniforms.uResolution.value.set(window.innerWidth, window.innerHeight);
}

export function setCrt(on) {
  crtOn = !!on;
  if (compositePass) compositePass.uniforms.uCrt.value = crtOn ? 1 : 0;
}
export function isCrtOn() { return crtOn; }

export function updatePost(dt, audioState) {
  if (!compositePass) return;
  compositePass.uniforms.uTime.value = audioState.time;
  // Subtle at rest, heavy on the drop.
  compositePass.uniforms.uHaze.value = Math.min(1,
    audioState.energy * (0.35 + audioState.sceneHeat * 1.3));
}
