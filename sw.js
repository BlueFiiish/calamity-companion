// Calamity Companion service worker — offline app shell + cross-origin sprite cache.
const VERSION = 'cc-v2';
const SHELL = VERSION + '-shell';
const IMGS = VERSION + '-img';
const PRECACHE = [
  './',
  './index.html',
  './css/style.css',
  './js/app.js',
  './data/items.json',
  './data/classes.json',
  './data/bosses.json',
  './data/meta.json',
  './manifest.webmanifest',
  './icons/icon.svg',
  './icons/icon-192.png',
  './icons/icon-512.png',
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(SHELL).then(c => c.addAll(PRECACHE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(
      keys.filter(k => !k.startsWith(VERSION)).map(k => caches.delete(k))
    )).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // Item sprites live cross-origin on the game wikis (Special:FilePath).
  // Cache-first so the app works offline after items have been browsed once.
  if (url.hostname.endsWith('calamitymod.wiki.gg') || url.hostname.endsWith('terraria.wiki.gg')) {
    e.respondWith(
      caches.match(req).then(hit => hit || fetch(req).then(res => {
        const copy = res.clone();
        caches.open(IMGS).then(c => c.put(req, copy));
        return res;
      }).catch(() => hit))
    );
    return;
  }

  if (url.origin !== location.origin) return;

  // data JSON: network-first so refreshed data lands, fall back to cache offline
  if (url.pathname.endsWith('.json')) {
    e.respondWith(
      fetch(req).then(res => {
        const copy = res.clone();
        caches.open(SHELL).then(c => c.put(req, copy));
        return res;
      }).catch(() => caches.match(req))
    );
    return;
  }

  // shell: cache-first
  e.respondWith(caches.match(req).then(hit => hit || fetch(req)));
});
