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

// ── Precache статики (шрифты и библиотеки со своего домена) ───────────────────
// Отдельный кэш, не пересоздаётся при каждом деплое. Если файл в списке изменился —
// увеличьте номер версии в имени STATIC_CACHE. Любые сбои тихо игнорируются:
// приложение просто берёт файл из сети, как раньше.
const STATIC_CACHE = 'aliby-admin-static-v1';
const STATIC_FILES = [
  'fonts/fonts.css',
  'fonts/01-latin.woff2',
  'fonts/02-latin.woff2',
  'fonts/03-cyrillic.woff2',
  'fonts/04-latin.woff2',
  'fonts/05-cyrillic.woff2',
  'fonts/06-latin.woff2',
  'vendor/jsQR.js',
  'vendor/maplibre-gl.css',
  'vendor/maplibre-gl.js',
  'vendor/qrcode.min.js'
].map(p => new URL(p, self.registration.scope).href);
const STATIC_SET = new Set(STATIC_FILES);

function stRace(p, ms) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('sw-static-timeout')), ms);
    p.then(v => { clearTimeout(t); resolve(v); }, e => { clearTimeout(t); reject(e); });
  });
}

async function precacheStatic() {
  const cache = await stRace(caches.open(STATIC_CACHE), 3000);
  await Promise.allSettled(STATIC_FILES.map(async u => {
    if (await stRace(cache.match(u), 3000)) return;
    const r = await stRace(fetch(u), 15000);
    if (r.ok) await cache.put(u, r);
  }));
}

self.addEventListener('install', e => {
  e.waitUntil(stRace(precacheStatic(), 12000).catch(() => {}));
});

// cache-first для файлов из списка; при любой проблеме с кэшем — обычная сеть
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET' || !STATIC_SET.has(req.url)) return;
  const fallback = req.clone();
  e.respondWith((async () => {
    try {
      const cache = await stRace(caches.open(STATIC_CACHE), 2000);
      const hit = await stRace(cache.match(req.url), 2000);
      if (hit) return hit;
      const r = await stRace(fetch(req), 15000);
      if (r.ok) cache.put(req.url, r.clone());
      return r;
    } catch (err) {
      return fetch(fallback);
    }
  })());
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(k => k !== TILE_CACHE && k !== APP_CACHE && k !== STATIC_CACHE).map(k => caches.delete(k))
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
