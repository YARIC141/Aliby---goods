// v1
const APP_CACHE = 'alliby-carry-app-v1';

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
      .then(keys => Promise.all(keys.filter(k => k !== APP_CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  if (e.request.mode !== 'navigate') return;

  e.respondWith((async () => {
    const cache = await caches.open(APP_CACHE);
    const cached = await cache.match(e.request);

    // waitUntil держит воркер живым до конца ревалидации — без него фоновый
    // fetch обрывается, если приложение закрывают сразу после открытия
    // (обычный сценарий), и кэш никогда не обновляется до свежей версии.
    const refresh = (async () => {
      const resp = await fetchTimeout(new Request(e.request.url, { cache: 'no-cache' })).catch(() => null);
      if (!resp || !resp.ok) return;
      const getTag = r => r.headers.get('etag') || r.headers.get('last-modified') || r.headers.get('content-length');
      const newTag = getTag(resp);
      const oldTag = cached ? getTag(cached) : null;
      await cache.put(e.request, resp.clone());
      if (cached && (!newTag || !oldTag || newTag !== oldTag)) {
        const clients = await self.clients.matchAll({ includeUncontrolled: true });
        clients.forEach(c => c.postMessage({ type: 'APP_UPDATED' }));
      }
    })();
    e.waitUntil(refresh);

    if (cached) return cached;
    await refresh;
    return (await cache.match(e.request)) || fetchTimeout(e.request);
  })());
});
