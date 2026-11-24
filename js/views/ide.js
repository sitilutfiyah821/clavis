/* Clavis — Ide: kotak ide (inbox), kartu ide berstruktur, langkah berikutnya (ke One for All), peta ide. */
import { S, add, remove, changed, get, IDEA_FIELDS, now } from '../store.js';
import { esc, ago, fmtDate, ymd, addDays, uid } from '../util.js';
import { I, $, $$, toast, modal, confirmDlg, opts } from '../ui.js';
import { shortLabel } from '../cite.js';
import { ofaSeen } from '../ofa.js';
import { go } from '../app.js';
import { newProjectDialog } from './proyek.js';

export const title = () => 'Ide';
let mode = 'kartu';
let filter = 'semua';
let kind = 'catatan';

const STATUS = [['mentah', 'Mentah'], ['berkembang', 'Berkembang'], ['siap', 'Siap']];
const KINDS = [['catatan', 'Catatan'], ['kutipan', 'Kutipan'], ['tautan', 'Tautan'], ['foto', 'Foto/tangkapan layar']];

const ideas = () => S.state.ideas;
const developed = () => ideas().filter((i) => i.status !== 'inbox');

function filled(i) { return IDEA_FIELDS.filter(([k]) => (i.fields || {})[k] && i.fields[k].trim()).length; }

function branchTree(curId) {
  const root = new Map();
  ideas().filter((i) => i.status !== 'inbox').forEach((i) => {
    const path = (i.branch || 'Tanpa cabang').split('›').map((x) => x.trim()).filter(Boolean);
    let node = root;
    path.forEach((seg) => {
      if (!node.has(seg)) node.set(seg, { kids: new Map(), ideas: [] });
      const n = node.get(seg);
      if (seg === path[path.length - 1]) n.ideas.push(i);
      node = n.kids;
    });
  });
  const draw = (map) => [...map.entries()].sort((a, b) => (a[0] === 'Tanpa cabang') - (b[0] === 'Tanpa cabang') || a[0].localeCompare(b[0], 'id')).map(([name, n]) => `
    <div class="node">${esc(name)}</div>
    <div class="kids">${n.ideas.map((i) => `<a class="leaf${i.id === curId ? ' cur' : ''}${i.projectId ? ' proj' : ''}" href="#ide/${i.id}"><span>${esc(i.title || 'Tanpa judul')}</span>${i.projectId ? '<span class="mono" style="font-size:10px;letter-spacing:.06em;text-transform:uppercase">proyek</span>' : `<span class="mono small muted">${filled(i)}/5</span>`}</a>`).join('')}${draw(n.kids)}</div>`).join('');
  return root.size ? draw(root) : '<p class="small muted" style="margin:0">Peta muncul setelah ide dikembangkan dan diberi cabang.</p>';
}

function suggestion() {
  const list = developed().filter((i) => !i.projectId);
  for (let a = 0; a < list.length; a++) {
    for (let b = a + 1; b < list.length; b++) {
      const A = list[a], B = list[b];
      const shared = (A.tags || []).filter((t) => (B.tags || []).includes(t));
      const sameLeaf = A.branch && A.branch === B.branch;
      if (shared.length || sameLeaf) return { A, B, why: shared.length ? `sama-sama bertag “${shared[0]}”` : 'berada di cabang yang sama' };
    }
  }
  return null;
}

function inboxHTML() {
  const inbox = ideas().filter((i) => i.status === 'inbox').sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  const fromOfa = inbox.filter((i) => i.source === 'ofa').length;
  return `<div class="ide-inbox">
    <div class="sec-h"><h2 class="h2" style="font-size:20px">Kotak ide</h2><span class="mono small muted">inbox · ${inbox.length}${fromOfa ? ` · ${fromOfa} dari OfA` : ''}</span></div>
    <div class="card pad stack" style="padding:14px">
      <label for="lempar" class="s13" style="color:var(--ink2)">Lempar apa saja, kategorikan nanti</label>
      <div class="chips" role="group" aria-label="Jenis">${KINDS.map(([k, l]) => `<button type="button" class="chip" style="height:30px;font-size:12px" aria-pressed="${kind === k}" data-act="kind" data-k="${k}">${l}</button>`).join('')}</div>
      <textarea id="lempar" class="textarea sunk" rows="3" placeholder="Kalimat iseng, kutipan, tautan…"></textarea>
      <div class="row between"><span class="small muted">Ctrl+Enter untuk simpan</span><button class="btn dark sm" data-act="capture">Simpan ke kotak</button></div>
    </div>
    ${inbox.map((i) => `<div class="card inbox-item${i.source === 'ofa' ? ' ofa' : ''}">
      <div class="row between"><span class="label">${esc((KINDS.find(([k]) => k === i.kind) || KINDS[0])[1])} · ${esc(ago(i.createdAt))}</span>
      ${i.source === 'ofa' ? `<span class="badge ofa">dari OfA · ${esc(i.sourceInfo || 'ponsel')}</span>` : ''}</div>
      <p${i.kind === 'kutipan' ? ' style="font-style:italic"' : ''}>${linkify(i.text || i.title)}</p>
      <div class="row between"><span class="small muted">${i.branch ? `usul cabang: ${esc(i.branch)}` : ''}</span>
        <span class="row"><button class="iconbtn" data-act="del" data-id="${i.id}" aria-label="Hapus ide">${I.trash}</button><button class="btn line sm" data-act="develop" data-id="${i.id}">Kembangkan</button></span></div>
    </div>`).join('')}
    ${!inbox.length ? `<div class="empty">Kotak kosong. ${ofaSeen() ? 'Ide yang kamu tangkap di One for All (ketik <b>#ide</b> di catat cepat) juga masuk ke sini.' : 'Dari One for All, ketik <b>#ide</b> di catat cepat untuk mengirim ide ke sini.'}</div>` : ''}
  </div>`;
}

function linkify(t) {
  return esc(t).replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" rel="noopener">$1</a>');
}

function cardHTML(i) {
  if (!i) {
    return `<div class="ide-card"><div class="empty" style="padding:40px">Pilih ide dari peta, atau tekan <b>Kembangkan</b> pada butir di kotak ide untuk menjadikannya kartu berstruktur.</div></div>`;
  }
  const steps = i.steps || [];
  const doneN = steps.filter((s) => s.done).length;
  const refs = (i.refIds || []).map((id) => S.state.refs.find((r) => r.id === id)).filter(Boolean);
  const branches = [...new Set(ideas().map((x) => x.branch).filter(Boolean))];
  return `<article class="ide-card card" aria-label="Kartu ide">
    <div class="row between wrap" style="padding:16px 20px;border-bottom:1px solid var(--line2)">
      <div class="row"><span class="label">Status</span><div class="seg">${STATUS.map(([k, l]) => `<button type="button" aria-pressed="${i.status === k}" data-act="status" data-s="${k}">${l}</button>`).join('')}</div></div>
      <div class="row">
        <button class="iconbtn" data-act="del" data-id="${i.id}" aria-label="Hapus ide">${I.trash}</button>
        ${i.projectId && get('projects', i.projectId) ? `<a class="btn" href="#proyek/${i.projectId}">Lihat proyek</a>` : `<button class="btn accent" data-act="to-project">Jadikan proyek →</button>`}
      </div>
    </div>
    <div class="stack" style="gap:20px;padding:20px">
      <div class="stack" style="gap:8px">
        <label class="label" for="i-title">Judul kerja</label>
        <input id="i-title" class="input serif" style="font-size:24px;height:auto;padding:6px 10px;border-color:transparent;background:transparent" data-bind="ideas:${i.id}:title" value="${esc(i.title || '')}" placeholder="Judul kerja ide ini">
        <div class="row wrap" style="gap:8px">
          <label class="row s13 muted" style="gap:6px">Tag <input class="input" style="height:32px;width:220px;font-size:13px" data-bind="ideas:${i.id}:tags" data-list value="${esc((i.tags || []).join(', '))}" placeholder="pisahkan dengan koma"></label>
          <label class="row s13 muted" style="gap:6px">Cabang <input class="input" style="height:32px;width:260px;font-size:13px" list="branches" data-bind="ideas:${i.id}:branch" value="${esc(i.branch || '')}" placeholder="mis. Horor Indonesia › Makhluk folklor"></label>
          <datalist id="branches">${branches.map((b) => `<option value="${esc(b)}">`).join('')}</datalist>
        </div>
        ${i.text && i.text !== i.title ? `<p class="s13 muted" style="margin:0;white-space:pre-wrap">Tangkapan awal: ${linkify(i.text)}</p>` : ''}
      </div>
      <div class="grid2">
        ${IDEA_FIELDS.slice(0, 4).map(([k, l], n) => `<label class="fieldbox"><span class="label">${n + 1} · ${l}</span><textarea data-bind="ideas:${i.id}:fields.${k}" rows="4">${esc((i.fields || {})[k] || '')}</textarea></label>`).join('')}
      </div>
      <label class="fieldbox" style="background:transparent;border:1px solid var(--line)"><span class="label">5 · Kenapa menarik</span><textarea class="serif" style="font-size:17px" data-bind="ideas:${i.id}:fields.menarik" rows="3">${esc((i.fields || {}).menarik || '')}</textarea></label>

      <div class="stack" style="gap:10px;padding:16px 18px;background:var(--paper);border:1px solid var(--line);border-radius:8px">
        <div class="sec-h"><span class="label">6 · Langkah berikutnya · ke One for All</span><span class="small" style="color:var(--ofa)">${doneN} dari ${steps.length} selesai</span></div>
        <div class="card list steps">
          ${steps.map((s) => `<div class="li">
            <input type="checkbox" class="check" style="width:18px;height:18px;accent-color:#2F8A63" ${s.done ? 'checked' : ''} data-act="step-done" data-sid="${s.id}" aria-label="Selesai">
            <input type="text" class="grow${s.done ? ' done-txt' : ''}" value="${esc(s.text)}" data-act-input="step-text" data-sid="${s.id}" aria-label="Langkah">
            <input type="date" value="${esc(s.date || '')}" data-act-change="step-date" data-sid="${s.id}" aria-label="Tanggal">
            <button type="button" class="badge ${s.toOfa ? 'ofa' : ''}" style="border:0;cursor:pointer" data-act="step-ofa" data-sid="${s.id}" title="${s.toOfa ? 'Terkirim ke OfA. Klik untuk menarik.' : 'Kirim ke OfA'}">${s.toOfa ? 'OfA ✓' : 'belum dikirim'}</button>
            <button class="iconbtn" style="width:28px;height:28px" data-act="step-del" data-sid="${s.id}" aria-label="Hapus langkah">${I.x}</button>
          </div>`).join('')}
          <div class="li"><span style="width:18px"></span><input id="new-step" type="text" class="grow" placeholder="Tambah langkah, mis. cari 1 studi tentang makanan di televisi" aria-label="Langkah baru"><button class="btn sm" data-act="step-add">Tambah</button></div>
        </div>
        <div class="row between wrap">
          <label class="check"><input type="checkbox" data-bind="ideas:${i.id}:remind" ${i.remind !== false ? 'checked' : ''}> Minta Ofa mengingatkan bila kartu ini diam 14 hari</label>
          <button class="btn ofa sm" data-act="steps-to-ofa">Kirim langkah ke OfA</button>
        </div>
      </div>

      <div class="row between wrap" style="padding-top:6px;border-top:1px solid var(--line2)">
        <div class="stack" style="gap:4px"><span class="label">Bacaan terkait · ${refs.length}</span>
          <span class="s13" style="color:var(--ink2)">${refs.length ? refs.map((r) => `<a href="#pustaka/${r.id}">${esc(shortLabel(r))}</a>`).join(' · ') : 'belum ada'}</span></div>
        <div class="row"><button class="btn sm" data-act="link-refs">Tautkan referensi</button><button class="btn sm" data-act="merge">Gabungkan dengan ide lain</button></div>
      </div>
      <p class="mono small muted" style="margin:0">Dibuat ${esc(fmtDate((i.createdAt || '').slice(0, 10)))} · disentuh ${esc(ago(i.touchedAt || i.updatedAt))}${i.source === 'ofa' ? ' · ditangkap lewat One for All' : ''}</p>
    </div>
  </article>`;
}

function listHTML() {
  const rows = developed().filter((i) => filter === 'semua' || i.status === filter);
  return `<div class="tablebox" style="flex:1 1 100%"><table class="t"><thead><tr><th>Judul</th><th>Status</th><th>Cabang</th><th>Kolom terisi</th><th>Langkah</th><th>Disentuh</th></tr></thead><tbody>
    ${rows.map((i) => `<tr class="click" data-act="open" data-id="${i.id}"><td class="serif" style="font-size:15px">${esc(i.title || 'Tanpa judul')}</td><td>${esc((STATUS.find(([k]) => k === i.status) || ['', i.status === 'proyek' ? 'Proyek' : i.status])[1])}</td><td class="muted">${esc(i.branch || '—')}</td><td class="mono">${filled(i)}/5</td><td class="mono">${(i.steps || []).filter((s) => s.done).length}/${(i.steps || []).length}</td><td class="muted">${esc(ago(i.touchedAt || i.updatedAt))}</td></tr>`).join('')}
    ${!rows.length ? '<tr><td colspan="6" class="muted">Belum ada ide di sini.</td></tr>' : ''}</tbody></table></div>`;
}

export function render(arg) {
  const all = ideas();
  const counts = STATUS.map(([k, l]) => `${all.filter((i) => i.status === k).length} ${l.toLowerCase()}`).join(' · ');
  let cur = arg ? get('ideas', arg) : null;
  if (cur && cur.status === 'inbox') cur = null;
  if (!cur) cur = developed().filter((i) => i.status !== 'proyek').sort((a, b) => ((a.touchedAt || a.updatedAt) < (b.touchedAt || b.updatedAt) ? 1 : -1))[0] || null;
  const sug = suggestion();
  return `
  <header class="head">
    <div class="t"><span class="label">${all.length} ide · ${counts}</span><h1 class="h1">Ide</h1></div>
    <div class="row wrap">
      <div class="seg" role="group" aria-label="Tampilan">${[['kartu', 'Kartu'], ['daftar', 'Daftar']].map(([k, l]) => `<button type="button" aria-pressed="${mode === k}" data-act="mode" data-m="${k}">${l}</button>`).join('')}</div>
      ${mode === 'daftar' ? `<div class="seg">${[['semua', 'Semua'], ...STATUS, ['proyek', 'Jadi proyek']].map(([k, l]) => `<button type="button" aria-pressed="${filter === k}" data-act="filter" data-f="${k}">${l}</button>`).join('')}</div>` : ''}
    </div>
  </header>
  <section class="ide-grid">
    ${inboxHTML()}
    ${mode === 'daftar' ? listHTML() : cardHTML(cur)}
    ${mode === 'kartu' ? `<aside class="ide-map" aria-label="Peta ide">
      <div class="sec-h"><h2 class="h2" style="font-size:20px">Peta ide</h2><span class="mono small muted">${new Set(developed().map((i) => (i.branch || '').split('›')[0].trim()).filter(Boolean)).size} cabang</span></div>
      <div class="card tree">${branchTree(cur && cur.id)}</div>
      ${sug ? `<div class="note"><span class="label">Saran gabungan</span><br>“${esc(sug.A.title)}” dan “${esc(sug.B.title)}” ${esc(sug.why)}. Mungkin satu tulisan perbandingan?</div>` : ''}
    </aside>` : ''}
  </section>`;
}

let curId = null;
export function mount(root, arg) {
  const t = $('#lempar', root);
  if (t) t.addEventListener('keydown', (e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); actions.capture(); } });
  const ns = $('#new-step', root);
  if (ns) ns.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); actions['step-add'](); } });
  // id kartu yang sedang terbuka (dari tombol status, dll.)
  const bind = root.querySelector('[data-bind^="ideas:"]');
  curId = bind ? bind.dataset.bind.split(':')[1] : null;
  $$('[data-act-input="step-text"]', root).forEach((el) => el.addEventListener('change', () => {
    const s = step(el.dataset.sid); if (!s) return; s.text = el.value; touch();
  }));
  $$('[data-act-change="step-date"]', root).forEach((el) => el.addEventListener('change', () => {
    const s = step(el.dataset.sid); if (!s) return; s.date = el.value; touch();
  }));
}

const cur = () => (curId ? get('ideas', curId) : null);
const step = (sid) => { const i = cur(); return i ? (i.steps || []).find((s) => s.id === sid) : null; };
function touch(kindArg = 'ideas') { const i = cur(); if (!i) return; i.touchedAt = now(); changed(i, kindArg); }

export const actions = {
  mode: (el) => { mode = el.dataset.m; go(location.hash || '#ide'); },
  filter: (el) => { filter = el.dataset.f; go(location.hash || '#ide'); },
  kind: (el) => { kind = el.dataset.k; $$('[data-act="kind"]').forEach((b) => b.setAttribute('aria-pressed', String(b === el))); },
  open: (el) => { mode = 'kartu'; go(`#ide/${el.dataset.id}`); },
  capture: () => {
    const t = $('#lempar');
    const text = t.value.trim();
    if (!text) { t.focus(); return; }
    add('ideas', { title: text.split(/\n|(?<=[.?!])\s/)[0].slice(0, 120).replace(/[.。]+$/, ''), text, kind, status: 'inbox', source: 'manual', tags: [], fields: {}, refIds: [], steps: [], remind: true, branch: '' });
    toast('Masuk ke kotak ide.');
  },
  develop: (el) => {
    const i = get('ideas', el.dataset.id);
    if (!i) return;
    i.status = 'mentah';
    if (i.kind === 'kutipan' && !(i.fields || {}).fenomena) i.fields = { ...(i.fields || {}), fenomena: i.text };
    i.touchedAt = now();
    changed(i, 'ideas');
    go(`#ide/${i.id}`);
  },
  del: async (el) => {
    const i = get('ideas', el.dataset.id);
    if (!i) return;
    if (i.status !== 'inbox' && !(await confirmDlg(`Hapus ide “${i.title || 'tanpa judul'}”?`, 'Hapus', true))) return;
    const copy = JSON.parse(JSON.stringify(i));
    remove('ideas', i.id);
    toast('Ide dihapus.', 'Urungkan', () => { delete S.state.deleted[copy.id]; S.state.ideas.push(copy); changed(copy, 'ideas'); });
  },
  status: (el) => { const i = cur(); if (!i) return; i.status = el.dataset.s; touch(); },
  'step-add': () => {
    const i = cur(); const inp = $('#new-step');
    if (!i || !inp.value.trim()) return;
    i.steps = i.steps || [];
    i.steps.push({ id: uid('s'), text: inp.value.trim(), date: ymd(addDays(new Date(), 3)), done: false, toOfa: false });
    touch();
  },
  'step-done': (el) => { const s = step(el.dataset.sid); if (!s) return; s.done = el.checked; s.doneAt = el.checked ? now() : null; touch(); },
  'step-del': (el) => { const i = cur(); if (!i) return; i.steps = (i.steps || []).filter((s) => s.id !== el.dataset.sid); touch(); },
  'step-ofa': (el) => {
    const s = step(el.dataset.sid); if (!s) return;
    if (!s.date) s.date = ymd(addDays(new Date(), 3));
    s.toOfa = !s.toOfa; touch();
    toast(s.toOfa ? 'Langkah dikirim ke One for All.' : 'Langkah ditarik dari One for All.');
  },
  'steps-to-ofa': () => {
    const i = cur(); if (!i) return;
    let n = 0;
    (i.steps || []).forEach((s) => { if (!s.done && !s.toOfa) { if (!s.date) s.date = ymd(addDays(new Date(), 3)); s.toOfa = true; n++; } });
    touch();
    toast(n ? `${n} langkah dikirim ke One for All. Buka OfA untuk melihatnya di proyek Clavis.` : 'Semua langkah sudah terkirim.');
  },
  'to-project': () => {
    const i = cur(); if (!i) return;
    newProjectDialog({ fromIdea: i });
  },
  'link-refs': () => {
    const i = cur(); if (!i) return;
    const refs = S.state.refs.slice().sort((a, b) => shortLabel(a).localeCompare(shortLabel(b), 'id'));
    if (!refs.length) { toast('Pustaka masih kosong. Tambahkan sumber di layar Pustaka.', 'Buka Pustaka', () => go('#pustaka')); return; }
    modal({
      title: 'Tautkan referensi', wide: true,
      body: `<input class="input" id="rf-q" placeholder="Saring penulis atau judul…"><div class="card list" style="max-height:50vh;overflow-y:auto">${refs.map((r) => `<label class="li check" data-t="${esc(`${shortLabel(r)} ${r.title}`.toLowerCase())}"><input type="checkbox" name="r" value="${r.id}" ${(i.refIds || []).includes(r.id) ? 'checked' : ''}><span><b>${esc(shortLabel(r))}</b> — ${esc(r.title)}</span></label>`).join('')}</div>`,
      onOpen: (f) => { $('#rf-q', f).addEventListener('input', (e) => { const q = e.target.value.toLowerCase(); $$('[data-t]', f).forEach((l) => { l.hidden = !l.dataset.t.includes(q); }); }); },
      actions: [{ label: 'Batal' }, { label: 'Simpan', cls: 'dark', primary: true, act: (f) => { i.refIds = $$('input[name=r]:checked', f).map((x) => x.value); touch(); } }]
    });
  },
  merge: () => {
    const i = cur(); if (!i) return;
    const others = developed().filter((x) => x.id !== i.id && !x.projectId);
    if (!others.length) { toast('Belum ada ide lain untuk digabung.'); return; }
    modal({
      title: 'Gabungkan dengan ide lain',
      body: `<p class="s13 muted" style="margin:0">Isi kolom, tag, referensi, dan langkah dari ide yang dipilih akan ditambahkan ke “${esc(i.title)}”, lalu ide itu dihapus.</p>
        <select class="select" name="o">${opts(others.map((o) => [o.id, o.title || 'Tanpa judul']), '')}</select>`,
      actions: [{ label: 'Batal' }, { label: 'Gabungkan', cls: 'dark', primary: true, act: (f) => {
        const o = get('ideas', f.o.value); if (!o) return;
        i.fields = i.fields || {};
        IDEA_FIELDS.forEach(([k]) => { const b = (o.fields || {})[k]; if (b && b.trim()) i.fields[k] = [i.fields[k], `— dari “${o.title}”: ${b}`].filter(Boolean).join('\n\n'); });
        i.tags = [...new Set([...(i.tags || []), ...(o.tags || [])])];
        i.refIds = [...new Set([...(i.refIds || []), ...(o.refIds || [])])];
        i.steps = [...(i.steps || []), ...(o.steps || [])];
        touch();
        remove('ideas', o.id);
        toast('Ide digabungkan.');
      } }]
    });
  }
};
