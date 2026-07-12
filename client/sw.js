// v32
const APP_CACHE  = 'alliby-app-v17';
const API_CACHE  = 'alliby-api-v1';
const IMG_CACHE  = 'alliby-img-v1';
const MAX_IMG    = 200;
const MAX_API    = 120;

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(k => k !== APP_CACHE && k !== API_CACHE && k !== IMG_CACHE).map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

async function trimApiCache() {
  const cache = await caches.open(API_CACHE);
  const keys  = await cache.keys();
  if (keys.length > MAX_API)
    await Promise.all(keys.slice(0, keys.length - MAX_API).map(k => cache.delete(k)));
}

self.addEventListener('fetch', e => {
  // ── Images: cache-first, max 200 ─────────────────────────────────────────
  if (e.request.destination === 'image') {
    e.respondWith(
      caches.open(IMG_CACHE).then(cache =>
        cache.match(e.request).then(cached => cached || fetch(e.request).then(resp => {
          if (resp.ok) {
            cache.put(e.request, resp.clone());
            cache.keys().then(keys => {
              if (keys.length > MAX_IMG)
                Promise.all(keys.slice(0, keys.length - MAX_IMG).map(k => cache.delete(k)));
            });
          }
          return resp;
        }))
      )
    );
    return;
  }

  // ── Supabase REST GET: stale-while-revalidate with 30s TTL ──────────────
  // Covers /rest/v1/stores, /rest/v1/menu_items, /rest/v1/store_categories, etc.
  // Mutations (POST/PATCH/DELETE) and auth are not cached.
  // promo_notifications excluded: client PATCHes read_at, stale GET would re-show cleared items.
  // Background revalidation fires only when cached response is older than SW_API_TTL.
  const SW_API_TTL = 30000;
  if (e.request.method === 'GET' && e.request.url.includes('/rest/v1/') && !e.request.url.includes('promo_notifications')) {
    e.respondWith(
      caches.open(API_CACHE).then(cache =>
        cache.match(e.request).then(cached => {
          const age = cached ? Date.now() - new Date(cached.headers.get('date') || 0).getTime() : Infinity;
          const networkFetch = fetch(e.request.clone()).then(resp => {
            if (resp.ok) { cache.put(e.request, resp.clone()); trimApiCache(); }
            return resp;
          }).catch(() => null);
          if (cached && age < SW_API_TTL) return cached; // свежий — не ревалидировать
          return cached || networkFetch;
        })
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
        }).catch(async () => {
          // Network failed and no cache — return any cached shell as fallback
          const fallback = await caches.match('/') || await caches.match('/index.html');
          return fallback || new Response('<html><body style="font:16px sans-serif;padding:32px">Нет соединения. Обновите страницу.</body></html>', {
            status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8' },
          });
        });
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
