/* Clavis — potongan tampilan bersama: ikon, badge, toast, modal, dialog, menu. */
import { esc } from './util.js';
import { S, typeOf } from './store.js';

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

const svg = (d, extra = '') => `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" ${extra}>${d}</svg>`;
export const I = {
  key: (c = 'currentColor', s = 26) => `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="${c}" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><circle cx="8" cy="12" r="4"></circle><path d="M12 12h9M18 12v3M15 12v2"></path></svg>`,
  meja: svg('<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>'),
  ide: svg('<path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-4 10.5c.7.7 1 1.5 1 2.5h6c0-1 .3-1.8 1-2.5A6 6 0 0 0 12 3z"/>'),
  draft: svg('<path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>'),
  pustaka: svg('<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20M4 19.5V4.5A1.5 1.5 0 0 1 5.5 3H20v14H6.5A2.5 2.5 0 0 0 4 19.5z"/>'),
  proyek: svg('<rect x="3" y="3" width="5" height="18" rx="1"/><rect x="10" y="3" width="5" height="12" rx="1"/><rect x="17" y="3" width="5" height="8" rx="1"/>'),
  kalender: svg('<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>'),
  gear: svg('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1A1.7 1.7 0 0 0 4.6 9a1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>'),
  search: svg('<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>', 'width="16" height="16"'),
  plus: svg('<path d="M12 5v14M5 12h14"/>', 'width="16" height="16"'),
  x: svg('<path d="M18 6 6 18M6 6l12 12"/>', 'width="16" height="16"'),
  drive: svg('<path d="M8 3h8l6 11-4 7H6l-4-7z"/><path d="M8 3l6 11H2M16 3l-6 11 4 7"/>', 'width="14" height="14"'),
  check: '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12l5 5 9-10"/></svg>',
  trash: svg('<path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14"/>', 'width="16" height="16"'),
  chevL: svg('<path d="M15 18l-6-6 6-6"/>'), chevR: svg('<path d="M9 18l6-6-6-6"/>')
};

export function typeBadge(pOrType, extra = '') {
  const t = pOrType && pOrType.stages ? pOrType : typeOf(pOrType);
  return `<span class="badge" style="background:${t.tint};color:${t.color}">${esc(t.name)}${extra ? ` · ${esc(extra)}` : ''}</span>`;
}

/* ---------- Toast ---------- */
export function toast(msg, actionLabel, action, ms = 4500) {
  let box = $('.toasts');
  if (!box) { box = document.createElement('div'); box.className = 'toasts'; box.setAttribute('role', 'status'); document.body.appendChild(box); }
  const el = document.createElement('div');
  el.className = 'toast';
  el.innerHTML = `<span>${esc(msg)}</span>${actionLabel ? `<button type="button">${esc(actionLabel)}</button>` : ''}`;
  if (actionLabel) el.querySelector('button').onclick = () => { el.remove(); action && action(); };
  box.appendChild(el);
  setTimeout(() => el.remove(), ms);
}

/* ---------- Modal ---------- */
let modalStack = [];
export function modal({ title, body, actions = [], wide = false, onOpen, onClose }) {
  const back = document.createElement('div');
  back.className = 'modal-back';
  back.innerHTML = `<div class="modal${wide ? ' wide' : ''}" role="dialog" aria-modal="true" aria-label="${esc(title)}">
    <div class="mh"><h2 class="h2">${esc(title)}</h2><button type="button" class="iconbtn" data-close aria-label="Tutup">${I.x}</button></div>
    <form class="mb" novalidate>${body}</form>
    ${actions.length ? `<div class="mf">${actions.map((a, i) => `<button type="button" class="btn ${a.cls || ''}" data-i="${i}">${esc(a.label)}</button>`).join('')}</div>` : ''}
  </div>`;
  const close = (v) => { back.remove(); modalStack = modalStack.filter((m) => m !== back); onClose && onClose(v); };
  back.addEventListener('mousedown', (e) => { if (e.target === back) close(); });
  back.querySelector('[data-close]').onclick = () => close();
  back.addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.stopPropagation(); close(); } });
  const form = back.querySelector('form');
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const prim = actions.findIndex((a) => a.primary);
    if (prim >= 0) back.querySelector(`[data-i="${prim}"]`).click();
  });
  back.querySelectorAll('.mf [data-i]').forEach((b) => {
    b.onclick = async () => {
      const a = actions[Number(b.dataset.i)];
      if (!a.act) { close(); return; }
      const r = await a.act(form, back);
      if (r !== false) close(r);
    };
  });
  document.body.appendChild(back);
  modalStack.push(back);
  const first = back.querySelector('input:not([type=hidden]):not([type=checkbox]), textarea, select');
  if (first) setTimeout(() => first.focus(), 30);
  onOpen && onOpen(form, back, close);
  return { el: back, form, close };
}

export function confirmDlg(message, yes = 'Ya', danger = false) {
  return new Promise((resolve) => {
    modal({ title: 'Yakin?', body: `<p style="margin:0;line-height:1.55">${esc(message)}</p>`,
      actions: [{ label: 'Batal', act: () => resolve(false) }, { label: yes, cls: danger ? 'accent' : 'dark', primary: true, act: () => resolve(true) }],
      onClose: (v) => { if (v === undefined) resolve(false); } });
  });
}

export function promptDlg(title, label, value = '', { multiline = false, placeholder = '', type = 'text', hint = '' } = {}) {
  return new Promise((resolve) => {
    let done = false;
    modal({
      title,
      body: `<label class="field"><span class="s13 muted">${esc(label)}</span>${multiline
        ? `<textarea class="textarea" name="v" rows="5" placeholder="${esc(placeholder)}">${esc(value)}</textarea>`
        : `<input class="input" name="v" type="${type}" value="${esc(value)}" placeholder="${esc(placeholder)}">`}</label>${hint ? `<p class="small muted" style="margin:0">${hint}</p>` : ''}`,
      actions: [{ label: 'Batal' }, { label: 'Simpan', cls: 'dark', primary: true, act: (f) => { done = true; resolve(f.v.value); } }],
      onClose: () => { if (!done) resolve(null); }
    });
  });
}

/* ---------- Menu kecil ---------- */
export function menu(anchor, items) {
  closeMenus();
  const m = document.createElement('div');
  m.className = 'menu';
  m.setAttribute('role', 'menu');
  m.innerHTML = items.map((it, i) => (it === '-' ? '<hr style="border:0;border-top:1px solid var(--line2);margin:4px 0">'
    : `<button type="button" role="menuitem" data-i="${i}">${esc(it.label)}${it.hint ? `<small>${esc(it.hint)}</small>` : ''}</button>`)).join('');
  document.body.appendChild(m);
  const r = anchor.getBoundingClientRect();
  const w = m.offsetWidth, h = m.offsetHeight;
  m.style.left = `${Math.max(8, Math.min(r.right - w, window.innerWidth - w - 8))}px`;
  m.style.top = `${r.bottom + 6 + h > window.innerHeight ? Math.max(8, r.top - h - 6) : r.bottom + 6}px`;
  m.querySelectorAll('[data-i]').forEach((b) => { b.onclick = () => { closeMenus(); items[Number(b.dataset.i)].act(); }; });
  setTimeout(() => document.addEventListener('mousedown', outside), 0);
  function outside(e) { if (!m.contains(e.target)) closeMenus(); }
  m._off = () => document.removeEventListener('mousedown', outside);
  return m;
}
export function closeMenus() { $$('.menu').forEach((m) => { m._off && m._off(); m.remove(); }); }

export function greeting(d = new Date()) {
  const h = d.getHours();
  return h < 11 ? 'Selamat pagi' : h < 15 ? 'Selamat siang' : h < 19 ? 'Selamat sore' : 'Selamat malam';
}

export const userName = () => S.state.settings.name || 'Nira';

export function opts(list, cur) {
  return list.map((o) => {
    const [v, l] = Array.isArray(o) ? o : [o.id ?? o, o.label ?? o.name ?? o];
    return `<option value="${esc(v)}"${String(v) === String(cur) ? ' selected' : ''}>${esc(l)}</option>`;
  }).join('');
}
