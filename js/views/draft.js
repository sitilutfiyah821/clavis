/* Clavis — Draft: editor naskah dengan outline, sitasi berpenanda (@), [butuh sitasi], catatan pinggir,
   riwayat versi, panel Drive (salinan Google Docs & komentar), dan ekspor. */
import { S, onChange, get, getDraft, saveDraft, changed, typeOf, addSnap, listSnaps, logWriting, now, setSetting } from '../store.js';
import { esc, uid, angka, fmtDate, ago, debounce, hash, slugify, ymd, daysUntil } from '../util.js';
import { I, $, $$, toast, modal, confirmDlg, promptDlg, menu, closeMenus, opts, typeBadge } from '../ui.js';
import { STYLES, shortLabel, formatCitation, prepare } from '../cite.js';
import { renderCites, citeItems, citedRefs, outline, wordsOf, bibFor, refById } from '../doc.js';
import { toDocx, toMarkdown, printPDF, download, fileBase, docxToDrive, googleDocsCopy, pullComments } from '../export.js';
import { G, connect, drive } from '../google.js';
import { status as syncStatus, rootName, syncNow } from '../sync.js';
import { go, isDone } from '../app.js';
import { manualDialog } from './pustaka.js';

export const flush = true;
export const noAutoRender = true;
export const title = () => { const p = get('projects', pid); return p ? p.title : 'Draft'; };

let pid = null;
let ed = null;
let side = null;
let focusMode = false;
let savedRange = null;
let unsub = null;
let session = { words: 0, minutes: 0, last: 0 };
let noteDismissed = {};
let driveCache = {};
const tabByProject = {};

const proj = () => get('projects', pid);
const style = (p) => (p && p.style) || S.state.settings.style;

/* ---------- Pilih proyek ---------- */

function pickerHTML() {
  const active = S.state.projects.filter((p) => !isDone(p));
  return `<div class="main" style="padding:34px 40px">
    <header class="head"><div class="t"><span class="label">Draft</span><h1 class="h1">Pilih naskah</h1></div><button class="btn dark" data-act="new-project">${I.plus} Proyek baru</button></header>
    ${active.length ? `<div class="card list">${active.map((p) => `<a class="li" href="#draft/${p.id}">${typeBadge(p, p.stage)}<span class="grow serif" style="font-size:17px">${esc(p.title)}</span><span class="mono small muted">${angka((S.drafts.get(p.id) || {}).words || 0)} kata</span></a>`).join('')}</div>`
      : '<div class="empty">Belum ada proyek. Buat proyek dulu, lalu draft-nya terbuka di sini.</div>'}</div>`;
}

/* ---------- Kerangka ---------- */

export function render(arg) {
  const want = arg || S.state.lastDraft;
  const p = want && get('projects', want);
  if (!p) { pid = null; return pickerHTML(); }
  pid = p.id;
  if (S.state.lastDraft !== pid) { S.state.lastDraft = pid; }
  const t = typeOf(p);
  const d = getDraft(pid);
  const active = S.state.projects.filter((x) => !isDone(x) || x.id === pid);
  return `<div class="${focusMode ? 'focus-mode' : ''}" id="dwrap" style="display:flex;flex-direction:column;min-height:100vh">
  <header class="dhead">
    <div class="row wrap" style="min-width:0">
      ${typeBadge(p, p.stage)}
      <button class="serif" data-act="rename" style="font-size:20px;font-weight:500;border:0;background:none;padding:0;text-align:left" title="Ganti judul">${esc(p.title)}</button>
      <span class="s13 muted">${p.target ? `${esc(p.target)} · ` : ''}${p.wordLimit ? `batas ${angka(p.wordLimit)} kata` : 'tanpa batas kata'}</span>
      <button class="btn xs" data-act="side" data-t="drive" style="border-radius:999px;font-family:var(--mono);font-size:11px;background:var(--card)">${I.drive} Drive › ${esc(rootName())} › ${esc(t.name)}</button>
    </div>
    <div class="row wrap">
      <select class="select" style="height:40px;width:auto;max-width:220px" id="switch" aria-label="Pindah naskah">${opts(active.map((x) => [x.id, x.title.slice(0, 40)]), pid)}</select>
      <button class="btn${focusMode ? ' on' : ''}" data-act="focus">Mode fokus</button>
      <button class="btn" data-act="snapshot">Simpan versi</button>
      <button class="btn dark" data-act="export">Ekspor ▾</button>
    </div>
  </header>
  <div class="dbody">
    <aside class="outline" aria-label="Outline" id="outline"></aside>
    <section class="pagewrap" aria-label="Halaman tulis">
      <div class="toolbar" role="toolbar" aria-label="Format">
        <button data-cmd="p" title="Paragraf">¶</button><button data-cmd="h2" title="Judul bagian"><b>H2</b></button><button data-cmd="h3" title="Subbagian"><b>H3</b></button>
        <span class="sep"></span>
        <button data-cmd="bold" title="Tebal (Ctrl+B)"><b>B</b></button><button data-cmd="italic" title="Miring (Ctrl+I)"><i>I</i></button><button data-cmd="underline" title="Garis bawah (Ctrl+U)"><u>U</u></button>
        <button data-cmd="blockquote" title="Kutipan blok">❝</button><button data-cmd="ul" title="Daftar berpoin">• —</button><button data-cmd="ol" title="Daftar bernomor">1.</button>
        <span class="sep"></span>
        ${t.citations !== false ? '<button data-cmd="cite" title="Sisipkan sitasi (ketik @)">@ Sitasi</button><button data-cmd="needcite" title="Tandai butuh sitasi">[butuh sitasi]</button>' : ''}
        <button data-cmd="note" title="Catatan pinggir untuk teks yang dipilih">✎ Catatan pinggir</button>
        <span class="sep"></span>
        <button data-cmd="undo" title="Batalkan (Ctrl+Z)">↶</button><button data-cmd="redo" title="Ulangi (Ctrl+Y)">↷</button>
      </div>
      <div id="lastnote"></div>
      <div class="page"><div class="editor" id="editor" contenteditable="true" spellcheck="true" aria-label="Naskah ${esc(p.title)}"></div></div>
      <div class="bibbox" id="bib"></div>
    </section>
    <aside class="panel" id="side" aria-label="Panel samping draft"></aside>
  </div>
  <footer class="dfoot" id="dfoot"></footer>
  </div>`;
}

/* ---------- Pasang ---------- */

export function mount(root) {
  if (!pid) return;
  const p = proj();
  const d = getDraft(pid);
  ed = $('#editor', root);
  side = $('#side', root);
  ed.innerHTML = d.html && d.html.trim() ? d.html : '<p><br></p>';
  ed.querySelectorAll('.cite, .needcite').forEach((x) => x.setAttribute('contenteditable', 'false'));
  renderCites(ed, style(p));
  session = { words: 0, minutes: 0, last: 0 };
  if (!tabByProject[pid]) tabByProject[pid] = typeOf(p).citations === false ? 'pinggir' : 'sitasi';

  ed.addEventListener('input', onInput);
  ed.addEventListener('keydown', onKey);
  ed.addEventListener('paste', onPaste);
  ed.addEventListener('click', onEdClick);
  ed.addEventListener('drop', (e) => { if (e.dataTransfer && e.dataTransfer.types.includes('Files')) e.preventDefault(); });
  document.addEventListener('selectionchange', onSel);
  $$('.toolbar [data-cmd]', root).forEach((b) => b.addEventListener('mousedown', (e) => { e.preventDefault(); cmd(b.dataset.cmd); }));
  $('#switch', root).addEventListener('change', (e) => go(`#draft/${e.target.value}`));
  unsub = onChange((what) => {
    if (what === 'draft-remote') {
      const nd = S.drafts.get(pid);
      if (nd && nd.html !== ed.innerHTML && document.activeElement !== ed) {
        ed.innerHTML = nd.html; renderCites(ed, style(proj())); toast('Draft diperbarui dari perangkat lain.');
      }
      refresh();
    }
  });
  document.addEventListener('visibilitychange', onHide);
  refresh();
  lastNote();
  if (S.pendingInsert) { const pi = S.pendingInsert; S.pendingInsert = null; insertQuote(pi); }
  else setTimeout(() => { ed.focus(); placeCaretEnd(); }, 30);
}

export function unmount() {
  if (!pid || !ed) return;
  saveNow();
  autoSnapshot();
  document.removeEventListener('selectionchange', onSel);
  document.removeEventListener('visibilitychange', onHide);
  if (unsub) unsub();
  unsub = null;
  closePop();
  ed = null;
}

function onHide() { if (document.visibilityState === 'hidden') { saveNow(); autoSnapshot(); } }

/* ---------- Simpan ---------- */

function cleanHTML() {
  const c = ed.cloneNode(true);
  c.querySelectorAll('.flash').forEach((x) => x.classList.remove('flash'));
  return c.innerHTML.replace(/ class=""/g, '');
}

function saveNow() {
  if (!ed || !pid) return;
  const d = getDraft(pid);
  const html = cleanHTML();
  if (html === d.html) return;
  const words = wordsOf(ed);
  const delta = words - (d.words || 0);
  d.html = html; d.words = words;
  saveDraft(d);
  if (delta > 0) { session.words += delta; logWriting(pid, delta, 0); }
  const p = proj();
  if (p && p.ideaId) { const i = get('ideas', p.ideaId); if (i) i.touchedAt = now(); }
}
const saveSoon = debounce(saveNow, 700);
const refreshSoon = debounce(() => refresh(), 400);

function onInput() {
  const t = Date.now();
  if (session.last && t - session.last < 120000) {
    const m = (t - session.last) / 60000;
    session.minutes += m;
    logWriting(pid, 0, m);
  }
  session.last = t;
  saveSoon();
  refreshSoon();
}

/* ---------- Pemilihan & kursor ---------- */

function onSel() {
  if (!ed) return;
  const s = window.getSelection();
  if (s.rangeCount && ed.contains(s.anchorNode)) {
    savedRange = s.getRangeAt(0).cloneRange();
    markOutline();
  }
}
function restoreRange() {
  ed.focus();
  const s = window.getSelection();
  if (savedRange && ed.contains(savedRange.startContainer)) { s.removeAllRanges(); s.addRange(savedRange); return savedRange; }
  placeCaretEnd();
  return s.getRangeAt(0);
}
function placeCaretEnd() {
  if (!ed) return;
  const r = document.createRange();
  const last = ed.lastElementChild || ed;
  r.selectNodeContents(last); r.collapse(false);
  const s = window.getSelection(); s.removeAllRanges(); s.addRange(r);
  savedRange = r.cloneRange();
}
function insertNodeAtCaret(node, after = ' ') {
  const r = restoreRange();
  r.deleteContents();
  const sp = document.createTextNode(after);
  r.insertNode(sp);
  r.insertNode(node);
  const nr = document.createRange();
  nr.setStart(sp, sp.length); nr.collapse(true);
  const s = window.getSelection(); s.removeAllRanges(); s.addRange(nr);
  savedRange = nr.cloneRange();
  renderCites(ed, style(proj()));
  saveNow(); refresh();
}

/* ---------- Perintah toolbar ---------- */

function cmd(c) {
  if (!ed) return;
  if (!['cite', 'needcite', 'note', 'undo', 'redo'].includes(c)) restoreRange();
  switch (c) {
    case 'p': document.execCommand('formatBlock', false, 'p'); break;
    case 'h2': document.execCommand('formatBlock', false, 'h2'); break;
    case 'h3': document.execCommand('formatBlock', false, 'h3'); break;
    case 'blockquote': document.execCommand('formatBlock', false, 'blockquote'); break;
    case 'bold': case 'italic': case 'underline': document.execCommand(c); break;
    case 'ul': document.execCommand('insertUnorderedList'); break;
    case 'ol': document.execCommand('insertOrderedList'); break;
    case 'undo': ed.focus(); document.execCommand('undo'); break;
    case 'redo': ed.focus(); document.execCommand('redo'); break;
    case 'cite': openPicker(); return;
    case 'needcite': {
      const m = document.createElement('mark');
      m.className = 'needcite'; m.contentEditable = 'false'; m.textContent = '[butuh sitasi]';
      insertNodeAtCaret(m);
      return;
    }
    case 'note': addNote(); return;
    default: break;
  }
  onInput();
}

function onKey(e) {
  if (e.key === '@' && typeOf(proj()).citations !== false) { e.preventDefault(); onSel(); openPicker(); return; }
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); saveNow(); toast('Tersimpan.'); return; }
  if ((e.ctrlKey || e.metaKey) && e.altKey && ['1', '2', '3'].includes(e.key)) { e.preventDefault(); cmd({ 1: 'h2', 2: 'h3', 3: 'p' }[e.key]); }
}

function onPaste(e) {
  e.preventDefault();
  const text = (e.clipboardData || window.clipboardData).getData('text/plain');
  if (!text) return;
  const parts = text.replace(/\r/g, '').split(/\n{2,}|\n/).map((x) => x.trim());
  if (parts.length <= 1) { document.execCommand('insertText', false, text.replace(/\s*\n\s*/g, ' ')); return; }
  const html = parts.filter(Boolean).map((x) => `<p>${esc(x)}</p>`).join('');
  document.execCommand('insertHTML', false, html);
}

function onEdClick(e) {
  const c = e.target.closest('.cite');
  if (c) { e.preventDefault(); citeEditor(c); return; }
  const m = e.target.closest('.needcite');
  if (m) { e.preventDefault(); openPicker({ replace: m }); return; }
  const a = e.target.closest('.anchor');
  if (a) { tabByProject[pid] = 'pinggir'; renderSide(a.dataset.note); }
}

/* ---------- Pemilih sitasi ---------- */

let pop = null;
function closePop() { if (pop) { pop.remove(); pop = null; document.removeEventListener('mousedown', popOutside, true); } }
function popOutside(e) { if (pop && !pop.contains(e.target)) closePop(); }

function caretRect() {
  const r = savedRange && savedRange.cloneRange();
  let rect = r && r.getClientRects()[0];
  if (!rect && r) { const span = document.createElement('span'); span.textContent = '​'; r.insertNode(span); rect = span.getBoundingClientRect(); span.remove(); }
  return rect || ed.getBoundingClientRect();
}

function openPicker({ replace = null, appendTo = null } = {}) {
  closePop();
  const p = proj();
  const refs = S.state.refs.slice().sort((a, b) => shortLabel(a).localeCompare(shortLabel(b), 'id'));
  let picked = [], hi = 0, mode = 'paren';
  pop = document.createElement('div');
  pop.className = 'pop';
  pop.innerHTML = `<div class="phead"><span class="mono" style="color:var(--accent)">@</span><input type="text" placeholder="Cari penulis, judul, tahun…" aria-label="Cari sumber"><span class="mono small muted" data-n></span></div>
    <div class="res" role="listbox"></div>
    <div class="pfoot"><label class="row" style="gap:6px">Halaman <input type="text" data-loc placeholder="hlm. 45"></label>
      <div class="seg" style="height:28px"><button type="button" data-m="paren" aria-pressed="true" style="height:28px;font-size:11px">(Penulis, th)</button><button type="button" data-m="narr" aria-pressed="false" style="height:28px;font-size:11px">Penulis (th)</button></div>
      <span>↵ sisipkan · klik untuk pilih beberapa</span><button type="button" class="btn xs" data-new>+ Sumber baru</button></div>`;
  document.body.appendChild(pop);
  const rect = caretRect();
  const top = rect.bottom + 8 + 360 > window.innerHeight ? Math.max(8, rect.top - 370) : rect.bottom + 8;
  pop.style.left = `${Math.max(8, Math.min(rect.left - 20, window.innerWidth - pop.offsetWidth - 8))}px`;
  pop.style.top = `${top}px`;
  const inp = $('input', pop), res = $('.res', pop), loc = $('[data-loc]', pop);
  const list = () => {
    const q = inp.value.trim().toLowerCase();
    return refs.filter((r) => !q || `${r.key} ${shortLabel(r)} ${r.title} ${r.year}`.toLowerCase().includes(q)).slice(0, 40);
  };
  const draw = () => {
    const L = list();
    if (hi >= L.length) hi = Math.max(0, L.length - 1);
    $('[data-n]', pop).textContent = `${L.length} cocok${picked.length ? ` · ${picked.length} dipilih` : ''}`;
    res.innerHTML = L.length ? L.map((r, i) => `<button type="button" role="option" data-id="${r.id}" class="${i === hi ? 'hi' : ''}${picked.includes(r.id) ? ' picked' : ''}"><span style="font-weight:600">${esc(shortLabel(r))} — <span style="font-weight:400">${esc(r.title)}</span></span><span class="muted small">${esc(r.type)} · ${esc(r.status || 'belum')}${(r.quotes || []).length ? ` · ${(r.quotes || []).length} kutipan` : ''}</span></button>`).join('')
      : `<div class="pad s13 muted">${refs.length ? 'Tidak ada yang cocok.' : 'Pustaka masih kosong. Tambahkan sumber dulu.'}</div>`;
    $$('button[data-id]', res).forEach((b) => b.addEventListener('mousedown', (e) => {
      e.preventDefault();
      const id = b.dataset.id;
      picked = picked.includes(id) ? picked.filter((x) => x !== id) : [...picked, id];
      if (!e.ctrlKey && !e.metaKey && !e.shiftKey && picked.length === 1 && e.detail >= 2) { finish(); return; }
      draw(); inp.focus();
    }));
  };
  const finish = () => {
    const L = list();
    const ids = picked.length ? picked : (L[hi] ? [L[hi].id] : []);
    if (!ids.length) return;
    const locs = ids.map((id, i) => (i === ids.length - 1 ? loc.value.trim() : ''));
    closePop();
    if (appendTo) {
      appendTo.dataset.refs = [...String(appendTo.dataset.refs || '').split(',').filter(Boolean), ...ids].join(',');
      appendTo.dataset.locs = [...String(appendTo.dataset.locs || '').split('|').slice(0, String(appendTo.dataset.refs).split(',').length - ids.length), ...locs].join('|');
      renderCites(ed, style(p)); saveNow(); refresh(); return;
    }
    const sp = document.createElement('span');
    sp.className = 'cite'; sp.contentEditable = 'false';
    sp.dataset.refs = ids.join(','); sp.dataset.locs = locs.join('|'); sp.dataset.mode = mode;
    if (replace) {
      replace.replaceWith(sp);
      renderCites(ed, style(p)); saveNow(); refresh();
    } else insertNodeAtCaret(sp);
  };
  inp.addEventListener('input', () => { hi = 0; draw(); });
  pop.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { e.preventDefault(); closePop(); restoreRange(); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); hi = Math.min(hi + 1, list().length - 1); draw(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); hi = Math.max(0, hi - 1); draw(); }
    else if (e.key === 'Enter') { e.preventDefault(); if (e.shiftKey) mode = 'narr'; finish(); }
    else if (e.key === 'Tab' && e.target === inp) { e.preventDefault(); loc.focus(); }
  });
  $$('[data-m]', pop).forEach((b) => b.addEventListener('click', () => { mode = b.dataset.m; $$('[data-m]', pop).forEach((x) => x.setAttribute('aria-pressed', String(x === b))); inp.focus(); }));
  $('[data-new]', pop).addEventListener('click', () => { closePop(); manualDialog(); });
  draw();
  inp.focus();
  setTimeout(() => document.addEventListener('mousedown', popOutside, true), 0);
}

function citeEditor(span) {
  closePop();
  const items = citeItems(span);
  pop = document.createElement('div');
  pop.className = 'pop';
  pop.style.width = '380px';
  pop.innerHTML = `<div class="phead"><span class="label">Sitasi</span></div>
    <div class="pad stack" style="gap:10px">
      ${items.map((it, i) => `<div class="row"><span class="grow s13">${it.ref ? `<b>${esc(shortLabel(it.ref))}</b> — ${esc(it.ref.title.slice(0, 50))}` : '<span style="color:var(--warn)">Sumber sudah dihapus dari pustaka</span>'}</span>
        <input class="input" style="height:30px;width:100px;font-size:12px" data-i="${i}" value="${esc(it.loc)}" placeholder="hlm."><button type="button" class="iconbtn" style="width:28px;height:28px" data-rm="${i}" aria-label="Hapus sumber ini">${I.x}</button></div>`).join('')}
      <div class="row between"><div class="seg"><button type="button" data-m="paren" aria-pressed="${span.dataset.mode !== 'narr'}" style="height:30px;font-size:12px">Dalam kurung</button><button type="button" data-m="narr" aria-pressed="${span.dataset.mode === 'narr'}" style="height:30px;font-size:12px">Naratif</button></div>
        <button type="button" class="btn xs" data-add>+ Sumber lain</button></div>
      <div class="row between"><button type="button" class="btn xs ghost" data-del style="color:var(--accent)">Hapus sitasi</button><button type="button" class="btn dark xs" data-ok>Selesai</button></div>
    </div>`;
  document.body.appendChild(pop);
  const r = span.getBoundingClientRect();
  pop.style.left = `${Math.max(8, Math.min(r.left, window.innerWidth - 390))}px`;
  pop.style.top = `${r.bottom + 360 > window.innerHeight ? Math.max(8, r.top - 260) : r.bottom + 8}px`;
  let ids = items.map((x) => x.id), mode = span.dataset.mode || 'paren';
  const apply = () => {
    const locs = $$('input[data-i]', pop).map((x) => x.value.trim());
    if (!ids.length) { span.remove(); } else { span.dataset.refs = ids.join(','); span.dataset.locs = locs.join('|'); span.dataset.mode = mode; }
    renderCites(ed, style(proj())); saveNow(); refresh();
  };
  $$('[data-m]', pop).forEach((b) => b.addEventListener('click', () => { mode = b.dataset.m; $$('[data-m]', pop).forEach((x) => x.setAttribute('aria-pressed', String(x === b))); apply(); }));
  $$('[data-rm]', pop).forEach((b) => b.addEventListener('click', () => { const i = Number(b.dataset.rm); ids.splice(i, 1); const inp = $(`input[data-i="${i}"]`, pop); if (inp) inp.closest('.row').remove(); apply(); if (!ids.length) closePop(); }));
  $('[data-add]', pop).addEventListener('click', () => { apply(); savedRange = null; openPicker({ appendTo: span }); });
  $('[data-del]', pop).addEventListener('click', () => { span.remove(); closePop(); renderCites(ed, style(proj())); saveNow(); refresh(); });
  $('[data-ok]', pop).addEventListener('click', () => { apply(); closePop(); });
  setTimeout(() => document.addEventListener('mousedown', popOutside, true), 0);
}

function insertQuote({ refId, text, loc }) {
  ed.focus();
  const p = document.createElement('p');
  p.appendChild(document.createTextNode(`“${text}” `));
  const sp = document.createElement('span');
  sp.className = 'cite'; sp.contentEditable = 'false';
  sp.dataset.refs = refId; sp.dataset.locs = loc || ''; sp.dataset.mode = 'paren';
  p.appendChild(sp);
  p.appendChild(document.createTextNode(' '));
  const anchorBlock = savedRange && ed.contains(savedRange.startContainer) ? (savedRange.startContainer.nodeType === 1 ? savedRange.startContainer : savedRange.startContainer.parentElement).closest('#editor > *') : null;
  if (anchorBlock) anchorBlock.after(p); else ed.appendChild(p);
  renderCites(ed, style(proj()));
  saveNow(); refresh();
  p.scrollIntoView({ block: 'center' });
  toast('Kutipan disisipkan bersama sitasinya.');
}

/* ---------- Catatan pinggir ---------- */

async function addNote() {
  const s = window.getSelection();
  const r = s.rangeCount && ed.contains(s.anchorNode) && !s.isCollapsed ? s.getRangeAt(0).cloneRange() : null;
  const text = await promptDlg('Catatan pinggir', r ? `Untuk: “${r.toString().slice(0, 80)}”` : 'Catatan untuk naskah ini (pilih teks dulu agar catatan menempel pada kalimat)', '', { multiline: true, placeholder: 'mis. pakai kutipan Wibowo soal rumah sebagai perangkap' });
  if (!text) return;
  const d = getDraft(pid);
  const id = uid('n');
  d.margins = d.margins || [];
  d.margins.push({ id, text: text.trim(), from: S.state.settings.name || 'Saya', quote: r ? r.toString().slice(0, 140) : '', createdAt: now(), resolved: false });
  if (r) {
    const span = document.createElement('span');
    span.className = 'anchor'; span.dataset.note = id;
    try { span.appendChild(r.extractContents()); r.insertNode(span); } catch (e) { /* abaikan */ }
  }
  tabByProject[pid] = 'pinggir';
  saveNow(); saveDraft(d); refresh();
}

function unwrapAnchor(id) {
  ed.querySelectorAll(`.anchor[data-note="${id}"]`).forEach((a) => a.replaceWith(...a.childNodes));
}

/* ---------- Outline ---------- */

function renderOutline() {
  const box = $('#outline');
  if (!box) return;
  const p = proj();
  const t = typeOf(p);
  const secs = outline(ed);
  const total = wordsOf(ed);
  const targets = p.sectionTargets || {};
  box.innerHTML = `<div class="sec-h"><span class="label">Outline</span><span class="mono small muted">${angka(total)}${p.wordLimit ? ` / ${angka(p.wordLimit)}` : ''}</span></div>
    ${p.wordLimit ? `<div style="height:4px;background:var(--line2);border-radius:2px;overflow:hidden"><div style="height:100%;width:${Math.min(100, (total / p.wordLimit) * 100)}%;background:${total > p.wordLimit ? 'var(--accent)' : 'var(--ok)'}"></div></div>` : ''}
    <ol>${secs.map((s, i) => {
      const tg = targets[s.key];
      const cls = !tg ? '' : s.words >= tg * 0.9 && s.words <= tg * 1.1 ? 'ok' : s.words > tg * 1.1 ? 'low' : 'low';
      return `<li data-sec="${i}" draggable="${s.el ? 'true' : 'false'}"><span class="grip" aria-hidden="true">⋮⋮</span><span class="grow">${esc(s.title)}</span>
        <button class="tgt ${cls}" data-act="target" data-key="${s.key}" title="Atur target kata">${angka(s.words)}${tg ? `/${angka(tg)}` : ''}</button></li>
        ${s.subs.map((x) => `<li class="sub" data-subof="${i}" data-title="${esc(x.title)}"><span class="grow">${esc(x.title)}</span><span class="mono" style="font-size:11px">${angka(x.words)}</span></li>`).join('')}`;
    }).join('')}</ol>
    ${!secs.length ? '<p class="small muted" style="margin:0">Pakai H2 untuk judul bagian; outline muncul di sini.</p>' : ''}
    <button class="btn dashed sm" data-act="add-section">+ Bagian</button>
    <div class="note small" style="margin-top:auto"><span class="label">Target per bagian</span><br>${t.sections && t.sections.length ? `Dari template ${esc(t.name)}. ` : ''}Klik angka di kanan untuk mengubah. Seret ⋮⋮ untuk memindah bagian.</div>`;
  const lis = $$('li[data-sec]', box);
  lis.forEach((li) => {
    const s = secs[Number(li.dataset.sec)];
    li.addEventListener('click', (e) => { if (e.target.closest('[data-act]')) return; if (s.el) { s.el.scrollIntoView({ block: 'start', behavior: 'smooth' }); } });
    li.addEventListener('dragstart', (e) => { e.dataTransfer.setData('text/sec', li.dataset.sec); });
    li.addEventListener('dragover', (e) => { e.preventDefault(); li.classList.add('drag-over'); });
    li.addEventListener('dragleave', () => li.classList.remove('drag-over'));
    li.addEventListener('drop', (e) => {
      e.preventDefault(); li.classList.remove('drag-over');
      const from = secs[Number(e.dataTransfer.getData('text/sec'))], to = s;
      if (!from || !to || from === to || !from.el || !to.el) return;
      const nodes = [];
      let n = from.el;
      do { nodes.push(n); n = n.nextElementSibling; } while (n && n.tagName !== 'H2');
      nodes.forEach((x) => to.el.before(x));
      saveNow(); refresh();
    });
  });
  $$('li.sub', box).forEach((li) => li.addEventListener('click', () => {
    const h = $$('h3', ed).find((x) => x.textContent.trim() === li.dataset.title);
    if (h) h.scrollIntoView({ block: 'start', behavior: 'smooth' });
  }));
  markOutline();
}

function markOutline() {
  const box = $('#outline');
  if (!box || !savedRange) return;
  let el = savedRange.startContainer;
  el = el.nodeType === 1 ? el : el.parentElement;
  const block = el && el.closest('#editor > *');
  if (!block) return;
  let h = block;
  while (h && h.tagName !== 'H2') h = h.previousElementSibling;
  const secs = outline(ed);
  const idx = secs.findIndex((s) => s.el === h);
  $$('li[data-sec]', box).forEach((li) => li.classList.toggle('cur', Number(li.dataset.sec) === idx));
}

/* ---------- Panel samping ---------- */

function sitasiHTML(p) {
  const refs = citedRefs(ed);
  const counts = new Map();
  ed.querySelectorAll('span.cite').forEach((sp) => citeItems(sp).forEach((x) => counts.set(x.id, (counts.get(x.id) || 0) + 1)));
  const need = ed.querySelectorAll('.needcite').length;
  const broken = [...ed.querySelectorAll('span.cite')].filter((sp) => citeItems(sp).some((x) => !x.ref)).length;
  const weak = refs.filter((r) => !r.year || (!r.publisher && !r.container));
  const idea = p.ideaId && get('ideas', p.ideaId);
  const linked = new Set([...((idea && idea.refIds) || []), ...(p.matrixRefs || [])]);
  const unused = [...linked].filter((id) => !counts.has(id)).map(refById).filter(Boolean);
  return `<div class="field"><label class="label" for="gaya">Gaya sitasi</label>
      <select id="gaya" class="select" data-bind="projects:${p.id}:style">${opts(STYLES, style(p))}</select>
      <span class="small muted">Mengubah gaya memperbarui seluruh draft dan daftar pustaka.</span></div>
    ${need || broken || weak.length ? `<div class="note warn stack" style="gap:6px"><span class="label" style="color:var(--warn)">Perlu perhatian · ${need + broken + weak.length}</span>
      ${need ? `<span>${need} penanda <b>[butuh sitasi]</b> <button class="btn xs ghost" data-act="next-need">cari</button></span>` : ''}
      ${broken ? `<span>${broken} sitasi ke sumber yang sudah dihapus</span>` : ''}
      ${weak.map((r) => `<span>Sitasi yatim: <a href="#pustaka/${r.id}"><b>${esc(r.key)}</b></a> ${!r.year ? 'tanpa tahun' : 'tanpa penerbit/jurnal'}</span>`).join('')}</div>` : ''}
    <div class="stack" style="gap:8px">
      <div class="sec-h"><span class="label">Dikutip di draft ini · ${refs.length}</span><a class="small" href="#pustaka" style="font-weight:500">Pustaka</a></div>
      ${refs.length ? `<div class="card list" style="font-size:13px">${refs.map((r) => `<a class="li" style="padding:9px 12px;justify-content:space-between" href="#pustaka/${r.id}"><span>${esc(shortLabel(r))}</span><span class="mono small muted">×${counts.get(r.id) || 0}</span></a>`).join('')}</div>` : '<div class="empty" style="padding:14px">Ketik <b>@</b> di naskah untuk menyisipkan sitasi dari pustaka.</div>'}
      ${unused.length ? `<span class="small muted">${unused.length} sumber yang ditautkan ke proyek/ide ini belum dikutip: ${unused.slice(0, 3).map((r) => esc(shortLabel(r))).join(', ')}${unused.length > 3 ? '…' : ''}</span>` : ''}
    </div>`;
}

function pinggirHTML(focusId) {
  const d = getDraft(pid);
  const ms = (d.margins || []).slice().sort((a, b) => (a.resolved - b.resolved) || ((a.createdAt || '') < (b.createdAt || '') ? 1 : -1));
  return `<div class="sec-h"><span class="label">Catatan pinggir · ${ms.filter((m) => !m.resolved).length}</span><button class="btn xs" data-act="note-add">+ Catatan</button></div>
    ${ms.map((m) => `<div class="margin-note${m.gdoc ? ' gd' : ''}${m.resolved ? ' resolved' : ''}" ${m.id === focusId ? 'style="box-shadow:0 0 0 2px var(--accent)"' : ''}>
      <div class="row between"><span class="mono small muted">${esc(m.from || 'Saya')} · ${esc(ago(m.createdAt))}</span>${m.gdoc ? '<span class="badge gdoc">dari Google Docs</span>' : ''}</div>
      ${m.quote ? `<span class="q">“${esc(m.quote.slice(0, 120))}”</span>` : ''}
      <span>${esc(m.text)}</span>
      <div class="row wrap" style="gap:6px">
        ${ed.querySelector(`.anchor[data-note="${m.id}"]`) ? `<button class="btn xs" data-act="note-jump" data-id="${m.id}">Lihat di naskah</button>` : ''}
        ${!m.resolved ? `<button class="btn xs" data-act="note-done" data-id="${m.id}">${m.gdoc ? 'Tandai beres, balas di Docs' : 'Beres'}</button>` : '<span class="small muted">sudah beres</span>'}
        <button class="iconbtn" style="width:28px;height:28px" data-act="note-del" data-id="${m.id}" aria-label="Hapus catatan">${I.x}</button>
      </div></div>`).join('')}
    ${!ms.length ? '<div class="empty" style="padding:14px">Pilih teks di naskah lalu tekan <b>✎ Catatan pinggir</b>. Komentar dari salinan Google Docs juga masuk ke sini.</div>' : ''}`;
}

function versiHTML() {
  return `<div class="sec-h"><span class="label">Riwayat versi · juga di Drive › Versi</span><button class="btn xs" data-act="snapshot">+ Simpan versi</button></div><div id="snaps" class="s13 muted">Memuat…</div>`;
}
async function loadSnaps() {
  const box = $('#snaps'); if (!box) return;
  const list = await listSnaps(pid);
  if (!$('#snaps')) return;
  box.className = '';
  box.innerHTML = list.length ? `<div class="card list" style="font-size:13px">${list.slice(0, 30).map((s) => `<div class="li" style="padding:10px 12px;flex-direction:column;align-items:stretch;gap:6px${s.kind === 'konflik' ? ';background:#FBF3E4' : ''}">
      <span style="font-weight:500${s.kind === 'konflik' ? ';color:var(--amber)' : ''}">${esc(s.label || (s.kind === 'auto' ? 'Otomatis' : 'Versi'))}</span>
      <span class="small muted">${esc(fmtDate(ymd(new Date(s.at)), { short: true }))} ${esc(new Date(s.at).toTimeString().slice(0, 5).replace(':', '.'))} · ${angka(s.words || 0)} kata · ${s.kind === 'auto' ? 'otomatis' : s.kind === 'konflik' ? 'salinan konflik' : 'manual'}${s.driveId ? ' · di Drive' : ''}</span>
      <span class="row" style="gap:6px"><button class="btn xs" data-act="snap-diff" data-id="${s.id}">Bandingkan</button><button class="btn xs" data-act="snap-restore" data-id="${s.id}">Pulihkan</button></span></div>`).join('')}</div>`
    : '<div class="empty" style="padding:14px">Belum ada versi. Versi otomatis dibuat di akhir sesi menulis; tekan “Simpan versi” untuk versi manual.</div>';
}

function driveHTML(p) {
  const st = S.state.settings;
  if (!G.configured) return '<div class="note">Sambungan Google untuk Clavis belum disiapkan.</div>';
  if (!G.everConnected) return `<div class="note stack" style="gap:8px">Masuk dengan Google untuk menyimpan draft ini ke folder <b>${esc(rootName())}</b> di Drive, membuat salinan Google Docs, dan menyimpan .docx otomatis.<button class="btn dark sm" data-act="google-connect">Masuk dengan Google</button></div>`;
  const f = p.drive || {};
  const s = syncStatus;
  const c = driveCache[pid] || {};
  const okLine = s.state === 'ok' ? `Tersimpan di Google Drive · ${s.at ? new Date(s.at).toTimeString().slice(0, 5).replace(':', '.') : ''}` : s.state === 'syncing' ? 'Menyinkron…' : s.state === 'offline' ? `Offline · ${s.pending} perubahan menunggu` : s.state === 'auth' ? 'Sesi Google habis' : s.state === 'error' ? `Bermasalah: ${s.message}` : 'Menunggu sinkron';
  const shares = (p.shares || []).slice(0, 3);
  return `<div class="row" style="padding:10px 12px;background:${s.state === 'ok' ? 'var(--ok-tint)' : 'var(--soft)'};border-radius:6px;color:${s.state === 'ok' ? '#2F4A2A' : 'var(--ink2)'}"><span class="dot ${s.state === 'ok' ? 'ok' : s.state === 'syncing' ? 'spin' : 'warn'}"></span><span class="grow s13">${esc(okLine)}</span>${s.state === 'auth' ? '<button class="btn xs" data-act="google-connect">Sambungkan</button>' : '<button class="btn xs ghost" data-act="sync-now">Sinkron</button>'}</div>
    <div class="stack" style="gap:6px"><span class="label">Folder proyek</span>
      <span class="mono small" style="color:var(--ink2)">${esc(rootName())} › ${esc(typeOf(p).name)} › ${esc(p.title)}</span>
      ${f.folderId ? `<div class="card list drive-tree">
        <div class="li"><b>draft.clavis</b><span class="muted">sumber utama</span></div>
        <div class="li"><span>Versi/</span><span class="muted">${c.versi ?? '…'} berkas</span></div>
        <div class="li"><span>Ekspor/</span><span class="muted">${c.ekspor ?? '…'} berkas</span></div>
        <div class="li"><span>Bagikan/</span><span style="color:var(--gdoc)">${c.bagikan ?? '…'} Google Docs</span></div>
        <div class="li"><span>Lampiran/</span><span class="muted">${c.lampiran ?? '…'} berkas</span></div></div>
        <a class="small" style="font-weight:500" href="https://drive.google.com/drive/folders/${f.folderId}" target="_blank" rel="noopener">Buka folder proyek di Drive</a>` : '<span class="small muted">Folder dibuat otomatis saat sinkron berikutnya.</span>'}
    </div>
    <div class="stack" style="gap:8px;padding:12px;background:var(--card);border:1px solid var(--gdoc-line);border-radius:6px">
      <span class="label" style="color:var(--gdoc)">Salinan untuk dibagikan</span>
      ${shares.length ? shares.map((sh, i) => `<div class="stack" style="gap:4px;${i ? 'padding-top:8px;border-top:1px solid var(--line2)' : ''}"><a href="${esc(sh.link || `https://docs.google.com/document/d/${sh.id}/edit`)}" target="_blank" rel="noopener" style="font-weight:500;color:var(--ink)">${esc(sh.name)}</a>
        <span class="small muted">Google Docs · ${esc(ago(sh.at))} · ${(sh.pulled || []).length} komentar sudah ditarik</span>
        <button class="btn gdoc xs" style="align-self:flex-start" data-act="pull" data-id="${sh.id}">Tarik komentar</button></div>`).join('') : '<span class="small muted">Buat salinan Google Docs untuk pembimbing, reviewer, atau klien. Komentar mereka bisa ditarik ke tab Pinggir. Isi Docs tidak menimpa draft.</span>'}
      <button class="btn xs" style="align-self:flex-start" data-act="gdoc">Buat salinan baru</button>
    </div>
    <div class="stack" style="gap:8px"><span class="label">Ekspor Word</span>
      <label class="check"><input type="checkbox" data-bind="settings::autoDocx" ${st.autoDocx ? 'checked' : ''}> Simpan .docx ke Ekspor/ setiap “Simpan versi”</label>
      <label class="check"><input type="checkbox" data-bind="settings::highlightCites" ${st.highlightCites ? 'checked' : ''}> Sorot sitasi kuning (memudahkan ganti lewat Mendeley Cite)</label>
      <label class="check"><input type="checkbox" data-bind="settings::marginsAsComments" ${st.marginsAsComments !== false ? 'checked' : ''}> Catatan pinggir jadi komentar Word</label>
      <label class="check"><input type="checkbox" data-bind="settings::keepNeedCite" ${st.keepNeedCite !== false ? 'checked' : ''}> Sertakan penanda [butuh sitasi]</label>
    </div>
    <span class="small muted">Tanpa internet? Tulisan tetap tersimpan di perangkat dan dikirim ke Drive begitu online.</span>`;
}

async function loadDriveCounts(p) {
  const f = p.drive || {};
  if (!G.token || !f.folderId || driveCache[pid]) return;
  driveCache[pid] = {};
  try {
    const [v, e, b, l] = await Promise.all([f.versiId, f.eksporId, f.bagikanId, f.lampiranId].map((id) => (id ? drive.list(id).then((x) => x.length) : 0)));
    driveCache[pid] = { versi: v, ekspor: e, bagikan: b, lampiran: l };
  } catch (er) { driveCache[pid] = {}; }
  if (tabByProject[pid] === 'drive') renderSide();
}

function renderSide(focusNote) {
  if (!side || !pid) return;
  const p = proj();
  const t = typeOf(p);
  const tab = tabByProject[pid];
  const tabs = [...(t.citations !== false ? [['sitasi', 'Sitasi']] : []), ['pinggir', `Pinggir · ${(getDraft(pid).margins || []).filter((m) => !m.resolved).length}`], ['versi', 'Versi'], ['drive', 'Drive']];
  side.innerHTML = `<div class="tabs" role="tablist" aria-label="Panel samping">${tabs.map(([k, l]) => `<button type="button" role="tab" aria-selected="${tab === k}" data-act="side" data-t="${k}">${l}</button>`).join('')}</div>
    <div class="stack" style="gap:16px">${tab === 'sitasi' ? sitasiHTML(p) : tab === 'pinggir' ? pinggirHTML(focusNote) : tab === 'versi' ? versiHTML() : driveHTML(p)}</div>`;
  if (tab === 'versi') loadSnaps();
  if (tab === 'drive') loadDriveCounts(p);
}

function renderBib() {
  const box = $('#bib'); if (!box) return;
  const p = proj();
  const bib = bibFor(ed, style(p));
  box.innerHTML = bib.length ? `<div style="border-top:1px solid var(--line2);padding-top:18px;margin-top:10px"><span class="label">Daftar pustaka · otomatis · ${esc((STYLES.find((s) => s.id === style(p)) || STYLES[0]).label)}</span>
    <h2 class="serif" style="font-size:26px;font-weight:500;margin:10px 0 14px">Daftar Pustaka</h2>${bib.map((b) => `<p class="bib">${b.html}</p>`).join('')}</div>` : '';
}

function renderFoot() {
  const f = $('#dfoot'); if (!f) return;
  const p = proj();
  const secs = outline(ed).filter((s) => s.el);
  const txt = ed.textContent || '';
  f.innerHTML = `<span>${angka(wordsOf(ed))} kata · ${angka(txt.length)} karakter${secs.length ? ` · ${secs.length} bagian` : ''}</span>
    <span>Sesi ini: ${Math.round(session.minutes)} menit · ${angka(session.words)} kata</span>
    <span>${G.everConnected ? `Drive: ${esc(rootName())}/${esc(typeOf(p).name)}/… · ${syncStatus.state === 'ok' ? 'tersinkron' : syncStatus.state === 'offline' ? 'menunggu online' : '…'}` : 'Tersimpan di perangkat'}</span>`;
}

function lastNote() {
  const box = $('#lastnote'); if (!box || noteDismissed[pid]) return;
  const j = S.state.journal.filter((x) => x.projectId === pid || !x.projectId).sort((a, b) => ((a.updatedAt || a.createdAt) < (b.updatedAt || b.createdAt) ? 1 : -1))[0];
  if (!j || -daysUntil(j.date) > 21) return;
  box.innerHTML = `<div class="note lastnote row between top"><span><span class="label">Catatan terakhir · ${esc(fmtDate(j.date, { short: true }))}</span><br><span class="serif" style="font-size:16px;font-style:italic">“${esc(j.text)}”</span></span><button class="iconbtn" data-act="dismiss-note" aria-label="Tutup">${I.x}</button></div>`;
}

export function refresh() {
  if (!ed || !pid || !proj()) return;
  renderCites(ed, style(proj()));
  renderOutline();
  renderSide();
  renderBib();
  renderFoot();
}

/* ---------- Versi ---------- */

async function snapshot(label, kind = 'manual') {
  saveNow();
  const d = getDraft(pid);
  const s = await addSnap({ projectId: pid, kind, label, html: d.html, words: d.words || 0 });
  d.lastSnapAt = s.at; d.lastSnapWords = d.words || 0; d.lastSnapHash = hash(d.html);
  saveDraft(d, { remote: true });
  syncNow();
  return s;
}
function autoSnapshot() {
  const d = S.drafts.get(pid);
  if (!d || !d.html) return;
  const h = hash(d.html);
  if (h === d.lastSnapHash) return;
  const wordsChanged = Math.abs((d.words || 0) - (d.lastSnapWords || 0));
  const mins = d.lastSnapAt ? (Date.now() - new Date(d.lastSnapAt).getTime()) / 60000 : 999;
  if (wordsChanged >= 30 || mins >= 30) snapshot(`Otomatis, akhir sesi${session.words ? ` · +${session.words} kata` : ''}`, 'auto');
}

function blocksOf(html) {
  const div = document.createElement('div'); div.innerHTML = html;
  return Array.from(div.children).map((c) => c.textContent.trim()).filter(Boolean);
}
function diffBlocks(a, b) {
  const n = a.length, m = b.length;
  const L = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) L[i][j] = a[i] === b[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
  const out = []; let i = 0, j = 0;
  while (i < n && j < m) { if (a[i] === b[j]) { out.push(['=', a[i]]); i++; j++; } else if (L[i + 1][j] >= L[i][j + 1]) out.push(['-', a[i++]]); else out.push(['+', b[j++]]); }
  while (i < n) out.push(['-', a[i++]]); while (j < m) out.push(['+', b[j++]]);
  return out;
}

/* ---------- Aksi ---------- */

export const actions = {
  side: (el) => { tabByProject[pid] = el.dataset.t; if (el.dataset.t === 'drive') driveCache[pid] = null; renderSide(); },
  focus: () => { focusMode = !focusMode; $('#dwrap').classList.toggle('focus-mode', focusMode); document.querySelector('.shell').classList.toggle('focus-mode', focusMode); $$('[data-act="focus"]').forEach((b) => b.classList.toggle('on', focusMode)); },
  rename: async () => {
    const p = proj();
    const v = await promptDlg('Ganti judul', 'Judul kerja', p.title);
    if (v && v.trim()) { p.title = v.trim(); changed(p, 'projects'); go(`#draft/${pid}`); }
  },
  'dismiss-note': () => { noteDismissed[pid] = true; $('#lastnote').innerHTML = ''; },
  snapshot: async () => {
    const label = await promptDlg('Simpan versi', 'Nama versi', '', { placeholder: 'mis. sebelum revisi reviewer' });
    if (label === null) return;
    await snapshot(label.trim() || 'Versi manual', 'manual');
    if (S.state.settings.autoDocx && G.token) {
      try { await docxToDrive(proj(), label.trim()); toast('Versi tersimpan · .docx dikirim ke Drive › Ekspor.'); driveCache[pid] = null; } catch (e) { toast(`Versi tersimpan. .docx gagal dikirim: ${e.message}`); }
    } else toast('Versi tersimpan.');
    if (tabByProject[pid] === 'versi') loadSnaps();
  },
  'snap-diff': async (el) => {
    const s = (await listSnaps(pid)).find((x) => x.id === el.dataset.id); if (!s) return;
    saveNow();
    const diff = diffBlocks(blocksOf(s.html), blocksOf(getDraft(pid).html));
    const add = diff.filter((x) => x[0] === '+').length, del = diff.filter((x) => x[0] === '-').length;
    modal({ title: `Bandingkan dengan “${s.label || 'versi'}”`, wide: true,
      body: `<p class="s13 muted" style="margin:0">${add} paragraf ditambah/diubah, ${del} paragraf dihapus/diubah sejak versi itu. Hijau = sekarang, merah = di versi lama.</p>
        <div class="diff card pad">${diff.filter((x) => x[0] !== '=' ).length ? diff.map(([k, t]) => (k === '=' ? `<p class="muted" style="opacity:.55">${esc(t.slice(0, 160))}${t.length > 160 ? '…' : ''}</p>` : `<p>${k === '+' ? `<ins>${esc(t)}</ins>` : `<del>${esc(t)}</del>`}</p>`)).join('') : '<p>Tidak ada perbedaan.</p>'}</div>`,
      actions: [{ label: 'Tutup', cls: 'dark' }] });
  },
  'snap-restore': async (el) => {
    const s = (await listSnaps(pid)).find((x) => x.id === el.dataset.id); if (!s) return;
    if (!(await confirmDlg(`Pulihkan “${s.label || 'versi'}”? Isi sekarang disimpan dulu sebagai versi supaya tidak hilang.`, 'Pulihkan'))) return;
    await snapshot('Sebelum memulihkan versi', 'manual');
    ed.innerHTML = s.html; renderCites(ed, style(proj()));
    saveNow(); refresh(); toast('Versi dipulihkan.');
  },
  target: async (el) => {
    const p = proj();
    const v = await promptDlg('Target kata bagian ini', 'Jumlah kata (kosongkan untuk tanpa target)', String((p.sectionTargets || {})[el.dataset.key] || ''), { type: 'number' });
    if (v === null) return;
    p.sectionTargets = p.sectionTargets || {};
    if (Number(v) > 0) p.sectionTargets[el.dataset.key] = Number(v); else delete p.sectionTargets[el.dataset.key];
    changed(p, 'quiet'); renderOutline();
  },
  'add-section': async () => {
    const v = await promptDlg('Bagian baru', 'Judul bagian', '');
    if (!v) return;
    const h = document.createElement('h2'); h.textContent = v.trim();
    const pp = document.createElement('p'); pp.innerHTML = '<br>';
    ed.append(h, pp);
    saveNow(); refresh(); h.scrollIntoView({ block: 'start' });
  },
  'next-need': () => {
    const all = $$('.needcite', ed);
    if (!all.length) return;
    const i = (actions['next-need'].i = ((actions['next-need'].i ?? -1) + 1) % all.length);
    all[i].scrollIntoView({ block: 'center', behavior: 'smooth' });
  },
  'note-add': () => addNote(),
  'note-jump': (el) => {
    const a = ed.querySelector(`.anchor[data-note="${el.dataset.id}"]`); if (!a) return;
    a.scrollIntoView({ block: 'center', behavior: 'smooth' }); a.classList.add('flash'); setTimeout(() => a.classList.remove('flash'), 1600);
  },
  'note-done': async (el) => {
    const d = getDraft(pid); const m = (d.margins || []).find((x) => x.id === el.dataset.id); if (!m) return;
    if (m.gdoc && G.token) {
      const reply = await promptDlg('Balas di Google Docs', 'Balasan untuk komentar ini (boleh kosong)', 'Sudah diperbaiki di naskah. Terima kasih.');
      if (reply === null) return;
      try { await drive.reply(m.gdoc.fileId, m.gdoc.commentId, reply || 'Beres.', true); } catch (e) { toast(`Gagal membalas di Docs: ${e.message}`); }
    }
    m.resolved = true; saveDraft(d); renderSide();
  },
  'note-del': async (el) => {
    const d = getDraft(pid);
    d.margins = (d.margins || []).filter((x) => x.id !== el.dataset.id);
    unwrapAnchor(el.dataset.id);
    saveNow(); saveDraft(d); renderSide();
  },
  gdoc: async () => {
    const p = proj();
    if (!G.token) { try { await connect(true); } catch (e) { toast(e.message); return; } }
    const untuk = await promptDlg('Salinan Google Docs', 'Untuk siapa? (muncul di nama berkas)', 'pembimbing', { placeholder: 'pembimbing / reviewer / klien' });
    if (untuk === null) return;
    saveNow();
    try {
      toast('Membuat Google Docs…', null, null, 2500);
      const f = await googleDocsCopy(p, untuk.trim());
      changed(p, 'projects'); driveCache[pid] = null; renderSide();
      toast('Salinan Google Docs dibuat di folder Bagikan.', 'Buka', () => window.open(f.webViewLink, '_blank'), 9000);
    } catch (e) { toast(e.message); }
  },
  pull: async (el) => {
    const p = proj(); const sh = (p.shares || []).find((x) => x.id === el.dataset.id); if (!sh) return;
    if (!G.token) { try { await connect(true); } catch (e) { toast(e.message); return; } }
    try {
      const n = await pullComments(p, sh);
      saveDraft(getDraft(pid)); changed(p, 'quiet');
      tabByProject[pid] = n ? 'pinggir' : tabByProject[pid];
      renderSide();
      toast(n ? `${n} komentar baru masuk ke tab Pinggir.` : 'Tidak ada komentar baru.');
    } catch (e) { toast(e.message); }
  },
  export: (el) => {
    const p = proj();
    saveNow();
    menu(el, [
      { label: 'Word (.docx) — unduh', hint: 'sitasi jadi teks biasa sesuai gaya', act: async () => { try { download(await toDocx(p), `${fileBase(p)}.docx`); } catch (e) { toast(e.message); } } },
      { label: 'Word (.docx) — simpan ke Drive › Ekspor', hint: G.token ? '' : 'perlu masuk Google', act: async () => {
        if (!G.token) { try { await connect(true); } catch (e) { toast(e.message); return; } }
        try { await docxToDrive(p); driveCache[pid] = null; toast('Tersimpan di Drive › Ekspor.'); } catch (e) { toast(e.message); }
      } },
      { label: 'Google Docs — salinan untuk dibagikan', hint: 'masuk ke folder Bagikan', act: () => actions.gdoc() },
      '-',
      { label: 'PDF — lewat Cetak', hint: 'pilih “Simpan sebagai PDF”', act: () => printPDF(p) },
      { label: 'Markdown (.md)', act: () => download(new Blob([toMarkdown(p)], { type: 'text/markdown' }), `${fileBase(p)}.md`) }
    ]);
  }
};
