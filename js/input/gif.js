// R22: GIF burst — minimal GIF89a encoder. Fixed 3-3-2 (256-color) global
// palette (no quantization pass needed), LZW compression, NETSCAPE loop.
// encodeGif(frames, w, h, delayCs) is pure and node-testable; captureGif
// grabs frames from a live canvas in the browser.

function lzwCompress(pixels, minCodeSize) {
  const clearCode = 1 << minCodeSize;
  const eoiCode = clearCode + 1;
  const out = [];
  let codeSize = minCodeSize + 1;
  let bitBuf = 0, bitCount = 0;
  const emit = (code) => {
    bitBuf |= code << bitCount;
    bitCount += codeSize;
    while (bitCount >= 8) { out.push(bitBuf & 0xff); bitBuf >>>= 8; bitCount -= 8; }
  };
  const dict = new Map();
  const resetDict = () => {
    dict.clear();
    for (let i = 0; i < clearCode; i++) dict.set(i, i);
    codeSize = minCodeSize + 1;
  };
  resetDict();
  emit(clearCode);
  let prefix = pixels[0];
  let nextCode = eoiCode + 1;
  for (let i = 1; i < pixels.length; i++) {
    const k = pixels[i];
    // Pair keys live above the single-pixel key space (0..clearCode-1) so
    // prefix=0 can never collide with a literal pixel entry.
    const key = prefix * 256 + k + clearCode;
    if (dict.has(key)) {
      prefix = dict.get(key);
    } else {
      emit(prefix);
      if (nextCode < 4096) {
        dict.set(key, nextCode);
        nextCode++;
        if (nextCode > (1 << codeSize) && codeSize < 12) codeSize++;
      } else {
        emit(clearCode); // table full — reset mid-stream
        resetDict();
        nextCode = eoiCode + 1;
      }
      prefix = k;
    }
  }
  emit(prefix);
  emit(eoiCode);
  if (bitCount > 0) out.push(bitBuf & 0xff);
  return out;
}

// 3-3-2 RGB → index; global table entry i → 24-bit color.
export function rgbTo332(r, g, b) {
  return ((r >> 5) << 5) | ((g >> 5) << 2) | (b >> 6);
}
function table332() {
  const t = new Uint8Array(768);
  for (let i = 0; i < 256; i++) {
    t[i * 3] = Math.round(((i >> 5) & 7) * 255 / 7);
    t[i * 3 + 1] = Math.round(((i >> 2) & 7) * 255 / 7);
    t[i * 3 + 2] = Math.round((i & 3) * 255 / 3);
  }
  return t;
}

function u16(v) { return [v & 0xff, (v >> 8) & 0xff]; }

// frames: Array<Uint8Array> of 3-3-2 indices, w*h each. delayCs: 1/100s.
export function encodeGif(frames, w, h, delayCs) {
  const bytes = [];
  const push = (...b) => bytes.push(...b);
  push(0x47, 0x49, 0x46, 0x38, 0x39, 0x61); // GIF89a
  push(...u16(w), ...u16(h), 0xf7, 0x00, 0x00); // LSD: GCT=1, 8-bit, 256 colors
  push(...table332()); // global color table
  // NETSCAPE2.0 — loop forever
  push(0x21, 0xff, 0x0b);
  push(...[0x4e, 0x45, 0x54, 0x53, 0x43, 0x41, 0x50, 0x45, 0x32, 0x2e, 0x30].map((c) => c));
  push(0x03, 0x01, 0x00, 0x00, 0x00);
  for (const frame of frames) {
    // Graphic control extension: disposal=2 (restore bg), delay
    push(0x21, 0xf9, 0x04, 0x08, ...u16(delayCs), 0x00, 0x00);
    // Image descriptor: no local table
    push(0x2c, ...u16(0), ...u16(0), ...u16(w), ...u16(h), 0x00);
    const minCodeSize = 8;
    const data = lzwCompress(frame, minCodeSize);
    push(minCodeSize);
    for (let i = 0; i < data.length; i += 255) {
      const chunk = data.slice(i, i + 255);
      push(chunk.length, ...chunk);
    }
    push(0x00); // data terminator
  }
  push(0x3b); // trailer
  return new Uint8Array(bytes);
}

// Browser: grab `seconds` of frames from a canvas, encode, hand back a Blob.
export function captureGif({ canvas, seconds = 6, fps = 12, width = 320, onDone }) {
  const scale = width / canvas.width;
  const w = width;
  const h = Math.max(2, Math.round(canvas.height * scale));
  const off = document.createElement('canvas');
  off.width = w;
  off.height = h;
  const g = off.getContext('2d', { willReadFrequently: true });
  const frames = [];
  const total = Math.round(seconds * fps);
  let n = 0;
  const timer = setInterval(() => {
    g.drawImage(canvas, 0, 0, w, h);
    const d = g.getImageData(0, 0, w, h).data;
    const idx = new Uint8Array(w * h);
    for (let i = 0; i < w * h; i++) {
      idx[i] = rgbTo332(d[i * 4], d[i * 4 + 1], d[i * 4 + 2]);
    }
    frames.push(idx);
    if (++n >= total) {
      clearInterval(timer);
      // Encode off the critical path — 72 small frames is fast, but yield anyway.
      setTimeout(() => {
        const gif = encodeGif(frames, w, h, Math.round(100 / fps));
        const blob = new Blob([gif.buffer], { type: 'image/gif' });
        if (onDone) onDone(blob);
      }, 30);
    }
  }, 1000 / fps);
}
