// v35
const APP_CACHE  = 'alliby-app-v17';
const API_CACHE  = 'alliby-api-v1';
const IMG_CACHE  = 'alliby-img-v1';
const MAX_IMG    = 200;
const MAX_API    = 120;

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
const STATIC_CACHE = 'alliby-static-v1';
const STATIC_FILES = [
  'fonts/fonts.css',
  'fonts/01-cyrillic.woff2',
  'fonts/02-latin.woff2',
  'fonts/03-cyrillic.woff2',
  'fonts/04-latin.woff2',
  'fonts/05-cyrillic.woff2',
  'fonts/06-latin.woff2',
  'fonts/07-cyrillic.woff2',
  'fonts/08-latin.woff2',
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

// The deploy pipeline renames APP_CACHE (alliby-app-v<timestamp>) on every push, so every
// activation here starts from a brand-new, empty cache. That silently broke update detection:
// checkAppShellUpdate() below only notifies clients when it finds a *stale* cached entry to
// diff against, but right after an activate the cache has no entry at all yet, so it no-ops —
// and a suspended/resumed PWA (no real 'navigate' fetch to populate the cache) could then sit
// on old JS/HTML indefinitely, with the update banner never appearing. Presence of an
// old-versioned cache at activate time is itself proof this is a real update (not a first
// install), so notify directly here instead of relying on the empty-cache diff.
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(async keys => {
        const isUpdate = keys.some(k => k.startsWith('alliby-app-v') && k !== APP_CACHE);
        // Новый APP_CACHE пуст, а первый запуск после деплоя на плохой сети не успевает скачать
        // оболочку и падает на HEAL_HTML. Поэтому переносим оболочку из самого свежего старого
        // кэша: приложение откроется сразу (stale-while-revalidate), а свежую версию подтянет фон.
        try {
          const olds = keys.filter(k => k.startsWith('alliby-app-v') && k !== APP_CACHE)
            .sort((x, y) => (parseInt(y.slice(12), 10) || 0) - (parseInt(x.slice(12), 10) || 0));
          if (olds.length) {
            const nc = await withTimeout(caches.open(APP_CACHE));
            const oc = await withTimeout(caches.open(olds[0]));
            const reqs = await withTimeout(oc.keys());
            for (const r of reqs) {
              if (await withTimeout(nc.match(r))) continue;
              const resp = await withTimeout(oc.match(r));
              if (resp) await withTimeout(nc.put(r, resp));
            }
          }
        } catch {}
        await Promise.all(
          keys.filter(k => k !== APP_CACHE && k !== API_CACHE && k !== IMG_CACHE && k !== STATIC_CACHE).map(k => caches.delete(k))
        );
        await self.clients.claim();
        if (isUpdate) {
          // includeUncontrolled:false on purpose — an *uncontrolled* client here is
          // (almost always) a page that just started navigating under this very SW
          // version, i.e. it's already getting the fresh HTML from the network and
          // doesn't need the banner. Without this guard, reloading from the banner's
          // "Обновить" races this same activate() (still finishing its cache cleanup),
          // the reloading page gets swept into the broadcast as "uncontrolled", and it
          // shows the exact same "new version" banner again right after the reload.
          const clients = await self.clients.matchAll();
          clients.forEach(c => c.postMessage({ type: 'APP_UPDATED' }));
        }
      })
  );
});

async function trimApiCache() {
  const cache = await caches.open(API_CACHE);
  const keys  = await cache.keys();
  if (keys.length > MAX_API)
    await Promise.all(keys.slice(0, keys.length - MAX_API).map(k => cache.delete(k)));
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
  // version.json — проверка версии приложения, всегда напрямую в сеть
  if (new URL(e.request.url).pathname.endsWith('/version.json')) return;

  // ── Images: cache-first, max 200 ─────────────────────────────────────────
  if (e.request.destination === 'image') {
    e.respondWith(
      withTimeout(caches.open(IMG_CACHE).then(cache => cache.match(e.request).then(cached => ({ cache, cached }))))
        .then(({ cache, cached }) => cached || fetchTimeout(e.request).then(resp => {
          if (resp.ok) {
            cache.put(e.request, resp.clone());
            cache.keys().then(keys => {
              if (keys.length > MAX_IMG)
                Promise.all(keys.slice(0, keys.length - MAX_IMG).map(k => cache.delete(k)));
            });
          }
          return resp;
        }))
        .catch(() => fetchTimeout(e.request))
    );
    return;
  }

  // ── Supabase REST GET: cache-first within 30s TTL, network-first once stale ──
  // Covers /rest/v1/stores, /rest/v1/menu_items, /rest/v1/store_categories, etc.
  // Mutations (POST/PATCH/DELETE) and auth are not cached.
  // promo_notifications excluded: client PATCHes read_at, stale GET would re-show cleared items.
  // Past SW_API_TTL this request itself waits for the network (falling back to the stale
  // cache only if the fetch fails) — otherwise changed fields (e.g. accepts_online_payment)
  // only ever reach the cache for some *future* request and the page never sees them.
  const SW_API_TTL = 30000;
  if (e.request.method === 'GET' && e.request.url.includes('/rest/v1/') && !e.request.url.includes('promo_notifications')) {
    e.respondWith(
      withTimeout(caches.open(API_CACHE))
        .then(async cache => {
          const cached = await withTimeout(cache.match(e.request));
          const age = cached ? Date.now() - new Date(cached.headers.get('date') || 0).getTime() : Infinity;
          if (cached && age < SW_API_TTL) return cached; // свежий — отдаём сразу, без сети
          try {
            const resp = await fetchTimeout(e.request.clone());
            if (resp.ok) { cache.put(e.request, resp.clone()); trimApiCache(); }
            return resp;
          } catch (err) {
            return cached || Response.error();
          }
        })
        .catch(() => fetchTimeout(e.request)) // cache API hung — bypass entirely, but still bounded
    );
    return;
  }

  // ── App shell (HTML navigate): stale-while-revalidate ─────────────────────
  if (e.request.mode === 'navigate') {
    e.respondWith(
      withTimeout(caches.open(APP_CACHE).then(async cache => ({ cache, cached: await cache.match(e.request, { ignoreSearch: true }) })))
        .then(({ cache, cached }) => {
          if (cached) {
            // Serve from cache immediately, revalidate in background
            checkAppShellUpdate(e.request.url).catch(() => {});
            return cached;
          }

          // First load — fetch from network and cache
          return fetchRace(e.request).then(resp => {
            if (resp.ok) cache.put(e.request, resp.clone());
            return resp;
          });
        })
        // Cache API hung (Safari: CacheStorage IPC breaks after tab resumes from
        // background) or network failed — bypass cache and go straight to network,
        // falling back to a cached shell (best-effort) only if that also fails.
        .catch(async () => {
          try {
            return await fetchRace(e.request);
          } catch {
            const fallback = await withTimeout(caches.match('/'), 1000).catch(() => null)
              || await withTimeout(caches.match('/index.html'), 1000).catch(() => null);
            return fallback || new Response(HEAL_HTML, {
              status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8' },
            });
          }
        })
    );
    return;
  }
});

// ── IndexedDB helpers for persisting promo notifications ─────────────────────
function _idbOpen() {
  return new Promise((res, rej) => {
    const req = indexedDB.open('alliby-sw', 1);
    req.onupgradeneeded = ev => ev.target.result.createObjectStore('promos', { autoIncrement: true });
    req.onsuccess = ev => res(ev.target.result);
    req.onerror   = ev => rej(ev.target.error);
  });
}
function _idbSave(item) {
  return _idbOpen().then(db => new Promise((res, rej) => {
    const tx = db.transaction('promos', 'readwrite');
    tx.objectStore('promos').add(item);
    tx.oncomplete = res; tx.onerror = ev => rej(ev.target.error);
  }));
}
function _idbFlush() {
  return _idbOpen().then(db => new Promise((res, rej) => {
    const tx = db.transaction('promos', 'readwrite');
    const store = tx.objectStore('promos');
    const items = [];
    store.openCursor().onsuccess = ev => {
      const cur = ev.target.result;
      if (cur) { items.push({ key: cur.key, ...cur.value }); cur.continue(); }
      else {
        items.forEach(i => store.delete(i.key));
        tx.oncomplete = () => res(items);
      }
    };
    tx.onerror = ev => rej(ev.target.error);
  }));
}

// ── Web Push: show notification and save to bell immediately ──────────────────
self.addEventListener('push', e => {
  let payload;
  if (e.data) {
    try { payload = e.data.json(); } catch { payload = { title: 'Alliby', body: e.data.text() }; }
  } else {
    payload = { title: 'Alliby', body: 'Новое уведомление' };
  }
  const { title = 'Alliby', body = '', data = {} } = payload;
  const isPromo = !data.type || data.type === 'promo';

  e.waitUntil(Promise.all([
    self.registration.showNotification(title, {
      body, icon: '/icons/client-192.png', badge: '/icons/client-192.png',
      data, tag: data.store_id ? 'promo-' + data.store_id : 'promo',
    }),
    // Save promo to bell immediately — post to open clients or persist in IDB
    isPromo && (async () => {
      const notif = { title, body, store_id: data.store_id || null };
      const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      if (clients.length) {
        clients.forEach(c => c.postMessage({ type: 'SW_PROMO_RECEIVED', ...notif }));
      } else {
        await _idbSave(notif);
      }
    })(),
  ]));
});

// ── Web Push: user tapped notification ───────────────────────────────────────
self.addEventListener('notificationclick', e => {
  e.notification.close();
  const nd = e.notification.data || {};
  const isPromo = !nd.type || nd.type === 'promo';
  const storeId = nd.store_id || null;
  // Pass raw notification data so client decides routing (promo vs order)
  const msg = { type: 'SW_NOTIF_TAP', notif_type: nd.type || 'promo', title: e.notification.title, body: e.notification.body, store_id: storeId };
  const url = isPromo && storeId ? '/?promo_store=' + storeId : '/';
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clients => {
      const client = clients.find(c => 'focus' in c);
      if (client) { client.postMessage(msg); return client.focus(); }
      return self.clients.openWindow(url);
    })
  );
});
