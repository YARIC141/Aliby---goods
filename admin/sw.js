// v11
const APP_CACHE  = 'aliby-admin-app-v5';
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

// Safari/WebKit bug: after a tab is backgrounded and resumed, the CacheStorage
// IPC channel can come back broken — caches.open()/cache.match() then hang
// forever (never resolve, never reject), which freezes navigation entirely.
// Race every cache call against a timeout and fall back to network on trip.
const CACHE_TIMEOUT_MS = 2000;
function withTimeout(promise, ms = CACHE_TIMEOUT_MS) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('sw-cache-timeout')), ms);
    promise.then(v => { clearTimeout(t); resolve(v); }, e => { clearTimeout(t); reject(e); });
  });
}

// Navigate-запросы: fetch(request, {signal}) на Request с mode:'navigate' в WebKit может падать,
// поэтому для навигации ограничиваем время гонкой с таймером, без AbortController.
function fetchRace(request, ms = NET_TIMEOUT_MS) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('sw-net-timeout')), ms);
    fetch(request).then(v => { clearTimeout(t); resolve(v); }, e => { clearTimeout(t); reject(e); });
  });
}

// Страница-самолечение: если SW не смог отдать ни сеть, ни кэш, она снимает SW и чистит кэши
// (каждый вызов с таймаутом — CacheStorage в Safari может зависать) и один раз перезагружается.
const HEAL_HTML = '<html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="font:16px sans-serif;padding:32px">Нет соединения. Пробуем восстановить…<br><br><a href="/" onclick="location.reload();return false">Обновить страницу</a>' +
  '<script>(function(){try{if(sessionStorage.getItem("sw_heal"))return;sessionStorage.setItem("sw_heal","1");}catch(e){return;}' +
  'function lim(p,ms){return Promise.race([p,new Promise(function(r){setTimeout(r,ms)})]);}' +
  'var a=navigator.serviceWorker?navigator.serviceWorker.getRegistrations().then(function(r){return Promise.all(r.map(function(x){return x.unregister();}));}):Promise.resolve();' +
  'var b=window.caches?caches.keys().then(function(k){return Promise.all(k.map(function(n){return caches.delete(n);}));}):Promise.resolve();' +
  'lim(Promise.all([a.catch(function(){}),b.catch(function(){})]),2500).then(function(){location.reload();});})();</script></body></html>';


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

// Новый APP_CACHE после каждого деплоя пуст: первый запуск на плохой сети не успевает скачать
// оболочку. Переносим её из самого свежего старого кэша — открывается сразу, фон обновит.
async function seedAppCache(keys) {
  try {
    const olds = keys.filter(k => k.startsWith('aliby-admin-app-v') && k !== APP_CACHE)
      .sort((x, y) => (parseInt(y.slice(17), 10) || 0) - (parseInt(x.slice(17), 10) || 0));
    if (!olds.length) return;
    const nc = await withTimeout(caches.open(APP_CACHE));
    const oc = await withTimeout(caches.open(olds[0]));
    for (const r of await withTimeout(oc.keys())) {
      if (await withTimeout(nc.match(r))) continue;
      const resp = await withTimeout(oc.match(r));
      if (resp) await withTimeout(nc.put(r, resp));
    }
  } catch {}
}

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(async keys => {
        await seedAppCache(keys);
        await Promise.all(keys.filter(k => k !== TILE_CACHE && k !== APP_CACHE && k !== STATIC_CACHE).map(k => caches.delete(k)));
      })
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
  const cache = await withTimeout(caches.open(APP_CACHE));
  const req = new Request(url);
  const cached = await withTimeout(cache.match(req));
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
      withTimeout(caches.open(APP_CACHE).then(async cache => ({ cache, cached: await cache.match(e.request, { ignoreSearch: true }) })))
        .then(({ cache, cached }) => {
          if (cached) {
            checkAppShellUpdate(e.request.url).catch(() => {});
            return cached;
          }
          return fetchRace(e.request).then(resp => {
            if (resp.ok) cache.put(e.request, resp.clone());
            return resp;
          });
        })
        // CacheStorage завис (Safari) или сеть упала: идём в сеть мимо кэша, а при неудаче
        // отдаём оболочку из кэша либо страницу-самолечение вместо "Safari не удалось открыть страницу".
        .catch(async () => {
          try {
            return await fetchRace(e.request);
          } catch {
            const fallback = await withTimeout(caches.match(self.registration.scope), 1000).catch(() => null)
              || await withTimeout(caches.match('/'), 1000).catch(() => null);
            return fallback || new Response(HEAL_HTML, {
              status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8' },
            });
          }
        })
    );
    return;
  }
});
