/* Clavis — penyimpanan di perangkat (IndexedDB) dan keadaan app.
   Semua data utama ada di satu objek `state`; naskah draft disimpan terpisah per proyek
   karena bisa besar. Setiap perubahan memanggil save(), yang menyimpan dan memberi kabar
   ke tampilan, sinkron Drive, dan jembatan One for All. */
import { uid, debounce } from './util.js';

const DB_NAME = 'clavis';
const DB_VER = 1;
let dbp = null;

function openDB() {
  if (dbp) return dbp;
  dbp = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VER);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('kv')) db.createObjectStore('kv');
      if (!db.objectStoreNames.contains('drafts')) db.createObjectStore('drafts', { keyPath: 'projectId' });
      if (!db.objectStoreNames.contains('snaps')) {
        const s = db.createObjectStore('snaps', { keyPath: 'id' });
        s.createIndex('projectId', 'projectId');
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbp;
}

async function tx(store, mode, fn) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const t = db.transaction(store, mode);
    const st = t.objectStore(store);
    let out;
    Promise.resolve(fn(st)).then((v) => { out = v; });
    t.oncomplete = () => resolve(out);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  });
}
const reqP = (r) => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });

/* ---------- Tipe proyek bawaan (template yang bisa diubah) ---------- */

export const DEFAULT_TYPES = [
  {
    id: 'jurnal', name: 'Jurnal', label: 'Artikel jurnal', color: '#7A2E2E', tint: '#EAD9D4',
    desc: 'IMRaD atau template jurnal · gaya sitasi jurnal · pipeline submit–review–terbit · tabel tanggapan reviewer',
    sections: [['Abstrak', 250], ['Pendahuluan', 1200], ['Tinjauan Pustaka', 1500], ['Metode', 600], ['Hasil dan Pembahasan', 2500], ['Simpulan', 400]],
    stages: ['Draft', 'Submit', 'Under review', 'Revisi', 'Diterima', 'Terbit'], done: ['Terbit'],
    features: ['reviewer'], citations: true, wordLimit: 6000
  },
  {
    id: 'thesis', name: 'Thesis', label: 'Thesis / skripsi', color: '#3F5E48', tint: '#D7E3DA',
    desc: 'Bab 1–5 + lampiran · log bimbingan · matriks penelitian · ruang instrumen & data',
    sections: [['Bab 1 Pendahuluan', 3000], ['Bab 2 Kajian Pustaka', 6000], ['Bab 3 Metode Penelitian', 3000], ['Bab 4 Hasil dan Pembahasan', 8000], ['Bab 5 Penutup', 1500], ['Lampiran', 0]],
    stages: ['Proposal', 'Seminar proposal', 'Penelitian', 'Penulisan', 'Sidang', 'Revisi', 'Selesai'], done: ['Selesai'],
    features: ['bimbingan', 'matriks'], citations: true, wordLimit: 0
  },
  {
    id: 'proposal', name: 'Proposal', label: 'Proposal', color: '#7A4E0E', tint: '#EEDFC6',
    desc: 'Riset, hibah, atau ke klien · latar–tujuan–metode · linimasa & RAB · status pengajuan',
    sections: [['Latar Belakang', 800], ['Rumusan Masalah', 200], ['Tujuan', 200], ['Tinjauan Pustaka', 800], ['Metode', 600], ['Linimasa', 0], ['Anggaran', 0]],
    stages: ['Draft', 'Diajukan', 'Ditinjau', 'Didanai', 'Ditolak'], done: ['Didanai', 'Ditolak'],
    features: ['rab'], citations: true, wordLimit: 0
  },
  {
    id: 'klien', name: 'Klien', label: 'Tulisan pesanan', color: '#35506B', tint: '#D9E1EA',
    desc: 'Brief klien · putaran revisi berbatas · tenggat per putaran · serah terima · tautan ke Niras',
    sections: [['Naskah', 900]],
    stages: ['Brief', 'Draft 1', 'Revisi', 'Serah terima', 'Selesai'], done: ['Selesai'],
    features: ['brief'], citations: false, wordLimit: 900
  }
];

export const IDEA_FIELDS = [
  ['fenomena', 'Fenomena'], ['pertanyaan', 'Pertanyaan penelitian'], ['gap', 'Celah (gap)'],
  ['metode', 'Metode yang terbayang'], ['menarik', 'Kenapa menarik']
];

function defaultState() {
  const now = new Date().toISOString();
  return {
    v: 1,
    settings: {
      name: 'Nira', style: 'apa7', driveRootId: '1Jwn14JbPrpPIgi2rI6j3EEbLMvPNP4Yb', calendarOn: false, ofaOn: true,
      autoDocx: true, highlightCites: false, marginsAsComments: true, keepNeedCite: true,
      submitReminders: [14, 7, 1], updatedAt: now
    },
    types: DEFAULT_TYPES.map((t) => ({ ...t, updatedAt: now })),
    projects: [], ideas: [], refs: [], journal: [], sessions: [], writeLog: [],
    deleted: {}, calTrash: [], ofaTaken: [], ofaChecks: {},
    welcomed: false
  };
}

/* ---------- Keadaan & langganan ---------- */

export const S = { state: defaultState(), drafts: new Map(), ready: false };
const listeners = new Set();
export const onChange = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };
const emit = (what) => listeners.forEach((fn) => { try { fn(what); } catch (e) { console.error(e); } });

const persistState = debounce(async () => {
  try { await tx('kv', 'readwrite', (st) => st.put(S.state, 'state')); } catch (e) { console.error('Gagal menyimpan', e); }
}, 300);

/** Tandai perubahan: simpan ke perangkat dan beri tahu semua pendengar. */
export function save(what = 'state') {
  persistState();
  emit(what);
}
export const flush = () => persistState.flush();

export async function load() {
  try {
    const st = await tx('kv', 'readonly', (s) => reqP(s.get('state')));
    if (st && st.v) S.state = migrate(st);
    const drafts = await tx('drafts', 'readonly', (s) => reqP(s.getAll()));
    (drafts || []).forEach((d) => S.drafts.set(d.projectId, d));
  } catch (e) { console.error('Gagal memuat', e); }
  S.ready = true;
  emit('load');
}

function migrate(st) {
  const d = defaultState();
  const out = { ...d, ...st, settings: { ...d.settings, ...(st.settings || {}) } };
  // tipe bawaan yang belum ada (mis. setelah pembaruan app) ditambahkan
  const have = new Set((out.types || []).map((t) => t.id));
  DEFAULT_TYPES.forEach((t) => { if (!have.has(t.id)) out.types.push({ ...t, updatedAt: new Date().toISOString() }); });
  for (const k of ['projects', 'ideas', 'refs', 'journal', 'sessions', 'writeLog', 'calTrash', 'ofaTaken']) if (!Array.isArray(out[k])) out[k] = [];
  if (!out.deleted) out.deleted = {};
  if (!out.ofaChecks) out.ofaChecks = {};
  return out;
}

/** Ganti seluruh keadaan (dipakai sinkron dan pulihkan cadangan). */
export function replaceState(st, what = 'remote') {
  S.state = migrate(st);
  save(what);
}

/* ---------- Koleksi ---------- */

const touch = (o) => { o.updatedAt = new Date().toISOString(); return o; };
export const now = () => new Date().toISOString();

export function add(kind, obj) {
  const o = touch({ id: uid(kind[0]), createdAt: now(), ...obj });
  S.state[kind].push(o);
  save(kind);
  return o;
}
export function update(kind, id, patch) {
  const o = S.state[kind].find((x) => x.id === id);
  if (!o) return null;
  Object.assign(o, patch);
  touch(o);
  save(kind);
  return o;
}
/** Ubah objek langsung lalu panggil changed(obj). */
export function changed(obj, kind) { touch(obj); save(kind || 'state'); }
export function remove(kind, id) {
  S.state[kind] = S.state[kind].filter((x) => x.id !== id);
  S.state.deleted[id] = now();
  save(kind);
}
export const get = (kind, id) => S.state[kind].find((x) => x.id === id) || null;
export const typeOf = (p) => S.state.types.find((t) => t.id === (p && p.type)) || S.state.types[0];
export const setting = (k) => S.state.settings[k];
export function setSetting(k, v) { S.state.settings[k] = v; S.state.settings.updatedAt = now(); save('settings'); }

/* ---------- Draft ---------- */

export function getDraft(projectId) {
  let d = S.drafts.get(projectId);
  if (!d) {
    d = { projectId, html: '', margins: [], updatedAt: now(), words: 0, dirty: true };
    S.drafts.set(projectId, d);
  }
  return d;
}
const persistDrafts = new Map();
export function saveDraft(d, opts = {}) {
  if (!opts.remote) { d.updatedAt = now(); d.dirty = true; }
  S.drafts.set(d.projectId, d);
  let f = persistDrafts.get(d.projectId);
  if (!f) {
    f = debounce(async (x) => { try { await tx('drafts', 'readwrite', (s) => s.put(x)); } catch (e) { console.error(e); } }, 400);
    persistDrafts.set(d.projectId, f);
  }
  f(d);
  emit(opts.remote ? 'draft-remote' : 'draft');
}
export async function deleteDraft(projectId) {
  S.drafts.delete(projectId);
  try { await tx('drafts', 'readwrite', (s) => s.delete(projectId)); } catch (e) { /* abaikan */ }
}

/* ---------- Snapshot (riwayat versi) ---------- */

export async function addSnap(snap) {
  const s = { id: uid('v'), at: now(), ...snap };
  await tx('snaps', 'readwrite', (st) => st.put(s));
  emit('snaps');
  return s;
}
export async function updateSnap(s) { await tx('snaps', 'readwrite', (st) => st.put(s)); }
export async function listSnaps(projectId) {
  const all = await tx('snaps', 'readonly', (st) => reqP(st.index('projectId').getAll(projectId)));
  return (all || []).sort((a, b) => (a.at < b.at ? 1 : -1));
}
export async function deleteSnaps(projectId) {
  const all = await listSnaps(projectId);
  await tx('snaps', 'readwrite', (st) => { all.forEach((s) => st.delete(s.id)); });
}

/* ---------- Cadangan ---------- */

export async function exportBackup() {
  const snaps = await tx('snaps', 'readonly', (st) => reqP(st.getAll()));
  return { app: 'clavis', v: 1, at: now(), state: S.state, drafts: [...S.drafts.values()], snaps };
}
export async function importBackup(b) {
  if (!b || b.app !== 'clavis') throw new Error('Berkas ini bukan cadangan Clavis.');
  replaceState(b.state, 'restore');
  for (const d of b.drafts || []) { S.drafts.set(d.projectId, d); await tx('drafts', 'readwrite', (s) => s.put(d)); }
  for (const s of b.snaps || []) await tx('snaps', 'readwrite', (st) => st.put(s));
  emit('restore');
}
export async function resetAll() {
  const db = await openDB();
  db.close(); dbp = null;
  await new Promise((r) => { const q = indexedDB.deleteDatabase(DB_NAME); q.onsuccess = q.onerror = q.onblocked = () => r(); });
}

/* ---------- Catatan menulis harian ---------- */

/** Tambah kata dan menit menulis untuk proyek pada hari ini. */
export function logWriting(projectId, words, minutes) {
  if (!words && !minutes) return;
  const d = new Date();
  const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const id = `w-${date}-${projectId}`;
  let e = S.state.writeLog.find((x) => x.id === id);
  if (!e) { e = { id, date, projectId, words: 0, minutes: 0, createdAt: now() }; S.state.writeLog.push(e); }
  e.words = Math.max(0, (e.words || 0) + (words || 0));
  e.minutes = (e.minutes || 0) + (minutes || 0);
  e.updatedAt = now();
  persistState();
}
