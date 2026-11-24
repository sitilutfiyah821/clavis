/* Clavis ↔ One for All.
   Semua app Nira tinggal di sitilutfiyah821.github.io, jadi berbagi penyimpanan di perangkat yang sama
   (pola yang sama dengan Niras dan Lei Stuff).
   - Clavis menulis 'clavis-ke-ofa-v1': tenggat proyek, langkah riset dari kartu ide, sesi menulis,
     dan pengingat ide yang mengendap. OfA menjadikannya jadwal proyek "Clavis".
   - OfA menulis 'ofa-ke-clavis-v1': ide yang ditangkap di OfA (catatan #ide) dan centang jadwal.
     Clavis memasukkan ide ke kotak ide dan mencentang langkah/tenggat yang selesai di OfA. */
import { S, save, now } from './store.js';
import { hash, ymd, daysUntil } from './util.js';
import { APP_URL } from './config.js';

export const KE_OFA = 'clavis-ke-ofa-v1';
export const DARI_OFA = 'ofa-ke-clavis-v1';
const MENGENDAP_HARI = 14;

const read = (k) => { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch (e) { return null; } };

function jadwal() {
  const out = [];
  const push = (o) => out.push({ ...o, versi: hash(JSON.stringify(o)) });
  S.state.projects.forEach((p) => (p.deadlines || []).forEach((dl) => {
    if (!dl.date) return;
    push({ id: `cl-dl-${dl.id}`, judul: `${dl.label || 'Tenggat'}: ${p.title}`, tanggal: dl.date, jam: null, catatan: 'Tenggat proyek di Clavis', link: `${APP_URL}#proyek/${p.id}`, selesai: !!dl.done });
  }));
  S.state.ideas.forEach((i) => (i.steps || []).forEach((st) => {
    if (!st.toOfa || !st.date) return;
    push({ id: `cl-st-${st.id}`, judul: st.text, tanggal: st.date, jam: null, catatan: `Ide: ${i.title || 'tanpa judul'}`, link: `${APP_URL}#ide/${i.id}`, selesai: !!st.done });
  }));
  S.state.sessions.forEach((s) => {
    if (!s.date) return;
    const p = S.state.projects.find((x) => x.id === s.projectId);
    push({ id: `cl-se-${s.id}`, judul: `Menulis: ${p ? p.title : 'sesi Clavis'}`, tanggal: s.date, jam: s.start || null, catatan: s.note || 'Sesi menulis', link: `${APP_URL}#draft/${s.projectId || ''}`, selesai: !!s.done });
  });
  // ide yang diam 14 hari → satu pengingat "kembangkan 15 menit" untuk hari ini
  const today = ymd();
  S.state.ideas.forEach((i) => {
    if (i.remind === false || i.status === 'proyek' || i.status === 'inbox') return;
    const last = (i.touchedAt || i.updatedAt || i.createdAt || '').slice(0, 10);
    if (!last || -daysUntil(last) < MENGENDAP_HARI) return;
    if (i.snoozeUntil && i.snoozeUntil > today) return;
    push({ id: `cl-ie-${i.id}-${last}`, judul: `Kembangkan 15 menit: ${i.title || 'ide'}`, tanggal: today, jam: null, catatan: `Ide ini sudah ${-daysUntil(last)} hari diam di Clavis.`, link: `${APP_URL}#ide/${i.id}`, selesai: false, mengendap: true });
  });
  return out;
}

let lastWritten = '';
export function writeBridge() {
  if (S.state.settings.ofaOn === false) return;
  const j = jadwal();
  const prev = read(KE_OFA) || {};
  const ids = new Set(j.map((x) => x.id));
  const dihapus = [...new Set([...(prev.dihapus || []), ...(prev.jadwal || []).map((x) => x.id).filter((id) => !ids.has(id) && !id.startsWith('cl-ie-'))])].slice(-300);
  const diambil = S.state.ofaTaken || [];
  const body = { v: 1, jadwal: j, dihapus: dihapus.filter((id) => !ids.has(id)), diambil: diambil.slice(-500), cabang: branches() };
  const str = JSON.stringify(body);
  if (str === lastWritten) return;
  lastWritten = str;
  try { localStorage.setItem(KE_OFA, JSON.stringify({ ...body, waktu: now() })); } catch (e) { /* penyimpanan penuh */ }
}

function branches() {
  return [...new Set(S.state.ideas.map((i) => (i.branch || '').split('›')[0].trim()).filter(Boolean))].slice(0, 20);
}

/** Baca kiriman OfA. Mengembalikan jumlah ide baru. */
export function readBridge() {
  if (S.state.settings.ofaOn === false) return 0;
  const j = read(DARI_OFA);
  if (!j) return 0;
  let baru = 0, ubah = false;
  S.state.ofaTaken = S.state.ofaTaken || [];
  const taken = new Set(S.state.ofaTaken);
  (j.ide || []).forEach((x) => {
    if (!x || !x.id || taken.has(x.id)) return;
    const teks = String(x.teks || '').trim();
    const iid = `i-ofa-${x.id}`;
    if (!teks || S.state.deleted[iid] || S.state.ideas.some((i) => i.id === iid)) { S.state.ofaTaken.push(x.id); taken.add(x.id); return; }
    S.state.ideas.push({
      id: iid, title: teks.split(/\n|(?<=[.?!])\s/)[0].slice(0, 120).replace(/[.。]+$/, ''), text: teks, kind: x.jenis || 'catatan', status: 'inbox',
      source: 'ofa', sourceInfo: x.perangkat || 'ponsel', ofaId: x.id, branch: x.cabang || '', tags: [], fields: {}, refIds: [], steps: [],
      remind: true, createdAt: x.dibuat || now(), updatedAt: now()
    });
    S.state.ofaTaken.push(x.id);
    taken.add(x.id);
    baru++; ubah = true;
  });
  const c = j.centang || {};
  Object.entries(c).forEach(([id, v]) => {
    if (!v) return;
    const seen = (S.state.ofaChecks = S.state.ofaChecks || {});
    if ((seen[id] || '') >= (v.waktu || '')) return;
    seen[id] = v.waktu || now();
    if (id.startsWith('cl-st-')) {
      const sid = id.slice(6);
      S.state.ideas.forEach((i) => (i.steps || []).forEach((st) => {
        if (st.id === sid && !!st.done !== !!v.done) { st.done = !!v.done; st.doneAt = v.done ? (v.waktu || now()) : null; i.updatedAt = now(); ubah = true; }
      }));
    } else if (id.startsWith('cl-dl-')) {
      const did = id.slice(6);
      S.state.projects.forEach((p) => (p.deadlines || []).forEach((dl) => {
        if (dl.id === did && !!dl.done !== !!v.done) { dl.done = !!v.done; p.updatedAt = now(); ubah = true; }
      }));
    } else if (id.startsWith('cl-se-')) {
      const s = S.state.sessions.find((x) => x.id === id.slice(6));
      if (s && !!s.done !== !!v.done) { s.done = !!v.done; s.updatedAt = now(); ubah = true; }
    } else if (id.startsWith('cl-ie-')) {
      // "kembangkan 15 menit" dicentang: anggap ide disentuh hari ini
      const iid = id.slice(6).replace(/-\d{4}-\d{2}-\d{2}$/, '');
      const i = S.state.ideas.find((x) => x.id === iid);
      if (i && v.done) { i.touchedAt = now(); i.updatedAt = now(); ubah = true; }
    }
  });
  if (ubah) save('ofa');
  return baru;
}

export function ofaSeen() {
  const j = read(DARI_OFA);
  return j ? j.waktu || null : null;
}

export function startBridge(onNewIdeas) {
  const run = () => { const n = readBridge(); if (n && onNewIdeas) onNewIdeas(n); };
  run();
  writeBridge();
  window.addEventListener('storage', (e) => { if (e.key === DARI_OFA) run(); });
  window.addEventListener('focus', run);
  setInterval(() => { run(); writeBridge(); }, 60000);
}
