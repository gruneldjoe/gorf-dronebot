import * as THREE from 'three';

// Area-weighted surface sampler: pick random points uniformly distributed
// over a set of transformed geometries.
const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _c = new THREE.Vector3();

export class SurfaceSampler {
  constructor() {
    this.parts = [];
    this.totalArea = 0;
    this._scratch = new Float32Array(3);
  }

  add(geometry, matrix) {
    const g = geometry.index ? geometry.toNonIndexed() : geometry;
    const pos = g.attributes.position;
    const triCount = Math.floor(pos.count / 3);
    const cum = new Float32Array(triCount);
    let run = 0;
    for (let i = 0; i < triCount; i++) {
      _a.fromBufferAttribute(pos, i * 3);
      _b.fromBufferAttribute(pos, i * 3 + 1);
      _c.fromBufferAttribute(pos, i * 3 + 2);
      // _b,_c become edge vectors; area = |ab x ac| / 2
      const area = _b.sub(_a).cross(_c.sub(_a)).length() * 0.5;
      run += area;
      cum[i] = run;
    }
    this.parts.push({ pos, cum, triCount, total: run, matrix: matrix.clone() });
    this.totalArea += run;
  }

  _pickTriangle(part, r) {
    const cum = part.cum;
    let lo = 0, hi = part.triCount - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (cum[mid] < r) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  }

  _sampleInto(part, out, offset) {
    const t = this._pickTriangle(part, Math.random() * part.total);
    _a.fromBufferAttribute(part.pos, t * 3);
    _b.fromBufferAttribute(part.pos, t * 3 + 1);
    _c.fromBufferAttribute(part.pos, t * 3 + 2);
    let u = Math.random(), v = Math.random();
    if (u + v > 1) { u = 1 - u; v = 1 - v; }
    const w = 1 - u - v;
    _a.multiplyScalar(w).addScaledVector(_b, u).addScaledVector(_c, v);
    _a.applyMatrix4(part.matrix);
    out[offset * 3] = _a.x;
    out[offset * 3 + 1] = _a.y;
    out[offset * 3 + 2] = _a.z;
  }

  // Fill `out` (Float32Array) at point index `offset`, in the space of the
  // matrices passed to add().
  sample(out, offset) {
    let r = Math.random() * this.totalArea;
    for (const part of this.parts) {
      if (r < part.total) { this._sampleInto(part, out, offset); return; }
      r -= part.total;
    }
    this._sampleInto(this.parts[this.parts.length - 1], out, offset);
  }

  sampleToVector(v) {
    this.sample(this._scratch, 0);
    return v.set(this._scratch[0], this._scratch[1], this._scratch[2]);
  }
}
