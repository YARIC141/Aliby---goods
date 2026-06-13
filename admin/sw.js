// v10
const APP_CACHE  = 'aliby-admin-app-v4';
const TILE_CACHE = 'aliby-admin-tiles-v2';
const TILE_PATH  = '/functions/v1/vector-tiles/';
const MAX_TILES  = 300;

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(k => k !== TILE_CACHE && k !== APP_CACHE).map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

async function trimTiles() {
  const cache = await caches.open(TILE_CACHE);
  const keys  = await cache.keys();
  if (keys.length > MAX_TILES)
    await Promise.all(keys.slice(0, keys.length - MAX_TILES).map(k => cache.delete(k)));
}

self.addEventListener('fetch', e => {
  if (e.request.url.includes(TILE_PATH)) {
    e.respondWith(
      caches.match(e.request).then(cached => cached || fetch(e.request).then(resp => {
        if (resp.ok) caches.open(TILE_CACHE).then(c => { c.put(e.request, resp.clone()); trimTiles(); });
        return resp;
      }))
    );
    return;
  }

  if (e.request.mode === 'navigate') {
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
    return;
  }
});
