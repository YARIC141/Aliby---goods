// v27
const APP_CACHE  = 'alliby-app-v16';
const TILE_CACHE = 'alliby-tiles-v2';
const API_CACHE  = 'alliby-api-v1';
const TILE_PATH  = '/functions/v1/vector-tiles/';
const MAX_TILES  = 300;
const MAX_API    = 120;

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(k => k !== TILE_CACHE && k !== APP_CACHE && k !== API_CACHE).map(k => caches.delete(k))
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

async function trimApiCache() {
  const cache = await caches.open(API_CACHE);
  const keys  = await cache.keys();
  if (keys.length > MAX_API)
    await Promise.all(keys.slice(0, keys.length - MAX_API).map(k => cache.delete(k)));
}

self.addEventListener('fetch', e => {
  // ── Vector tiles: cache-first ──────────────────────────────────────────────
  if (e.request.url.includes(TILE_PATH)) {
    e.respondWith(
      caches.match(e.request).then(cached => cached || fetch(e.request).then(resp => {
        if (resp.ok) caches.open(TILE_CACHE).then(c => { c.put(e.request, resp.clone()); trimTiles(); });
        return resp;
      }))
    );
    return;
  }

  // ── Supabase REST GET: network-first, offline fallback to cache ────────────
  // Covers /rest/v1/stores, /rest/v1/menu_items, /rest/v1/store_categories, etc.
  // Mutations (POST/PATCH/DELETE) and auth are not cached.
  if (e.request.method === 'GET' && e.request.url.includes('/rest/v1/')) {
    e.respondWith(
      fetch(e.request.clone()).then(resp => {
        if (resp.ok) {
          caches.open(API_CACHE).then(c => { c.put(e.request, resp.clone()); trimApiCache(); });
        }
        return resp;
      }).catch(() =>
        caches.match(e.request).then(cached => cached || Response.error())
      )
    );
    return;
  }

  // ── App shell (HTML navigate): stale-while-revalidate ─────────────────────
  if (e.request.mode === 'navigate') {
    e.respondWith(
      caches.open(APP_CACHE).then(async cache => {
        const cached = await cache.match(e.request);

        if (cached) {
          // Serve from cache immediately, revalidate in background
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

        // First load — fetch from network and cache
        return fetch(e.request).then(resp => {
          if (resp.ok) cache.put(e.request, resp.clone());
          return resp;
        });
      })
    );
    return;
  }
});
