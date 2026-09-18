// Step 14: SNES title screen — PRESS START → menu → visualizer.
// Menu selection is the browser audio gesture (the AudioContext starts
// inside the click handler). The 3D scene idles behind the whole time.
// Step 15: track list comes from DEMO_TRACKS (single source of truth).
import { DEMO_TRACKS } from '../audio/engine.js';

let root, menuEl, rows = [], selIdx = 0, mode = 'press'; // press | menu | hidden
let cb = {};

function rowDefs() {
  return [
    ...DEMO_TRACKS.map((t) => ({
      label: t.label,
      sub: `${t.bpm} BPM · ${t.vibe}`,
      act: () => cb.onDemo(t.n),
    })),
    { label: 'AUDIO FILE', sub: 'pick from disk', act: () => cb.onFile() },
    { label: 'MIC IN', sub: 'live microphone', act: () => cb.onMic() },
    { label: 'LINE IN', sub: 'choose device in HUD', act: () => cb.onLine() },
    {
      label: () => 'CRT: ' + (cb.isCrtOn() ? 'ON' : 'OFF'),
      sub: 'retro monitor',
      act: () => { cb.onToggleCrt(); render(); },
    },
  ];
}

function render() {
  menuEl.innerHTML = rows.map((r, i) => {
    const label = typeof r.label === 'function' ? r.label() : r.label;
    return `<div class="tm-row${i === selIdx ? ' sel' : ''}" data-i="${i}">${label}<span class="sub">${r.sub}</span></div>`;
  }).join('');
}

function toMenu() {
  mode = 'menu';
  root.querySelector('.press-start').classList.add('hidden');
  menuEl.classList.remove('hidden');
  render();
}

function activate() {
  rows[selIdx].act();
}

export function initTitle(callbacks) {
  cb = callbacks;
  root = document.getElementById('title');
  root.innerHTML = `
    <div class="title-logo">GORF<br>DRONEBOT</div>
    <div class="title-sub">WIRE-FRAME GHOST UNIT 07</div>
    <div class="press-start">PRESS START</div>
    <div class="title-menu hidden"></div>
    <div class="title-foot">© 2026 GORF SYSTEMS · HEADPHONES RECOMMENDED</div>
  `;
  menuEl = root.querySelector('.title-menu');
  rows = rowDefs();
  render();

  root.addEventListener('click', (e) => {
    if (mode === 'press') { toMenu(); return; }
    if (mode !== 'menu') return;
    const rowEl = e.target.closest('.tm-row');
    if (rowEl) { selIdx = parseInt(rowEl.dataset.i, 10); activate(); }
  });
  menuEl.addEventListener('mousemove', (e) => {
    const rowEl = e.target.closest('.tm-row');
    if (rowEl) {
      const i = parseInt(rowEl.dataset.i, 10);
      if (i !== selIdx) { selIdx = i; render(); }
    }
  });
  window.addEventListener('keydown', (e) => {
    if (mode === 'hidden') return;
    if (mode === 'press') {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toMenu(); }
      return;
    }
    if (e.key === 'ArrowDown') { selIdx = (selIdx + 1) % rows.length; render(); e.preventDefault(); }
    else if (e.key === 'ArrowUp') { selIdx = (selIdx + rows.length - 1) % rows.length; render(); e.preventDefault(); }
    else if (e.key === 'Enter' || e.key === ' ') { activate(); e.preventDefault(); }
    else if (e.key >= '1' && e.key <= '4') { selIdx = parseInt(e.key, 10) - 1; activate(); }
  });
}

export function dismissTitle() {
  if (mode === 'hidden') return;
  mode = 'hidden';
  root.classList.add('hidden');
  if (cb.onDismiss) cb.onDismiss();
}

export function isTitleUp() { return mode !== 'hidden'; }
