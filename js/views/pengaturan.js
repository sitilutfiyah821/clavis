/* Clavis — Pengaturan: akun Google & folder Drive, gaya sitasi, One for All, ekspor, cadangan. */
import { S, setSetting, exportBackup, importBackup, resetAll } from '../store.js';
import { esc, ymd, ago } from '../util.js';
import { I, $, toast, confirmDlg, opts, modal } from '../ui.js';
import { STYLES } from '../cite.js';
import { G, connect, disconnect, drive } from '../google.js';
import { status as syncStatus, syncNow, rootName, resetMeta } from '../sync.js';
import { ofaSeen, KE_OFA } from '../ofa.js';
import { download } from '../export.js';
import { go } from '../app.js';

export const title = () => 'Pengaturan';

export function render() {
  const st = S.state.settings;
  const u = G.user;
  const seen = ofaSeen();
  return `
  <header class="head"><div class="t"><span class="label">Clavis v1.0</span><h1 class="h1">Pengaturan</h1></div></header>
  <section class="cols">
    <div class="col">
      <div class="card pad stack">
        <h2 class="h2">Google Drive</h2>
        ${!G.configured ? '<div class="note warn">Sambungan Google belum disiapkan di app ini.</div>'
          : u ? `<div class="row">${u.picture ? `<img src="${esc(u.picture)}" alt="" width="36" height="36" style="border-radius:50%">` : ''}<div class="stack grow" style="gap:2px"><b>${esc(u.name || '')}</b><span class="s13 muted">${esc(u.email || '')}</span></div><button class="btn sm" data-act="logout">Keluar</button></div>
               <div class="note ${syncStatus.state === 'ok' ? 'ok' : ''}">${syncStatus.state === 'ok' ? `Tersinkron ${esc(ago(syncStatus.at))}.` : syncStatus.state === 'auth' ? 'Sesi Google habis. Tekan “Sambungkan lagi” di sidebar.' : syncStatus.state === 'error' ? esc(syncStatus.message) : 'Menunggu sinkron.'}</div>`
            : `<p class="s13 muted" style="margin:0;line-height:1.55">Masuk supaya ide, pustaka, dan draft tersimpan di folder Clavis di Drive dan bisa dibuka dari perangkat lain.</p><button class="btn dark" style="align-self:flex-start" data-act="google-connect">Masuk dengan Google</button>`}
        <label class="field"><span class="label">Folder Clavis di Drive</span>
          <span class="row"><input class="input" id="root" value="${esc(st.driveRootId || '')}" placeholder="tempel tautan folder Drive"><button class="btn" data-act="set-root">Pakai</button></span>
          <span class="small muted">Sekarang: <b>${esc(rootName())}</b>${st.driveRootId ? ` · <a href="https://drive.google.com/drive/folders/${esc(st.driveRootId)}" target="_blank" rel="noopener">buka</a>` : ''}. Isinya: clavis-data.json dan satu folder per tipe proyek.</span></label>
        ${G.everConnected ? '<button class="btn sm" style="align-self:flex-start" data-act="sync-now">Sinkron sekarang</button>' : ''}
      </div>
      <div class="card pad stack">
        <h2 class="h2">Menulis & sitasi</h2>
        <label class="field"><span class="label">Nama sapaan</span><input class="input" data-bind="settings::name" value="${esc(st.name || '')}"></label>
        <label class="field"><span class="label">Gaya sitasi bawaan untuk proyek baru</span><select class="select" data-bind="settings::style">${opts(STYLES, st.style)}</select></label>
        <span class="label">Ekspor Word & Google Docs</span>
        <label class="check"><input type="checkbox" data-bind="settings::highlightCites" ${st.highlightCites ? 'checked' : ''}> Sorot sitasi kuning (memudahkan mengganti lewat Mendeley Cite)</label>
        <label class="check"><input type="checkbox" data-bind="settings::marginsAsComments" ${st.marginsAsComments !== false ? 'checked' : ''}> Catatan pinggir jadi komentar Word</label>
        <label class="check"><input type="checkbox" data-bind="settings::keepNeedCite" ${st.keepNeedCite !== false ? 'checked' : ''}> Sertakan penanda [butuh sitasi]</label>
        <label class="check"><input type="checkbox" data-bind="settings::autoDocx" ${st.autoDocx ? 'checked' : ''}> Simpan .docx ke Drive setiap “Simpan versi”</label>
      </div>
    </div>
    <div class="col">
      <div class="card pad stack">
        <h2 class="h2">One for All</h2>
        <label class="check"><input type="checkbox" data-bind="settings::ofaOn" data-rerender ${st.ofaOn !== false ? 'checked' : ''}> Kirim tenggat, langkah ide, dan sesi menulis ke OfA; terima ide dari OfA</label>
        <div class="note ofa">${seen ? `OfA terakhir mengirim kabar ${esc(ago(seen))}.` : 'Belum ada kabar dari OfA di perangkat ini. Buka One for All (versi terbaru) di browser yang sama sekali saja.'}
          <br>Di OfA, ketik <b>#ide</b> di catat cepat (mis. <i>#ide kenapa horor kita jadi religi?</i>) untuk mengirim ide ke kotak ide Clavis.</div>
        <span class="small muted">Sambungan ini lewat penyimpanan browser di perangkat yang sama (seperti Niras dan Lei Stuff). Jadwal yang masuk ke OfA ikut tersinkron ke HP lewat login Google di OfA.</span>
        <a class="btn sm" style="align-self:flex-start" href="https://sitilutfiyah821.github.io/one-for-all/" target="_blank" rel="noopener">Buka One for All</a>
      </div>
      <div class="card pad stack">
        <h2 class="h2">Pengingat</h2>
        <button class="btn sm" style="align-self:flex-start" data-act="notif">Nyalakan notifikasi sesi menulis</button>
        <span class="small muted">Muncul saat app terbuka. Untuk pengingat yang pasti, nyalakan Google Calendar di layar Kalender.</span>
      </div>
      <div class="card pad stack">
        <h2 class="h2">Cadangan</h2>
        <div class="row wrap"><button class="btn sm" data-act="backup">Unduh cadangan (.json)</button><label class="btn sm">Pulihkan dari cadangan<input type="file" accept=".json" id="restore" hidden></label></div>
        <span class="small muted">Cadangan berisi semua ide, pustaka, proyek, draft, dan riwayat versi.</span>
        <button class="btn sm ghost" style="align-self:flex-start;color:var(--accent)" data-act="reset">Hapus semua data di perangkat ini</button>
      </div>
    </div>
  </section>`;
}

function folderId(v) {
  const s = String(v || '').trim();
  const m = s.match(/folders\/([\w-]{10,})/) || s.match(/[?&]id=([\w-]{10,})/) || s.match(/^([\w-]{10,})$/);
  return m ? m[1] : null;
}

export function mount(root) {
  const r = $('#restore', root);
  if (r) r.addEventListener('change', async () => {
    const f = r.files[0]; if (!f) return;
    if (!(await confirmDlg('Pulihkan dari cadangan? Data di perangkat ini diganti isi cadangan.', 'Pulihkan'))) return;
    try { await importBackup(JSON.parse(await f.text())); toast('Cadangan dipulihkan.'); go('#meja'); } catch (e) { toast(e.message || 'Berkas tidak bisa dibaca.'); }
  });
}

export const actions = {
  logout: async () => { if (await confirmDlg('Keluar dari Google? Data tetap ada di perangkat ini; sinkron Drive berhenti sampai kamu masuk lagi.', 'Keluar')) { disconnect(); go('#pengaturan'); } },
  'set-root': async () => {
    const id = folderId($('#root').value);
    if (!id) { toast('Tautan folder tidak dikenali.'); return; }
    if (G.token) {
      try { const m = await drive.meta(id); if (m.mimeType !== 'application/vnd.google-apps.folder') { toast('Itu bukan folder.'); return; } toast(`Memakai folder “${m.name}”.`); } catch (e) { toast(e.message); return; }
    }
    S.state.projects.forEach((p) => { if (p.drive) p.drive = null; });
    resetMeta();
    setSetting('driveRootId', id);
    syncNow();
  },
  notif: async () => {
    if (!('Notification' in window)) { toast('Browser ini tidak mendukung notifikasi.'); return; }
    const p = await Notification.requestPermission();
    toast(p === 'granted' ? 'Notifikasi menyala.' : 'Notifikasi tidak diizinkan.');
  },
  backup: async () => { download(new Blob([JSON.stringify(await exportBackup())], { type: 'application/json' }), `clavis-cadangan-${ymd()}.json`); },
  reset: async () => {
    if (!(await confirmDlg('Hapus SEMUA data Clavis di perangkat ini? Data di Drive tidak ikut terhapus.', 'Hapus semua', true))) return;
    await resetAll();
    ['clavis-sync-meta', KE_OFA].forEach((k) => localStorage.removeItem(k));
    location.hash = '#meja';
    location.reload();
  }
};
