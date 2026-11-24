/* Clavis — Proyek: tipe output (template), pipeline, detail per tipe, arsip & portofolio. */
import { S, add, remove, changed, get, typeOf, getDraft, saveDraft, deleteDraft, deleteSnaps, now } from '../store.js';
import { esc, uid, fmtDate, hLabel, daysUntil, ymd, addDays, angka, slugify } from '../util.js';
import { I, $, $$, toast, modal, confirmDlg, opts, typeBadge } from '../ui.js';
import { STYLES } from '../cite.js';
import { templateHTML } from '../doc.js';
import { G, drive } from '../google.js';
import { reviewerDocx, download, fileBase } from '../export.js';
import { projectFolders } from '../sync.js';
import { go, isDone } from '../app.js';

export const title = (arg) => { const p = arg && get('projects', arg); return p ? p.title : 'Proyek'; };
let view = 'pipeline';
let typeFilter = null;
let tab = 'ringkasan';
let reviewRound = null;

const PALETTES = [
  ['#7A2E2E', '#EAD9D4', 'Oxblood'], ['#35506B', '#D9E1EA', 'Biru batu'], ['#3F5E48', '#D7E3DA', 'Hijau lumut'],
  ['#7A4E0E', '#EEDFC6', 'Amber tua'], ['#5B3F7A', '#E5DCEE', 'Ungu tinta'], ['#1F4D3B', '#E4F3EC', 'Hijau OfA'], ['#4A443B', '#ECE7DC', 'Arang']
];

/* ---------- Proyek baru ---------- */

const TARGET_LABEL = { jurnal: 'Jurnal sasaran', klien: 'Nama klien', thesis: 'Kampus / program studi', proposal: 'Lembaga / skema hibah' };

export function newProjectDialog({ type, fromIdea } = {}) {
  const types = S.state.types;
  const t0 = types.find((t) => t.id === type) || types[0];
  const titleVal = fromIdea ? (fromIdea.title || '') : '';
  modal({
    title: fromIdea ? 'Jadikan proyek' : 'Proyek baru',
    body: `
      <div class="field"><span class="s13 muted">Tipe output</span><div class="chips" id="np-types">${types.map((t) => `<button type="button" class="chip" data-t="${t.id}" aria-pressed="${t.id === t0.id}">${esc(t.name)}</button>`).join('')}</div></div>
      <label class="field"><span class="s13 muted">Judul kerja</span><input class="input" name="title" value="${esc(titleVal)}" placeholder="Boleh diganti kapan saja" required></label>
      <label class="field"><span class="s13 muted" id="np-tlabel">${esc(TARGET_LABEL[t0.id] || 'Tujuan / sasaran')}</span><input class="input" name="target" placeholder="boleh dikosongkan"></label>
      <div class="grid2">
        <label class="field"><span class="s13 muted">Batas kata</span><input class="input" name="limit" type="number" min="0" step="100" value="${t0.wordLimit || ''}" placeholder="tanpa batas"></label>
        <label class="field" id="np-style"><span class="s13 muted">Gaya sitasi</span><select class="select" name="style">${opts(STYLES, S.state.settings.style)}</select></label>
      </div>
      <div class="grid2">
        <label class="field"><span class="s13 muted">Tenggat utama</span><input class="input" name="dlabel" value="${t0.id === 'klien' ? 'Draft 1' : t0.id === 'jurnal' ? 'Submit' : t0.id === 'thesis' ? 'Seminar proposal' : 'Pengajuan'}"></label>
        <label class="field"><span class="s13 muted">Tanggal</span><input class="input" name="ddate" type="date"></label>
      </div>
      <p class="small muted" style="margin:0" id="np-desc">${esc(t0.desc || '')}</p>
      <input type="hidden" name="type" value="${t0.id}">`,
    onOpen: (f) => {
      $$('#np-types [data-t]', f).forEach((b) => b.addEventListener('click', () => {
        const t = types.find((x) => x.id === b.dataset.t);
        f.type.value = t.id;
        $$('#np-types [data-t]', f).forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
        $('#np-tlabel', f).textContent = TARGET_LABEL[t.id] || 'Tujuan / sasaran';
        $('#np-desc', f).textContent = t.desc || '';
        f.limit.value = t.wordLimit || '';
        $('#np-style', f).hidden = t.citations === false;
      }));
      $('#np-style', f).hidden = t0.citations === false;
    },
    actions: [{ label: 'Batal' }, { label: 'Buat proyek', cls: 'dark', primary: true, act: (f) => {
      const titleV = f.title.value.trim();
      if (!titleV) { f.title.focus(); return false; }
      const t = types.find((x) => x.id === f.type.value) || t0;
      const deadlines = f.ddate.value ? [{ id: uid('d'), label: f.dlabel.value.trim() || 'Tenggat', date: f.ddate.value, done: false }] : [];
      const sectionTargets = {};
      (t.sections || []).forEach(([name, n]) => { if (n) sectionTargets[slugify(name)] = n; });
      const p = add('projects', {
        title: titleV, type: t.id, stage: t.stages[0], target: f.target.value.trim(), wordLimit: Number(f.limit.value) || 0,
        style: f.style.value, deadlines, sectionTargets, ideaId: fromIdea ? fromIdea.id : null,
        reviewers: [], rounds: [], bimbingan: [], linimasa: [], rab: [], brief: {}, matriks: {}, matrixThemes: [], shares: []
      });
      let intro = '';
      if (fromIdea) {
        const F = fromIdea.fields || {};
        intro = [F.fenomena, F.pertanyaan ? `Pertanyaan penelitian: ${F.pertanyaan}` : '', F.gap ? `Celah: ${F.gap}` : ''].filter(Boolean).map((x) => esc(x)).join('</p><p>');
        fromIdea.status = 'proyek'; fromIdea.projectId = p.id; changed(fromIdea, 'ideas');
      }
      const d = getDraft(p.id);
      d.html = templateHTML(t.sections, intro);
      saveDraft(d);
      toast(`Proyek “${titleV}” dibuat.`);
      setTimeout(() => go(`#draft/${p.id}`), 50);
    } }]
  });
}

/* ---------- Tipe sendiri ---------- */

export function typeDialog(existing) {
  const t = existing || { name: '', label: '', color: PALETTES[4][0], tint: PALETTES[4][1], sections: [['Pendahuluan', 0], ['Isi', 0], ['Penutup', 0]], stages: ['Draft', 'Dikirim', 'Selesai'], done: ['Selesai'], features: [], citations: true, wordLimit: 0, desc: '' };
  modal({
    title: existing ? `Ubah tipe “${t.name}”` : 'Buat tipe sendiri', wide: true,
    body: `
      <div class="grid2">
        <label class="field"><span class="s13 muted">Nama tipe</span><input class="input" name="name" value="${esc(t.name)}" placeholder="mis. Makalah konferensi"></label>
        <label class="field"><span class="s13 muted">Warna</span><select class="select" name="pal">${PALETTES.map(([c, tint, n], i) => `<option value="${i}"${c === t.color ? ' selected' : ''}>${n}</option>`).join('')}</select></label>
      </div>
      <label class="field"><span class="s13 muted">Keterangan singkat</span><input class="input" name="desc" value="${esc(t.desc || '')}"></label>
      <div class="grid2">
        <label class="field"><span class="s13 muted">Bagian naskah (satu per baris, target kata setelah | )</span><textarea class="textarea" name="sections" rows="7">${esc((t.sections || []).map(([n, w]) => (w ? `${n} | ${w}` : n)).join('\n'))}</textarea></label>
        <label class="field"><span class="s13 muted">Tahapan pipeline (satu per baris; tahap terakhir = selesai)</span><textarea class="textarea" name="stages" rows="7">${esc((t.stages || []).join('\n'))}</textarea></label>
      </div>
      <div class="grid2">
        <label class="field"><span class="s13 muted">Batas kata bawaan</span><input class="input" type="number" name="limit" value="${t.wordLimit || ''}"></label>
        <div class="field"><span class="s13 muted">Fitur</span>
          <label class="check"><input type="checkbox" name="cit" ${t.citations !== false ? 'checked' : ''}> Sitasi & daftar pustaka</label>
          ${[['reviewer', 'Tabel tanggapan reviewer'], ['brief', 'Brief & putaran revisi klien'], ['bimbingan', 'Log bimbingan & matriks penelitian'], ['rab', 'Linimasa & RAB']].map(([k, l]) => `<label class="check"><input type="checkbox" name="f" value="${k}" ${(t.features || []).includes(k) ? 'checked' : ''}> ${l}</label>`).join('')}
        </div>
      </div>`,
    actions: [
      ...(existing && !['jurnal', 'thesis', 'proposal', 'klien'].includes(existing.id) ? [{ label: 'Hapus tipe', cls: 'ghost', act: async () => {
        if (S.state.projects.some((p) => p.type === existing.id)) { toast('Tipe ini masih dipakai proyek.'); return false; }
        remove('types', existing.id); return true;
      } }] : []),
      { label: 'Batal' },
      { label: existing ? 'Simpan' : 'Buat tipe', cls: 'dark', primary: true, act: (f) => {
        const name = f.name.value.trim(); if (!name) { f.name.focus(); return false; }
        const [color, tint] = PALETTES[Number(f.pal.value)];
        const sections = f.sections.value.split('\n').map((l) => l.trim()).filter(Boolean).map((l) => { const [n, w] = l.split('|'); return [n.trim(), Number(w) || 0]; });
        const stages = f.stages.value.split('\n').map((l) => l.trim()).filter(Boolean);
        if (!stages.length) { toast('Isi minimal satu tahapan.'); return false; }
        const data = { name, label: name, color, tint, desc: f.desc.value.trim(), sections, stages, done: [stages[stages.length - 1]],
          citations: f.cit.checked, features: $$('input[name=f]:checked', f).map((x) => x.value), wordLimit: Number(f.limit.value) || 0 };
        if (existing) { Object.assign(existing, data); changed(existing, 'types'); }
        else add('types', { ...data, custom: true });
        return true;
      } }
    ]
  });
}

/* ---------- Tampilan ---------- */

function pcard(p, curId) {
  const d = S.drafts.get(p.id);
  const next = (p.deadlines || []).filter((x) => !x.done && x.date).sort((a, b) => (a.date < b.date ? -1 : 1))[0];
  return `<a class="pcard${p.id === curId ? ' cur' : ''}" href="#proyek/${p.id}" draggable="true" data-pid="${p.id}">
    <span class="serif h3">${esc(p.title)}</span>
    <span class="small muted">${angka((d && d.words) || 0)} kata${p.target ? ` · ${esc(p.target)}` : ''}</span>
    ${next ? `<span class="small" style="color:${daysUntil(next.date) <= 7 ? 'var(--accent)' : 'var(--muted)'}">${esc(next.label)} · ${esc(hLabel(next.date))}</span>` : ''}
  </a>`;
}

function pipelineHTML(curId) {
  const types = S.state.types;
  const tf = typeFilter && types.find((t) => t.id === typeFilter);
  const chips = `<div class="chips"><button class="chip" aria-pressed="${!tf}" data-act="tf" data-t="">Semua</button>${types.map((t) => `<button class="chip" aria-pressed="${tf && tf.id === t.id}" data-act="tf" data-t="${t.id}">${esc(t.name)} <span class="mono small">${S.state.projects.filter((p) => p.type === t.id && !isDone(p)).length}</span></button>`).join('')}</div>`;
  const board = (t) => `<div class="board">${t.stages.map((st) => {
    const ps = S.state.projects.filter((p) => p.type === t.id && p.stage === st);
    const done = (t.done || []).includes(st);
    return `<div class="lane"><div class="row between label" style="padding:0 4px${done ? '' : ''}"><span>${esc(st)}</span><span>${ps.length}</span></div>
      <div class="drop" data-type="${t.id}" data-stage="${esc(st)}">${ps.slice(0, done ? 3 : 50).map((p) => pcard(p, curId)).join('')}${done && ps.length > 3 ? `<span class="small muted" style="padding:0 4px">+ ${ps.length - 3} lainnya di arsip</span>` : ''}</div></div>`;
  }).join('')}</div>`;
  if (tf) return `<section class="stack"><div class="sec-h"><h2 class="h2">Pipeline · ${esc(tf.name)}</h2>${chips}</div>${board(tf)}</section>`;
  const used = types.filter((t) => S.state.projects.some((p) => p.type === t.id));
  return `<section class="stack"><div class="sec-h"><h2 class="h2">Pipeline</h2>${chips}</div>
    ${used.length ? used.map((t) => `<div class="stack" style="gap:8px">${typeBadge(t)}${board(t)}</div>`).join('') : '<div class="empty">Belum ada proyek. Pilih tipe output di atas untuk memulai.</div>'}</section>`;
}

function listHTML() {
  const ps = S.state.projects.filter((p) => !isDone(p)).sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
  return `<div class="tablebox"><table class="t"><thead><tr><th>Judul</th><th>Tipe</th><th>Tahap</th><th>Kata</th><th>Tenggat berikutnya</th></tr></thead><tbody>
    ${ps.map((p) => { const d = S.drafts.get(p.id); const n = (p.deadlines || []).filter((x) => !x.done && x.date).sort((a, b) => (a.date < b.date ? -1 : 1))[0];
      return `<tr class="click" data-act="go" data-go="#proyek/${p.id}"><td class="serif" style="font-size:15px">${esc(p.title)}</td><td>${typeBadge(p)}</td><td>${esc(p.stage)}</td><td class="mono">${angka((d && d.words) || 0)}</td><td>${n ? `${esc(n.label)} · ${fmtDate(n.date, { short: true })} (${esc(hLabel(n.date))})` : '—'}</td></tr>`; }).join('')}
    ${!ps.length ? '<tr><td colspan="5" class="muted">Belum ada proyek berjalan.</td></tr>' : ''}</tbody></table></div>`;
}

function archiveHTML() {
  const ps = S.state.projects.filter(isDone).sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
  return `<section class="stack"><div class="sec-h"><h2 class="h2">Arsip & portofolio</h2><span class="s13 muted">Proyek selesai beserta hasil akhirnya: bahan CV dan portofolio.</span></div>
    ${ps.length ? `<div class="tablebox"><table class="t"><thead><tr><th>Judul</th><th>Tipe</th><th>Hasil</th><th>DOI / tautan terbit</th><th>Catatan</th></tr></thead><tbody>
    ${ps.map((p) => `<tr><td><a class="serif" style="font-size:15px;color:var(--ink)" href="#proyek/${p.id}">${esc(p.title)}</a></td><td>${typeBadge(p)}</td><td>${esc(p.stage)}</td>
      <td class="cell-edit"><textarea rows="1" data-bind="projects:${p.id}:result.link" placeholder="https://doi.org/…">${esc((p.result || {}).link || '')}</textarea></td>
      <td class="cell-edit"><textarea rows="1" data-bind="projects:${p.id}:result.note" placeholder="mis. terbit vol. 5 no. 2, testimoni klien">${esc((p.result || {}).note || '')}</textarea></td></tr>`).join('')}
    </tbody></table></div>` : '<div class="empty">Belum ada proyek yang selesai.</div>'}</section>`;
}

/* ---------- Detail ---------- */

function tabsFor(p) {
  const t = typeOf(p);
  const f = t.features || [];
  return [['ringkasan', 'Ringkasan & tenggat'], ...(f.includes('reviewer') ? [['reviewer', 'Tanggapan reviewer']] : []),
    ...(f.includes('brief') ? [['brief', 'Brief & revisi']] : []), ...(f.includes('bimbingan') ? [['bimbingan', 'Bimbingan & matriks']] : []),
    ...(f.includes('rab') ? [['rab', 'Linimasa & RAB']] : [])];
}

const B = (p, path) => `data-bind="projects:${p.id}:${path}"`;

function ringkasanHTML(p) {
  const t = typeOf(p);
  const dls = (p.deadlines || []).slice().sort((a, b) => ((a.date || '9') < (b.date || '9') ? -1 : 1));
  return `
    <div class="kv">
      <label class="field"><span class="label">Judul kerja</span><input class="input" ${B(p, 'title')} value="${esc(p.title)}"></label>
      <label class="field"><span class="label">${esc(TARGET_LABEL[p.type] || 'Tujuan / sasaran')}</span><input class="input" ${B(p, 'target')} value="${esc(p.target || '')}"></label>
      <label class="field"><span class="label">Tahap</span><select class="select" ${B(p, 'stage')} data-rerender>${opts(t.stages, p.stage)}</select></label>
      <label class="field"><span class="label">Batas kata</span><input class="input" type="number" min="0" step="100" ${B(p, 'wordLimit')} data-num value="${p.wordLimit || ''}"></label>
      ${t.citations !== false ? `<label class="field"><span class="label">Gaya sitasi</span><select class="select" ${B(p, 'style')}>${opts(STYLES, p.style || S.state.settings.style)}</select></label>` : ''}
      <label class="field"><span class="label">Tipe</span><select class="select" ${B(p, 'type')} data-rerender>${opts(S.state.types.map((x) => [x.id, x.name]), p.type)}</select></label>
    </div>
    <div class="stack" style="gap:8px">
      <div class="sec-h"><span class="label">Tenggat · masuk ke Kalender, Google Calendar, dan One for All</span><button class="btn sm" data-act="dl-add">${I.plus} Tenggat</button></div>
      ${dls.length ? `<div class="card list">${dls.map((dl) => `<div class="li" style="padding:9px 14px">
        <input type="checkbox" class="check" style="width:18px;height:18px" ${dl.done ? 'checked' : ''} ${B(p, `deadlines.#${dl.id}.done`)} data-rerender aria-label="Selesai">
        <input class="input grow${dl.done ? ' done-txt' : ''}" style="height:34px" ${B(p, `deadlines.#${dl.id}.label`)} value="${esc(dl.label || '')}" aria-label="Nama tenggat">
        <input class="input" style="height:34px;width:150px" type="date" ${B(p, `deadlines.#${dl.id}.date`)} data-rerender value="${esc(dl.date || '')}" aria-label="Tanggal">
        <span class="badge ${dl.date && daysUntil(dl.date) < 0 && !dl.done ? 'err' : ''}" style="min-width:64px;justify-content:center">${dl.date ? esc(hLabel(dl.date)) : '—'}</span>
        <button class="iconbtn" data-act="dl-del" data-id="${dl.id}" aria-label="Hapus tenggat">${I.x}</button></div>`).join('')}</div>` : '<div class="empty" style="padding:14px">Belum ada tenggat.</div>'}
    </div>
    ${isDone(p) ? `<div class="kv"><label class="field"><span class="label">DOI / tautan terbit</span><input class="input" ${B(p, 'result.link')} value="${esc((p.result || {}).link || '')}"></label>
      <label class="field"><span class="label">Catatan hasil</span><input class="input" ${B(p, 'result.note')} value="${esc((p.result || {}).note || '')}"></label></div>` : ''}`;
}

function reviewerHTML(p) {
  const rows = p.reviewers || [];
  const rounds = [...new Set(rows.map((r) => String(r.round || 1)))].sort();
  const rr = reviewRound && rounds.includes(String(reviewRound)) ? String(reviewRound) : rounds[rounds.length - 1] || '1';
  const shown = rows.filter((r) => String(r.round || 1) === rr);
  return `<div class="row between wrap"><div class="row"><span class="label">Putaran</span><div class="seg">${(rounds.length ? rounds : ['1']).map((r) => `<button type="button" aria-pressed="${r === rr}" data-act="rv-round" data-r="${r}">${r}</button>`).join('')}<button type="button" data-act="rv-newround">+</button></div></div>
    <div class="row"><button class="btn sm" data-act="rv-add" data-r="${rr}">${I.plus} Komentar</button><button class="btn sm" data-act="rv-export" data-r="${rr}">Unduh .docx</button>${G.token ? `<button class="btn sm" data-act="rv-drive" data-r="${rr}">Simpan ke Drive</button>` : ''}</div></div>
    <div class="tablebox"><table class="t" style="min-width:760px"><thead><tr><th style="width:70px">No.</th><th>Komentar reviewer</th><th>Tanggapan saya</th><th>Perubahan di draft</th><th style="width:130px">Status</th><th style="width:40px"></th></tr></thead><tbody>
    ${shown.map((r) => `<tr>
      <td class="cell-edit"><textarea rows="1" ${B(p, `reviewers.#${r.id}.no`)}>${esc(r.no || '')}</textarea></td>
      <td class="cell-edit"><textarea ${B(p, `reviewers.#${r.id}.komentar`)} placeholder="Salin komentar reviewer">${esc(r.komentar || '')}</textarea></td>
      <td class="cell-edit"><textarea ${B(p, `reviewers.#${r.id}.tanggapan`)} placeholder="Tanggapanmu">${esc(r.tanggapan || '')}</textarea></td>
      <td class="cell-edit"><textarea ${B(p, `reviewers.#${r.id}.perubahan`)} placeholder="mis. bagian 2.3, paragraf 1">${esc(r.perubahan || '')}</textarea></td>
      <td><select class="select" style="height:32px;font-size:12px" ${B(p, `reviewers.#${r.id}.status`)}>${opts([['belum', 'belum'], ['dikerjakan', 'dikerjakan'], ['selesai', 'selesai']], r.status || 'belum')}</select></td>
      <td><button class="iconbtn" data-act="rv-del" data-id="${r.id}" aria-label="Hapus baris">${I.x}</button></td></tr>`).join('')}
    ${!shown.length ? '<tr><td colspan="6" class="muted">Belum ada komentar di putaran ini. Tekan “+ Komentar”.</td></tr>' : ''}</tbody></table></div>
    <p class="small muted" style="margin:0">${shown.filter((r) => r.status === 'selesai').length} dari ${shown.length} komentar selesai ditanggapi.</p>`;
}

function briefHTML(p) {
  const b = p.brief || {};
  const rounds = p.rounds || [];
  const used = rounds.filter((r) => r.kind === 'revisi').length;
  return `<div class="kv">
      ${[['tujuan', 'Tujuan'], ['audiens', 'Audiens'], ['nada', 'Nada'], ['panjang', 'Panjang'], ['kataKunci', 'Kata kunci'], ['referensi', 'Referensi gaya']].map(([k, l]) => `<label class="field"><span class="label">${l}</span><input class="input" ${B(p, `brief.${k}`)} value="${esc(b[k] || '')}"></label>`).join('')}
      <label class="field"><span class="label">Batas putaran revisi</span><input class="input" type="number" min="0" ${B(p, 'brief.batasRevisi')} data-num value="${esc(b.batasRevisi ?? 2)}"></label>
      <label class="field"><span class="label">Tautan proyek di Niras</span><input class="input" ${B(p, 'brief.niras')} value="${esc(b.niras || '')}" placeholder="https://sitilutfiyah821.github.io/niras/#kerja/…"></label>
    </div>
    ${b.niras ? `<a class="s13" href="${esc(b.niras)}" target="_blank" rel="noopener">Buka di Niras (penawaran, SPK, invoice)</a>` : '<p class="small muted" style="margin:0">Urusan penawaran, SPK, dan invoice tetap di Niras; cukup tautkan di sini.</p>'}
    <div class="stack" style="gap:8px">
      <div class="sec-h"><span class="label">Putaran · revisi terpakai ${used} dari ${b.batasRevisi ?? 2}</span><button class="btn sm" data-act="round-add">${I.plus} Putaran</button></div>
      ${rounds.length ? `<div class="card list">${rounds.map((r) => `<div class="li" style="padding:9px 14px;flex-wrap:wrap">
        <select class="select" style="height:34px;width:140px" ${B(p, `rounds.#${r.id}.kind`)} data-rerender>${opts([['draft', 'Draft dikirim'], ['masukan', 'Masukan klien'], ['revisi', 'Revisi'], ['serah', 'Serah terima']], r.kind)}</select>
        <input class="input" style="height:34px;width:150px" type="date" ${B(p, `rounds.#${r.id}.date`)} value="${esc(r.date || '')}">
        <input class="input grow" style="height:34px;min-width:200px" ${B(p, `rounds.#${r.id}.note`)} value="${esc(r.note || '')}" placeholder="catatan / masukan klien">
        <button class="iconbtn" data-act="round-del" data-id="${r.id}" aria-label="Hapus">${I.x}</button></div>`).join('')}</div>` : '<div class="empty" style="padding:14px">Catat kapan draft dikirim, masukan klien, dan revisi di sini.</div>'}
    </div>`;
}

function bimbinganHTML(p) {
  const m = p.matriks || {};
  const log = (p.bimbingan || []).slice().sort((a, b) => ((a.date || '') < (b.date || '') ? 1 : -1));
  return `<div class="stack" style="gap:8px">
      <div class="sec-h"><span class="label">Log bimbingan</span><button class="btn sm" data-act="bb-add">${I.plus} Bimbingan</button></div>
      <div class="tablebox"><table class="t" style="min-width:700px"><thead><tr><th style="width:150px">Tanggal</th><th>Catatan pembimbing</th><th>Revisi diminta</th><th style="width:130px">Status</th><th style="width:40px"></th></tr></thead><tbody>
      ${log.map((r) => `<tr><td><input class="input" style="height:32px" type="date" ${B(p, `bimbingan.#${r.id}.date`)} value="${esc(r.date || '')}"></td>
        <td class="cell-edit"><textarea ${B(p, `bimbingan.#${r.id}.catatan`)}>${esc(r.catatan || '')}</textarea></td>
        <td class="cell-edit"><textarea ${B(p, `bimbingan.#${r.id}.revisi`)}>${esc(r.revisi || '')}</textarea></td>
        <td><select class="select" style="height:32px;font-size:12px" ${B(p, `bimbingan.#${r.id}.status`)}>${opts([['belum', 'belum'], ['dikerjakan', 'dikerjakan'], ['selesai', 'selesai']], r.status || 'belum')}</select></td>
        <td><button class="iconbtn" data-act="bb-del" data-id="${r.id}" aria-label="Hapus">${I.x}</button></td></tr>`).join('')}
      ${!log.length ? '<tr><td colspan="5" class="muted">Belum ada catatan bimbingan.</td></tr>' : ''}</tbody></table></div>
    </div>
    <div class="stack" style="gap:8px"><span class="label">Matriks penelitian · supaya semuanya nyambung</span>
      <div class="grid2">${[['rumusan', 'Rumusan masalah'], ['tujuan', 'Tujuan'], ['teori', 'Teori'], ['metode', 'Metode'], ['instrumen', 'Instrumen & data'], ['temuan', 'Temuan yang diharapkan']].map(([k, l]) => `<label class="fieldbox"><span class="label">${l}</span><textarea rows="3" ${B(p, `matriks.${k}`)}>${esc(m[k] || '')}</textarea></label>`).join('')}</div>
    </div>`;
}

const rupiah = (n) => `Rp${Number(n || 0).toLocaleString('id-ID')}`;
function rabHTML(p) {
  const lm = p.linimasa || [];
  const rab = p.rab || [];
  const total = rab.reduce((s, r) => s + (Number(r.vol) || 0) * (Number(r.harga) || 0), 0);
  return `<div class="stack" style="gap:8px">
      <div class="sec-h"><span class="label">Linimasa · tampil sebagai tabel di bagian “Linimasa” saat diekspor</span><button class="btn sm" data-act="lm-add">${I.plus} Kegiatan</button></div>
      <div class="tablebox"><table class="t"><thead><tr><th>Kegiatan</th><th style="width:150px">Mulai</th><th style="width:150px">Selesai</th><th style="width:40px"></th></tr></thead><tbody>
      ${lm.map((r) => `<tr><td class="cell-edit"><textarea rows="1" ${B(p, `linimasa.#${r.id}.kegiatan`)}>${esc(r.kegiatan || '')}</textarea></td>
        <td><input class="input" style="height:32px" type="date" ${B(p, `linimasa.#${r.id}.mulai`)} value="${esc(r.mulai || '')}"></td>
        <td><input class="input" style="height:32px" type="date" ${B(p, `linimasa.#${r.id}.selesai`)} value="${esc(r.selesai || '')}"></td>
        <td><button class="iconbtn" data-act="lm-del" data-id="${r.id}" aria-label="Hapus">${I.x}</button></td></tr>`).join('')}
      ${!lm.length ? '<tr><td colspan="4" class="muted">Belum ada kegiatan.</td></tr>' : ''}</tbody></table></div>
    </div>
    <div class="stack" style="gap:8px">
      <div class="sec-h"><span class="label">RAB · tampil sebagai tabel di bagian “Anggaran” · total ${rupiah(total)}</span><button class="btn sm" data-act="rab-add">${I.plus} Pos anggaran</button></div>
      <div class="tablebox"><table class="t"><thead><tr><th>Pos</th><th style="width:90px">Volume</th><th style="width:110px">Satuan</th><th style="width:150px">Harga satuan</th><th style="width:140px">Jumlah</th><th style="width:40px"></th></tr></thead><tbody>
      ${rab.map((r) => `<tr><td class="cell-edit"><textarea rows="1" ${B(p, `rab.#${r.id}.item`)}>${esc(r.item || '')}</textarea></td>
        <td><input class="input" style="height:32px" type="number" min="0" ${B(p, `rab.#${r.id}.vol`)} data-num data-rerender value="${esc(r.vol ?? '')}"></td>
        <td><input class="input" style="height:32px" ${B(p, `rab.#${r.id}.satuan`)} value="${esc(r.satuan || '')}"></td>
        <td><input class="input" style="height:32px" type="number" min="0" step="1000" ${B(p, `rab.#${r.id}.harga`)} data-num data-rerender value="${esc(r.harga ?? '')}"></td>
        <td class="mono">${rupiah((Number(r.vol) || 0) * (Number(r.harga) || 0))}</td>
        <td><button class="iconbtn" data-act="rab-del" data-id="${r.id}" aria-label="Hapus">${I.x}</button></td></tr>`).join('')}
      ${!rab.length ? '<tr><td colspan="6" class="muted">Belum ada pos anggaran.</td></tr>' : ''}</tbody></table></div>
    </div>`;
}

function detailHTML(p) {
  const tabs = tabsFor(p);
  if (!tabs.some(([k]) => k === tab)) tab = 'ringkasan';
  const body = { ringkasan: ringkasanHTML, reviewer: reviewerHTML, brief: briefHTML, bimbingan: bimbinganHTML, rab: rabHTML }[tab](p);
  const folder = p.drive && p.drive.folderId;
  return `<section class="card detail" id="detail">
    <div class="dt"><div class="row between wrap">
      <div class="row wrap">${typeBadge(p, p.stage)}<h2 class="h2">${esc(p.title)}</h2></div>
      <div class="row wrap">
        ${folder ? `<a class="btn sm" href="https://drive.google.com/drive/folders/${folder}" target="_blank" rel="noopener">${I.drive} Folder di Drive</a>` : ''}
        <button class="iconbtn" data-act="del-project" aria-label="Hapus proyek">${I.trash}</button>
        <a class="btn dark sm" href="#draft/${p.id}">Buka draft</a>
      </div></div>
      <div class="tabs" role="tablist" style="max-width:720px">${tabs.map(([k, l]) => `<button type="button" role="tab" aria-selected="${tab === k}" data-act="tab" data-t="${k}">${l}</button>`).join('')}</div>
    </div>
    <div class="db">${body}</div>
  </section>`;
}

export function render(arg) {
  const p = arg ? get('projects', arg) : null;
  const active = S.state.projects.filter((x) => !isDone(x)).length;
  return `
  <header class="head">
    <div class="t"><span class="label">${active} berjalan · ${S.state.projects.length - active} di arsip</span><h1 class="h1">Proyek</h1></div>
    <div class="seg" role="group" aria-label="Tampilan">${[['pipeline', 'Pipeline'], ['daftar', 'Daftar'], ['arsip', 'Arsip & portofolio']].map(([k, l]) => `<button type="button" aria-pressed="${view === k}" data-act="view" data-v="${k}">${l}</button>`).join('')}</div>
  </header>
  <section class="stack">
    <div class="sec-h"><h2 class="h2">Proyek baru — pilih tipe output</h2><span class="s13 muted">Tiap tipe membawa struktur bab, gaya sitasi, tahapan, dan fitur sendiri.</span></div>
    <div class="typegrid">
      ${S.state.types.map((t) => `<button type="button" class="typecard" data-act="new-project" data-type="${t.id}">
        <span class="row between" style="width:100%"><span class="badge" style="background:${t.tint};color:${t.color}">${esc(t.name)}</span>${t.custom ? `<span class="small muted" data-act="edit-type" data-t="${t.id}" role="button" tabindex="0">ubah</span>` : ''}</span>
        <span class="serif" style="font-size:19px">${esc(t.label || t.name)}</span>
        <span class="small" style="line-height:1.5;color:var(--ink2)">${esc(t.desc || `${(t.sections || []).map((s) => s[0]).join(' · ')}`)}</span></button>`).join('')}
      <button type="button" class="typecard new" data-act="new-type"><span class="serif" style="font-size:19px;color:var(--ink2)">+ Buat tipe sendiri</span><span class="small" style="line-height:1.5">Artikel populer, makalah konferensi, book chapter, laporan… Tipe adalah template yang bisa diubah.</span></button>
    </div>
  </section>
  ${p ? detailHTML(p) : ''}
  ${view === 'pipeline' ? pipelineHTML(p && p.id) : view === 'daftar' ? listHTML() : archiveHTML()}`;
}

export function mount(root, arg) {
  if (arg && $('#detail', root) && !mount.scrolled) { mount.scrolled = arg; $('#detail', root).scrollIntoView({ block: 'start' }); }
  if (!arg) mount.scrolled = null;
  $$('.pcard', root).forEach((c) => c.addEventListener('dragstart', (e) => { e.dataTransfer.setData('text/plain', c.dataset.pid); e.dataTransfer.effectAllowed = 'move'; }));
  $$('.drop', root).forEach((z) => {
    z.addEventListener('dragover', (e) => { e.preventDefault(); z.classList.add('over'); });
    z.addEventListener('dragleave', () => z.classList.remove('over'));
    z.addEventListener('drop', (e) => {
      e.preventDefault(); z.classList.remove('over');
      const p = get('projects', e.dataTransfer.getData('text/plain'));
      if (!p) return;
      if (p.type !== z.dataset.type) { toast('Proyek hanya bisa dipindah di dalam tipenya sendiri.'); return; }
      p.stage = z.dataset.stage; changed(p, 'projects');
      toast(`“${p.title}” → ${p.stage}`);
    });
  });
}

const curP = () => { const id = location.hash.split('/')[1]; return id ? get('projects', decodeURIComponent(id)) : null; };
const pushRow = (key, row) => { const p = curP(); if (!p) return; p[key] = p[key] || []; p[key].push({ id: uid(key[0]), ...row }); changed(p, 'projects'); };
const delRow = (key, id) => { const p = curP(); if (!p) return; p[key] = (p[key] || []).filter((r) => r.id !== id); changed(p, 'projects'); };

export const actions = {
  view: (el) => { view = el.dataset.v; go(location.hash || '#proyek'); },
  tf: (el) => { typeFilter = el.dataset.t || null; go(location.hash || '#proyek'); },
  tab: (el) => { tab = el.dataset.t; go(location.hash); },
  'new-type': () => typeDialog(),
  'edit-type': (el, e) => { e.stopPropagation(); typeDialog(S.state.types.find((t) => t.id === el.dataset.t)); },
  'dl-add': () => pushRow('deadlines', { label: 'Tenggat', date: ymd(addDays(new Date(), 7)), done: false }),
  'dl-del': (el) => {
    const p = curP(); const dl = p && (p.deadlines || []).find((x) => x.id === el.dataset.id);
    if (dl && dl.calId) { S.state.calTrash = [...(S.state.calTrash || []), dl.calId]; }
    delRow('deadlines', el.dataset.id);
  },
  'rv-round': (el) => { reviewRound = el.dataset.r; go(location.hash); },
  'rv-newround': () => { const p = curP(); if (!p) return; const n = Math.max(0, ...(p.reviewers || []).map((r) => Number(r.round) || 1)) + 1; reviewRound = String(n); pushRow('reviewers', { round: n, no: `R1-1`, status: 'belum' }); },
  'rv-add': (el) => { const p = curP(); if (!p) return; const n = (p.reviewers || []).filter((r) => String(r.round || 1) === el.dataset.r).length + 1; pushRow('reviewers', { round: Number(el.dataset.r) || 1, no: `R1-${n}`, status: 'belum' }); },
  'rv-del': (el) => delRow('reviewers', el.dataset.id),
  'rv-export': async (el) => { const p = curP(); if (!p) return; try { download(await reviewerDocx(p, el.dataset.r), `${fileBase(p)} · tanggapan reviewer putaran ${el.dataset.r}.docx`); } catch (e) { toast(e.message); } },
  'rv-drive': async (el) => {
    const p = curP(); if (!p) return;
    try {
      const blob = await reviewerDocx(p, el.dataset.r);
      const f = await projectFolders(p);
      await drive.upload({ parentId: f.eksporId, name: `${fileBase(p)} · tanggapan reviewer putaran ${el.dataset.r}.docx`, mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', data: blob });
      toast('Tabel tanggapan tersimpan di Drive › Ekspor.');
    } catch (e) { toast(e.message); }
  },
  'round-add': () => pushRow('rounds', { kind: 'draft', date: ymd(), note: '' }),
  'round-del': (el) => delRow('rounds', el.dataset.id),
  'bb-add': () => pushRow('bimbingan', { date: ymd(), catatan: '', revisi: '', status: 'belum' }),
  'bb-del': (el) => delRow('bimbingan', el.dataset.id),
  'lm-add': () => pushRow('linimasa', { kegiatan: '', mulai: '', selesai: '' }),
  'lm-del': (el) => delRow('linimasa', el.dataset.id),
  'rab-add': () => pushRow('rab', { item: '', vol: 1, satuan: 'paket', harga: 0 }),
  'rab-del': (el) => delRow('rab', el.dataset.id),
  'del-project': async () => {
    const p = curP(); if (!p) return;
    const folder = p.drive && p.drive.folderId && G.token;
    modal({
      title: 'Hapus proyek?',
      body: `<p style="margin:0;line-height:1.55">“${esc(p.title)}” beserta draft dan riwayat versinya akan dihapus dari Clavis.</p>${folder ? '<label class="check"><input type="checkbox" name="trash"> Pindahkan juga folder proyek di Drive ke Sampah</label>' : ''}`,
      actions: [{ label: 'Batal' }, { label: 'Hapus', cls: 'accent', primary: true, act: async (f) => {
        if (folder && f.trash && f.trash.checked) { try { await drive.trash(p.drive.folderId); } catch (e) { toast(e.message); } }
        (p.deadlines || []).forEach((dl) => { if (dl.calId) S.state.calTrash = [...(S.state.calTrash || []), dl.calId]; });
        S.state.ideas.forEach((i) => { if (i.projectId === p.id) { i.projectId = null; i.status = 'siap'; i.updatedAt = now(); } });
        remove('projects', p.id);
        await deleteDraft(p.id); await deleteSnaps(p.id);
        toast('Proyek dihapus.');
        go('#proyek');
      } }]
    });
  }
};
