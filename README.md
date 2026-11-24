# Clavis — meja riset

Tempat ide penelitian pelan-pelan menjadi draft: kotak ide, kartu ide berstruktur, editor naskah dengan sitasi berpenanda, pustaka dengan catatan baca dan matriks sintesis, pipeline proyek per tipe output (jurnal, thesis, proposal, tulisan klien), dan kalender tenggat & sesi menulis.

Alamat: https://sitilutfiyah821.github.io/clavis/

## Tersambung dengan

- **Google Drive** — semua data disinkron ke folder "Clavis" milik pemilik:
  `clavis-data.json` (ide, pustaka, proyek, jurnal riset, sesi) dan satu folder per proyek
  (`<Tipe>/<Judul>/draft.clavis`, `Versi/`, `Ekspor/`, `Bagikan/`, `Lampiran/`).
  Data ditulis di perangkat dulu, lalu dikirim ke Drive saat online.
- **Google Calendar** — tenggat proyek dan sesi menulis (satu arah), plus unduhan `.ics`.
- **One for All** — lewat penyimpanan browser di perangkat yang sama:
  Clavis menulis `clavis-ke-ofa-v1` (tenggat, langkah riset, sesi, ide yang mengendap),
  OfA menulis `ofa-ke-clavis-v1` (ide yang ditangkap dengan `#ide`, dan centang jadwal).
- **Mendeley** — impor pustaka lewat BibTeX/RIS. Ekspor Word memakai sitasi teks biasa
  (bisa disorot kuning supaya mudah diganti lewat Mendeley Cite).

## Ekspor

Word (.docx, dengan catatan pinggir sebagai komentar dan tabel linimasa/RAB), Google Docs (salinan di folder Bagikan, komentarnya bisa ditarik kembali), PDF lewat Cetak, Markdown.

## Susunan berkas

- `index.html`, `css/app.css` — tampilan
- `js/app.js` — kerangka, perutean, pengikat isian
- `js/store.js` — penyimpanan di perangkat (IndexedDB)
- `js/sync.js`, `js/google.js`, `js/config.js` — Google Drive & Calendar
- `js/cite.js`, `js/doc.js`, `js/export.js` — sitasi, daftar pustaka, ekspor
- `js/ofa.js` — jembatan One for All
- `js/views/` — layar Meja, Ide, Draft, Pustaka, Proyek, Kalender, Pengaturan
- `vendor/docx.iife.js` — pustaka pembuat Word ([docx](https://github.com/dolanmiu/docx), lisensi MIT)

## Memperbarui

Setelah mengubah berkas, naikkan `VERSI` di `sw.js` (mis. `clavis-v2`) supaya perangkat mengambil versi terbaru.
