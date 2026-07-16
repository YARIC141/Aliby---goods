// v1
const APP_CACHE = 'alliby-carry-app-v1';

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== APP_CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  if (e.request.mode !== 'navigate') return;

  e.respondWith(
    caches.open(APP_CACHE).then(async cache => {
      const cached = await cache.match(e.request);

      if (cached) {
        fetch(new Request(e.request.url, { cache: 'no-cache' })).then(async resp => {
          if (!resp.ok) return;
          const getTag = r => r.headers.get('etag') || r.headers.get('last-modified') || r.headers.get('content-length');
          const newTag = getTag(resp);
          const oldTag = getTag(cached);
          await cache.put(e.request, resp.clone());
          if (!newTag || !oldTag || newTag !== oldTag) {
            const clients = await self.clients.matchAll({ includeUncontrolled: true });
            clients.forEach(c => c.postMessage({ type: 'APP_UPDATED' }));
          }
        }).catch(() => {});
        return cached;
      }

      return fetch(e.request).then(resp => {
        if (resp.ok) cache.put(e.request, resp.clone());
        return resp;
      });
    })
  );
});
