/* Clavis — sinkron ke Google Drive (folder "Clavis" milik Nira).
   Susunan:
     Clavis/clavis-data.json                 ← ide, pustaka, proyek, jurnal riset, sesi, pengaturan
     Clavis/<Tipe>/<Judul proyek>/draft.clavis
                                 /Versi/ /Ekspor/ /Bagikan/ /Lampiran/
   Tulis di perangkat dulu, kirim ke Drive saat online. Bentrok di dua perangkat:
   versi terbaru dipakai, versi lain disimpan sebagai salinan konflik di Riwayat versi. */
import { S, onChange, replaceState, saveDraft, typeOf, listSnaps, addSnap, updateSnap, changed } from './store.js';
import { G, drive, calendar, connect, AuthError, FOLDER } from './google.js';
import { safeName, debounce, hash, parseYMD, addDays, ymd } from './util.js';
import { APP_URL } from './config.js';

const META_KEY = 'clavis-sync-meta';
const meta = (() => { try { return JSON.parse(localStorage.getItem(META_KEY) || '{}'); } catch (e) { return {}; } })();
const saveMeta = () => localStorage.setItem(META_KEY, JSON.stringify(meta));

export const status = { state: 'off', at: meta.lastSyncAt || null, message: '', pending: 0 };
let stateDirty = !meta.lastSyncAt;
let running = false, again = false;

function emit(patch) {
  Object.assign(status, patch);
  status.pending = (stateDirty ? 1 : 0) + [...S.drafts.values()].filter((d) => d.dirty).length;
  window.dispatchEvent(new CustomEvent('clavis:sync', { detail: { ...status } }));
}

/* ---------- Gabung data ---------- */

const COLLS = ['projects', 'ideas', 'refs', 'journal', 'sessions', 'types', 'writeLog'];
const t = (o) => (o && o.updatedAt) || '';

export function mergeStates(local, remote) {
  if (!remote) return local;
  const deleted = { ...(remote.deleted || {}), ...(local.deleted || {}) };
  Object.keys(remote.deleted || {}).forEach((k) => { if ((remote.deleted[k] || '') > (deleted[k] || '')) deleted[k] = remote.deleted[k]; });
  const out = { ...local, deleted };
  for (const c of COLLS) {
    const L = new Map((local[c] || []).map((x) => [x.id, x]));
    const R = new Map((remote[c] || []).map((x) => [x.id, x]));
    const ids = new Set([...L.keys(), ...R.keys()]);
    const list = [];
    ids.forEach((id) => {
      const l = L.get(id), r = R.get(id);
      const pick = !l ? r : !r ? l : (t(r) > t(l) ? r : l);
      if (deleted[id] && deleted[id] >= t(pick)) return;
      list.push(pick);
    });
    // pertahankan urutan: yang lama dulu sesuai createdAt
    list.sort((a, b) => ((a.createdAt || '') < (b.createdAt || '') ? -1 : 1));
    out[c] = list;
  }
  out.settings = t(remote.settings) > t(local.settings) ? remote.settings : local.settings;
  out.welcomed = !!(local.welcomed || remote.welcomed);
  out.calTrash = [...new Set([...(local.calTrash || []), ...(remote.calTrash || [])])];
  out.ofaTaken = [...new Set([...(local.ofaTaken || []), ...(remote.ofaTaken || [])])];
  out.ofaChecks = { ...(remote.ofaChecks || {}) };
  Object.entries(local.ofaChecks || {}).forEach(([k, v]) => { if ((v || '') > (out.ofaChecks[k] || '')) out.ofaChecks[k] = v; });
  return out;
}

const stable = (st) => JSON.stringify({ ...st, deleted: Object.keys(st.deleted || {}).sort().map((k) => [k, st.deleted[k]]) });

/* ---------- Folder ---------- */

async function rootId() {
  const id = S.state.settings.driveRootId;
  if (!id) throw new Error('Folder Drive untuk Clavis belum dipilih (Pengaturan).');
  if (meta.rootChecked !== id) {
    const m = await drive.meta(id);
    if (m.mimeType !== FOLDER || m.trashed) throw new Error('Folder Clavis di Drive tidak ditemukan.');
    meta.rootChecked = id; meta.rootName = m.name; saveMeta();
  }
  return id;
}

/** Pastikan folder proyek ada (dan namanya mengikuti judul). */
export async function projectFolders(p) {
  const root = await rootId();
  const type = typeOf(p);
  const want = safeName(p.title);
  const d = p.drive || {};
  let ok = false;
  if (d.folderId && d.root === root) {
    try {
      const m = await drive.meta(d.folderId);
      ok = !m.trashed;
      if (ok && m.name !== want) await drive.rename(d.folderId, want);
    } catch (e) { if (e instanceof AuthError) throw e; ok = false; }
  }
  if (!ok) {
    const tf = await drive.folder(root, safeName(type.name));
    const pf = await drive.folder(tf.id, want);
    p.drive = { root, folderId: pf.id, typeFolderId: tf.id };
  }
  for (const [k, name] of [['versiId', 'Versi'], ['eksporId', 'Ekspor'], ['bagikanId', 'Bagikan'], ['lampiranId', 'Lampiran']]) {
    if (!p.drive[k]) p.drive[k] = (await drive.folder(p.drive.folderId, name)).id;
  }
  if (!ok || !p.drive.versiId) changed(p, 'projects');
  return p.drive;
}

/* ---------- Langkah sinkron ---------- */

async function syncData() {
  const root = await rootId();
  if (!meta.dataId || meta.dataRoot !== root) {
    const f = await drive.find(root, 'clavis-data.json');
    meta.dataId = f ? f.id : null; meta.dataRoot = root; meta.dataModified = null; saveMeta();
  }
  let remote = null;
  if (meta.dataId) {
    const m = await drive.meta(meta.dataId).catch((e) => { if (e instanceof AuthError) throw e; return null; });
    if (!m || m.trashed) { meta.dataId = null; }
    else if (m.modifiedTime !== meta.dataModified || !meta.remoteHash) {
      const txt = await drive.text(meta.dataId);
      try { remote = JSON.parse(typeof txt === 'string' ? txt : JSON.stringify(txt)).state; } catch (e) { remote = null; }
      meta.dataModified = m.modifiedTime;
    }
  }
  const local = S.state;
  const merged = remote ? mergeStates(local, remote) : local;
  const mergedStr = stable(merged);
  if (remote && mergedStr !== stable(local)) replaceState(merged, 'remote');
  const remoteHash = remote ? hash(stable(remote)) : meta.remoteHash;
  if (!meta.dataId || hash(mergedStr) !== remoteHash || stateDirty) {
    const body = JSON.stringify({ app: 'clavis', v: 1, savedAt: new Date().toISOString(), state: S.state });
    const f = await drive.upload({ id: meta.dataId, parentId: root, name: 'clavis-data.json', mime: 'application/json', data: body });
    meta.dataId = f.id; meta.dataModified = f.modifiedTime; meta.remoteHash = hash(stable(S.state));
  } else {
    meta.remoteHash = hash(mergedStr);
  }
  stateDirty = false;
  saveMeta();
}

async function syncDraft(p) {
  const d = S.drafts.get(p.id);
  const f = await projectFolders(p);
  const dm = (meta.drafts = meta.drafts || {})[p.id] || {};
  let remoteMeta = null;
  if (!f.draftId) {
    const found = await drive.find(f.folderId, 'draft.clavis');
    if (found) { f.draftId = found.id; changed(p, 'projects'); }
  }
  if (f.draftId) {
    remoteMeta = await drive.meta(f.draftId).catch((e) => { if (e instanceof AuthError) throw e; return null; });
    if (!remoteMeta || remoteMeta.trashed) { f.draftId = null; remoteMeta = null; changed(p, 'projects'); }
  }
  const remoteChanged = remoteMeta && remoteMeta.modifiedTime !== dm.modified;
  if (remoteChanged) {
    let r = null;
    try { const txt = await drive.text(f.draftId); r = typeof txt === 'string' ? JSON.parse(txt) : txt; } catch (e) { if (e instanceof AuthError) throw e; }
    if (r && typeof r.html === 'string') {
      if (!d || !d.dirty || !d.html) {
        saveDraft({ ...(d || {}), projectId: p.id, html: r.html, margins: r.margins || [], updatedAt: r.updatedAt, words: r.words || 0, dirty: false }, { remote: true });
      } else if ((r.updatedAt || '') !== (d.updatedAt || '') && r.html !== d.html) {
        // bentrok: yang terbaru dipakai, yang lain jadi salinan konflik
        const localNewer = (d.updatedAt || '') >= (r.updatedAt || '');
        const loser = localNewer ? r : d;
        await addSnap({ projectId: p.id, kind: 'konflik', label: `Salinan konflik (${localNewer ? 'dari perangkat lain' : 'dari perangkat ini'})`, html: loser.html, words: loser.words || 0 });
        if (!localNewer) saveDraft({ ...d, html: r.html, margins: r.margins || [], updatedAt: r.updatedAt, words: r.words || 0, dirty: false }, { remote: true });
      }
    }
    dm.modified = remoteMeta.modifiedTime;
  }
  const cur = S.drafts.get(p.id);
  if (cur && (cur.dirty || !f.draftId)) {
    const body = JSON.stringify({ app: 'clavis', v: 1, projectId: p.id, title: p.title, html: cur.html, margins: cur.margins || [], words: cur.words || 0, updatedAt: cur.updatedAt });
    const up = await drive.upload({ id: f.draftId, parentId: f.folderId, name: 'draft.clavis', mime: 'application/json', data: body });
    if (!f.draftId) { f.draftId = up.id; changed(p, 'projects'); }
    dm.modified = up.modifiedTime;
    cur.dirty = false;
    saveDraft(cur, { remote: true });
  }
  meta.drafts[p.id] = dm;
  saveMeta();
}

async function syncSnaps(p) {
  const snaps = await listSnaps(p.id);
  const todo = snaps.filter((s) => !s.driveId).slice(0, 10);
  if (!todo.length) return;
  const f = await projectFolders(p);
  for (const s of todo) {
    const name = `${s.at.slice(0, 16).replace('T', ' ').replace(':', '.')} · ${safeName(s.label || s.kind)}.clavis`;
    const up = await drive.upload({ parentId: f.versiId, name, mime: 'application/json', data: JSON.stringify({ app: 'clavis', snapshot: true, ...s }) });
    s.driveId = up.id;
    await updateSnap(s);
  }
}

/* ---------- Google Calendar ---------- */

function calendarItems() {
  const items = [];
  const reminders = (days) => ({ useDefault: false, overrides: days.map((n) => ({ method: 'popup', minutes: n * 1440 })).slice(0, 5) });
  S.state.projects.forEach((p) => {
    const type = typeOf(p);
    (p.deadlines || []).forEach((dl) => {
      if (!dl.date) return;
      const submit = /submit|kirim|pengajuan|sidang|serah/i.test(dl.label || '');
      items.push({
        owner: dl, kind: 'projects', obj: p,
        ev: {
          summary: `${dl.done ? '✓ ' : ''}Tenggat · ${dl.label || 'Tenggat'} — ${p.title}`,
          description: `${type.name} · Clavis\n${APP_URL}#proyek/${p.id}`,
          start: { date: dl.date }, end: { date: ymd(addDays(parseYMD(dl.date), 1)) },
          reminders: reminders(submit ? (S.state.settings.submitReminders || [14, 7, 1]) : [1]),
          colorId: '11'
        }
      });
    });
  });
  S.state.sessions.forEach((s) => {
    if (!s.date || !s.start) return;
    const p = S.state.projects.find((x) => x.id === s.projectId);
    const dt = (hhmm) => `${s.date}T${hhmm.replace('.', ':')}:00`;
    items.push({
      owner: s, kind: 'sessions', obj: s,
      ev: {
        summary: `Menulis · ${p ? p.title : 'Clavis'}`,
        description: `${s.note || ''}\n${APP_URL}#draft/${s.projectId || ''}`.trim(),
        start: { dateTime: dt(s.start), timeZone: 'Asia/Jakarta' },
        end: { dateTime: dt(s.end || s.start), timeZone: 'Asia/Jakarta' },
        reminders: { useDefault: false, overrides: [{ method: 'popup', minutes: 10 }] },
        colorId: '8'
      }
    });
  });
  return items;
}

async function syncCalendar() {
  if (!S.state.settings.calendarOn) return;
  for (const it of calendarItems()) {
    const h = hash(JSON.stringify(it.ev));
    if (it.owner.calId && it.owner.calHash === h) continue;
    const ev = await calendar.upsert(it.owner.calId, it.ev);
    it.owner.calId = ev.id; it.owner.calHash = h;
    changed(it.obj, it.kind);
  }
  const trash = S.state.calTrash || [];
  if (trash.length) {
    for (const id of trash) await calendar.remove(id);
    S.state.calTrash = [];
    changed(S.state.settings, 'settings');
  }
}

/* ---------- Jalankan ---------- */

export async function syncNow(opts = {}) {
  if (!G.configured) { emit({ state: 'unconfigured' }); return; }
  if (!G.everConnected) { emit({ state: 'off' }); return; }
  if (!navigator.onLine) { emit({ state: 'offline' }); return; }
  if (running) { again = true; return; }
  if (!G.token) {
    if (opts.interactive) {
      try { await connect(true); } catch (e) { emit({ state: 'auth', message: e.message }); return; }
    } else { emit({ state: 'auth', message: 'Sesi Google habis.' }); return; }
  }
  running = true;
  emit({ state: 'syncing', message: '' });
  try {
    await syncData();
    for (const p of S.state.projects) {
      const d = S.drafts.get(p.id);
      if (d || (p.drive && p.drive.draftId)) await syncDraft(p);
      await syncSnaps(p);
    }
    await syncCalendar();
    // simpan id folder/kalender yang baru dibuat
    if (stateDirty) await syncData();
    meta.lastSyncAt = new Date().toISOString(); saveMeta();
    emit({ state: 'ok', at: meta.lastSyncAt, message: '' });
  } catch (e) {
    console.error(e);
    if (e instanceof AuthError) emit({ state: 'auth', message: e.message });
    else if (!navigator.onLine) emit({ state: 'offline' });
    else emit({ state: 'error', message: e.message || 'Sinkron bermasalah.' });
  } finally {
    running = false;
    if (again) { again = false; setTimeout(() => syncNow(), 500); }
  }
}

const soon = debounce(() => syncNow(), 4000);

export function startSync() {
  onChange((what) => {
    if (what === 'remote' || what === 'draft-remote' || what === 'snaps' || what === 'load') return;
    if (what !== 'draft') stateDirty = true;
    emit({});
    soon();
  });
  window.addEventListener('online', () => syncNow());
  window.addEventListener('offline', () => emit({ state: 'offline' }));
  window.addEventListener('focus', () => { if (Date.now() - new Date(status.at || 0).getTime() > 60000) syncNow(); });
  window.addEventListener('clavis:google', () => syncNow());
  setInterval(() => syncNow(), 120000);
  emit({ state: G.configured ? (G.everConnected ? 'idle' : 'off') : 'unconfigured' });
  syncNow();
}

export const rootName = () => meta.rootName || 'Clavis';

/** Lupakan id berkas Drive yang diingat (dipakai saat folder Clavis diganti). */
export function resetMeta() {
  Object.keys(meta).forEach((k) => delete meta[k]);
  saveMeta();
  stateDirty = true;
}
