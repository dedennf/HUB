// Service worker Fase 1: membersihkan cache app lama (hub-pribadi-v4) dan tidak meng-cache apa pun,
// supaya data selalu segar dari server. Push notification ditambahkan di Fase 6.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});
