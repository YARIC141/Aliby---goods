// Выключатель: раньше на alliby.ru/ жило клиентское приложение со своим service worker.
// Теперь здесь сайт, а приложение — на app.alliby.ru. Этот worker заменяет старый,
// чистит его кэши, снимает регистрацию и перезагружает вкладки, чтобы показать сайт.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) await caches.delete(k);
    await self.registration.unregister();
    for (const c of await self.clients.matchAll({ type: 'window' })) c.navigate(c.url);
  })());
});
