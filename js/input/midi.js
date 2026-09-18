// Step 17 — MIDI input: Dan's DDJ-FLX10 can trigger the fire.
// Web MIDI device list + learn mode (shift+click a trigger in the HUD, then
// move a knob / hit a pad). Note-ons and CCs (>= 64) fire the bound action.
// Bindings persist in localStorage.

export const MIDI_ACTIONS = ['erupt', 'punch', 'palette', 'crt'];

const STORE_KEY = 'gorf.midi.bindings.v1';

let access = null;
let bindings = {};   // actionId -> { type: 'note'|'cc', channel, key }
let learnAction = null;
let onTrigger = null;
let onStatus = null; // (text) -> HUD status line
let onDevices = null; // (names[]) -> device select

try {
  bindings = JSON.parse(localStorage.getItem(STORE_KEY) || '{}');
} catch (_) { bindings = {}; }

function save() {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(bindings)); } catch (_) {}
}

function matches(b, type, channel, key) {
  return b && b.type === type && b.channel === channel && b.key === key;
}

function boundAction(type, channel, key) {
  for (const a of MIDI_ACTIONS) {
    if (matches(bindings[a], type, channel, key)) return a;
  }
  return null;
}

function describe(b) {
  if (!b) return '—';
  const ch = b.channel + 1;
  return b.type === 'note' ? `note ${b.key} ch${ch}` : `CC ${b.key} ch${ch}`;
}

export function getBinding(action) { return bindings[action] || null; }
export function describeBinding(action) { return describe(bindings[action]); }

export function clearBindings() {
  bindings = {};
  save();
  if (onStatus) onStatus('bindings cleared');
}

export function armLearn(action) {
  learnAction = action;
  if (onStatus) onStatus(`learn: ${action} — move a knob / hit a pad… (shift+click again to cancel)`);
}

export function cancelLearn() {
  learnAction = null;
  if (onStatus) onStatus('learn cancelled');
}

export function isLearning(action) { return learnAction === action; }

function handleMessage(e) {
  const [status, d1, d2] = e.data;
  const type = status & 0xf0;
  const channel = status & 0x0f;
  let kind = null;
  if (type === 0x90 && d2 > 0) kind = 'note';       // note on
  else if (type === 0xb0 && d2 >= 64) kind = 'cc';  // CC, button-style
  if (!kind) return;

  if (learnAction) {
    bindings[learnAction] = { type: kind, channel, key: d1 };
    save();
    if (onStatus) onStatus(`${learnAction} ← ${describe(bindings[learnAction])}`);
    learnAction = null;
    return;
  }

  const action = boundAction(kind, channel, d1);
  if (action && onTrigger) onTrigger(action, { type: kind, channel, key: d1 });
}

function attachInputs() {
  if (!access) return;
  const names = [];
  for (const input of access.inputs.values()) {
    names.push(input.name || 'unnamed device');
    input.onmidimessage = handleMessage;
  }
  if (onDevices) onDevices(names);
  if (onStatus) {
    onStatus(names.length ? `${names.length} MIDI in: ${names[0]}` : 'no MIDI inputs found');
  }
}

export async function initMidi({ onTrigger: trig, onStatus: stat, onDevices: devs }) {
  onTrigger = trig;
  onStatus = stat;
  onDevices = devs;

  if (!navigator.requestMIDIAccess) {
    if (onStatus) onStatus('Web MIDI not supported in this browser');
    return false;
  }
  try {
    access = await navigator.requestMIDIAccess();
  } catch (err) {
    if (onStatus) onStatus('MIDI access denied');
    return false;
  }
  access.onstatechange = attachInputs;
  attachInputs();
  return true;
}
