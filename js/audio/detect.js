// Onset detection: spectral flux on band-limited spectra with adaptive
// thresholds, plus an energy envelope → verse/build/drop section classifier.
// All state is per-detector; engine owns one instance.
export function createDetector(bins) {
  const subLen = bins.subHi - bins.subLo + 1;
  const snrLen = bins.snrHi - bins.snrLo + 1;
  const midLen = bins.midHi - bins.midLo + 1;
  let prevSub = new Float32Array(subLen);
  let prevSnr = new Float32Array(snrLen);
  let avgFluxKick = 0.05, avgFluxSnr = 0.05;
  let coolKick = 0, coolSnr = 0;
  let kick = 0, snare = 0, energy = 0, energyPeak = 0.02;
  let prevFk = 0, prevFs = 0; // step 21: onset sharpness (impulsive vs swelling)
  // Section state: intensity relative to the track's own recent baseline.
  let inst = 0, slow = 0, secInit = false;
  const instHist = new Float32Array(45); // step 21: ~0.75s of inst, for drop-slope
  let histN = 0;
  let section = 'verse', pendingSection = 'verse', pendingT = 0;
  const dbg = { fk: 0, fs: 0 };

  function flux(data, lo, prev) {
    let f = 0;
    for (let i = 0; i < prev.length; i++) {
      const v = data[lo + i] / 255;
      const d = v - prev[i];
      if (d > 0) f += d;
      prev[i] = v;
    }
    return f / prev.length;
  }

  function bandMean(data, lo, len) {
    let s = 0;
    for (let i = 0; i < len; i++) s += data[lo + i];
    return s / len / 255;
  }

  function update(data, dt, out) {
    // --- onsets ---
    const fk = flux(data, bins.subLo, prevSub);
    const fs = flux(data, bins.snrLo, prevSnr);
    dbg.fk = fk; // step 21: tuning hook — last frame's flux magnitudes
    dbg.fs = fs;
    avgFluxKick += (fk - avgFluxKick) * 0.02;
    avgFluxSnr += (fs - avgFluxSnr) * 0.02;
    coolKick -= dt;
    coolSnr -= dt;
    // Sharpness gate: a real drum onset is impulsive (flux jumps many-fold in
    // one frame); evolving pads/basses creep up gradually and must not pass.
    // The gate only matters when the absolute floor dominates (quiet/sparse
    // passages) — on dense tracks the adaptive threshold already rules.
    const sharpKick = fk > prevFk * 2.5 + 0.02;
    const sharpSnr = fs > prevFs * 2.5 + 0.02;
    prevFk = fk;
    prevFs = fs;
    if (fk > Math.max(0.12, avgFluxKick * 2.2) && sharpKick && coolKick <= 0) {
      // Sub-dominance: a real kick concentrates energy in the sub band.
      // Phantom flux from broadband leakage/beating has the mids as loud
      // or louder (measured: kicks 1.2-1.8x, phantoms 0.5x).
      const subLevel = bandMean(data, bins.subLo, subLen);
      const midLevel = bandMean(data, bins.midLo, midLen);
      if (subLevel > midLevel * 0.95) {
        kick = 1;
        coolKick = 0.14;
      }
    }
    if (fs > Math.max(0.10, avgFluxSnr * 2.0) && sharpSnr && coolSnr <= 0) {
      snare = 1;
      coolSnr = 0.09;
    }
    kick *= Math.exp(-dt * 9);
    snare *= Math.exp(-dt * 13);

    // --- energy: mean spectrum, AGC-normalized, smoothed ---
    let sum = 0;
    for (let i = 0; i < data.length; i++) sum += data[i];
    const raw = sum / data.length / 255;
    energyPeak = Math.max(raw, energyPeak * 0.99, 0.02);
    const target = Math.min(1, raw / energyPeak);
    energy += (target - energy) * (target > energy ? 0.4 : 0.06);

    // --- section: intensity vs. the track's own recent baseline ---
    // inst follows the moment (~0.2s); slow follows the baseline with an
    // asymmetric response — quick to follow falls (~4s), very slow to chase
    // rises (~30s) — so a sustained drop keeps reading as a drop instead of
    // becoming the new normal. The old AGC-based classifier saturated near
    // 1.0 for every track and reported permanent drop; ratios stay truthful.
    if (!secInit) {
      inst = raw;
      slow = raw;
      secInit = true;
    }
    inst += (raw - inst) * 0.09;
    slow += (raw - slow) * (raw < slow ? 0.004 : 0.0005);
    instHist[histN % 45] = inst;
    histN++;
    // slope45: how much has the moment-level risen over the last ~0.75s?
    // Catches hard drop entries (crash + full band) even when the baseline
    // has partly adapted during a long build.
    const past = instHist[(histN - 45 + 90) % 45] || inst;
    const slope = histN >= 45 ? (inst - past) / Math.max(past, 1e-3) : 0;
    const ratio = inst / Math.max(slow, 1e-3);
    const audible = raw > 0.05; // silence is verse, never a drop
    // Hysteresis: entering a hotter section takes more evidence than staying
    // in it, so boundary wobble doesn't flicker the grade.
    const dropHit = audible && (ratio > 1.35 || slope > 0.22);
    const dropHold = audible && (ratio > 1.20 || slope > 0.15);
    const buildHit = audible && ratio > 1.10;
    const buildHold = audible && ratio > 1.05;
    let cand;
    if (section === 'drop') cand = dropHold ? 'drop' : buildHold ? 'build' : 'verse';
    else if (section === 'build') cand = dropHit ? 'drop' : buildHold ? 'build' : 'verse';
    else cand = dropHit ? 'drop' : buildHit ? 'build' : 'verse';
    if (cand !== section) {
      if (cand !== pendingSection) {
        pendingSection = cand;
        pendingT = 0;
      }
      pendingT += dt;
      if (pendingT > 0.8) {
        section = cand;
        pendingT = 0;
      }
    } else {
      pendingSection = section;
      pendingT = 0;
    }

    out.kick = kick;
    out.snare = snare;
    out.energy = energy;
    out.section = section;
  }

  function reset() {
    prevSub = new Float32Array(subLen);
    prevSnr = new Float32Array(snrLen);
    avgFluxKick = 0.05;
    avgFluxSnr = 0.05;
    coolKick = 0;
    coolSnr = 0;
    kick = 0;
    snare = 0;
    energy = 0;
    energyPeak = 0.02;
    prevFk = 0;
    prevFs = 0;
    inst = 0;
    slow = 0;
    secInit = false;
    instHist.fill(0);
    histN = 0;
    section = 'verse';
    pendingSection = 'verse';
    pendingT = 0;
  }

  return { update, reset, dbg };
}
