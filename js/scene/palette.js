// Palette system (step 17): named color variants + a registry of live
// THREE.Color objects. Modules register their colors at init with
// registerPaletteColor(key, color); applyPalette/cyclePalette then re-tints
// every registered color in place — no material rebuilds.
import { CONFIG } from '../config.js';

const P = CONFIG.palette;

export const PALETTES = {
  // Default: the locked inferno look (snapshot of config at load).
  inferno: { ...P },
  // Acid green fire, violet accents.
  toxic: {
    bot: 0x0a0f08,
    fireCore: 0xf2ffd6, fireMid: 0x9dff3c, fireEdge: 0x2aff5a,
    cyan: 0xc44dff,
    skyTop: 0x031007, skyHorizon: 0x0a2a14, skyHorizonHot: 0x2a4a10,
    sunCore: 0xeaffb8, sunGlow: 0x6aff3c,
    floorCool: 0x9dff3c, floorHot: 0x2aff5a, floorBase: 0x020604,
    fog: 0x031007,
  },
  // Ice-blue fire, warm orange accent (inversion of the default).
  glacier: {
    bot: 0x0a0d12,
    fireCore: 0xffffff, fireMid: 0x7ad9ff, fireEdge: 0x2a6aff,
    cyan: 0xff9a3c,
    skyTop: 0x030812, skyHorizon: 0x0a1a3a, skyHorizonHot: 0x1a3a6a,
    sunCore: 0xeaf6ff, sunGlow: 0x7ad9ff,
    floorCool: 0x7ad9ff, floorHot: 0x2a6aff, floorBase: 0x02040a,
    fog: 0x030812,
  },
  // Purple haze: magenta fire, teal accent.
  ultraviolet: {
    bot: 0x0d0a12,
    fireCore: 0xffe9ff, fireMid: 0xff7ad9, fireEdge: 0xb42aff,
    cyan: 0x2affd9,
    skyTop: 0x0d0518, skyHorizon: 0x240a44, skyHorizonHot: 0x4a1060,
    sunCore: 0xffe9ff, sunGlow: 0xff5ac8,
    floorCool: 0xb42aff, floorHot: 0xff2ad9, floorBase: 0x08020e,
    fog: 0x0d0518,
  },
};

export const PALETTE_ORDER = ['inferno', 'toxic', 'glacier', 'ultraviolet'];

const registry = []; // { key, color }
let current = 'inferno';

export function registerPaletteColor(key, color) {
  registry.push({ key, color });
  return color;
}

export function applyPalette(name) {
  const pal = PALETTES[name];
  if (!pal) return current;
  for (const { key, color } of registry) {
    if (pal[key] !== undefined) color.setHex(pal[key]);
  }
  current = name;
  return current;
}

export function cyclePalette() {
  const next = PALETTE_ORDER[(PALETTE_ORDER.indexOf(current) + 1) % PALETTE_ORDER.length];
  return applyPalette(next);
}

export function currentPalette() {
  return current;
}
