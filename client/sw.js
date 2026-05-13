// v9
const CACHE = 'alliby-tiles';
const TILE_PATH = '/functions/v1/vector-tiles/';

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
      .then(() => self.clients.matchAll({ type: 'window' }))
      .then(clients => clients.forEach(c => c.navigate(c.url)))
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

self.addEventListener('push', e => {
  let title = 'Aliby', body = '', extra = {};
  if (e.data) {
    try {
      const d = e.data.json();
      title = d.title || title;
      body  = d.body  || body;
      extra = d.data  || extra;
    } catch { body = e.data.text() || body; }
  }
  e.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon:    '/icons/icon-192.png',
      badge:   '/icons/icon-192.png',
      data:    extra,
      vibrate: [200, 100, 200],
      tag:     extra.orderId || 'aliby',
    })
  );
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  const orderId = e.notification.data?.orderId;
  const scope   = self.registration.scope;

  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clients => {
      for (const client of clients) {
        if (client.url.startsWith(scope)) {
          client.focus();
          client.postMessage({ type: 'OPEN_ORDER', orderId });
          return;
        }
      }
      return self.clients.openWindow(scope + (orderId ? '#orders' : ''));
    })
  );
});
