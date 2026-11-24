/* Clavis — sitasi: format gaya (APA 7, Chicago penulis–tahun, MLA 9, Harvard),
   daftar pustaka, pembaca BibTeX/RIS, dan data dari DOI (Crossref).
   Tidak menyentuh tampilan, jadi bisa diuji dengan Node. */

export const STYLES = [
  { id: 'apa7', label: 'APA 7 (penulis–tahun)' },
  { id: 'chicago', label: 'Chicago 17 (penulis–tahun)' },
  { id: 'harvard', label: 'Harvard' },
  { id: 'mla9', label: 'MLA 9' }
];

export const REF_TYPES = [
  { id: 'article', label: 'Artikel jurnal' },
  { id: 'book', label: 'Buku' },
  { id: 'chapter', label: 'Bab dalam buku' },
  { id: 'thesis', label: 'Skripsi/Tesis/Disertasi' },
  { id: 'web', label: 'Halaman web' },
  { id: 'report', label: 'Laporan' },
  { id: 'film', label: 'Film' },
  { id: 'news', label: 'Berita/Koran' },
  { id: 'other', label: 'Lainnya' }
];

const isFilled = (v) => v !== undefined && v !== null && String(v).trim() !== '';
const tidy = (s) => String(s || '').replace(/\s+/g, ' ').trim();
const endDot = (s) => (/[.?!]$/.test(s) ? s : `${s}.`);
const iEsc = (s) => String(s ?? '').replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
const it = (s) => `<i>${iEsc(s)}</i>`;
const itDot = (s) => (/[.?!]$/.test(s) ? it(s) : `${it(s)}.`);

/* ---------- Nama ---------- */

/** Ubah "Sari, Dewi" / "Dewi Sari" / {family, given} menjadi {family, given}. */
export function parseName(n) {
  if (!n) return null;
  if (typeof n === 'object') return { family: tidy(n.family || n.literal || ''), given: tidy(n.given || '') };
  const s = tidy(n.replace(/[{}]/g, ''));
  if (!s) return null;
  if (s.includes(',')) {
    const [family, ...rest] = s.split(',');
    return { family: tidy(family), given: tidy(rest.join(' ')) };
  }
  const parts = s.split(' ');
  if (parts.length === 1) return { family: parts[0], given: '' };
  const family = parts.pop();
  return { family, given: parts.join(' ') };
}

export function parseNames(text) {
  return String(text || '').split(/\s+and\s+|;\s*|\n/).map(parseName).filter((x) => x && x.family);
}

const initials = (given) => tidy(given).split(/[\s.]+/).filter(Boolean)
  .map((g) => g.split('-').map((p) => `${p[0].toUpperCase()}.`).join('-')).join(' ');

/** "Sari, D." (APA) / "Sari, Dewi" (Chicago/MLA, nama pertama) */
function invName(a, style) {
  if (!a.given) return a.family;
  if (style === 'apa7' || style === 'harvard') return `${a.family}, ${initials(a.given)}`;
  return `${a.family}, ${a.given}`;
}
function directName(a, style) {
  if (!a.given) return a.family;
  if (style === 'apa7' || style === 'harvard') return `${initials(a.given)} ${a.family}`;
  return `${a.given} ${a.family}`;
}

/* ---------- Siapkan: akhiran tahun (2021a, 2021b) ---------- */

const firstFamily = (r) => ((r.authors && r.authors[0]) ? r.authors[0].family : (r.title || '')).toLowerCase();
const yearOf = (r) => (isFilled(r.year) ? String(r.year) : 't.t.');

/** Urutkan referensi sesuai gaya dan beri akhiran a/b bila penulis pertama + tahun sama. */
export function prepare(refs, style) {
  const sorted = refs.slice().sort((a, b) => {
    const fa = firstFamily(a), fb = firstFamily(b);
    if (fa !== fb) return fa.localeCompare(fb, 'id');
    const ya = yearOf(a), yb = yearOf(b);
    if (ya !== yb) return ya.localeCompare(yb);
    return tidy(a.title).localeCompare(tidy(b.title), 'id');
  });
  const suffix = new Map();
  if (style !== 'mla9') {
    const groups = new Map();
    sorted.forEach((r) => {
      const k = `${(r.authors || []).map((a) => a.family.toLowerCase()).join('|')}#${yearOf(r)}`;
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k).push(r);
    });
    groups.forEach((g) => { if (g.length > 1) g.forEach((r, i) => suffix.set(r.id, String.fromCharCode(97 + i))); });
  }
  return { sorted, suffix };
}

const yearLabel = (r, ctx) => `${yearOf(r)}${ctx && ctx.suffix.get(r.id) ? ctx.suffix.get(r.id) : ''}`;

/* ---------- Sitasi di dalam teks ---------- */

function authorsInText(r, style, narrative) {
  const a = r.authors || [];
  const short = (t) => (t.length > 40 ? `${t.slice(0, 37)}…` : t);
  if (!a.length) return style === 'mla9' ? `"${short(tidy(r.title))}"` : short(tidy(r.title));
  const and = narrative ? 'dan' : (style === 'apa7' ? '&' : 'dan');
  if (style === 'mla9') {
    if (a.length === 1) return a[0].family;
    if (a.length === 2) return `${a[0].family} dan ${a[1].family}`;
    return `${a[0].family} et al.`;
  }
  if (a.length === 1) return a[0].family;
  if (a.length === 2) return `${a[0].family} ${and} ${a[1].family}`;
  if (style === 'chicago' && a.length === 3) return `${a[0].family}, ${a[1].family}, ${and} ${a[2].family}`;
  return `${a[0].family} et al.`;
}

const locText = (loc) => tidy(loc);

/**
 * Sitasi untuk satu kelompok.
 * items: [{ref, loc}], mode: 'paren' | 'narr'
 */
export function formatCitation(items, mode, style, ctx) {
  const parts = items.filter((x) => x && x.ref);
  if (!parts.length) return '[sumber hilang]';
  if (mode === 'narr') {
    return parts.map(({ ref, loc }) => {
      const who = authorsInText(ref, style, true);
      if (style === 'mla9') return loc ? `${who} (${locText(loc).replace(/^hlm\.\s*/i, '')})` : who;
      return `${who} (${yearLabel(ref, ctx)}${loc ? `, ${locText(loc)}` : ''})`;
    }).join('; ');
  }
  const inner = parts.map(({ ref, loc }) => {
    const who = authorsInText(ref, style, false);
    if (style === 'mla9') return loc ? `${who} ${locText(loc).replace(/^hlm\.\s*/i, '')}` : who;
    if (style === 'chicago') return `${who} ${yearLabel(ref, ctx)}${loc ? `, ${locText(loc).replace(/^hlm\.\s*/i, '')}` : ''}`;
    return `${who}, ${yearLabel(ref, ctx)}${loc ? `, ${locText(loc)}` : ''}`;
  });
  return `(${inner.join('; ')})`;
}

/* ---------- Daftar pustaka ---------- */

function authorsBib(r, style) {
  const a = r.authors || [];
  if (!a.length) return '';
  if (style === 'apa7' || style === 'harvard') {
    const list = a.slice(0, 20).map((x) => invName(x, style));
    if (list.length === 1) return list[0];
    if (style === 'harvard') return `${list.slice(0, -1).join(', ')} dan ${list[list.length - 1]}`;
    return `${list.slice(0, -1).join(', ')}, & ${list[list.length - 1]}`;
  }
  if (style === 'mla9') {
    if (a.length === 1) return invName(a[0], style);
    if (a.length === 2) return `${invName(a[0], style)}, dan ${directName(a[1], style)}`;
    return `${invName(a[0], style)}, et al.`;
  }
  // chicago
  if (a.length === 1) return invName(a[0], style);
  const rest = a.slice(1).map((x) => directName(x, style));
  return `${invName(a[0], style)}, ${rest.slice(0, -1).map((x) => `${x}, `).join('')}dan ${rest[rest.length - 1]}`;
}

function editorsText(r, style) {
  const e = r.editors || [];
  if (!e.length) return '';
  const names = e.map((x) => directName(x, style));
  const joined = names.length === 1 ? names[0] : `${names.slice(0, -1).join(', ')} & ${names[names.length - 1]}`;
  return `${joined} (${e.length > 1 ? 'Eds.' : 'Ed.'})`;
}

const doiUrl = (r) => (isFilled(r.doi) ? `https://doi.org/${String(r.doi).replace(/^https?:\/\/(dx\.)?doi\.org\//i, '')}` : (isFilled(r.url) ? r.url : ''));
const pagesTxt = (p) => tidy(p).replace(/\s*-+\s*/g, '–');

/** Satu entri daftar pustaka sebagai HTML (miring memakai <i>). */
export function formatBib(r, style, ctx) {
  const who = authorsBib(r, style);
  const y = yearLabel(r, ctx);
  const title = tidy(r.title) || 'Tanpa judul';
  const link = doiUrl(r);
  const pub = tidy(r.publisher);
  const cont = tidy(r.container);
  const vol = tidy(r.volume), iss = tidy(r.issue), pg = pagesTxt(r.pages);
  const t = r.type || 'other';
  const out = [];

  if (style === 'apa7' || style === 'harvard') {
    const head = who ? `${iEsc(who)}${/\.$/.test(who) ? '' : '.'} (${y}).` : '';
    if (t === 'article' || t === 'news') {
      out.push(head || '', `${iEsc(endDot(title))}`);
      let src = cont ? it(cont) : '';
      if (vol) src += `, ${it(vol)}`;
      if (iss) src += `(${iEsc(iss)})`;
      if (pg) src += `, ${iEsc(pg)}`;
      if (src) out.push(`${src}.`);
    } else if (t === 'chapter') {
      out.push(head, `${iEsc(endDot(title))}`);
      const ed = editorsText(r, style);
      out.push(`Dalam ${ed ? `${iEsc(ed)}, ` : ''}${cont ? it(cont) : ''}${pg ? ` (hlm. ${iEsc(pg)})` : ''}.`);
      if (pub) out.push(`${iEsc(endDot(pub))}`);
    } else if (t === 'thesis') {
      out.push(head, `${it(title)} [${iEsc(tidy(r.genre) || 'Tesis')}${r.institution ? `, ${iEsc(tidy(r.institution))}` : ''}].`);
      if (cont) out.push(`${iEsc(endDot(cont))}`);
    } else if (t === 'film') {
      const dir = (r.authors || [])[0];
      const dirTxt = dir ? `${iEsc(invName(dir, style))} (Sutradara). (${y}).` : `(${y}).`;
      out.push(dirTxt, `${it(title)} [Film].`);
      if (pub) out.push(`${iEsc(endDot(pub))}`);
    } else if (t === 'web') {
      out.push(head || `${it(title)}. (${y}).`);
      if (head) out.push(`${itDot(title)}`);
      if (cont) out.push(`${iEsc(endDot(cont))}`);
    } else {
      out.push(head || '', `${itDot(title)}`);
      if (t === 'book' && tidy(r.edition)) out[out.length - 1] = `${it(title)} (Edisi ke-${iEsc(tidy(r.edition))}).`;
      if (pub) out.push(`${iEsc(endDot(pub))}`);
    }
    if (!who && t !== 'film' && t !== 'web') out[0] = `${itDot(title)} (${y}).`;
    if (link) out.push(iEsc(link));
  } else if (style === 'chicago') {
    const head = who ? `${iEsc(endDot(who))} ${y}.` : '';
    if (t === 'article' || t === 'news') {
      out.push(head, `“${iEsc(endDot(title))}”`);
      let src = cont ? it(cont) : '';
      if (vol) src += ` ${iEsc(vol)}`;
      if (iss) src += ` (${iEsc(iss)})`;
      if (pg) src += `: ${iEsc(pg)}`;
      if (src) out.push(`${src}.`);
    } else if (t === 'chapter') {
      out.push(head, `“${iEsc(endDot(title))}”`);
      const ed = (r.editors || []).map((x) => directName(x, style)).join(' dan ');
      out.push(`Dalam ${cont ? it(cont) : ''}${ed ? `, disunting oleh ${iEsc(ed)}` : ''}${pg ? `, ${iEsc(pg)}` : ''}.`);
      const pp = [tidy(r.place), pub].filter(Boolean).join(': ');
      if (pp) out.push(`${iEsc(endDot(pp))}`);
    } else if (t === 'thesis') {
      out.push(head, `“${iEsc(endDot(title))}”`, `${iEsc(tidy(r.genre) || 'Tesis')}, ${iEsc(endDot(tidy(r.institution) || ''))}`);
    } else if (t === 'film') {
      out.push(`${itDot(title)}`, `${y}.`);
      const dir = (r.authors || [])[0];
      if (dir) out.push(`Disutradarai oleh ${iEsc(endDot(directName(dir, style)))}`);
      if (pub) out.push(`${iEsc(endDot(pub))}`);
    } else {
      out.push(head, `${itDot(title)}`);
      const pp = [tidy(r.place), pub].filter(Boolean).join(': ');
      if (pp) out.push(`${iEsc(endDot(pp))}`);
      if (t === 'web' && cont) out.push(`${iEsc(endDot(cont))}`);
    }
    if (!who && t !== 'film') out[0] = '';
    if (link) out.push(`${iEsc(link)}.`);
  } else {
    // MLA 9
    const head = who ? `${iEsc(endDot(who))}` : '';
    if (t === 'article' || t === 'news') {
      out.push(head, `“${iEsc(endDot(title))}”`);
      const bits = [cont ? it(cont) : '', vol ? `vol. ${iEsc(vol)}` : '', iss ? `no. ${iEsc(iss)}` : '', y, pg ? `hlm. ${iEsc(pg)}` : ''].filter(Boolean);
      out.push(`${bits.join(', ')}.`);
    } else if (t === 'chapter') {
      out.push(head, `“${iEsc(endDot(title))}”`);
      const ed = (r.editors || []).map((x) => directName(x, style)).join(' dan ');
      const bits = [cont ? it(cont) : '', ed ? `disunting oleh ${iEsc(ed)}` : '', pub ? iEsc(pub) : '', y, pg ? `hlm. ${iEsc(pg)}` : ''].filter(Boolean);
      out.push(`${bits.join(', ')}.`);
    } else if (t === 'film') {
      const dir = (r.authors || [])[0];
      out.push(`${itDot(title)}`, `${[dir ? `Disutradarai oleh ${iEsc(directName(dir, style))}` : '', pub ? iEsc(pub) : '', y].filter(Boolean).join(', ')}.`);
    } else {
      out.push(head, `${itDot(title)}`);
      const bits = [t === 'web' && cont ? iEsc(cont) : '', pub ? iEsc(pub) : '', y].filter(Boolean);
      if (bits.length) out.push(`${bits.join(', ')}.`);
    }
    if (link) out.push(`${iEsc(link.replace(/^https?:\/\//, ''))}.`);
  }
  return out.filter((x) => x && x.trim()).join(' ').replace(/\.\./g, '.').replace(/\s+/g, ' ').trim();
}

/** Daftar pustaka lengkap (array HTML) dari referensi yang dikutip. */
export function bibliography(refs, style) {
  const ctx = prepare(refs, style);
  return ctx.sorted.map((r) => ({ id: r.id, html: formatBib(r, style, ctx) }));
}

/** Ubah HTML entri (hanya <i>) menjadi potongan teks {text, italic}. */
export function bibRuns(html) {
  const runs = [];
  const re = /<i>(.*?)<\/i>/g;
  let last = 0, m;
  const un = (s) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
  while ((m = re.exec(html))) {
    if (m.index > last) runs.push({ text: un(html.slice(last, m.index)), italic: false });
    runs.push({ text: un(m[1]), italic: true });
    last = m.index + m[0].length;
  }
  if (last < html.length) runs.push({ text: un(html.slice(last)), italic: false });
  return runs;
}

/* ---------- Kunci sitasi ---------- */

export function makeKey(r, taken = new Set()) {
  const fam = ((r.authors && r.authors[0] && r.authors[0].family) || (r.title || 'anon').split(' ')[0] || 'anon')
    .normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '') || 'anon';
  const base = `${fam}${isFilled(r.year) ? r.year : ''}`;
  let key = base, i = 0;
  while (taken.has(key)) key = `${base}${String.fromCharCode(97 + i++)}`;
  return key;
}

/* ---------- BibTeX ---------- */

const BIB_TYPE = {
  article: 'article', book: 'book', inbook: 'chapter', incollection: 'chapter', inproceedings: 'chapter',
  phdthesis: 'thesis', mastersthesis: 'thesis', thesis: 'thesis', online: 'web', misc: 'other', techreport: 'report', report: 'report',
  movie: 'film', video: 'film', film: 'film', unpublished: 'other'
};

function readBibValue(s, i) {
  // s[i] adalah awal nilai: {..}, "..", atau kata/angka
  while (/\s/.test(s[i])) i++;
  let val = '';
  if (s[i] === '{') {
    let depth = 0;
    for (; i < s.length; i++) {
      const c = s[i];
      if (c === '{') { depth++; if (depth === 1) continue; }
      if (c === '}') { depth--; if (depth === 0) { i++; break; } }
      val += c;
    }
  } else if (s[i] === '"') {
    i++;
    let depth = 0;
    for (; i < s.length; i++) {
      const c = s[i];
      if (c === '{') depth++;
      if (c === '}') depth--;
      if (c === '"' && depth === 0) { i++; break; }
      val += c;
    }
  } else {
    while (i < s.length && /[^,}\s]/.test(s[i])) val += s[i++];
  }
  // sambungan dengan #
  while (/\s/.test(s[i])) i++;
  if (s[i] === '#') { const r = readBibValue(s, i + 1); return { val: val + r.val, i: r.i }; }
  return { val, i };
}

const deTex = (s) => tidy(String(s || '')
  .replace(/\\&/g, '&').replace(/\\%/g, '%').replace(/\\_/g, '_').replace(/--/g, '–')
  .replace(/\\['`^"~=.]\{?([a-zA-Z])\}?/g, '$1').replace(/\\[a-zA-Z]+\s*/g, '').replace(/[{}]/g, ''));

export function parseBibTeX(text) {
  const out = [];
  const s = String(text || '');
  const re = /@(\w+)\s*\{/g;
  let m;
  while ((m = re.exec(s))) {
    const type = m[1].toLowerCase();
    if (type === 'comment' || type === 'preamble' || type === 'string') continue;
    let i = re.lastIndex;
    const keyEnd = s.indexOf(',', i);
    if (keyEnd < 0) break;
    const key = tidy(s.slice(i, keyEnd));
    i = keyEnd + 1;
    const f = {};
    while (i < s.length) {
      while (/[\s,]/.test(s[i])) i++;
      if (s[i] === '}' || i >= s.length) { i++; break; }
      const nm = /^([\w-]+)\s*=\s*/.exec(s.slice(i));
      if (!nm) { i++; continue; }
      i += nm[0].length;
      const r = readBibValue(s, i);
      f[nm[1].toLowerCase()] = r.val;
      i = r.i;
    }
    re.lastIndex = i;
    const t = BIB_TYPE[type] || 'other';
    const ref = {
      type: t,
      key,
      authors: parseNames(deTex(f.author || f.director || '')),
      editors: parseNames(deTex(f.editor || '')),
      year: (deTex(f.year || f.date || '').match(/\d{4}/) || [''])[0],
      title: deTex(f.title),
      container: deTex(f.journal || f.journaltitle || f.booktitle || f.howpublished || f.organization || ''),
      publisher: deTex(f.publisher || f.school || f.institution || ''),
      place: deTex(f.address || f.location || ''),
      volume: deTex(f.volume), issue: deTex(f.number || f.issue), pages: deTex(f.pages),
      doi: deTex(f.doi), url: deTex(f.url), edition: deTex(f.edition)
    };
    if (t === 'thesis') {
      ref.institution = deTex(f.school || f.institution);
      ref.genre = type === 'phdthesis' ? 'Disertasi' : (type === 'mastersthesis' ? 'Tesis' : deTex(f.type) || 'Tesis');
      ref.publisher = '';
    }
    if (ref.title) out.push(ref);
  }
  return out;
}

/* ---------- RIS ---------- */

const RIS_TYPE = { JOUR: 'article', JFULL: 'article', MGZN: 'article', BOOK: 'book', EBOOK: 'book', CHAP: 'chapter', ECHAP: 'chapter',
  THES: 'thesis', ELEC: 'web', WEB: 'web', RPRT: 'report', MPCT: 'film', VIDEO: 'film', NEWS: 'news', CONF: 'chapter', CPAPER: 'chapter', GEN: 'other' };

export function parseRIS(text) {
  const out = [];
  let cur = null;
  String(text || '').split(/\r?\n/).forEach((line) => {
    const m = /^([A-Z][A-Z0-9])\s{1,2}-\s?(.*)$/.exec(line);
    if (!m) return;
    const [, tag, raw] = m;
    const v = tidy(raw);
    if (tag === 'TY') { cur = { type: RIS_TYPE[v] || 'other', authors: [], editors: [], _sp: '', _ep: '' }; return; }
    if (!cur) return;
    switch (tag) {
      case 'AU': case 'A1': cur.authors.push(parseName(v)); break;
      case 'A2': case 'ED': cur.editors.push(parseName(v)); break;
      case 'PY': case 'Y1': case 'DA': if (!cur.year) cur.year = (v.match(/\d{4}/) || [''])[0]; break;
      case 'TI': case 'T1': cur.title = v; break;
      case 'T2': case 'JO': case 'JF': case 'JA': case 'BT': if (!cur.container) cur.container = v; break;
      case 'VL': cur.volume = v; break;
      case 'IS': cur.issue = v; break;
      case 'SP': cur._sp = v; break;
      case 'EP': cur._ep = v; break;
      case 'PB': cur.publisher = v; break;
      case 'CY': cur.place = v; break;
      case 'DO': cur.doi = v; break;
      case 'UR': if (!cur.url) cur.url = v; break;
      case 'ET': cur.edition = v; break;
      case 'ER':
        cur.pages = cur._sp && cur._ep ? `${cur._sp}–${cur._ep}` : cur._sp;
        delete cur._sp; delete cur._ep;
        cur.authors = cur.authors.filter(Boolean); cur.editors = cur.editors.filter(Boolean);
        if (cur.type === 'thesis') { cur.institution = cur.publisher; cur.publisher = ''; cur.genre = 'Tesis'; }
        if (cur.title) out.push(cur);
        cur = null; break;
      default: break;
    }
  });
  return out;
}

/* ---------- DOI lewat Crossref ---------- */

const CR_TYPE = { 'journal-article': 'article', book: 'book', 'book-chapter': 'chapter', 'edited-book': 'book', monograph: 'book',
  dissertation: 'thesis', 'report': 'report', 'proceedings-article': 'chapter', 'posted-content': 'other' };

export function fromCrossref(msg) {
  const date = (msg.issued && msg.issued['date-parts'] && msg.issued['date-parts'][0]) || [];
  return {
    type: CR_TYPE[msg.type] || 'other',
    authors: (msg.author || []).map((a) => ({ family: tidy(a.family || a.name || ''), given: tidy(a.given || '') })).filter((a) => a.family),
    editors: (msg.editor || []).map((a) => ({ family: tidy(a.family || a.name || ''), given: tidy(a.given || '') })).filter((a) => a.family),
    year: date[0] ? String(date[0]) : '',
    title: deTex((msg.title || [])[0] || ''),
    container: deTex((msg['container-title'] || [])[0] || ''),
    publisher: tidy(msg.publisher || ''),
    volume: tidy(msg.volume || ''), issue: tidy(msg.issue || ''), pages: tidy(msg.page || ''),
    doi: tidy(msg.DOI || ''), url: ''
  };
}

export async function fetchDOI(doi) {
  const clean = String(doi).trim().replace(/^https?:\/\/(dx\.)?doi\.org\//i, '').replace(/^doi:\s*/i, '');
  const res = await fetch(`https://api.crossref.org/works/${encodeURIComponent(clean)}`);
  if (!res.ok) throw new Error(res.status === 404 ? 'DOI tidak ditemukan.' : 'Gagal mengambil data DOI.');
  const j = await res.json();
  return fromCrossref(j.message);
}

/** Ringkasan pendek untuk daftar: "Sari, D. · 2021" */
export function shortLabel(r) {
  const a = r.authors || [];
  const who = !a.length ? (r.title || 'Tanpa judul').slice(0, 30)
    : a.length === 1 ? invName(a[0], 'apa7') : a.length === 2 ? `${a[0].family} & ${a[1].family}` : `${a[0].family} et al.`;
  return `${who} · ${yearOf(r)}`;
}
