// Minimal debug HUD: FPS meter, fake band meters, heat slider. Toggle with H.
let fpsEl, panelEl, meterFills = {};
let frames = 0, lastFpsT = 0, fps = 0;
let visible = true;

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
    <div class="meter"><label>SPIN</label><button id="spin-toggle">ON</button></div>
    <div class="hint">[H] hud &nbsp; [T] spin &nbsp; audio: fake (step 8)</div>
  `;
  hud.appendChild(panelEl);
  for (const k of ['sub', 'mid', 'high']) {
    meterFills[k] = panelEl.querySelector('#m-' + k);
  }
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
}
