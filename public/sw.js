const CACHE_NAME = 'zentra-v1.9.11'; // Incrementar esto junto con APP_VERSION
const ASSETS = [
  '/',
  '/index.html',
  '/login.html',
  '/manifest.json'
];

self.addEventListener('install', (event) => {
  // Forzar que el nuevo SW tome el control de inmediato
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS);
    })
  );
});

// Limpieza de caches antiguos al activar el nuevo SW
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            console.log('Zentra: Borrando caché antigua:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
});

self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request).then((response) => {
      return response || fetch(event.request);
    })
  );
});
