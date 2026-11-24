/* Clavis — ekspor: Word (.docx), Google Docs, Markdown, PDF (lewat cetak), dan kalender (.ics).
   Sitasi diekspor sebagai teks biasa sesuai gaya yang dipilih (bisa disorot kuning supaya mudah
   diganti lewat Mendeley Cite). Catatan pinggir bisa ikut sebagai komentar Word. */
import { S, getDraft, typeOf } from './store.js';
import { parseDraft, renderCites, bibFor } from './doc.js';
import { bibRuns } from './cite.js';
import { esc, fmtDate, ymd, parseYMD, addDays } from './util.js';
import { drive, GDOC, G } from './google.js';
import { projectFolders } from './sync.js';
import { APP_URL } from './config.js';

let docxLoading = null;
function loadDocx() {
  if (window.docx) return Promise.resolve(window.docx);
  if (docxLoading) return docxLoading;
  docxLoading = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'vendor/docx.iife.js';
    s.onload = () => resolve(window.docx);
    s.onerror = () => { docxLoading = null; reject(new Error('Pembuat berkas Word gagal dimuat.')); };
    document.head.appendChild(s);
  });
  return docxLoading;
}

export function exportOptions() {
  const st = S.state.settings;
  return { highlightCites: !!st.highlightCites, marginsAsComments: st.marginsAsComments !== false, keepNeedCite: st.keepNeedCite !== false };
}

/** Siapkan isi draft untuk diekspor: sitasi dirender, daftar pustaka dihitung. */
export function prepareDoc(p) {
  const d = getDraft(p.id);
  const root = parseDraft(d.html);
  const style = p.style || S.state.settings.style;
  const type = typeOf(p);
  renderCites(root, style);
  const bib = type.citations === false && !root.querySelector('span.cite') ? [] : bibFor(root, style);
  return { d, root, bib, style };
}

export const fileBase = (p) => String(p.title || 'Naskah').replace(/[\\/:*?"<>|]+/g, ' ').trim().slice(0, 80) || 'Naskah';

export function download(blob, name) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 2000);
}


/* ---------- Tabel linimasa & RAB (tipe Proposal) ---------- */

const rp = (n) => `Rp${Number(n || 0).toLocaleString('id-ID')}`;
export function projectTables(p) {
  const lm = (p.linimasa || []).filter((r) => r.kegiatan);
  const rab = (p.rab || []).filter((r) => r.item);
  const total = rab.reduce((s, r) => s + (Number(r.vol) || 0) * (Number(r.harga) || 0), 0);
  return {
    linimasa: lm.length ? [['No.', 'Kegiatan', 'Mulai', 'Selesai'], ...lm.map((r, i) => [String(i + 1), r.kegiatan, r.mulai ? fmtDate(r.mulai) : '', r.selesai ? fmtDate(r.selesai) : ''])] : null,
    rab: rab.length ? [['No.', 'Pos anggaran', 'Volume', 'Satuan', 'Harga satuan', 'Jumlah'],
      ...rab.map((r, i) => [String(i + 1), r.item, String(r.vol ?? ''), r.satuan || '', rp(r.harga), rp((Number(r.vol) || 0) * (Number(r.harga) || 0))]),
      ['', 'Total', '', '', '', rp(total)]] : null
  };
}
const tableFor = (title, T) => (/linimasa|jadwal kegiatan/i.test(title) ? T.linimasa : /anggaran|\brab\b|biaya/i.test(title) ? T.rab : null);

/* ---------- Word ---------- */

export async function toDocx(p, opt = exportOptions()) {
  const D = await loadDocx();
  const { d, root, bib } = prepareDoc(p);
  const margins = new Map((d.margins || []).filter((m) => !m.resolved).map((m, i) => [m.id, { ...m, n: i }]));
  const comments = [];
  const usedComments = new Set();

  function runsOf(node, fmt = {}) {
    const out = [];
    node.childNodes.forEach((n) => {
      if (n.nodeType === 3) {
        if (n.nodeValue) out.push(new D.TextRun({ text: n.nodeValue, bold: fmt.b, italics: fmt.i, underline: fmt.u ? {} : undefined, highlight: fmt.hl }));
        return;
      }
      if (n.nodeType !== 1) return;
      const tag = n.tagName;
      if (tag === 'BR') { out.push(new D.TextRun({ break: 1 })); return; }
      if (n.classList.contains('cite')) {
        out.push(new D.TextRun({ text: n.textContent, bold: fmt.b, italics: fmt.i, highlight: opt.highlightCites ? 'yellow' : fmt.hl }));
        return;
      }
      if (n.classList.contains('needcite')) {
        if (opt.keepNeedCite) out.push(new D.TextRun({ text: n.textContent, highlight: 'yellow', bold: true }));
        return;
      }
      if (n.classList.contains('anchor') && opt.marginsAsComments && margins.has(n.dataset.note) && !usedComments.has(n.dataset.note)) {
        const m = margins.get(n.dataset.note);
        const cid = comments.length;
        usedComments.add(m.id);
        comments.push({ id: cid, author: m.from || S.state.settings.name || 'Clavis', initials: 'CL', date: new Date(m.createdAt || Date.now()),
          children: [new D.Paragraph({ children: [new D.TextRun(m.text || '')] })] });
        out.push(new D.CommentRangeStart(cid));
        out.push(...runsOf(n, fmt));
        out.push(new D.CommentRangeEnd(cid));
        out.push(new D.TextRun({ children: [new D.CommentReference(cid)] }));
        return;
      }
      const f = { ...fmt };
      if (tag === 'B' || tag === 'STRONG') f.b = true;
      if (tag === 'I' || tag === 'EM') f.i = true;
      if (tag === 'U') f.u = true;
      out.push(...runsOf(n, f));
    });
    return out;
  }

  const T = projectTables(p);
  const dTable = (rows) => new D.Table({
    width: { size: 100, type: D.WidthType.PERCENTAGE },
    rows: rows.map((r, ri) => new D.TableRow({ tableHeader: ri === 0, children: r.map((c) => new D.TableCell({ children: [new D.Paragraph({ spacing: { line: 240, after: 0 }, children: [new D.TextRun({ text: c || '', bold: ri === 0 || (ri === rows.length - 1 && r[1] === 'Total'), size: 22 })] })] })) }))
  });
  const children = [new D.Paragraph({ heading: D.HeadingLevel.TITLE, alignment: D.AlignmentType.CENTER, children: [new D.TextRun({ text: p.title || 'Tanpa judul', bold: true })] })];
  Array.from(root.children).forEach((el) => {
    const tag = el.tagName;
    if (tag === 'H2') {
      children.push(new D.Paragraph({ heading: D.HeadingLevel.HEADING_1, children: runsOf(el) }));
      const rows = tableFor(el.textContent, T);
      if (rows) { children.push(dTable(rows)); children.push(new D.Paragraph({ children: [] })); }
    }
    else if (tag === 'H3') children.push(new D.Paragraph({ heading: D.HeadingLevel.HEADING_2, children: runsOf(el) }));
    else if (tag === 'H4') children.push(new D.Paragraph({ heading: D.HeadingLevel.HEADING_3, children: runsOf(el) }));
    else if (tag === 'BLOCKQUOTE') {
      const ps = el.querySelectorAll('p');
      (ps.length ? Array.from(ps) : [el]).forEach((x) => children.push(new D.Paragraph({ indent: { left: 720, right: 720 }, spacing: { line: 240 }, children: runsOf(x) })));
    } else if (tag === 'UL' || tag === 'OL') {
      el.querySelectorAll(':scope > li').forEach((li) => children.push(new D.Paragraph({ numbering: { reference: tag === 'UL' ? 'poin' : 'angka', level: 0, instance: tag === 'OL' ? children.length : undefined }, children: runsOf(li) })));
    } else if (el.classList && el.classList.contains('bib-block')) {
      /* dilewati: daftar pustaka dibuat ulang di bawah */
    } else {
      const runs = runsOf(el);
      children.push(new D.Paragraph({ children: runs.length ? runs : [new D.TextRun('')] }));
    }
  });

  if (bib.length) {
    children.push(new D.Paragraph({ heading: D.HeadingLevel.HEADING_1, children: [new D.TextRun('Daftar Pustaka')] }));
    bib.forEach((b) => children.push(new D.Paragraph({
      indent: { left: 720, hanging: 720 },
      children: bibRuns(b.html).map((r) => new D.TextRun({ text: r.text, italics: r.italic, highlight: opt.highlightCites ? 'yellow' : undefined }))
    })));
  }

  const doc = new D.Document({
    creator: S.state.settings.name || 'Clavis',
    title: p.title,
    description: 'Diekspor dari Clavis',
    styles: {
      default: {
        document: { run: { font: 'Times New Roman', size: 24 }, paragraph: { spacing: { line: 360, after: 120 } } },
        title: { run: { font: 'Times New Roman', size: 32, bold: true, color: '000000' } },
        heading1: { run: { font: 'Times New Roman', size: 26, bold: true, color: '000000' }, paragraph: { spacing: { before: 240, after: 120 } } },
        heading2: { run: { font: 'Times New Roman', size: 24, bold: true, italics: true, color: '000000' }, paragraph: { spacing: { before: 200, after: 100 } } },
        heading3: { run: { font: 'Times New Roman', size: 24, italics: true, color: '000000' } }
      }
    },
    numbering: {
      config: [
        { reference: 'poin', levels: [{ level: 0, format: D.LevelFormat.BULLET, text: '•', alignment: D.AlignmentType.LEFT, style: { paragraph: { indent: { left: 720, hanging: 360 } } } }] },
        { reference: 'angka', levels: [{ level: 0, format: D.LevelFormat.DECIMAL, text: '%1.', alignment: D.AlignmentType.LEFT, style: { paragraph: { indent: { left: 720, hanging: 360 } } } }] }
      ]
    },
    comments: { children: comments },
    sections: [{
      properties: { page: { size: { width: 11906, height: 16838 }, margin: { top: 1440, bottom: 1440, left: 1440, right: 1440 } } },
      children
    }]
  });
  return D.Packer.toBlob(doc);
}

/* ---------- HTML untuk Google Docs, cetak, Markdown ---------- */

function cleanInline(el, opt) {
  const c = el.cloneNode(true);
  c.querySelectorAll('span.cite').forEach((sp) => {
    const t = document.createElement(opt.highlightCites ? 'mark' : 'span');
    t.textContent = sp.textContent;
    sp.replaceWith(t);
  });
  c.querySelectorAll('.needcite').forEach((m) => {
    if (!opt.keepNeedCite) { m.remove(); return; }
    const t = document.createElement('mark'); t.textContent = m.textContent; m.replaceWith(t);
  });
  c.querySelectorAll('span.anchor').forEach((a) => a.replaceWith(...a.childNodes));
  c.querySelectorAll('.bib-block').forEach((b) => b.remove());
  return c;
}

export function toHTML(p, opt = exportOptions()) {
  const { root, bib } = prepareDoc(p);
  const T = projectTables(p);
  root.querySelectorAll('h2').forEach((h) => {
    const rows = tableFor(h.textContent, T);
    if (!rows) return;
    const t = document.createElement('table');
    t.innerHTML = rows.map((r, i) => `<tr>${r.map((c) => (i === 0 ? `<th>${esc(c)}</th>` : `<td>${esc(c)}</td>`)).join('')}</tr>`).join('');
    h.after(t);
  });
  const body = cleanInline(root, opt).innerHTML;
  const bibHtml = bib.length ? `<h2>Daftar Pustaka</h2>${bib.map((b) => `<p class="bib">${opt.highlightCites ? `<mark>${b.html}</mark>` : b.html}</p>`).join('')}` : '';
  return `<!doctype html><html lang="id"><head><meta charset="utf-8"><title>${esc(p.title)}</title>
<style>
body{font-family:'Times New Roman',Times,serif;font-size:12pt;line-height:1.5;max-width:16cm;margin:2.5cm auto;color:#000}
h1{font-size:16pt;text-align:center;margin:0 0 18pt}
h2{font-size:13pt;margin:18pt 0 6pt}
h3{font-size:12pt;font-style:italic;margin:12pt 0 6pt}
p{margin:0 0 8pt}
blockquote{margin:0 1.27cm 8pt;line-height:1.15}
p.bib{padding-left:1.27cm;text-indent:-1.27cm}
mark{background:#fff59d}
table{border-collapse:collapse;width:100%;margin:0 0 10pt;font-size:11pt}th,td{border:1px solid #444;padding:3pt 5pt;text-align:left;vertical-align:top}th{background:#eee}
@page{size:A4;margin:2.54cm}
</style></head><body><h1>${esc(p.title)}</h1>${body}${bibHtml}</body></html>`;
}

export function printPDF(p) {
  const html = toHTML(p, { ...exportOptions(), highlightCites: false });
  const f = document.createElement('iframe');
  f.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0';
  document.body.appendChild(f);
  f.contentDocument.open(); f.contentDocument.write(html); f.contentDocument.close();
  setTimeout(() => { f.contentWindow.focus(); f.contentWindow.print(); setTimeout(() => f.remove(), 60000); }, 400);
}

export function toMarkdown(p) {
  const { root, bib } = prepareDoc(p);
  const opt = exportOptions();
  const inline = (el) => {
    let s = '';
    el.childNodes.forEach((n) => {
      if (n.nodeType === 3) { s += n.nodeValue; return; }
      if (n.nodeType !== 1) return;
      if (n.classList.contains('needcite')) { if (opt.keepNeedCite) s += '**[butuh sitasi]**'; return; }
      if (n.classList.contains('cite')) { s += n.textContent; return; }
      const inner = inline(n);
      if (n.tagName === 'B' || n.tagName === 'STRONG') s += `**${inner}**`;
      else if (n.tagName === 'I' || n.tagName === 'EM') s += `*${inner}*`;
      else if (n.tagName === 'BR') s += '  \n';
      else s += inner;
    });
    return s;
  };
  const lines = [`# ${p.title}`, ''];
  Array.from(root.children).forEach((el) => {
    if (el.classList.contains('bib-block')) return;
    if (el.tagName === 'H2') lines.push(`## ${inline(el)}`, '');
    else if (el.tagName === 'H3') lines.push(`### ${inline(el)}`, '');
    else if (el.tagName === 'BLOCKQUOTE') lines.push(`> ${inline(el).replace(/\n/g, '\n> ')}`, '');
    else if (el.tagName === 'UL') { el.querySelectorAll(':scope > li').forEach((li) => lines.push(`- ${inline(li)}`)); lines.push(''); }
    else if (el.tagName === 'OL') { el.querySelectorAll(':scope > li').forEach((li, i) => lines.push(`${i + 1}. ${inline(li)}`)); lines.push(''); }
    else { const t = inline(el).trim(); if (t) lines.push(t, ''); }
  });
  if (bib.length) {
    lines.push('## Daftar Pustaka', '');
    bib.forEach((b) => lines.push(bibRuns(b.html).map((r) => (r.italic ? `*${r.text}*` : r.text)).join(''), ''));
  }
  return lines.join('\n');
}

/* ---------- Ke Drive ---------- */

const stamp = () => {
  const d = new Date();
  return `${ymd(d)} ${String(d.getHours()).padStart(2, '0')}.${String(d.getMinutes()).padStart(2, '0')}`;
};

/** Simpan .docx ke folder Ekspor/ proyek. */
export async function docxToDrive(p, label = '') {
  if (!G.token) throw new Error('Masuk Google dulu untuk menyimpan ke Drive.');
  const blob = await toDocx(p);
  const f = await projectFolders(p);
  return drive.upload({ parentId: f.eksporId, name: `${fileBase(p)} · ${stamp()}${label ? ` · ${label}` : ''}.docx`, mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', data: blob });
}

/** Buat salinan Google Docs di folder Bagikan/. */
export async function googleDocsCopy(p, untuk = '') {
  if (!G.token) throw new Error('Masuk Google dulu untuk membuat Google Docs.');
  const html = toHTML(p, { ...exportOptions(), highlightCites: false });
  const f = await projectFolders(p);
  const name = `${fileBase(p)} — ${untuk ? `untuk ${untuk}` : 'untuk dibagikan'} (${stamp()})`;
  const file = await drive.upload({ parentId: f.bagikanId, name, mime: 'text/html', data: html, convertTo: GDOC });
  p.shares = p.shares || [];
  p.shares.unshift({ id: file.id, name, untuk, link: file.webViewLink, at: new Date().toISOString(), pulled: [] });
  return file;
}

/** Tarik komentar dari salinan Google Docs ke catatan pinggir. Mengembalikan jumlah komentar baru. */
export async function pullComments(p, share) {
  const list = await drive.comments(share.id);
  const d = getDraft(p.id);
  d.margins = d.margins || [];
  share.pulled = share.pulled || [];
  let n = 0;
  list.forEach((c) => {
    if (c.resolved || share.pulled.includes(c.id)) return;
    share.pulled.push(c.id);
    const quote = c.quotedFileContent && c.quotedFileContent.value ? c.quotedFileContent.value : '';
    d.margins.push({ id: `gd-${c.id}`, text: c.content, quote, from: `${(c.author && c.author.displayName) || 'Pembaca'} · Google Docs`, gdoc: { fileId: share.id, commentId: c.id }, createdAt: c.createdTime || new Date().toISOString(), resolved: false });
    n++;
  });
  return n;
}

/* ---------- Kalender (.ics) ---------- */

export function toICS() {
  const L = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Clavis//ID', 'CALSCALE:GREGORIAN', 'X-WR-CALNAME:Clavis'];
  const escI = (s) => String(s || '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');
  const nowS = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
  S.state.projects.forEach((p) => (p.deadlines || []).forEach((dl) => {
    if (!dl.date) return;
    const d = dl.date.replace(/-/g, '');
    const e = ymd(addDays(parseYMD(dl.date), 1)).replace(/-/g, '');
    L.push('BEGIN:VEVENT', `UID:${dl.id}@clavis`, `DTSTAMP:${nowS}`, `DTSTART;VALUE=DATE:${d}`, `DTEND;VALUE=DATE:${e}`,
      `SUMMARY:${escI(`Tenggat · ${dl.label} — ${p.title}`)}`, `DESCRIPTION:${escI(`${APP_URL}#proyek/${p.id}`)}`);
    (S.state.settings.submitReminders || [14, 7, 1]).forEach((n) => L.push('BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${escI(dl.label)}`, `TRIGGER:-P${n}D`, 'END:VALARM'));
    L.push('END:VEVENT');
  }));
  S.state.sessions.forEach((s) => {
    if (!s.date || !s.start) return;
    const p = S.state.projects.find((x) => x.id === s.projectId);
    const t = (x) => `${s.date.replace(/-/g, '')}T${String(x).replace(/[.:]/g, '')}00`;
    L.push('BEGIN:VEVENT', `UID:${s.id}@clavis`, `DTSTAMP:${nowS}`, `DTSTART;TZID=Asia/Jakarta:${t(s.start)}`, `DTEND;TZID=Asia/Jakarta:${t(s.end || s.start)}`,
      `SUMMARY:${escI(`Menulis · ${p ? p.title : 'Clavis'}`)}`, `DESCRIPTION:${escI(s.note || '')}`, 'END:VEVENT');
  });
  L.push('END:VCALENDAR');
  return new Blob([L.join('\r\n')], { type: 'text/calendar' });
}

/* ---------- Tabel tanggapan reviewer ---------- */

export async function reviewerDocx(p, round) {
  const D = await loadDocx();
  const rows = (p.reviewers || []).filter((r) => !round || String(r.round) === String(round));
  const cell = (t, bold) => new D.TableCell({ children: [new D.Paragraph({ children: [new D.TextRun({ text: t || '', bold })] })] });
  const table = new D.Table({
    width: { size: 100, type: D.WidthType.PERCENTAGE },
    rows: [
      new D.TableRow({ tableHeader: true, children: ['No.', 'Komentar reviewer', 'Tanggapan penulis', 'Perubahan di naskah'].map((t) => cell(t, true)) }),
      ...rows.map((r, i) => new D.TableRow({ children: [cell(r.no || String(i + 1)), cell(r.komentar), cell(r.tanggapan), cell(r.perubahan)] }))
    ]
  });
  const doc = new D.Document({
    styles: { default: { document: { run: { font: 'Times New Roman', size: 22 } } } },
    sections: [{ properties: { page: { size: { orientation: D.PageOrientation.LANDSCAPE, width: 11906, height: 16838 } } }, children: [
      new D.Paragraph({ heading: D.HeadingLevel.HEADING_1, children: [new D.TextRun({ text: 'Tanggapan untuk Reviewer', bold: true })] }),
      new D.Paragraph({ children: [new D.TextRun(`Naskah: ${p.title}`)] }),
      new D.Paragraph({ children: [new D.TextRun(`${p.target ? `Jurnal: ${p.target} · ` : ''}${round ? `Putaran ${round} · ` : ''}${fmtDate(ymd())}`)] }),
      table
    ] }]
  });
  return D.Packer.toBlob(doc);
}
