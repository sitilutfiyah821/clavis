/* Clavis — service worker: app tetap bisa dibuka tanpa internet.
   Naikkan VERSI setiap kali file app berubah supaya perangkat mengambil versi terbaru. */
const VERSI = 'clavis-v2';
const SHELL = [
  './', 'index.html', 'manifest.webmanifest', 'css/app.css?v=1', 'js/app.js',
  'js/util.js', 'js/cite.js', 'js/store.js', 'js/config.js', 'js/google.js', 'js/sync.js', 'js/doc.js', 'js/export.js', 'js/ofa.js', 'js/dilan.js', 'js/ui.js',
  'js/views/meja.js', 'js/views/ide.js', 'js/views/draft.js', 'js/views/pustaka.js', 'js/views/proyek.js', 'js/views/kalender.js', 'js/views/pengaturan.js',
  'icons/icon-192.png', 'icons/icon-512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(VERSI).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((k) => k.startsWith('clavis-') && k !== VERSI).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return; // Google, font, Crossref: langsung ke jaringan
  if (!url.pathname.includes('/clavis/') && url.hostname !== 'localhost' && url.hostname !== '127.0.0.1') return;
  // jaringan dulu (supaya pembaruan cepat terasa), cache bila offline
  event.respondWith(
    fetch(req).then((res) => {
      if (res.ok) { const copy = res.clone(); caches.open(VERSI).then((c) => c.put(req, copy)); }
      return res;
    }).catch(() => caches.match(req).then((r) => r || (req.mode === 'navigate' ? caches.match('index.html') : undefined)))
  );
});
