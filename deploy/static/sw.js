// Samowyrejestrowujący się service worker dla avenit.pl i app.avenit.pl.
// Te hosty wcześniej serwowały aplikację (PWA z SW). Ten SW zastępuje stary,
// czyści cache, wyrejestrowuje się i przeładowuje stronę → pokazuje się
// poprawna treść (placeholder / logowanie), nie zcache'owana apka.
self.addEventListener('install', function () {
  self.skipWaiting();
});

self.addEventListener('activate', function (event) {
  event.waitUntil((async function () {
    try {
      var keys = await caches.keys();
      await Promise.all(keys.map(function (k) { return caches.delete(k); }));
    } catch (e) {}
    try { await self.registration.unregister(); } catch (e) {}
    var clients = await self.clients.matchAll({ type: 'window' });
    clients.forEach(function (c) { c.navigate(c.url); });
  })());
});
