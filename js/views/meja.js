/* Clavis — Meja (beranda): angka penting, tenggat terdekat, proyek berjalan, jurnal riset harian, kotak ide. */
import { S, add, getDraft, typeOf, changed } from '../store.js';
import { esc, fmtDate, hLabel, daysUntil, ymd, addDays, ago, angka } from '../util.js';
import { I, $, typeBadge, greeting, userName, toast } from '../ui.js';
import { G } from '../google.js';
import { isDone } from '../app.js';

export const title = () => 'Meja';

export function upcoming(limit = 6) {
  const out = [];
  S.state.projects.forEach((p) => {
    if (isDone(p)) return;
    (p.deadlines || []).forEach((dl) => { if (dl.date && !dl.done) out.push({ p, dl, n: daysUntil(dl.date) }); });
  });
  return out.filter((x) => x.n >= -14).sort((a, b) => a.n - b.n).slice(0, limit);
}

function weekWords() {
  const start = ymd(addDays(new Date(), -6));
  const log = S.state.writeLog.filter((w) => w.date >= start);
  const words = log.reduce((s, w) => s + (w.words || 0), 0);
  const days = new Set(log.filter((w) => w.words > 0).map((w) => w.date)).size;
  return { words, days };
}

function lastTouched(p) {
  const d = S.drafts.get(p.id);
  return [p.updatedAt, d && d.updatedAt].filter(Boolean).sort().pop() || p.createdAt;
}

export function render() {
  const st = S.state;
  const now = new Date();
  const active = st.projects.filter((p) => !isDone(p));
  const byType = st.types.map((t) => [t.name, active.filter((p) => p.type === t.id).length]).filter(([, n]) => n);
  const up = upcoming();
  const in14 = up.filter((x) => x.n >= 0 && x.n <= 14);
  const ww = weekWords();
  const inbox = st.ideas.filter((i) => i.status === 'inbox');
  const raw = st.ideas.filter((i) => i.status === 'inbox' || i.status === 'mentah');
  const journal = st.journal.slice().sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  const todayJ = journal.find((j) => j.date === ymd());
  const lastJ = journal.find((j) => j.date !== ymd());
  const projects = active.slice().sort((a, b) => (lastTouched(a) < lastTouched(b) ? 1 : -1)).slice(0, 5);

  const welcome = !st.projects.length && !st.ideas.length ? `
    <section class="welcome">
      <span class="label">Selamat datang di Clavis</span>
      <p class="h3" style="margin:0">Meja ini masih kosong. Mulai dari mana saja:</p>
      <div class="row wrap">
        <button class="btn dark" data-act="new-project">${I.plus} Proyek baru</button>
        <a class="btn" href="#ide">Tangkap ide</a>
        <a class="btn" href="#pustaka">Impor pustaka dari Mendeley</a>
        ${G.configured && !G.everConnected ? '<button class="btn" data-act="google-connect">Sambungkan Google Drive</button>' : ''}
      </div>
      <p class="small muted" style="margin:0">Data tersimpan di perangkat ini dulu, lalu ikut ke folder Clavis di Drive setelah kamu masuk dengan Google.</p>
    </section>` : '';

  return `
  <header class="head">
    <div class="t">
      <span class="label">${esc(fmtDate(ymd(now), { day: true }))} ${now.getFullYear()}</span>
      <h1 class="h1">${greeting(now)}, ${esc(userName())}. Meja Anda hari ini.</h1>
    </div>
    <div class="row" style="position:relative">
      <label for="cari" class="sr">Cari di semua ide, draft, dan pustaka</label>
      <div class="row card" style="height:44px;padding:0 12px;width:320px;max-width:60vw">
        ${I.search}<input id="cari" type="search" autocomplete="off" placeholder="Cari ide, draft, kutipan, brief…  ( / )" style="border:0;outline:0;background:transparent;flex:1;min-width:0;height:40px">
      </div>
      <button class="btn dark" style="height:44px" data-act="new-project">${I.plus} Proyek baru</button>
      <div id="cari-hasil" class="card search-res" hidden></div>
    </div>
  </header>
  ${welcome}
  <section class="stats" aria-label="Ringkasan">
    <a class="card stat" href="#proyek" style="text-decoration:none;color:inherit"><span class="label">Proyek berjalan</span><span class="n">${active.length}</span><span class="s13 muted">${byType.length ? byType.map(([n, c]) => `${c} ${n.toLowerCase()}`).join(' · ') : 'belum ada'}</span></a>
    <a class="card stat" href="#kalender" style="text-decoration:none;color:inherit"><span class="label">Tenggat 14 hari ke depan</span><span class="n">${in14.length}</span><span class="s13 muted">${in14.length ? `terdekat: ${hLabel(in14[0].dl.date)}` : 'tidak ada'}</span></a>
    <div class="card stat"><span class="label">Kata 7 hari terakhir</span><span class="n">${angka(ww.words)}</span><span class="s13 muted">${ww.days} hari menulis${ww.days ? ` · rata-rata ${angka(Math.round(ww.words / ww.days))}` : ''}</span></div>
    <a class="card stat" href="#ide" style="text-decoration:none;color:inherit"><span class="label">Ide di kotak</span><span class="n">${raw.length}</span><span class="s13 muted">${inbox.length} belum dikembangkan</span></a>
  </section>
  <section class="cols">
    <div class="col">
      <div class="sec-h"><h2 class="h2">Tenggat terdekat</h2><a class="s13" href="#kalender" style="font-weight:500">Buka kalender</a></div>
      ${up.length ? `<div class="card list">${up.map(({ p, dl, n }) => `
        <a class="li" href="#proyek/${p.id}">
          <span class="badge ${n < 0 ? 'err' : n <= 7 ? 'warn' : ''}" style="font-size:12px">${esc(hLabel(dl.date))}</span>
          <span class="grow stack" style="gap:3px"><span style="font-size:15px;font-weight:500">${esc(dl.label || 'Tenggat')} — ${esc(p.title)}</span>
          <span class="s13 muted">${esc(p.stage || '')} · ${fmtDate(dl.date, { short: true })}</span></span>
          ${typeBadge(p)}</a>`).join('')}</div>` : '<div class="empty">Belum ada tenggat. Tambahkan di halaman proyek atau kalender.</div>'}

      <div class="sec-h" style="margin-top:10px"><h2 class="h2">Jurnal riset hari ini</h2><span class="s13 muted">Satu baris cukup</span></div>
      <div class="card pad stack">
        <label for="jurnal" class="s13" style="color:var(--ink2)">Hari ini saya mengerjakan … dan mentok di …</label>
        <textarea id="jurnal" class="textarea sunk" rows="2" placeholder="Misal: merapikan tinjauan pustaka; mentok di bagian ruang domestik, butuh satu sumber lagi.">${esc(todayJ ? todayJ.text : '')}</textarea>
        <div class="row between wrap">
          <span class="mono small muted">${lastJ ? `${esc(fmtDate(lastJ.date, { short: true }))}: “${esc(lastJ.text.slice(0, 90))}${lastJ.text.length > 90 ? '…' : ''}”` : 'Catatan ini muncul lagi saat kamu membuka draft.'}</span>
          <div class="row"><select id="jurnal-p" class="select" style="height:40px;width:auto;max-width:200px"><option value="">Semua proyek</option>${active.map((p) => `<option value="${p.id}"${todayJ && todayJ.projectId === p.id ? ' selected' : ''}>${esc(p.title.slice(0, 40))}</option>`).join('')}</select>
          <button class="btn line" data-act="save-journal">Simpan catatan</button></div>
        </div>
      </div>
    </div>
    <div class="col">
      <div class="sec-h"><h2 class="h2">Proyek berjalan</h2><a class="s13" href="#proyek" style="font-weight:500">Semua proyek</a></div>
      ${projects.length ? projects.map((p) => {
        const d = getDraft(p.id);
        const t = typeOf(p);
        const lt = lastTouched(p);
        const stale = -daysUntil(lt.slice(0, 10)) >= 10;
        return `<a class="card pad stack" href="#draft/${p.id}" style="text-decoration:none;color:inherit;gap:8px">
          <span class="row between">${typeBadge(p, p.stage)}<span class="mono small" style="color:${stale ? 'var(--amber)' : 'var(--muted)'}">${stale ? `lama tidak disentuh · ${-daysUntil(lt.slice(0, 10))} hari` : `disentuh ${ago(lt)}`}</span></span>
          <span class="h3">${esc(p.title)}</span>
          <span class="s13 muted">${angka(d.words || 0)}${p.wordLimit ? ` / ${angka(p.wordLimit)}` : ''} kata${p.target ? ` · ${esc(p.target)}` : ''}${t.citations !== false ? ` · ${esc((p.style || S.state.settings.style).toUpperCase())}` : ''}</span></a>`;
      }).join('') : '<div class="empty">Belum ada proyek berjalan.</div>'}
      <div class="sec-h" style="margin-top:10px"><h2 class="h2">Dari kotak ide</h2><a class="s13" href="#ide" style="font-weight:500">Buka kotak ide</a></div>
      ${inbox.length ? `<div class="chips">${inbox.slice(0, 8).map((i) => `<a class="chip soft" href="#ide/${i.id}">${i.source === 'ofa' ? '<span class="dot" style="background:#2F8A63"></span>' : ''}${esc((i.title || i.text || '').slice(0, 60))}</a>`).join('')}</div>` : '<div class="empty">Kotak ide kosong. Tangkap ide di layar Ide atau dari One for All dengan #ide.</div>'}
    </div>
  </section>`;
}

/* ---------- Cari ---------- */

function search(q) {
  const s = q.trim().toLowerCase();
  if (s.length < 2) return [];
  const out = [];
  const hit = (t) => String(t || '').toLowerCase().includes(s);
  const snip = (t) => {
    const str = String(t || ''); const i = str.toLowerCase().indexOf(s);
    return i < 0 ? '' : `${i > 40 ? '…' : ''}${str.slice(Math.max(0, i - 40), i + 80)}${i + 80 < str.length ? '…' : ''}`;
  };
  S.state.ideas.forEach((i) => {
    const all = [i.title, i.text, ...Object.values(i.fields || {}), ...(i.tags || [])].join(' \n ');
    if (hit(all)) out.push({ k: 'Ide', t: i.title || i.text, s: snip(all), h: `#ide/${i.id}` });
  });
  S.state.projects.forEach((p) => {
    const brief = Object.values(p.brief || {}).join(' \n ');
    if (hit(`${p.title} ${p.target || ''} ${brief}`)) out.push({ k: 'Proyek', t: p.title, s: snip(brief), h: `#proyek/${p.id}` });
    const d = S.drafts.get(p.id);
    if (d && d.html) {
      const txt = d.html.replace(/<[^>]+>/g, ' ');
      if (hit(txt)) out.push({ k: 'Draft', t: p.title, s: snip(txt), h: `#draft/${p.id}` });
    }
  });
  S.state.refs.forEach((r) => {
    const a = (r.authors || []).map((x) => x.family).join(' ');
    const all = [r.title, a, r.container, r.summary, r.critique, ...(r.quotes || []).map((x) => x.text), ...(r.tags || [])].join(' \n ');
    if (hit(all)) out.push({ k: 'Pustaka', t: `${a}${r.year ? ` (${r.year})` : ''} — ${r.title}`, s: snip(all), h: `#pustaka/${r.id}` });
  });
  S.state.journal.forEach((j) => { if (hit(j.text)) out.push({ k: 'Jurnal riset', t: fmtDate(j.date), s: snip(j.text), h: j.projectId ? `#draft/${j.projectId}` : '#meja' }); });
  return out.slice(0, 30);
}

export function mount(root) {
  const inp = $('#cari', root), box = $('#cari-hasil', root);
  if (!inp) return;
  inp.addEventListener('input', () => {
    const r = search(inp.value);
    box.hidden = !inp.value.trim();
    box.innerHTML = r.length ? `<div class="list">${r.map((x) => `<a class="li" href="${x.h}" style="flex-direction:column;align-items:flex-start;gap:4px"><span class="row"><span class="badge">${esc(x.k)}</span><span style="font-weight:500">${esc(String(x.t).slice(0, 80))}</span></span>${x.s ? `<span class="s13 muted">${esc(x.s)}</span>` : ''}</a>`).join('')}</div>` : '<div class="pad s13 muted">Tidak ada yang cocok.</div>';
  });
  inp.addEventListener('keydown', (e) => { if (e.key === 'Escape') { inp.value = ''; box.hidden = true; } });
  document.addEventListener('mousedown', (e) => { if (!box.contains(e.target) && e.target !== inp) box.hidden = true; }, { once: true });
}

export const actions = {
  'save-journal': () => {
    const text = $('#jurnal').value.trim();
    if (!text) return;
    const pid = $('#jurnal-p').value || null;
    const existing = S.state.journal.find((j) => j.date === ymd());
    if (existing) { existing.text = text; existing.projectId = pid; changed(existing, 'journal'); }
    else add('journal', { date: ymd(), text, projectId: pid });
    toast('Catatan riset tersimpan.');
  }
};
