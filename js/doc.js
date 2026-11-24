/* Clavis — membaca isi draft: sitasi berpenanda, outline per bagian, hitung kata, daftar pustaka.
   Draft disimpan sebagai HTML sederhana:
     <h2>Bagian</h2> <h3>Subbagian</h3> <p>…</p> <blockquote> <ul>/<ol>
     <span class="cite" data-refs="id1,id2" data-locs="hlm. 45|" data-mode="paren|narr">(Sari, 2021)</span>
     <mark class="needcite">[butuh sitasi]</mark>
     <span class="anchor" data-note="idCatatan">teks yang diberi catatan pinggir</span> */
import { S } from './store.js';
import { prepare, formatCitation, bibliography } from './cite.js';
import { countWords, slugify } from './util.js';

export function parseDraft(html) {
  const div = document.createElement('div');
  div.innerHTML = html || '';
  return div;
}

export const refById = (id) => S.state.refs.find((r) => r.id === id) || null;

export function citeItems(span) {
  const ids = String(span.dataset.refs || '').split(',').filter(Boolean);
  const locs = String(span.dataset.locs || '').split('|');
  return ids.map((id, i) => ({ ref: refById(id), loc: locs[i] || '', id }));
}

export function citedRefs(root) {
  const seen = new Set();
  const out = [];
  root.querySelectorAll('span.cite').forEach((sp) => {
    citeItems(sp).forEach(({ ref, id }) => { if (ref && !seen.has(id)) { seen.add(id); out.push(ref); } });
  });
  return out;
}

/** Perbarui teks semua sitasi di dalam root sesuai gaya. */
export function renderCites(root, style) {
  const refs = citedRefs(root);
  const ctx = prepare(refs, style);
  root.querySelectorAll('span.cite').forEach((sp) => {
    const items = citeItems(sp);
    const txt = formatCitation(items, sp.dataset.mode || 'paren', style, ctx);
    if (sp.textContent !== txt) sp.textContent = txt;
    sp.classList.toggle('broken', items.some((x) => !x.ref));
  });
  return refs;
}

export const bibFor = (root, style) => bibliography(citedRefs(root), style);

/** Teks yang dihitung sebagai kata (tanpa penanda [butuh sitasi]). */
export function plainText(node) {
  const c = node.cloneNode(true);
  c.querySelectorAll('.needcite, .bib-block').forEach((x) => x.remove());
  return c.textContent || '';
}
export const wordsOf = (node) => countWords(plainText(node));

/** Outline: bagian h2 beserta subbagian h3 dan jumlah kata masing-masing. */
export function outline(root) {
  const out = [];
  let cur = null, sub = null;
  const pre = { title: '(sebelum bagian pertama)', level: 2, words: 0, el: null, subs: [], key: '_pre' };
  Array.from(root.children).forEach((el) => {
    const tag = el.tagName;
    if (tag === 'H2') { cur = { title: el.textContent.trim() || 'Tanpa judul', level: 2, words: 0, el, subs: [], key: slugify(el.textContent) }; out.push(cur); sub = null; return; }
    if (tag === 'H3') { sub = { title: el.textContent.trim() || 'Tanpa judul', level: 3, words: 0, el, key: slugify(el.textContent) }; (cur || pre).subs.push(sub); return; }
    const w = wordsOf(el);
    (cur || pre).words += w;
    if (sub) sub.words += w;
  });
  if (pre.words > 0) out.unshift(pre);
  return out;
}

/** Templat awal draft dari bagian tipe proyek. */
export function templateHTML(sections, intro) {
  const empty = '<p><br></p>';
  if (!sections || !sections.length) return intro ? `<p>${intro}</p>` : empty;
  let at = sections.findIndex(([t]) => /pendahuluan|latar/i.test(t));
  if (at < 0) at = 0;
  return sections.map(([title], i) => `<h2>${title}</h2>${i === at && intro ? `<p>${intro}</p>` : empty}`).join('');
}
