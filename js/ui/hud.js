// Minimal debug HUD: FPS meter, live band meters, source controls, heat slider.
// Toggle with H.
let fpsEl, panelEl, meterFills = {};
let frames = 0, lastFpsT = 0, fps = 0;
let visible = true;
let beatDot, secLabel, srcNameEl, lineSelect, fileInput;

export function initHUD() {
  const hud = document.getElementById('hud');
  fpsEl = document.createElement('div');
  fpsEl.textContent = '-- fps';
  hud.appendChild(fpsEl);

  panelEl = document.createElement('div');
  panelEl.className = 'panel';
  panelEl.innerHTML = `
    <div class="meter"><label>SUB</label><div class="bar"><div class="fill" id="m-sub"></div></div></div>
    <div class="meter"><label>MID</label><div class="bar"><div class="fill" id="m-mid"></div></div></div>
    <div class="meter"><label>HIGH</label><div class="bar"><div class="fill" id="m-high"></div></div></div>
    <div class="meter"><label>HEAT</label><input type="range" id="heat-slider" min="0" max="1" step="0.01" value="0.25"></div>
    <div class="meter"><label>SRC</label><button id="src-file">FILE</button><button id="src-mic">MIC</button><button id="src-stop">STOP</button></div>
    <div class="meter"><label>DEMO</label><select id="demo-select"><option value="">-- pick --</option></select><span id="beat-dot">●</span></div>
    <div class="meter"><label>LINE</label><select id="src-line"><option value="">-- select --</option></select></div>
    <div class="meter"><label>SPIN</label><button id="spin-toggle">ON</button></div>
    <div class="meter"><label>SWAY</label><button id="sway-toggle">ON</button></div>
    <div class="meter"><label>CRT</label><button id="crt-toggle">OFF</button></div>
    <div class="meter"><label>FX</label><button id="fx-shockwaves">RINGS</button><button id="fx-punch">PUNCH</button><button id="fx-sun">SUN</button></div>
    <div class="meter"><label>QUALITY</label><select id="quality-select"><option value="auto">AUTO</option><option value="high">HIGH</option><option value="med">MED</option><option value="low">LOW</option></select></div>
    <div class="hint">[H] hud &nbsp; [T] spin &nbsp; [C] crt &nbsp; [?] help &nbsp; <span id="src-name">no source</span> &nbsp;·&nbsp; <span id="sec-label">verse</span></div>
  `;
  hud.appendChild(panelEl);
  for (const k of ['sub', 'mid', 'high']) {
    meterFills[k] = panelEl.querySelector('#m-' + k);
  }
  beatDot = panelEl.querySelector('#beat-dot');
  secLabel = panelEl.querySelector('#sec-label');
  srcNameEl = panelEl.querySelector('#src-name');
  lineSelect = panelEl.querySelector('#src-line');

  fileInput = document.createElement('input');
  fileInput.type = 'file';
  fileInput.accept = 'audio/*';
  fileInput.style.display = 'none';
  document.body.appendChild(fileInput);
}

// Source-control elements for main.js to wire to the audio engine.
export function getSourceUI() {
  return {
    fileBtn: panelEl.querySelector('#src-file'),
    micBtn: panelEl.querySelector('#src-mic'),
    stopBtn: panelEl.querySelector('#src-stop'),
    demoSelect: panelEl.querySelector('#demo-select'),
    lineSelect,
    fileInput,
  };
}

export async function refreshLineInputs(listInputDevices) {
  try {
    const devs = await listInputDevices();
    const cur = lineSelect.value;
    lineSelect.innerHTML = '<option value="">-- select --</option>';
    devs.forEach((d, i) => {
      const o = document.createElement('option');
      o.value = d.deviceId;
      o.textContent = d.label || `input ${i + 1}`;
      lineSelect.appendChild(o);
    });
    lineSelect.value = cur;
  } catch (_) { /* enumerateDevices unavailable */ }
}

export function setSourceName(name) {
  if (srcNameEl) srcNameEl.textContent = name;
}

export function toggleHUD() {
  visible = !visible;
  panelEl.classList.toggle('hidden', !visible);
}

export function updateHUD(dt, audioState) {
  frames++;
  const now = performance.now();
  if (now - lastFpsT >= 500) {
    fps = Math.round(frames * 1000 / (now - lastFpsT));
    frames = 0;
    lastFpsT = now;
    fpsEl.textContent = fps + ' fps';
    fpsEl.style.color = fps >= 55 ? '#8affff' : fps >= 30 ? '#ff9a3c' : '#ff2a6a';
  }
  meterFills.sub.style.width = (audioState.sub * 100).toFixed(0) + '%';
  meterFills.mid.style.width = (audioState.mid * 100).toFixed(0) + '%';
  meterFills.high.style.width = (audioState.high * 100).toFixed(0) + '%';
  // Beat indicator flashes on kick onsets; section label follows the detector.
  beatDot.style.opacity = (0.25 + audioState.kick * 0.75).toFixed(2);
  beatDot.style.color = audioState.kick > 0.5 ? '#ff2a6a' : '#5a5a8a';
  if (secLabel.textContent !== audioState.section) {
    secLabel.textContent = audioState.section;
  }
}
