// v1 — статичный app-shell, все данные в localStorage, сети не требуется в принципе
const CACHE = 'tamagotchi-v4';
const SHELL = ['./', './index.html', './manifest.json', './icons/icon-192.png', './icons/icon-512.png',
  './assets/feed.png', './assets/hungry.png', './assets/walk.png', './assets/exercise.png',
  './assets/play.png', './assets/tired.png', './assets/rest.png', './assets/default.png'];

self.addEventListener('install', e => {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Cache-first: страница не делает сетевых запросов вообще, поэтому нет смысла
// в revalidate-логике клиентского sw.js — только обновление самого шелла при новом деплое.
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    caches.match(e.request).then(cached => cached || fetch(e.request).then(resp => {
      if (resp.ok) caches.open(CACHE).then(c => c.put(e.request, resp.clone()));
      return resp;
    }).catch(() => cached))
  );
});
