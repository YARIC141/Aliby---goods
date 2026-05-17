// v12
const CACHE = 'alliby-tiles-v2';
const TILE_PATH = '/functions/v1/vector-tiles/';

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  if (e.request.url.includes(TILE_PATH)) {
    e.respondWith(
      caches.match(e.request).then(cached => cached || fetch(e.request).then(resp => {
        if (resp.ok) caches.open(CACHE).then(c => c.put(e.request, resp.clone()));
        return resp;
      }))
    );
    return;
  }
  if (e.request.mode === 'navigate') {
    e.respondWith(
      fetch(e.request, { cache: 'reload' }).catch(() => caches.match(e.request))
    );
  }
});
