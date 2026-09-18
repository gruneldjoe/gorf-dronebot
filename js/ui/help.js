// Step 19: help overlay — SNES field-manual styling, toggled with ?.
let root = null;
let shown = false;

const ROWS = [
  ['SPACE', 'manual eruption'],
  ['C', 'CRT monitor on/off'],
  ['H', 'HUD on/off'],
  ['F', 'fullscreen'],
  ['1 – 9, 0', 'demo tracks 1 – 10'],
  ['T', 'turntable spin on/off'],
  ['?', 'this manual'],
  ['M', 'MIDI learn: ERUPT (shift+click any TRIG button to learn it)'],
  ['R', 'record .webm clip (HUD REC button; 1080p checkbox for export size)'],
  ['TRIG', 'ERUPT fires the drop-shatter · PUNCH camera punch · PAL cycles palette · CRT toggles scanlines'],
  ['P', 'performance mode: fullscreen ritual, every pixel of UI hidden'],
  ['O', 'photo mode: freeze frame + hi-res still download'],
  ['G', 'GIF burst: 6-second looped capture'],
  ['B', 'bullet-time: brief slow-mo (buffer sources pitch-drop too)'],
  ['X', 'detonate OVERDRIVE early (fills with room energy)'],
  ['MODE', 'KEY = palette follows the music · CROWD = audience raises HEAT · DIR = auto-director cuts · DUEL = second mech battles for the right channel'],
  ['MECH', 'cycle mech chassis: ghost / scout / brute / seraph'],
  ['LIB', 'personal track library: ADD audio files, SET saves the current palette + HEAT as the track preset'],
  ['9:16', 'REC checkbox: vertical crop for Shorts/TikTok'],
];

export function initHelp() {
  root = document.createElement('div');
  root.id = 'help';
  root.className = 'hidden';
  root.innerHTML = `
    <div class="help-card">
      <div class="help-title">FIELD MANUAL</div>
      <div class="help-sub">GORF DRONEBOT · UNIT 07</div>
      ${ROWS.map(([k, d]) => `<div class="help-row"><span class="help-key">${k}</span><span>${d}</span></div>`).join('')}
      <div class="help-foot">PRESS ? TO CLOSE</div>
    </div>
  `;
  document.body.appendChild(root);
}

export function toggleHelp() {
  shown = !shown;
  root.classList.toggle('hidden', !shown);
}

export function isHelpOpen() {
  return shown;
}
