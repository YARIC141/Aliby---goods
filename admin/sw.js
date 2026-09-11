// v10
const APP_CACHE  = 'aliby-admin-app-v4';
const TILE_CACHE = 'aliby-admin-tiles-v2';
const TILE_PATH  = '/functions/v1/vector-tiles/';
const MAX_TILES  = 300;

// Plain fetch() never rejects on its own when a connection is blackholed
// (packets silently dropped instead of cleanly refused) — without this,
// a network fetch inside the SW can hang forever and freeze the whole
// page navigation before index.html's own JS ever gets a chance to run.
const NET_TIMEOUT_MS = 10000;
function fetchTimeout(request, ms = NET_TIMEOUT_MS) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  return fetch(request, { signal: ctrl.signal }).finally(() => clearTimeout(t));
}

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

// Revalidates the cached app shell against the network and notifies clients via
// APP_UPDATED when it changed. Normally runs as a side effect of a real navigation
// (see the 'navigate' fetch handler below) — but mobile OSes routinely resume a
// suspended tab/PWA instead of re-navigating it, so a device can sit on a stale
// cached shell indefinitely across many "close and reopen" cycles. The 'message'
// listener lets the page trigger this check explicitly on every foreground resume.
async function checkAppShellUpdate(url) {
  const cache = await caches.open(APP_CACHE);
  const req = new Request(url);
  const cached = await cache.match(req);
  if (!cached) return;
  const resp = await fetchTimeout(new Request(url, { cache: 'no-cache' }));
  if (!resp.ok) return;
  const getTag = r => r.headers.get('etag') || r.headers.get('last-modified') || r.headers.get('content-length');
  const newTag = getTag(resp);
  const oldTag = getTag(cached);
  await cache.put(req, resp.clone());
  if (!newTag || !oldTag || newTag !== oldTag) {
    const clients = await self.clients.matchAll({ includeUncontrolled: true });
    clients.forEach(c => c.postMessage({ type: 'APP_UPDATED' }));
  }
}

self.addEventListener('message', e => {
  if (e.data?.type !== 'CHECK_APP_UPDATE') return;
  const p = checkAppShellUpdate(self.registration.scope).catch(() => {});
  if (e.waitUntil) e.waitUntil(p);
});

self.addEventListener('fetch', e => {
  if (e.request.url.includes(TILE_PATH)) {
    e.respondWith(
      caches.match(e.request).then(cached => cached || fetchTimeout(e.request).then(resp => {
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
          checkAppShellUpdate(e.request.url).catch(() => {});
          return cached;
        }

        return fetchTimeout(e.request).then(resp => {
          if (resp.ok) cache.put(e.request, resp.clone());
          return resp;
        });
      })
    );
    return;
  }
});
