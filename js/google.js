/* Clavis — login Google (Google Identity Services) serta pemanggil Drive dan Calendar.
   Token akses disimpan di perangkat sampai kedaluwarsa (±1 jam). Bila habis, Clavis meminta
   ulang tanpa layar persetujuan; kalau browser memblokir jendelanya, status sinkron
   menampilkan tombol "Sambungkan lagi". */
import { GOOGLE_CLIENT_ID } from './config.js';

const SCOPES = [
  'https://www.googleapis.com/auth/drive',
  'https://www.googleapis.com/auth/calendar.events',
  'openid', 'email', 'profile'
].join(' ');

const TOKEN_KEY = 'clavis-google-token';
const USER_KEY = 'clavis-google-user';
let tokenClient = null;
let gisLoading = null;
let pending = null;

export const G = {
  get configured() { return !!GOOGLE_CLIENT_ID; },
  get user() { try { return JSON.parse(localStorage.getItem(USER_KEY) || 'null'); } catch (e) { return null; } },
  get token() {
    try {
      const t = JSON.parse(localStorage.getItem(TOKEN_KEY) || 'null');
      return t && t.exp > Date.now() + 60000 ? t.access_token : null;
    } catch (e) { return null; }
  },
  get everConnected() { return !!localStorage.getItem(USER_KEY); }
};

function loadGIS() {
  if (window.google && window.google.accounts && window.google.accounts.oauth2) return Promise.resolve();
  if (gisLoading) return gisLoading;
  gisLoading = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://accounts.google.com/gsi/client';
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => { gisLoading = null; reject(new Error('Tidak bisa memuat login Google. Periksa internet.')); };
    document.head.appendChild(s);
  });
  return gisLoading;
}

/** Minta token. interactive=true saat dipicu klik (boleh menampilkan pemilih akun). */
export async function connect(interactive = true) {
  if (!GOOGLE_CLIENT_ID) throw new Error('Google belum disiapkan untuk Clavis.');
  await loadGIS();
  if (!tokenClient) {
    tokenClient = window.google.accounts.oauth2.initTokenClient({
      client_id: GOOGLE_CLIENT_ID,
      scope: SCOPES,
      callback: (resp) => {
        const p = pending; pending = null;
        if (!p) return;
        if (resp.error) { p.reject(new Error(resp.error === 'access_denied' ? 'Izin Google ditolak.' : 'Login Google gagal.')); return; }
        localStorage.setItem(TOKEN_KEY, JSON.stringify({ access_token: resp.access_token, exp: Date.now() + (Number(resp.expires_in) || 3600) * 1000 }));
        p.resolve(resp.access_token);
      },
      error_callback: (err) => {
        const p = pending; pending = null;
        if (p) p.reject(new Error(err && err.type === 'popup_closed' ? 'Jendela login ditutup.' : 'Jendela login diblokir browser.'));
      }
    });
  }
  const u = G.user;
  const tok = await new Promise((resolve, reject) => {
    pending = { resolve, reject };
    tokenClient.requestAccessToken({ prompt: interactive && !u ? 'consent' : '', login_hint: u ? u.email : undefined });
  });
  if (!u) {
    try {
      const r = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', { headers: { Authorization: `Bearer ${tok}` } });
      if (r.ok) { const j = await r.json(); localStorage.setItem(USER_KEY, JSON.stringify({ name: j.name, email: j.email, picture: j.picture })); }
    } catch (e) { /* abaikan */ }
  }
  window.dispatchEvent(new CustomEvent('clavis:google'));
  return tok;
}

export function disconnect() {
  const t = G.token;
  if (t && window.google && window.google.accounts) { try { window.google.accounts.oauth2.revoke(t, () => {}); } catch (e) { /* abaikan */ } }
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
  window.dispatchEvent(new CustomEvent('clavis:google'));
}

export class AuthError extends Error {}

async function api(url, opts = {}) {
  const tok = G.token;
  if (!tok) throw new AuthError('Perlu masuk Google lagi.');
  const res = await fetch(url, { ...opts, headers: { Authorization: `Bearer ${tok}`, ...(opts.headers || {}) } });
  if (res.status === 401) { localStorage.removeItem(TOKEN_KEY); throw new AuthError('Perlu masuk Google lagi.'); }
  if (!res.ok) {
    let msg = `Google menolak permintaan (${res.status}).`;
    try { const j = await res.json(); if (j.error && j.error.message) msg = j.error.message; } catch (e) { /* abaikan */ }
    const err = new Error(msg); err.status = res.status; throw err;
  }
  if (opts.raw) return res;
  const ct = res.headers.get('content-type') || '';
  return ct.includes('json') ? res.json() : res.text();
}

/* ---------- Drive ---------- */

const DRIVE = 'https://www.googleapis.com/drive/v3/files';
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3/files';
export const FOLDER = 'application/vnd.google-apps.folder';
export const GDOC = 'application/vnd.google-apps.document';
const FIELDS = 'id,name,mimeType,modifiedTime,webViewLink,parents,trashed';
const q = (s) => s.replace(/\\/g, '\\\\').replace(/'/g, "\\'");

export const drive = {
  async meta(id) { return api(`${DRIVE}/${id}?fields=${FIELDS}&supportsAllDrives=true`); },
  async list(parentId, extra = '') {
    const out = [];
    let token = '';
    do {
      const query = encodeURIComponent(`'${parentId}' in parents and trashed = false${extra ? ` and ${extra}` : ''}`);
      const j = await api(`${DRIVE}?q=${query}&fields=nextPageToken,files(${FIELDS})&pageSize=200&supportsAllDrives=true&includeItemsFromAllDrives=true${token ? `&pageToken=${token}` : ''}`);
      out.push(...(j.files || []));
      token = j.nextPageToken || '';
    } while (token);
    return out;
  },
  async find(parentId, name, mime) {
    const f = await this.list(parentId, `name = '${q(name)}'${mime ? ` and mimeType = '${mime}'` : ''}`);
    return f[0] || null;
  },
  async folder(parentId, name) {
    const f = await this.find(parentId, name, FOLDER);
    if (f) return f;
    return api(`${DRIVE}?fields=${FIELDS}&supportsAllDrives=true`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, mimeType: FOLDER, parents: [parentId] })
    });
  },
  async text(id) { return api(`${DRIVE}/${id}?alt=media&supportsAllDrives=true`, { headers: { Accept: '*/*' } }); },
  /** Unggah berkas baru (atau ganti isi bila id diberikan). data: string | Blob. */
  async upload({ id, parentId, name, mime, data, convertTo }) {
    const boundary = `clavis${Math.random().toString(36).slice(2)}`;
    const metadata = id ? {} : { name, parents: [parentId], ...(convertTo ? { mimeType: convertTo } : {}) };
    if (id && name) metadata.name = name;
    const blob = data instanceof Blob ? data : new Blob([data], { type: mime });
    const body = new Blob([
      `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n`,
      `--${boundary}\r\nContent-Type: ${mime}\r\n\r\n`, blob, `\r\n--${boundary}--`
    ]);
    const url = id ? `${UPLOAD}/${id}?uploadType=multipart&fields=${FIELDS}&supportsAllDrives=true`
      : `${UPLOAD}?uploadType=multipart&fields=${FIELDS}&supportsAllDrives=true`;
    return api(url, { method: id ? 'PATCH' : 'POST', headers: { 'Content-Type': `multipart/related; boundary=${boundary}` }, body });
  },
  async rename(id, name) {
    return api(`${DRIVE}/${id}?fields=${FIELDS}&supportsAllDrives=true`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }) });
  },
  async trash(id) {
    return api(`${DRIVE}/${id}?supportsAllDrives=true`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ trashed: true }) });
  },
  async comments(id) {
    const j = await api(`${DRIVE}/${id}/comments?fields=comments(id,content,author(displayName),quotedFileContent,resolved,createdTime,replies(content,author(displayName)))&pageSize=100`);
    return j.comments || [];
  },
  async reply(fileId, commentId, content, resolve) {
    return api(`${DRIVE}/${fileId}/comments/${commentId}/replies?fields=id`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(resolve ? { content, action: 'resolve' } : { content })
    });
  }
};

/* ---------- Calendar ---------- */

const CAL = 'https://www.googleapis.com/calendar/v3/calendars/primary/events';
export const calendar = {
  async upsert(eventId, ev) {
    if (eventId) {
      try {
        return await api(`${CAL}/${eventId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(ev) });
      } catch (e) { if (e.status !== 404 && e.status !== 410) throw e; }
    }
    return api(CAL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(ev) });
  },
  async remove(eventId) {
    try { await api(`${CAL}/${eventId}`, { method: 'DELETE', raw: true }); } catch (e) { if (e.status !== 404 && e.status !== 410) throw e; }
  }
};
