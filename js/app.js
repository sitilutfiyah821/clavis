/* Clavis — kerangka app: sidebar, perutean, pengikat isian, status sinkron, pengingat sesi. */
import { S, load, onChange, changed, save, setSetting } from './store.js';
import { esc, debounce, ymd, hm } from './util.js';
import { I, $, $$, toast, closeMenus } from './ui.js';
import { startSync, syncNow, status as syncStatus } from './sync.js';
import { G, connect } from './google.js';
import { startBridge, writeBridge } from './ofa.js';
import * as meja from './views/meja.js';
import * as ide from './views/ide.js';
import * as draft from './views/draft.js';
import * as pustaka from './views/pustaka.js';
import * as proyek from './views/proyek.js';
import * as kalender from './views/kalender.js';
import * as pengaturan from './views/pengaturan.js';

const VIEWS = { meja, ide, draft, pustaka, proyek, kalender, pengaturan };
const NAV = [
  ['meja', 'Meja', I.meja], ['ide', 'Ide', I.ide], ['draft', 'Draft', I.draft],
  ['pustaka', 'Pustaka', I.pustaka], ['proyek', 'Proyek', I.proyek], ['kalender', 'Kalender', I.kalender]
];

export const route = { name: 'meja', arg: '' };
let current = null;

export function go(hash) {
  if (location.hash === hash) render(); else location.hash = hash;
}
window.clavisGo = go;

function parseHash() {
  const h = decodeURIComponent(location.hash.replace(/^#/, ''));
  const [name, ...rest] = h.split('/');
  route.name = VIEWS[name] ? name : 'meja';
  route.arg = rest.join('/');
}

/* ---------- Sidebar ---------- */

function syncHTML() {
  const s = syncStatus;
  const when = s.at ? hm(new Date(s.at)) : '';
  const map = {
    unconfigured: ['', 'Google belum disiapkan', ''],
    off: ['', 'Belum tersambung ke Google', '<button class="btn sm" data-act="google-connect">Masuk dengan Google</button>'],
    idle: ['spin', 'Menyiapkan sinkron…', ''],
    syncing: ['spin', 'Menyinkron ke Drive…', ''],
    ok: ['ok', `Tersimpan di Drive · ${when}`, ''],
    offline: ['warn', `Offline · ${s.pending || 0} perubahan menunggu`, ''],
    auth: ['warn', 'Sesi Google habis', '<button class="btn sm" data-act="google-connect">Sambungkan lagi</button>'],
    error: ['err', 'Sinkron bermasalah', '<button class="btn sm" data-act="sync-now">Coba lagi</button>']
  };
  const [dot, text, btn] = map[s.state] || map.off;
  return `<div class="sync" aria-live="polite">
    <span class="line"><span class="dot ${dot}"></span><span>${esc(text)}</span></span>
    ${s.state === 'error' && s.message ? `<span class="small muted">${esc(s.message)}</span>` : ''}
    ${s.state === 'ok' && s.pending ? `<span class="small muted">${s.pending} perubahan menunggu</span>` : ''}
    ${btn}</div>`;
}

function sideHTML() {
  const st = S.state;
  const counts = {
    ide: st.ideas.filter((i) => i.status === 'inbox').length,
    proyek: st.projects.filter((p) => !isDone(p)).length
  };
  return `<a class="brand" href="#meja"><span class="row">${I.key('var(--accent)')}<span class="wordmark">Clavis</span></span><span class="kicker">Meja riset · v1.0</span></a>
    <nav class="nav" aria-label="Navigasi utama">${NAV.map(([id, label, icon]) => `<a href="#${id}"${route.name === id ? ' aria-current="page"' : ''}>${icon}<span>${label}</span>${counts[id] ? `<span class="count">${counts[id]}</span>` : ''}</a>`).join('')}</nav>
    <div class="side-foot"><div id="sync-box">${syncHTML()}</div>
      <a class="btn ghost sm" href="#pengaturan" style="justify-content:flex-start;padding-left:2px"${route.name === 'pengaturan' ? ' aria-current="page"' : ''}>${I.gear}<span>Pengaturan</span></a></div>`;
}

export function isDone(p) {
  const t = S.state.types.find((x) => x.id === p.type);
  return !!(t && (t.done || []).includes(p.stage));
}

/* ---------- Render ---------- */

function render() {
  parseHash();
  closeMenus();
  const view = VIEWS[route.name];
  if (current && current !== view && current.unmount) current.unmount();
  const side = $('#side');
  side.innerHTML = sideHTML();
  const main = $('#main');
  main.className = `main${view.flush ? ' flush' : ''}`;
  const keepScroll = current === view ? window.scrollY : 0;
  main.innerHTML = view.render(route.arg);
  current = view;
  if (view.mount) view.mount(main, route.arg);
  window.scrollTo(0, keepScroll);
  document.title = `${view.title ? view.title(route.arg) : 'Clavis'} · Clavis`;
}
const rerender = debounce(() => {
  if (!current) return;
  const ae = document.activeElement;
  // jangan ganggu saat sedang mengetik di isian
  if (ae && $('#main').contains(ae) && (ae.matches('input[type=text], input:not([type]), input[type=search], textarea, [contenteditable]'))) {
    $('#side').innerHTML = sideHTML();
    return;
  }
  if (current.noAutoRender) { current.refresh && current.refresh(); $('#side').innerHTML = sideHTML(); return; }
  render();
}, 60);

/* ---------- Pengikat isian: data-bind="koleksi:id:jalur" ---------- */

function setPath(obj, path, value) {
  const parts = path.split('.');
  let o = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    let k = parts[i];
    if (k.startsWith('#')) { o = (o || []).find((x) => x.id === k.slice(1)); continue; }
    if (o[k] == null || typeof o[k] !== 'object') o[k] = {};
    o = o[k];
  }
  if (!o) return;
  const last = parts[parts.length - 1];
  o[last] = value;
}
function bindTarget(el) {
  const [kind, id, path] = el.dataset.bind.split(':');
  if (kind === 'settings') return { obj: S.state.settings, kind: 'settings', path: id || path };
  const obj = (S.state[kind] || []).find((x) => x.id === id);
  return obj ? { obj, kind, path } : null;
}
function readValue(el) {
  if (el.type === 'checkbox') return el.checked;
  if (el.dataset.num !== undefined) return el.value === '' ? null : Number(el.value);
  if (el.dataset.list !== undefined) return el.value.split(',').map((x) => x.trim()).filter(Boolean);
  return el.value;
}
function onBind(e) {
  const el = e.target.closest('[data-bind]');
  if (!el) return;
  const t = bindTarget(el);
  if (!t) return;
  setPath(t.obj, t.path, readValue(el));
  if (t.kind === 'settings') t.obj.updatedAt = new Date().toISOString();
  if (e.type === 'input' && el.dataset.live === undefined) { changed(t.obj, 'quiet'); return; }
  if (t.obj.touchedAt !== undefined || t.kind === 'ideas') t.obj.touchedAt = new Date().toISOString();
  changed(t.obj, el.dataset.rerender !== undefined ? t.kind : 'quiet');
}

/* ---------- Aksi ---------- */

const GLOBAL = {
  'google-connect': async () => {
    try { await connect(true); toast('Tersambung ke Google. Menyinkron ke Drive…'); syncNow(); }
    catch (e) { toast(e.message); }
  },
  'sync-now': () => syncNow({ interactive: true }),
  'new-project': (el) => proyek.newProjectDialog({ type: el.dataset.type }),
  'go': (el) => go(el.dataset.go)
};

function onClick(e) {
  const a = e.target.closest('[data-act]');
  if (!a) return;
  if (a.tagName === 'A' && !a.getAttribute('href')) e.preventDefault();
  const act = a.dataset.act;
  const fn = (current && current.actions && current.actions[act]) || GLOBAL[act];
  if (fn) { if (a.tagName === 'BUTTON' || a.tagName === 'A') e.preventDefault(); fn(a, e); }
}

/* ---------- Pengingat sesi menulis ---------- */

function tick() {
  const now = new Date();
  const today = ymd(now);
  const t = hm(now);
  S.state.sessions.forEach((s) => {
    if (s.date !== today || !s.start || s.notified === today) return;
    const start = s.start.replace(':', '.');
    if (start <= t && t <= (s.end || start).replace(':', '.')) {
      s.notified = today;
      changed(s, 'quiet');
      const p = S.state.projects.find((x) => x.id === s.projectId);
      const title = `Waktunya menulis${p ? `: ${p.title}` : ''}`;
      toast(title, 'Buka draft', () => go(`#draft/${s.projectId || ''}`), 15000);
      try { if ('Notification' in window && Notification.permission === 'granted') new Notification(title, { body: s.note || 'Sesi menulis dari Clavis', icon: 'icons/icon-192.png' }); } catch (er) { /* abaikan */ }
    }
  });
}

/* ---------- Mulai ---------- */

async function start() {
  document.execCommand && document.execCommand('defaultParagraphSeparator', false, 'p');
  await load();
  parseHash();
  render();
  window.addEventListener('hashchange', render);
  document.addEventListener('click', onClick);
  document.addEventListener('input', onBind);
  document.addEventListener('change', onBind);
  document.addEventListener('keydown', (e) => {
    if (e.key === '/' && !e.target.closest('input, textarea, [contenteditable]')) {
      const s = $('#cari'); if (s) { e.preventDefault(); s.focus(); }
    }
  });
  const bridge = debounce(writeBridge, 800);
  onChange((what) => {
    if (what !== 'draft' && what !== 'draft-remote') bridge();
    if (what === 'quiet' || what === 'draft') { $('#side').innerHTML = sideHTML(); return; }
    rerender();
  });
  window.addEventListener('clavis:sync', () => { const b = $('#sync-box'); if (b) b.innerHTML = syncHTML(); });
  window.addEventListener('clavis:google', () => rerender());
  startBridge((n) => toast(`${n} ide baru masuk dari One for All.`, 'Lihat', () => go('#ide')));
  startSync();
  setInterval(tick, 30000); tick();
  if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
  window.addEventListener('beforeunload', () => { if (current && current.unmount) current.unmount(); });
}

start();
