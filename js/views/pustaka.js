/* Clavis — Pustaka: referensi, catatan baca, kutipan, matriks sintesis.
   Impor dari Mendeley lewat BibTeX/RIS, atau langsung dari DOI (Crossref). */
import { S, add, remove, changed, get, now } from '../store.js';
import { esc, uid, ago, fmtDate } from '../util.js';
import { I, $, $$, toast, modal, confirmDlg, opts, promptDlg } from '../ui.js';
import { REF_TYPES, parseBibTeX, parseRIS, fetchDOI, makeKey, shortLabel, formatCitation, prepare, parseNames } from '../cite.js';
import { parseDraft, citedRefs } from '../doc.js';
import { go, isDone } from '../app.js';

export const title = () => 'Pustaka';
let statusF = 'semua';
let tagF = null;
let q = '';
let matrixPid = null;

const STAT = [['belum', 'Belum dibaca'], ['sedang', 'Sedang'], ['selesai', 'Selesai']];
const statBadge = (s) => `<span class="badge ${s === 'selesai' ? 'ok' : s === 'sedang' ? 'warn' : ''}">${esc(s || 'belum')}</span>`;

function usage() {
  const map = new Map();
  S.state.projects.forEach((p) => {
    const d = S.drafts.get(p.id);
    if (!d || !d.html || !d.html.includes('data-refs')) return;
    citedRefs(parseDraft(d.html)).forEach((r) => { if (!map.has(r.id)) map.set(r.id, []); map.get(r.id).push(p); });
  });
  return map;
}

function filtered() {
  const s = q.trim().toLowerCase();
  return S.state.refs.filter((r) => (statusF === 'semua' || (r.status || 'belum') === statusF)
    && (!tagF || (r.tags || []).includes(tagF))
    && (!s || `${shortLabel(r)} ${r.title} ${r.container || ''} ${(r.tags || []).join(' ')}`.toLowerCase().includes(s)))
    .sort((a, b) => shortLabel(a).localeCompare(shortLabel(b), 'id'));
}

function detailHTML(r, use) {
  if (!r) return `<aside class="card pad" style="flex:2 1 340px;min-width:0"><div class="empty">Pilih sumber dari daftar untuk melihat catatan bacanya.</div></aside>`;
  const st = S.state.settings.style;
  const ctx = prepare([r], st);
  const ps = use.get(r.id) || [];
  const ideas = S.state.ideas.filter((i) => (i.refIds || []).includes(r.id));
  const authors = (r.authors || []).map((a) => [a.family, a.given].filter(Boolean).join(', ')).join('; ');
  const where = [r.container, r.volume && `vol. ${r.volume}`, r.issue && `no. ${r.issue}`, r.pages && `hlm. ${r.pages}`, r.publisher, r.place].filter(Boolean).join(' · ');
  return `<aside class="card" style="flex:2 1 340px;min-width:0;display:flex;flex-direction:column" aria-label="Detail sumber">
    <div class="stack" style="gap:8px;padding:18px 20px;border-bottom:1px solid var(--line2)">
      <div class="row between"><span class="label">${esc((REF_TYPES.find((t) => t.id === r.type) || REF_TYPES[8]).label)} · @${esc(r.key || '')}</span>
        <div class="row"><button class="btn xs" data-act="edit" data-id="${r.id}">Ubah data</button><button class="iconbtn" data-act="del" data-id="${r.id}" aria-label="Hapus sumber">${I.trash}</button></div></div>
      <h2 class="h2" style="line-height:1.25">${esc(r.title)}</h2>
      <span class="s13" style="color:var(--ink2)">${esc(authors || 'Tanpa penulis')} · ${esc(r.year || 't.t.')}${where ? ` · ${esc(where)}` : ''}</span>
      ${r.doi || r.url ? `<a class="s13" href="${esc(r.doi ? `https://doi.org/${r.doi}` : r.url)}" target="_blank" rel="noopener">${esc(r.doi ? `doi:${r.doi}` : r.url)}</a>` : ''}
      <div class="row wrap" style="gap:8px">
        <select class="select" style="height:32px;width:auto;font-size:13px" data-bind="refs:${r.id}:status" data-rerender aria-label="Status baca">${opts(STAT, r.status || 'belum')}</select>
        <input class="input" style="height:32px;font-size:13px;max-width:280px" data-bind="refs:${r.id}:tags" data-list value="${esc((r.tags || []).join(', '))}" placeholder="tag, pisahkan dengan koma" aria-label="Tag">
      </div>
      <span class="mono small muted">Contoh sitasi: ${esc(formatCitation([{ ref: r, loc: '' }], 'paren', st, ctx))}</span>
    </div>
    <div class="stack" style="gap:16px;padding:18px 20px;font-size:13px;line-height:1.55">
      <label class="field"><span class="label">Ringkasan saya</span><textarea class="textarea" rows="3" data-bind="refs:${r.id}:summary" placeholder="Apa argumen utamanya? Bagian mana yang relevan?">${esc(r.summary || '')}</textarea></label>
      <div class="stack" style="gap:8px">
        <div class="sec-h"><span class="label">Kutipan penting · ${(r.quotes || []).length}</span><button class="btn xs" data-act="q-add" data-id="${r.id}">${I.plus} Kutipan</button></div>
        ${(r.quotes || []).map((x) => `<div class="stack" style="gap:6px;padding:10px 12px;background:var(--paper);border-radius:6px">
          <p class="serif" style="margin:0;font-size:15px;font-style:italic">“${esc(x.text)}”</p>
          <div class="row between"><span class="mono small muted">${x.page ? `hlm. ${esc(x.page)}` : 'tanpa halaman'}</span>
          <span class="row"><button class="btn xs ghost" data-act="q-copy" data-id="${r.id}" data-q="${x.id}">Salin dengan sitasi</button><button class="btn xs ghost" data-act="q-insert" data-id="${r.id}" data-q="${x.id}">Sisipkan ke draft</button><button class="iconbtn" style="width:28px;height:28px" data-act="q-del" data-id="${r.id}" data-q="${x.id}" aria-label="Hapus kutipan">${I.x}</button></span></div></div>`).join('')}
      </div>
      <label class="field" style="padding:12px 14px;border:1px solid var(--line);border-radius:6px"><span class="label" style="color:var(--accent)">Komentar kritis saya</span><textarea class="textarea" rows="3" style="border:0;padding:0;background:transparent" data-bind="refs:${r.id}:critique" placeholder="Kekuatan, kelemahan, celah yang bisa kamu isi">${esc(r.critique || '')}</textarea></label>
      <div class="row between wrap" style="padding-top:6px;border-top:1px solid var(--line2);color:var(--muted)">
        <span>Dipakai di: ${ps.length || ideas.length ? [...ps.map((p) => `<a href="#draft/${p.id}">${esc(p.title.slice(0, 40))}</a>`), ...ideas.map((i) => `<a href="#ide/${i.id}">ide: ${esc((i.title || '').slice(0, 30))}</a>`)].join(' · ') : 'belum dikutip'}</span>
        <span class="mono small">ditambah ${esc(fmtDate((r.createdAt || '').slice(0, 10), { short: true }))}</span>
      </div>
    </div>
  </aside>`;
}

function matrixHTML(use) {
  const projects = S.state.projects.filter((p) => !isDone(p));
  if (!projects.length) return '';
  const p = projects.find((x) => x.id === matrixPid) || projects[0];
  matrixPid = p.id;
  const themes = p.matrixThemes || [];
  const rows = S.state.refs.filter((r) => (use.get(r.id) || []).some((x) => x.id === p.id) || (p.matrixRefs || []).includes(r.id))
    .sort((a, b) => shortLabel(a).localeCompare(shortLabel(b), 'id'));
  const emptyCol = (t) => rows.length > 1 && rows.filter((r) => !(((r.matrix || {})[p.id] || {})[t.id] || '').trim()).length >= Math.ceil(rows.length * 0.75);
  return `<section class="stack">
    <div class="sec-h"><h2 class="h2">Matriks sintesis</h2>
      <div class="row wrap"><select class="select" style="width:auto;height:36px" data-act-change="mx-project" aria-label="Proyek">${opts(projects.map((x) => [x.id, x.title.slice(0, 50)]), p.id)}</select>
      <button class="btn sm" data-act="mx-theme">${I.plus} Kolom tema</button><button class="btn sm" data-act="mx-row">${I.plus} Baris sumber</button></div></div>
    <p class="s13 muted" style="margin:0">Baris = sumber yang dikutip di draft proyek ini (atau ditambah manual) · kolom = tema. Kolom yang sebagian besar kosong diberi warna: kemungkinan celah penelitian.</p>
    ${themes.length && rows.length ? `<div class="tablebox"><table class="t" style="min-width:${220 + themes.length * 200}px"><thead><tr><th style="width:200px">Sumber</th>
      ${themes.map((t) => `<th class="${emptyCol(t) ? 'gapcol' : ''}"><span class="row between"><span>${esc(t.name)}</span><span class="row" style="gap:0"><button class="iconbtn" style="width:24px;height:24px" data-act="mx-rename" data-t="${t.id}" aria-label="Ganti nama kolom">✎</button><button class="iconbtn" style="width:24px;height:24px" data-act="mx-deltheme" data-t="${t.id}" aria-label="Hapus kolom">${I.x}</button></span></span></th>`).join('')}</tr></thead><tbody>
      ${rows.map((r) => `<tr><td><a href="#pustaka/${r.id}" style="color:var(--ink);font-weight:500">${esc(shortLabel(r))}</a></td>
        ${themes.map((t) => `<td class="cell-edit${emptyCol(t) ? ' gapcol' : ''}"><textarea data-bind="refs:${r.id}:matrix.${p.id}.${t.id}" placeholder="—">${esc((((r.matrix || {})[p.id] || {})[t.id]) || '')}</textarea></td>`).join('')}</tr>`).join('')}
    </tbody></table></div>` : `<div class="empty">${!themes.length ? 'Tambahkan kolom tema, mis. “Folklor sebagai arsip”, “Metode”.' : 'Belum ada sumber: kutip sumber di draft proyek ini, atau tambah baris manual.'}</div>`}
  </section>`;
}

export function render(arg) {
  const refs = S.state.refs;
  const use = usage();
  const list = filtered();
  const cur = arg ? get('refs', arg) : null;
  const tags = [...new Set(refs.flatMap((r) => r.tags || []))].slice(0, 12);
  const count = (s) => refs.filter((r) => (r.status || 'belum') === s).length;
  return `
  <header class="head">
    <div class="t"><span class="label">${refs.length} sumber · ${count('belum')} belum dibaca · ${count('sedang')} sedang dibaca</span><h1 class="h1">Pustaka</h1></div>
    <div class="row wrap">
      <button class="btn" data-act="doi">Impor DOI</button>
      <button class="btn" data-act="paste">Impor dari Mendeley (BibTeX/RIS)</button>
      <button class="btn dark" data-act="manual">${I.plus} Sumber manual</button>
    </div>
  </header>
  <div class="row wrap" style="gap:8px">
    ${[['semua', 'Semua'], ...STAT].map(([k, l]) => `<button class="chip" aria-pressed="${statusF === k}" data-act="sf" data-s="${k}">${l}</button>`).join('')}
    ${tags.length ? '<span aria-hidden="true" style="width:1px;height:22px;background:var(--line);margin:0 6px"></span>' : ''}
    ${tags.map((t) => `<button class="chip" aria-pressed="${tagF === t}" data-act="tagf" data-t="${esc(t)}">tag: ${esc(t)}</button>`).join('')}
    <input id="pq" class="input" style="height:34px;width:220px;margin-left:auto" type="search" placeholder="Cari penulis/judul…" value="${esc(q)}" aria-label="Cari di pustaka">
  </div>
  <section class="cols" style="gap:20px">
    <div class="tablebox" style="flex:3 1 520px;min-width:0">
      <table class="t" style="min-width:620px"><thead><tr><th>Penulis · tahun</th><th>Judul</th><th>Jenis</th><th>Status</th><th>Dipakai di</th></tr></thead><tbody>
      ${list.map((r) => `<tr class="click${cur && cur.id === r.id ? ' sel' : ''}" data-act="go" data-go="#pustaka/${r.id}">
        <td style="white-space:nowrap;font-weight:500">${esc(shortLabel(r))}</td><td class="serif" style="font-size:15px">${esc(r.title)}</td>
        <td class="muted">${esc((REF_TYPES.find((t) => t.id === r.type) || REF_TYPES[8]).label.toLowerCase())}</td><td>${statBadge(r.status)}</td>
        <td class="muted">${(use.get(r.id) || []).length ? `${(use.get(r.id) || []).length} proyek` : '—'}${(!r.year || (!r.publisher && !r.container)) ? ' <span class="badge warn" title="Metadata kurang">kurang</span>' : ''}</td></tr>`).join('')}
      ${!list.length ? `<tr><td colspan="5"><div class="empty" style="margin:8px 0">${refs.length ? 'Tidak ada yang cocok dengan saringan.' : 'Pustaka masih kosong. Dari Mendeley Reference Manager: pilih referensi → Export → BibTeX (.bib) atau RIS, lalu tekan “Impor dari Mendeley”.'}</div></td></tr>` : ''}
      </tbody></table>
    </div>
    ${detailHTML(cur, use)}
  </section>
  ${matrixHTML(use)}`;
}

export function mount(root) {
  const pq = $('#pq', root);
  if (pq) pq.addEventListener('input', () => { q = pq.value; const pos = pq.selectionStart; go(location.hash || '#pustaka'); const n = $('#pq'); if (n) { n.focus(); n.setSelectionRange(pos, pos); } });
  const mx = $('[data-act-change="mx-project"]', root);
  if (mx) mx.addEventListener('change', () => { matrixPid = mx.value; go(location.hash || '#pustaka'); });
}

/* ---------- Formulir sumber ---------- */

function refForm(r = {}) {
  const names = (list) => (list || []).map((a) => [a.family, a.given].filter(Boolean).join(', ')).join('\n');
  return `
    <div class="grid2">
      <label class="field"><span class="s13 muted">Jenis</span><select class="select" name="type">${opts(REF_TYPES, r.type || 'article')}</select></label>
      <label class="field"><span class="s13 muted">Tahun</span><input class="input" name="year" value="${esc(r.year || '')}" placeholder="2021"></label>
    </div>
    <label class="field"><span class="s13 muted">Judul</span><input class="input" name="title" value="${esc(r.title || '')}"></label>
    <div class="grid2">
      <label class="field"><span class="s13 muted">Penulis / sutradara (satu per baris: Nama keluarga, Nama depan)</span><textarea class="textarea" name="authors" rows="3" placeholder="Sari, Dewi">${esc(names(r.authors))}</textarea></label>
      <label class="field"><span class="s13 muted">Editor (bila bab dalam buku)</span><textarea class="textarea" name="editors" rows="3">${esc(names(r.editors))}</textarea></label>
    </div>
    <label class="field"><span class="s13 muted">Nama jurnal / judul buku induk / situs</span><input class="input" name="container" value="${esc(r.container || '')}"></label>
    <div class="grid2">
      <label class="field"><span class="s13 muted">Penerbit / rumah produksi</span><input class="input" name="publisher" value="${esc(r.publisher || '')}"></label>
      <label class="field"><span class="s13 muted">Kota terbit</span><input class="input" name="place" value="${esc(r.place || '')}"></label>
    </div>
    <div class="grid2">
      <label class="field"><span class="s13 muted">Volume · Nomor</span><span class="row"><input class="input" name="volume" value="${esc(r.volume || '')}" placeholder="vol"><input class="input" name="issue" value="${esc(r.issue || '')}" placeholder="no"></span></label>
      <label class="field"><span class="s13 muted">Halaman</span><input class="input" name="pages" value="${esc(r.pages || '')}" placeholder="101–120"></label>
    </div>
    <div class="grid2">
      <label class="field"><span class="s13 muted">Institusi & jenis (skripsi/tesis)</span><span class="row"><input class="input" name="institution" value="${esc(r.institution || '')}" placeholder="Universitas…"><input class="input" name="genre" value="${esc(r.genre || '')}" placeholder="Tesis"></span></label>
      <label class="field"><span class="s13 muted">DOI atau URL</span><span class="row"><input class="input" name="doi" value="${esc(r.doi || '')}" placeholder="10.xxxx/…"><input class="input" name="url" value="${esc(r.url || '')}" placeholder="https://"></span></label>
    </div>`;
}

function readForm(f) {
  const v = (n) => f[n].value.trim();
  return { type: v('type'), year: v('year'), title: v('title'), authors: parseNames(f.authors.value), editors: parseNames(f.editors.value),
    container: v('container'), publisher: v('publisher'), place: v('place'), volume: v('volume'), issue: v('issue'), pages: v('pages'),
    institution: v('institution'), genre: v('genre'), doi: v('doi').replace(/^https?:\/\/(dx\.)?doi\.org\//i, ''), url: v('url') };
}

function addRefs(list) {
  const taken = new Set(S.state.refs.map((r) => r.key));
  const dup = (r) => S.state.refs.find((x) => (r.doi && x.doi && x.doi.toLowerCase() === r.doi.toLowerCase())
    || (x.title && r.title && x.title.toLowerCase() === r.title.toLowerCase() && String(x.year) === String(r.year)));
  let n = 0, skip = 0, last = null;
  list.forEach((r) => {
    if (dup(r)) { skip++; return; }
    const key = r.key && !taken.has(r.key) ? r.key : makeKey(r, taken);
    taken.add(key);
    last = add('refs', { ...r, key, status: 'belum', tags: r.tags || [], quotes: [], summary: '', critique: '', matrix: {} });
    n++;
  });
  return { n, skip, last };
}

export function manualDialog(existing) {
  modal({
    title: existing ? 'Ubah data sumber' : 'Sumber manual', wide: true, body: refForm(existing || {}),
    actions: [{ label: 'Batal' }, { label: 'Simpan', cls: 'dark', primary: true, act: (f) => {
      const r = readForm(f);
      if (!r.title) { f.title.focus(); return false; }
      if (existing) { Object.assign(existing, r); changed(existing, 'refs'); toast('Data sumber diperbarui.'); }
      else { const { last } = addRefs([r]); if (last) go(`#pustaka/${last.id}`); else toast('Sumber ini sudah ada di pustaka.'); }
    } }]
  });
}

const curR = () => { const id = location.hash.split('/')[1]; return id ? get('refs', decodeURIComponent(id)) : null; };

export const actions = {
  sf: (el) => { statusF = el.dataset.s; go(location.hash || '#pustaka'); },
  tagf: (el) => { tagF = tagF === el.dataset.t ? null : el.dataset.t; go(location.hash || '#pustaka'); },
  manual: () => manualDialog(),
  edit: (el) => manualDialog(get('refs', el.dataset.id)),
  doi: async () => {
    const v = await promptDlg('Impor dari DOI', 'DOI atau tautan doi.org', '', { placeholder: '10.1080/xxxx atau https://doi.org/…', hint: 'Data diambil dari Crossref. Butuh internet.' });
    if (!v) return;
    try {
      toast('Mengambil data DOI…', null, null, 2000);
      const r = await fetchDOI(v);
      const { n, last } = addRefs([r]);
      if (n) { toast(`Ditambahkan: ${shortLabel(last)}`); go(`#pustaka/${last.id}`); } else toast('Sumber ini sudah ada di pustaka.');
    } catch (e) { toast(e.message || 'Gagal mengambil data DOI.'); }
  },
  paste: () => {
    modal({
      title: 'Impor dari Mendeley', wide: true,
      body: `<p class="s13" style="margin:0;line-height:1.55;color:var(--ink2)">Di <b>Mendeley Reference Manager</b>: pilih referensi (atau semua dengan Ctrl+A) → klik kanan → <b>Export</b> → pilih <b>BibTeX (.bib)</b> atau <b>RIS</b>. Lalu pilih berkasnya di sini, atau tempel isinya.</p>
        <input class="input" type="file" name="file" accept=".bib,.ris,.txt,.bibtex" style="padding:7px">
        <textarea class="textarea" name="text" rows="10" placeholder="@article{…} atau TY  - JOUR …" style="font-family:var(--mono);font-size:12px"></textarea>
        <p class="small muted" style="margin:0">Sumber yang sudah ada (DOI atau judul+tahun sama) dilewati.</p>`,
      onOpen: (f) => f.file.addEventListener('change', async () => { const file = f.file.files[0]; if (file) f.text.value = await file.text(); }),
      actions: [{ label: 'Batal' }, { label: 'Impor', cls: 'dark', primary: true, act: (f) => {
        const t = f.text.value;
        const list = /^\s*TY\s{1,2}-/m.test(t) ? parseRIS(t) : parseBibTeX(t);
        if (!list.length) { toast('Tidak ada referensi yang terbaca. Pastikan formatnya BibTeX atau RIS.'); return false; }
        const { n, skip } = addRefs(list);
        toast(`${n} sumber ditambahkan${skip ? `, ${skip} sudah ada` : ''}.`);
      } }]
    });
  },
  del: async (el) => {
    const r = get('refs', el.dataset.id);
    if (!r || !(await confirmDlg(`Hapus “${r.title}” dari pustaka? Sitasi ke sumber ini di draft akan ditandai hilang.`, 'Hapus', true))) return;
    remove('refs', r.id);
    go('#pustaka');
  },
  'q-add': async (el) => {
    const r = get('refs', el.dataset.id); if (!r) return;
    modal({
      title: 'Kutipan penting',
      body: `<label class="field"><span class="s13 muted">Kutipan</span><textarea class="textarea" name="t" rows="4"></textarea></label><label class="field"><span class="s13 muted">Halaman</span><input class="input" name="p" placeholder="45"></label>`,
      actions: [{ label: 'Batal' }, { label: 'Simpan', cls: 'dark', primary: true, act: (f) => {
        if (!f.t.value.trim()) return false;
        r.quotes = r.quotes || []; r.quotes.push({ id: uid('q'), text: f.t.value.trim(), page: f.p.value.trim() }); changed(r, 'refs');
      } }]
    });
  },
  'q-del': (el) => { const r = get('refs', el.dataset.id); if (!r) return; r.quotes = (r.quotes || []).filter((x) => x.id !== el.dataset.q); changed(r, 'refs'); },
  'q-copy': async (el) => {
    const r = get('refs', el.dataset.id); const x = r && (r.quotes || []).find((z) => z.id === el.dataset.q);
    if (!x) return;
    const st = S.state.settings.style;
    const cit = formatCitation([{ ref: r, loc: x.page ? `hlm. ${x.page}` : '' }], 'paren', st, prepare([r], st));
    try { await navigator.clipboard.writeText(`“${x.text}” ${cit}`); toast('Disalin bersama sitasinya.'); } catch (e) { toast('Gagal menyalin.'); }
  },
  'q-insert': (el) => {
    const r = get('refs', el.dataset.id); const x = r && (r.quotes || []).find((z) => z.id === el.dataset.q);
    if (!x) return;
    const active = S.state.projects.filter((p) => !isDone(p));
    if (!active.length) { toast('Belum ada proyek untuk disisipi.'); return; }
    modal({
      title: 'Sisipkan ke draft',
      body: `<label class="field"><span class="s13 muted">Proyek</span><select class="select" name="p">${opts(active.map((p) => [p.id, p.title]), S.state.lastDraft)}</select></label><p class="small muted" style="margin:0">Kutipan disisipkan di posisi kursor terakhir di draft itu (atau di akhir), lengkap dengan sitasi berpenanda.</p>`,
      actions: [{ label: 'Batal' }, { label: 'Sisipkan', cls: 'dark', primary: true, act: (f) => {
        S.pendingInsert = { refId: r.id, text: x.text, loc: x.page ? `hlm. ${x.page}` : '' };
        go(`#draft/${f.p.value}`);
      } }]
    });
  },
  'mx-theme': async () => {
    const p = get('projects', matrixPid); if (!p) return;
    const name = await promptDlg('Kolom tema baru', 'Nama tema', '', { placeholder: 'mis. Ruang domestik' });
    if (!name) return;
    p.matrixThemes = [...(p.matrixThemes || []), { id: uid('t'), name: name.trim() }]; changed(p, 'projects');
  },
  'mx-rename': async (el) => {
    const p = get('projects', matrixPid); const t = p && (p.matrixThemes || []).find((x) => x.id === el.dataset.t);
    if (!t) return;
    const name = await promptDlg('Ganti nama kolom', 'Nama tema', t.name);
    if (name) { t.name = name.trim(); changed(p, 'projects'); }
  },
  'mx-deltheme': async (el) => {
    const p = get('projects', matrixPid); if (!p) return;
    if (!(await confirmDlg('Hapus kolom ini beserta isinya?', 'Hapus', true))) return;
    p.matrixThemes = (p.matrixThemes || []).filter((x) => x.id !== el.dataset.t); changed(p, 'projects');
  },
  'mx-row': () => {
    const p = get('projects', matrixPid); if (!p) return;
    const refs = S.state.refs.filter((r) => !(p.matrixRefs || []).includes(r.id));
    if (!refs.length) { toast('Semua sumber sudah ada di matriks.'); return; }
    modal({
      title: 'Tambah baris sumber',
      body: `<select class="select" name="r">${opts(refs.map((r) => [r.id, `${shortLabel(r)} — ${r.title.slice(0, 60)}`]), '')}</select>`,
      actions: [{ label: 'Batal' }, { label: 'Tambah', cls: 'dark', primary: true, act: (f) => { p.matrixRefs = [...(p.matrixRefs || []), f.r.value]; changed(p, 'projects'); } }]
    });
  }
};
