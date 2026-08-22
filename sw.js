const CACHE_NAME = 'farmacia-shell-v1';
const APP_SHELL = [
  './',
  './modern-index.html',
  './produtos.html',
  './checkout.html',
  './conta.html',
  './pedidos.html',
  './instrucoes.html',
  './manifest.webmanifest',
  './modern/css/modern-styles.css',
  './img/logo.png',
  './img/pwa-icon.svg'
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) =>
      Promise.all(cacheNames
        .filter((cacheName) => cacheName !== CACHE_NAME)
        .map((cacheName) => caches.delete(cacheName)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;

  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request).then((response) => {
        const copy = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
        return response;
      }).catch(() => caches.match(event.request).then((response) => response || caches.match('./modern-index.html')))
    );
    return;
  }

  event.respondWith(
    (async () => {
      const request = event.request;
      const cacheMode = request.cache;
      const networkFirst = ['no-store', 'no-cache', 'reload'].includes(cacheMode);
      const allowStore = cacheMode !== 'no-store';

      if (!networkFirst) {
        const cached = await caches.match(request);
        if (cached) return cached;
      }

      try {
        const response = await fetch(request);
        if (allowStore && response && response.ok && response.type !== 'opaque') {
          const copy = response.clone();
          event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.put(request, copy)));
        }
        return response;
      } catch (err) {
        const cached = await caches.match(request);
        if (cached) return cached;
        throw err;
      }
    })()
  );
});
