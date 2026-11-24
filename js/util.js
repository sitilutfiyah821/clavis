/* Clavis — alat kecil yang dipakai di mana-mana: id, tanggal, teks, kata. */

export const uid = (p = '') => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export const HARI = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
export const HARI_PENDEK = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];
export const BULAN = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
export const BULAN_PENDEK = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];

const pad = (n) => String(n).padStart(2, '0');
export const ymd = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const parseYMD = (s) => { const [y, m, d] = String(s).split('-').map(Number); return new Date(y, (m || 1) - 1, d || 1); };
export const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
export const addDays = (d, n) => { const x = startOfDay(d); x.setDate(x.getDate() + n); return x; };
export const daysUntil = (s, now = new Date()) => Math.round((parseYMD(s) - startOfDay(now)) / 86400000);
export const hm = (d) => `${pad(d.getHours())}.${pad(d.getMinutes())}`;

export function fmtDate(s, opt = {}) {
  if (!s) return '';
  const d = typeof s === 'string' && s.length <= 10 ? parseYMD(s) : new Date(s);
  if (opt.short) return `${d.getDate()} ${BULAN_PENDEK[d.getMonth()]}`;
  if (opt.day) return `${HARI[d.getDay()]}, ${d.getDate()} ${BULAN[d.getMonth()]}`;
  return `${d.getDate()} ${BULAN[d.getMonth()]} ${d.getFullYear()}`;
}

/** "H-4", "Hari ini", "lewat 2 hari" */
export function hLabel(s, now = new Date()) {
  const n = daysUntil(s, now);
  if (n === 0) return 'Hari ini';
  if (n > 0) return `H-${n}`;
  return `lewat ${-n} hari`;
}

/** "hari ini", "kemarin", "3 hari lalu" untuk waktu ISO */
export function ago(iso, now = new Date()) {
  if (!iso) return '';
  const d = new Date(iso);
  const n = Math.round((startOfDay(now) - startOfDay(d)) / 86400000);
  if (n <= 0) return `hari ini ${hm(d)}`;
  if (n === 1) return 'kemarin';
  if (n < 30) return `${n} hari lalu`;
  return fmtDate(ymd(d), { short: true });
}

export const angka = (n) => Number(n || 0).toLocaleString('id-ID');

/** Hitung kata dari teks biasa. */
export function countWords(text) {
  const m = String(text || '').trim().match(/[\p{L}\p{N}][\p{L}\p{N}'’\-]*/gu);
  return m ? m.length : 0;
}

export const slugify = (s) => String(s || '').normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase()
  .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'tanpa-judul';

/** Nama berkas/folder yang aman untuk Drive. */
export const safeName = (s) => String(s || 'Tanpa judul').replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120) || 'Tanpa judul';

export function debounce(fn, ms) {
  let t;
  const f = (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
  f.flush = (...a) => { clearTimeout(t); fn(...a); };
  return f;
}

/** Hash pendek (untuk penanda versi jembatan). */
export function hash(s) {
  let h = 2166136261;
  const str = String(s);
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0).toString(36);
}

export const clone = (o) => JSON.parse(JSON.stringify(o));
