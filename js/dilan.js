/* Clavis ↔ Dilan — "pulau" kecil di tengah atas layar laptop Windows (PROTOKOL Dilan §7).
   Browser tidak bisa membuka named pipe, jadi Dilan membuka WebSocket di 127.0.0.1 dan Clavis menyambung ke sana.

   Clavis hanya MENGIRIM satu hal: pengingat ide yang sudah lama diam ("kembangkan 15 menit"), aturannya sama
   dengan yang dipakai jembatan One for All (ofa.js). Tenggat proyek dan sesi menulis sengaja tidak dikirim:
   keduanya sudah menjadi jadwal di One for All, dan Dilan menampilkannya dari sana.

   Clavis tidak berlangganan 'tangkap', jadi ketikan di kolom Dilan tetap utuh milik One for All (tanpa awalan).
   Ide dari Dilan masuk lewat One for All: "#ide …" atau "r: …" → catatan berlabel Clavis → kotak ide di sini.

   Di luar Windows, di luar https, atau saat Dilan tidak berjalan, modul ini diam sepenuhnya. */
import { S, save, now, onChange } from './store.js';
import { ymd, addDays, daysUntil } from './util.js';

const ALAMAT = 'ws://127.0.0.1:47615/';
const COBA_LAGI_MS = 20000;   // Dilan belum menyala: coba lagi diam-diam
const PERIKSA_MS = 10000;     // periksa perubahan data Clavis
const MENGENDAP_HARI = 14;    // sama dengan ofa.js
const MAKS_KARTU = 3;
const TUNDA_HARI = 7;

/* ---------- satu tab saja yang tersambung ----------
   Dilan menyimpan satu sambungan per aplikasi: tab kedua yang mendaftar menggantikan yang pertama. Tanpa aturan
   ini, dua tab Clavis saling merebut tiap 20 detik. Tab yang tersambung mencatat dirinya di penyimpanan browser;
   tab lain menunggu, kecuali catatannya kedaluwarsa (tab itu sudah ditutup) atau versi modulnya lebih lama. */
const VERSI_MODUL = 1;
const KUNCI_PEMIMPIN = 'dilan-pemimpin-clavis';
const ID_TAB = Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const HIDUP_MS = 150000;      // tab di latar bisa diperlambat browser sampai sekali semenit

const baca = (k) => { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch (e) { return null; } };
const potong = (s, n) => { s = String(s || '').trim(); return s.length > n ? s.slice(0, n - 1) + '…' : s; };

function bolehSambung() {
  const p = baca(KUNCI_PEMIMPIN);
  if (!p || p.tab === ID_TAB || Date.now() - (Number(p.hb) || 0) > HIDUP_MS) return true;
  return (Number(p.versi) || 0) < VERSI_MODUL;
}
function tandaiPemimpin() {
  try { localStorage.setItem(KUNCI_PEMIMPIN, JSON.stringify({ tab: ID_TAB, versi: VERSI_MODUL, hb: Date.now() })); } catch (e) { }
}
function lepasPemimpin() {
  const p = baca(KUNCI_PEMIMPIN);
  if (p && p.tab === ID_TAB) { try { localStorage.removeItem(KUNCI_PEMIMPIN); } catch (e) { } }
}

/** Ide yang sudah diam ≥ 14 hari, terlama dulu. Aturannya sama persis dengan ofa.js. */
export function ideMengendap() {
  const hariIni = ymd();
  return (S.state.ideas || [])
    .map((i) => {
      if (!i || i.remind === false || i.status === 'proyek' || i.status === 'inbox') return null;
      const last = (i.touchedAt || i.updatedAt || i.createdAt || '').slice(0, 10);
      if (!last) return null;
      const hari = -daysUntil(last);
      if (hari < MENGENDAP_HARI) return null;
      if (i.snoozeUntil && i.snoozeUntil > hariIni) return null;
      return { ide: i, hari };
    })
    .filter(Boolean)
    .sort((a, b) => b.hari - a.hari)
    .slice(0, MAKS_KARTU);
}

const idKartu = (ideId) => 'ide-' + String(ideId).replace(/[^A-Za-z0-9_-]/g, '').slice(0, 55);

function aktivitas() {
  return ideMengendap().map(({ ide, hari }) => ({
    id: idKartu(ide.id),
    jenis: 'ide',
    prioritas: 'pengingat',
    judul: potong(ide.title || ide.text || 'Ide tanpa judul', 80),
    sub: `Diam ${hari} hari · kembangkan 15 menit`,
    judul_privat: 'Ide riset',
    aksi: ['buka', { id: 'tunda', label: 'Tunda seminggu' }]
  }));
}

/* ---------- aksi dari Dilan ---------- */
function ideDariKartu(idAktivitas) {
  return (S.state.ideas || []).find((i) => idKartu(i.id) === idAktivitas) || null;
}
function jalankanAksi(m) {
  const ide = ideDariKartu(m.id);
  if (!ide) return;
  if (m.aksi === 'tunda') {
    ide.snoozeUntil = ymd(addDays(new Date(), TUNDA_HARI));
    ide.updatedAt = now();
    save('ide');
    selaraskan();
  } else if (m.aksi === 'buka') {
    // Tab tidak bisa memunculkan dirinya sendiri tanpa klik, tapi ia sudah siap di ide yang benar.
    location.hash = `#ide/${ide.id}`;
    try { window.focus(); } catch (e) { }
  }
}

/* ---------- sambungan ---------- */
let ws = null;
let siap = false;                 // sudah diterima_daftar
let terkirim = new Map();         // id → JSON terakhir yang dikirim
let tundaUlang = null;

function kirim(pesan) {
  if (ws && ws.readyState === 1) ws.send(JSON.stringify(Object.assign({ v: 1 }, pesan)));
}

export function selaraskan() {
  if (!siap) return;
  tandaiPemimpin();
  let daftar;
  try { daftar = aktivitas(); } catch (e) { return; }
  const baru = new Map(daftar.map((a) => [a.id, JSON.stringify(a)]));
  terkirim.forEach((_, id) => { if (!baru.has(id)) kirim({ tipe: 'hapus', id }); });
  baru.forEach((json, id) => {
    if (terkirim.get(id) !== json) kirim(Object.assign({ tipe: 'aktivitas' }, JSON.parse(json)));
  });
  terkirim = baru;
}

function sambung() {
  clearTimeout(tundaUlang);
  if (ws) return;
  if (!bolehSambung()) { jadwalkanUlang(); return; }
  try { ws = new WebSocket(ALAMAT); } catch (e) { ws = null; jadwalkanUlang(); return; }
  ws.onopen = () => {
    siap = false;
    terkirim = new Map();
    // Tanpa langganan 'tangkap': ketikan di Dilan tetap milik One for All, tanpa perlu awalan.
    kirim({ tipe: 'daftar', aplikasi: 'clavis', nama: 'Clavis', ikon: { huruf: 'C', warna: '#7A2E2E' } });
  };
  ws.onmessage = (e) => {
    let m; try { m = JSON.parse(e.data); } catch (er) { return; }
    if (m.tipe === 'diterima_daftar') { siap = true; tandaiPemimpin(); selaraskan(); }
    else if (m.tipe === 'aksi' && m.id) { try { jalankanAksi(m); } catch (er) { /* jangan jatuhkan sambungan */ } }
    else if (m.tipe === 'galat' && window.console) console.warn('[Dilan]', m.kode, m.pesan);
  };
  ws.onclose = () => { ws = null; siap = false; jadwalkanUlang(); };
  ws.onerror = () => { /* onclose menyusul */ };
}
function jadwalkanUlang() {
  clearTimeout(tundaUlang);
  tundaUlang = setTimeout(sambung, COBA_LAGI_MS);
}

export function startDilan() {
  // Dilan hanya ada di Windows. Di HP jangan mencoba sama sekali (Chrome bisa meminta izin jaringan lokal).
  if (!/Windows/i.test(navigator.userAgent) || !('WebSocket' in window)) return;
  if (location.protocol !== 'https:' && location.protocol !== 'http:') return;
  onChange(() => selaraskan());   // ide berubah (termasuk saat data Drive selesai dimuat)
  setInterval(selaraskan, PERIKSA_MS);
  window.addEventListener('storage', (e) => {
    if (e.key !== KUNCI_PEMIMPIN) return;
    if (!ws && !e.newValue) { clearTimeout(tundaUlang); tundaUlang = setTimeout(sambung, 500 + Math.random() * 1500); }
  });
  document.addEventListener('visibilitychange', selaraskan);
  window.addEventListener('pagehide', lepasPemimpin);   // tab ditutup/dimuat ulang: tab lain boleh mengambil alih
  sambung();
}

startDilan();
