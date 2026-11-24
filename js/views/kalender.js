/* Clavis — Kalender: tenggat & sesi menulis per bulan, sesi berikutnya, linimasa 4 minggu, sinkron Google Calendar. */
import { S, add, remove, changed, get, typeOf, setSetting } from '../store.js';
import { esc, ymd, parseYMD, addDays, startOfDay, BULAN, HARI_PENDEK, fmtDate, hLabel, daysUntil } from '../util.js';
import { I, $, toast, modal, opts, typeBadge } from '../ui.js';
import { toICS, download } from '../export.js';
import { G, connect } from '../google.js';
import { syncNow } from '../sync.js';
import { go, isDone } from '../app.js';

export const title = () => 'Kalender';
let cursor = startOfDay(new Date());
cursor.setDate(1);

function eventsByDay() {
  const map = new Map();
  const put = (date, ev) => { if (!date) return; if (!map.has(date)) map.set(date, []); map.get(date).push(ev); };
  S.state.projects.forEach((p) => {
    const t = typeOf(p);
    (p.deadlines || []).forEach((dl) => put(dl.date, { kind: 'dl', p, dl, t, label: `${dl.label}: ${p.title}`, done: dl.done }));
  });
  S.state.sessions.forEach((s) => {
    const p = get('projects', s.projectId);
    put(s.date, { kind: 'se', s, p, label: `${(s.start || '').replace(':', '.')}–${(s.end || '').replace(':', '.')} menulis · ${p ? p.title : 'bebas'}`, done: s.done });
  });
  S.state.ideas.forEach((i) => (i.steps || []).forEach((st) => { if (st.toOfa) put(st.date, { kind: 'st', i, st, label: st.text, done: st.done }); }));
  map.forEach((l) => l.sort((a, b) => ({ dl: 0, se: 1, st: 2 }[a.kind] - { dl: 0, se: 1, st: 2 }[b.kind])));
  return map;
}

function evHTML(e) {
  if (e.kind === 'dl') return `<span class="ev hard${e.done ? ' done' : ''}" style="background:${e.t.color}" title="${esc(e.label)}">${esc(e.label)}</span>`;
  if (e.kind === 'se') return `<span class="ev${e.done ? ' done' : ''}" title="${esc(e.label)}">${esc(e.label)}</span>`;
  return `<span class="ev step${e.done ? ' done' : ''}" title="${esc(e.label)}">${esc(e.label)}</span>`;
}

function monthHTML(map) {
  const y = cursor.getFullYear(), m = cursor.getMonth();
  const first = new Date(y, m, 1);
  const start = addDays(first, -((first.getDay() + 6) % 7));
  const today = ymd();
  const cells = [];
  const daysIn = new Date(y, m + 1, 0).getDate();
  const total = Math.ceil((((first.getDay() + 6) % 7) + daysIn) / 7) * 7;
  for (let i = 0; i < total; i++) {
    const d = addDays(start, i);
    const key = ymd(d);
    const evs = map.get(key) || [];
    cells.push(`<button type="button" class="day${d.getMonth() !== m ? ' out' : ''}${key === today ? ' today' : ''}" data-act="day" data-d="${key}" aria-label="${fmtDate(key, { day: true })}">
      <span class="num">${d.getDate()}</span>${evs.slice(0, 3).map(evHTML).join('')}${evs.length > 3 ? `<span class="small muted">+${evs.length - 3}</span>` : ''}</button>`);
  }
  return `<div class="card" style="overflow:hidden"><div class="month">${['Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab', 'Min'].map((d) => `<div class="dow">${d}</div>`).join('')}${cells.join('')}</div></div>`;
}

function nextSession() {
  const now = new Date();
  const t = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  const today = ymd(now);
  return S.state.sessions.filter((s) => !s.done && s.date && (s.date > today || (s.date === today && (s.end || s.start || '') >= t)))
    .sort((a, b) => `${a.date}${a.start}` < `${b.date}${b.start}` ? -1 : 1)[0] || null;
}

function sessionCard() {
  const s = nextSession();
  if (!s) return `<div class="sesscard"><span class="label">Sesi menulis berikutnya</span><span class="serif" style="font-size:20px">Belum dijadwalkan</span><span class="s13" style="opacity:.8">Blok waktu menulis membuat draft lebih sering disentuh. Clavis mengingatkan saat waktunya tiba.</span><button class="btn" style="background:var(--paper);color:var(--ink)" data-act="session">${I.plus} Sesi menulis</button></div>`;
  const p = get('projects', s.projectId);
  const j = S.state.journal.filter((x) => !s.projectId || x.projectId === s.projectId || !x.projectId).sort((a, b) => ((a.updatedAt || a.createdAt) < (b.updatedAt || b.createdAt) ? 1 : -1))[0];
  return `<div class="sesscard" aria-label="Sesi menulis berikutnya">
    <span class="label">Sesi menulis berikutnya</span>
    <span class="serif" style="font-size:22px;line-height:1.25">${esc(fmtDate(s.date, { day: true }))} · ${esc((s.start || '').replace(':', '.'))}–${esc((s.end || '').replace(':', '.'))}</span>
    <span style="font-size:14px">${p ? esc(p.title) : 'Sesi bebas'}${s.note ? ` — ${esc(s.note)}` : ''}</span>
    ${j ? `<div class="q"><span class="label">Catatan terakhir · ${esc(fmtDate(j.date, { short: true }))}</span><br>“${esc(j.text)}”</div>` : ''}
    <div class="row"><a class="btn" style="flex:1;background:var(--paper);color:var(--ink);border-color:var(--paper)" href="#draft/${s.projectId || ''}">Buka draft</a><button class="btn" style="color:var(--paper);border-color:#5E5649" data-act="session-edit" data-id="${s.id}">Ubah</button></div>
  </div>`;
}

function timelineHTML() {
  const start = addDays(startOfDay(new Date()), -((new Date().getDay() + 6) % 7));
  const end = addDays(start, 28);
  const span = 28;
  const pos = (d) => Math.max(0, Math.min(100, ((parseYMD(d) - start) / 86400000 / span) * 100));
  const rows = S.state.projects.filter((p) => !isDone(p)).map((p) => {
    const dls = (p.deadlines || []).filter((d) => d.date && parseYMD(d.date) >= start && parseYMD(d.date) < end);
    const t = typeOf(p);
    if (!dls.length) return '';
    const last = dls.map((d) => d.date).sort().pop();
    const from = (p.createdAt || '').slice(0, 10);
    const left = from && parseYMD(from) > start ? pos(from) : 0;
    return `<div class="tl-row"><span style="color:var(--ink2)">${esc(p.title)}</span><div class="bar">
      <div class="b" style="left:${left}%;width:${Math.max(2, pos(last) - left)}%;background:${t.tint}"></div>
      ${dls.map((d) => `<div class="d" style="left:${pos(d.date)}%;background:${d.done ? '#B9B1A2' : t.color}" title="${esc(d.label)} · ${fmtDate(d.date, { short: true })}"></div>`).join('')}</div></div>`;
  }).join('');
  // dua tenggat keras dalam 3 hari
  const all = [];
  S.state.projects.filter((p) => !isDone(p)).forEach((p) => (p.deadlines || []).forEach((d) => { if (d.date && !d.done && daysUntil(d.date) >= 0 && daysUntil(d.date) < 28) all.push({ p, d }); }));
  all.sort((a, b) => (a.d.date < b.d.date ? -1 : 1));
  let warn = '';
  for (let i = 1; i < all.length; i++) {
    const gap = (parseYMD(all[i].d.date) - parseYMD(all[i - 1].d.date)) / 86400000;
    if (gap <= 3 && all[i].p.id !== all[i - 1].p.id) { warn = `Tenggat menumpuk: “${all[i - 1].d.label}” (${all[i - 1].p.title}) dan “${all[i].d.label}” (${all[i].p.title}) hanya berjarak ${gap} hari. Pertimbangkan memajukan sesi menulis.`; break; }
  }
  const weeks = [0, 1, 2, 3].map((w) => { const a = addDays(start, w * 7), b = addDays(a, 6); return `${a.getDate()}–${b.getDate()} ${BULAN[b.getMonth()].slice(0, 3)}`; });
  return `<div class="card pad stack timeline" aria-label="Linimasa proyek">
    <div class="sec-h"><h2 class="h2" style="font-size:20px">Linimasa · 4 minggu</h2></div>
    <div class="weeks">${weeks.map((w) => `<span>${w}</span>`).join('')}</div>
    ${rows || '<p class="small muted" style="margin:0">Tidak ada tenggat dalam empat minggu ini.</p>'}
    ${warn ? `<div class="note warn small">${esc(warn)}</div>` : ''}
  </div>`;
}

function syncCard() {
  const st = S.state.settings;
  const rem = st.submitReminders || [14, 7, 1];
  return `<div class="card pad stack" aria-label="Sinkronisasi">
    <h2 class="h2" style="font-size:20px">Sinkronisasi & pengingat</h2>
    <div class="row between" style="padding:6px 0;border-bottom:1px solid var(--line2)">
      <div class="stack" style="gap:2px"><span>Google Calendar</span><span class="small muted">${G.everConnected ? 'satu arah: tenggat & sesi Clavis → kalender utama' : 'masuk dengan Google dulu'}</span></div>
      <label class="check"><input type="checkbox" data-act="cal-toggle" ${st.calendarOn ? 'checked' : ''} ${G.configured ? '' : 'disabled'} aria-label="Sinkron ke Google Calendar"></label>
    </div>
    <div class="stack" style="gap:6px;padding:6px 0;border-bottom:1px solid var(--line2)">
      <span>Berkas kalender (.ics)</span><span class="small muted">Untuk kalender lain (Outlook, Apple). Unduh lagi setelah ada perubahan.</span>
      <button class="btn sm" style="align-self:flex-start" data-act="ics">Unduh .ics</button>
    </div>
    <div class="stack" style="gap:8px;padding-top:4px"><span>Pengingat tenggat submit</span>
      <div class="row wrap" style="gap:14px">${[30, 14, 7, 3, 1].map((n) => `<label class="check"><input type="checkbox" data-act="rem" data-n="${n}" ${rem.includes(n) ? 'checked' : ''}> H-${n}</label>`).join('')}</div>
      <span class="small muted">Tenggat lain diingatkan H-1. Jadwal juga muncul di One for All.</span>
    </div>
  </div>`;
}

export function render() {
  const map = eventsByDay();
  const y = cursor.getFullYear(), m = cursor.getMonth();
  const monthKeys = [...map.keys()].filter((k) => k.startsWith(`${y}-${String(m + 1).padStart(2, '0')}`));
  const dlN = monthKeys.reduce((s, k) => s + map.get(k).filter((e) => e.kind === 'dl').length, 0);
  const seN = monthKeys.reduce((s, k) => s + map.get(k).filter((e) => e.kind === 'se').length, 0);
  return `
  <header class="head">
    <div class="t"><span class="label">${dlN} tenggat · ${seN} sesi menulis bulan ini</span><h1 class="h1">${BULAN[m]} ${y}</h1></div>
    <div class="row wrap">
      <button class="iconbtn" style="border-color:var(--line);width:40px;height:40px" data-act="prev" aria-label="Bulan sebelumnya">${I.chevL}</button>
      <button class="btn" data-act="today">Hari ini</button>
      <button class="iconbtn" style="border-color:var(--line);width:40px;height:40px" data-act="next" aria-label="Bulan berikutnya">${I.chevR}</button>
      <button class="btn dark" data-act="session">${I.plus} Sesi menulis</button>
    </div>
  </header>
  <section class="cols" style="gap:20px">
    <div style="flex:3 1 560px;min-width:0" class="stack">${monthHTML(map)}
      <div class="row wrap small muted" style="gap:14px">${S.state.types.map((t) => `<span class="row" style="gap:6px"><span style="width:10px;height:10px;border-radius:2px;background:${t.color}"></span>${esc(t.name)}</span>`).join('')}<span class="row" style="gap:6px"><span style="width:10px;height:10px;border-radius:2px;background:var(--soft);border:1px solid var(--line)"></span>Sesi menulis</span><span class="row" style="gap:6px"><span style="width:10px;height:10px;border-radius:2px;background:var(--ofa-tint)"></span>Langkah ide (OfA)</span></div>
    </div>
    <div style="flex:2 1 340px;min-width:0" class="stack">${sessionCard()}${timelineHTML()}${syncCard()}</div>
  </section>`;
}

function sessionDialog(s, date) {
  const active = S.state.projects.filter((p) => !isDone(p));
  const v = s || { date: date || ymd(), start: '09:00', end: '11:00', projectId: S.state.lastDraft || (active[0] && active[0].id) || '', note: '' };
  modal({
    title: s ? 'Ubah sesi menulis' : 'Sesi menulis',
    body: `<label class="field"><span class="s13 muted">Naskah</span><select class="select" name="p"><option value="">Bebas</option>${opts(active.map((p) => [p.id, p.title]), v.projectId)}</select></label>
      <div class="grid2"><label class="field"><span class="s13 muted">Tanggal</span><input class="input" type="date" name="d" value="${esc(v.date)}"></label>
      <div class="row"><label class="field grow"><span class="s13 muted">Mulai</span><input class="input" type="time" name="a" value="${esc(v.start)}"></label><label class="field grow"><span class="s13 muted">Selesai</span><input class="input" type="time" name="b" value="${esc(v.end)}"></label></div></div>
      <label class="field"><span class="s13 muted">Rencana sesi</span><input class="input" name="n" value="${esc(v.note || '')}" placeholder="mis. isi bagian 2.3 ruang domestik"></label>
      ${!s ? '<label class="field"><span class="s13 muted">Ulangi setiap minggu</span><select class="select" name="r">' + opts([['0', 'Tidak'], ['3', '4 minggu'], ['7', '8 minggu']], '0') + '</select></label>' : ''}`,
    actions: [
      ...(s ? [{ label: 'Hapus', cls: 'ghost', act: () => { if (s.calId) S.state.calTrash = [...(S.state.calTrash || []), s.calId]; remove('sessions', s.id); } }] : []),
      { label: 'Batal' },
      { label: 'Simpan', cls: 'dark', primary: true, act: (f) => {
        if (!f.d.value || !f.a.value) return false;
        const data = { date: f.d.value, start: f.a.value, end: f.b.value || f.a.value, projectId: f.p.value || null, note: f.n.value.trim() };
        if (s) { Object.assign(s, data); changed(s, 'sessions'); }
        else {
          const n = Number((f.r && f.r.value) || 0);
          for (let i = 0; i <= n; i++) add('sessions', { ...data, date: ymd(addDays(parseYMD(data.date), i * 7)) });
          toast(n ? `${n + 1} sesi dijadwalkan.` : 'Sesi dijadwalkan.');
        }
      } }
    ]
  });
}

export const actions = {
  prev: () => { cursor = new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1); go('#kalender'); },
  next: () => { cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1); go('#kalender'); },
  today: () => { cursor = startOfDay(new Date()); cursor.setDate(1); go('#kalender'); },
  session: () => sessionDialog(),
  'session-edit': (el) => sessionDialog(get('sessions', el.dataset.id)),
  day: (el) => {
    const date = el.dataset.d;
    const evs = eventsByDay().get(date) || [];
    modal({
      title: fmtDate(date, { day: true }),
      body: `${evs.length ? `<div class="card list">${evs.map((e) => e.kind === 'dl'
        ? `<a class="li" href="#proyek/${e.p.id}">${typeBadge(e.p)}<span class="grow${e.done ? ' done-txt' : ''}">${esc(e.dl.label)} — ${esc(e.p.title)}</span><span class="small muted">${esc(hLabel(date))}</span></a>`
        : e.kind === 'se' ? `<button type="button" class="li" data-act="session-edit" data-id="${e.s.id}"><span class="badge">Sesi</span><span class="grow">${esc(e.label)}${e.s.note ? ` — ${esc(e.s.note)}` : ''}</span></button>`
          : `<a class="li" href="#ide/${e.i.id}"><span class="badge ofa">Langkah ide</span><span class="grow${e.done ? ' done-txt' : ''}">${esc(e.st.text)}</span></a>`).join('')}</div>` : '<p class="muted" style="margin:0">Belum ada apa-apa di tanggal ini.</p>'}`,
      onOpen: (f, back, close) => { back.addEventListener('click', (e) => { if (e.target.closest('a.li, [data-act="session-edit"]')) close(); }); },
      actions: [{ label: '+ Tenggat', act: () => { setTimeout(() => deadlineDialog(date), 0); } }, { label: '+ Sesi menulis', cls: 'dark', act: () => { setTimeout(() => sessionDialog(null, date), 0); } }]
    });
  },
  ics: () => download(toICS(), 'clavis.ics'),
  rem: (el) => {
    const n = Number(el.dataset.n);
    const cur = new Set(S.state.settings.submitReminders || [14, 7, 1]);
    if (el.checked) cur.add(n); else cur.delete(n);
    setSetting('submitReminders', [...cur].sort((a, b) => b - a));
  },
  'cal-toggle': async (el) => {
    if (el.checked && !G.token) {
      try { await connect(true); } catch (e) { toast(e.message); el.checked = false; return; }
    }
    setSetting('calendarOn', el.checked);
    if (el.checked) { toast('Tenggat dan sesi dikirim ke Google Calendar…'); syncNow(); }
  }
};

function deadlineDialog(date) {
  const active = S.state.projects.filter((p) => !isDone(p));
  if (!active.length) { toast('Belum ada proyek.'); return; }
  modal({
    title: 'Tenggat baru',
    body: `<label class="field"><span class="s13 muted">Proyek</span><select class="select" name="p">${opts(active.map((p) => [p.id, p.title]), '')}</select></label>
      <div class="grid2"><label class="field"><span class="s13 muted">Nama tenggat</span><input class="input" name="l" placeholder="mis. Submit, Revisi minor"></label><label class="field"><span class="s13 muted">Tanggal</span><input class="input" type="date" name="d" value="${esc(date)}"></label></div>`,
    actions: [{ label: 'Batal' }, { label: 'Simpan', cls: 'dark', primary: true, act: (f) => {
      const p = get('projects', f.p.value); if (!p) return false;
      p.deadlines = p.deadlines || [];
      p.deadlines.push({ id: `d${Date.now().toString(36)}`, label: f.l.value.trim() || 'Tenggat', date: f.d.value, done: false });
      changed(p, 'projects');
    } }]
  });
}
