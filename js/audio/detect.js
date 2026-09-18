// Onset detection: spectral flux on band-limited spectra with adaptive
// thresholds, plus an energy envelope → verse/build/drop section classifier.
// All state is per-detector; engine owns one instance.
export function createDetector(bins) {
  const subLen = bins.subHi - bins.subLo + 1;
  const snrLen = bins.snrHi - bins.snrLo + 1;
  let prevSub = new Float32Array(subLen);
  let prevSnr = new Float32Array(snrLen);
  let avgFluxKick = 0.05, avgFluxSnr = 0.05;
  let coolKick = 0, coolSnr = 0;
  let kick = 0, snare = 0, energy = 0, energyPeak = 0.02;
  let hist = [];
  let section = 'verse', pendingSection = 'verse', pendingT = 0;

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

  function avgTail(arr, n) {
    const m = Math.min(n, arr.length);
    if (!m) return 0;
    let s = 0;
    for (let i = arr.length - m; i < arr.length; i++) s += arr[i];
    return s / m;
  }

  function update(data, dt, out) {
    // --- onsets ---
    const fk = flux(data, bins.subLo, prevSub);
    const fs = flux(data, bins.snrLo, prevSnr);
    avgFluxKick += (fk - avgFluxKick) * 0.02;
    avgFluxSnr += (fs - avgFluxSnr) * 0.02;
    coolKick -= dt;
    coolSnr -= dt;
    if (fk > Math.max(0.12, avgFluxKick * 2.2) && coolKick <= 0) {
      kick = 1;
      coolKick = 0.14;
    }
    if (fs > Math.max(0.10, avgFluxSnr * 2.0) && coolSnr <= 0) {
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

    // --- section: envelope level + slope, with hysteresis ---
    hist.push(energy);
    if (hist.length > 240) hist.shift();
    const short = avgTail(hist, 30);   // ~0.5s
    const long = avgTail(hist, 180);   // ~3s
    const cand = short > 0.6 ? 'drop'
      : (short - long > 0.10 ? 'build' : 'verse');
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
    hist = [];
    section = 'verse';
    pendingSection = 'verse';
    pendingT = 0;
  }

  return { update, reset };
}
