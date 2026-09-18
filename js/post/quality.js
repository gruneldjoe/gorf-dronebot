import { CONFIG } from '../config.js';
import { setEmberBudget } from '../scene/embers.js';
import { setJetBudget } from '../scene/jets.js';

// Step 20: auto quality scaler. Watches an FPS EMA and steps through three
// tiers (pixel ratio, particle budgets, bloom on/off), with hysteresis so
// it doesn't oscillate. Manual override via the HUD QUALITY select.
//
// Profiling notes (reasoned, not measured — no GPU here):
// - UnrealBloomPass is the biggest cost: ~6 extra fullscreen passes at
//   devicePixelRatio 2. Killing it on LOW is the single largest win.
// - Particle overdraw is second: 1100 additive points at up to 2x DPR.
//   Budgets cut both the CPU sim loop and the fragment load.
// - The composite pass is one fullscreen pass with a cheap 2-octave
//   value-noise haze — negligible next to bloom.
// - Tier changes only touch pixelRatio / draw counts / one pass toggle,
//   so they're pop-free (no shader recompiles, no reallocations).

const TIERS = ['high', 'med', 'low'];
let tier = 0;
let mode = 'auto';
let emaFps = 60;
let lowTime = 0;
let highTime = 0;
let rendererRef = null;
let composerRef = null;
let bloomRef = null;

export function initQuality({ renderer, composer, bloomPass }) {
  rendererRef = renderer;
  composerRef = composer;
  bloomRef = bloomPass;
  applyTier(0);
}

export function setQualityMode(m) {
  mode = m;
  if (m !== 'auto') applyTier(TIERS.indexOf(m));
  else { lowTime = 0; highTime = 0; } // re-evaluate from current fps
}

export function getQualityMode() {
  return mode;
}

export function getQualityTier() {
  return TIERS[tier];
}

function applyTier(i) {
  tier = Math.max(0, Math.min(TIERS.length - 1, i));
  const q = CONFIG.quality.tiers[TIERS[tier]];
  const pr = Math.min(window.devicePixelRatio || 1, q.pixelRatio);
  rendererRef.setPixelRatio(pr);
  composerRef.setPixelRatio(pr);
  composerRef.setSize(window.innerWidth, window.innerHeight);
  if (bloomRef) bloomRef.enabled = q.bloom;
  setEmberBudget(q.embers);
  setJetBudget(q.jets);
}

export function updateQuality(dt) {
  if (mode !== 'auto' || !rendererRef) return;
  const fps = 1 / Math.max(dt, 1e-4);
  emaFps += (fps - emaFps) * Math.min(1, dt * 0.5);
  if (emaFps < 50) {
    lowTime += dt;
    highTime = 0;
  } else if (emaFps > 58) {
    highTime += dt;
    lowTime = 0;
  } else {
    lowTime = 0;
    highTime = 0;
  }
  if (lowTime > 2 && tier < TIERS.length - 1) {
    applyTier(tier + 1);
    lowTime = 0;
    highTime = 0;
  } else if (highTime > 8 && tier > 0) {
    applyTier(tier - 1);
    lowTime = 0;
    highTime = 0;
  }
}
