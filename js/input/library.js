// R18: personal track library — audio blobs + per-track visual presets,
// persisted in IndexedDB. { id, name, addedAt, blob, palette, heat, art }.

const DB = 'gorf-library';
const STORE = 'tracks';
const VER = 1;

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, VER);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(STORE, { keyPath: 'id', autoIncrement: true });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function tx(db, mode, fn) {
  return new Promise((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const req = fn(t.objectStore(STORE));
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function addFiles(files) {
  const db = await openDb();
  const added = [];
  for (const f of files) {
    if (!f.type.startsWith('audio/') && !/\.(mp3|ogg|wav|m4a|flac)$/i.test(f.name)) continue;
    const id = await tx(db, 'readwrite', (s) => s.add({
      name: f.name.replace(/\.[^.]+$/, '').slice(0, 40),
      addedAt: Date.now(),
      blob: f,
      palette: null, // null = current palette at play time
      heat: null,
      art: null,
    }));
    added.push({ id, name: f.name });
  }
  db.close();
  return added;
}

export async function listTracks() {
  const db = await openDb();
  const all = await tx(db, 'readonly', (s) => s.getAll());
  db.close();
  return all
    .sort((a, b) => a.addedAt - b.addedAt)
    .map(({ id, name, palette, heat }) => ({ id, name, palette, heat }));
}

export async function getTrack(id) {
  const db = await openDb();
  const rec = await tx(db, 'readonly', (s) => s.get(id));
  db.close();
  return rec || null;
}

export async function updatePreset(id, { palette, heat }) {
  const db = await openDb();
  const rec = await tx(db, 'readonly', (s) => s.get(id));
  if (rec) {
    rec.palette = palette;
    rec.heat = heat;
    await tx(db, 'readwrite', (s) => s.put(rec));
  }
  db.close();
}

export async function deleteTrack(id) {
  const db = await openDb();
  await tx(db, 'readwrite', (s) => s.delete(id));
  db.close();
}
