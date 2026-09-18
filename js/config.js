// All tunables live here. No magic numbers in modules.
export const CONFIG = {
  camera: {
    fov: 55,
    near: 0.1,
    far: 1200,
    pos: [0, 3.4, 15],
    lookAt: [0, 3.0, 0],
  },
  palette: {
    // Bot: near-black gunmetal so fire reads hard against it (locked call)
    bot: 0x0b0b10,
    // Fire: white-orange-magenta
    fireCore: 0xfff3d6,
    fireMid: 0xff9a3c,
    fireEdge: 0xff2a6a,
    // Cyan reserved for wireframe accents / eyes / verse sections
    cyan: 0x2affff,
    // Sky
    skyTop: 0x05051a,
    skyHorizon: 0x141448,
    skyHorizonHot: 0x4a1440,
    // Sun
    sunCore: 0xffe9b8,
    sunGlow: 0xff6a3c,
    // Floor grid: cool (verse) -> hot (drop)
    floorCool: 0x2affff,
    floorHot: 0xff2a6a,
    floorBase: 0x020208,
    fog: 0x05051a,
  },
  sky: {
    radius: 900,
  },
  sun: {
    size: 90,
    pos: [0, 26, -420],
    pulseAmount: 0.18,
  },
  parallax: {
    layers: [
      // { speed, y, z, width, height, color, kind }
      { speed: 1.2, y: 26, z: -380, width: 900, height: 90, color: '#1a1a4e', kind: 'ridge', seed: 11 },
      { speed: 2.6, y: 16, z: -300, width: 900, height: 70, color: '#0d0d2b', kind: 'city', seed: 42 },
    ],
  },
  floor: {
    size: 600,
    gridScale: 3.0,
    scrollSpeed: 7.0,
    fadeK: 0.012,
    lineIntensity: 1.4,
  },
  robot: {
    pos: [0, 0, 0],
    turntable: true,       // slow model turntable (review aid; camera step decides final)
    turntableSpeed: 0.25,
    pointCount: 6000,      // ghost point cloud
    pointSize: 0.5,
    wireOpacity: 0.85,
    eyeSize: 2.4,          // never-dispersing eye points
    eyeColor: 0xff7a2a,
    disperse: 3.2,         // how high dispersed points rise
    coherenceDecay: 1.5,   // step 9: coherence falloff per second between kicks
    swayGain: 0.10,        // step 9: mid-driven sway amplitude scale
  },
  embers: {
    count: 700,
    size: [0.25, 0.65],
    life: [0.8, 2.2],      // seconds
    rise: [1.5, 3.5],      // initial upward velocity
    spread: 0.9,           // lateral velocity
  },
};
