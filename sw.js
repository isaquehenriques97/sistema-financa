// ============================================================
// FLUXO PWA — Service Worker
// Estratégia: Cache First para assets, Network First para dados
// ============================================================

const CACHE_NAME = 'fluxo-v1';
const ASSETS = [
  './index.html',
  './styles.css',
  './script.js',
  './manifest.json',
  'https://fonts.googleapis.com/css2?family=Syne:wght@400;600;700;800&family=DM+Sans:ital,wght@0,300;0,400;0,500;1,400&family=JetBrains+Mono:wght@400;500&display=swap'
];

// Instala e faz cache dos assets principais
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(ASSETS).catch(() => {
        // Falha silenciosa se algum asset não carregar (ex: offline no install)
        return Promise.resolve();
      });
    })
  );
  self.skipWaiting();
});

// Remove caches antigos
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Estratégia: Cache First (serve do cache, atualiza em background)
self.addEventListener('fetch', event => {
  // Ignora requisições não-GET e chrome-extension
  if (event.request.method !== 'GET') return;
  if (!event.request.url.startsWith('http')) return;

  event.respondWith(
    caches.match(event.request).then(cached => {
      const networkFetch = fetch(event.request)
        .then(response => {
          if (response && response.status === 200) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
          }
          return response;
        })
        .catch(() => cached); // Offline: retorna cache

      // Retorna cache imediatamente; atualiza em segundo plano
      return cached || networkFetch;
    })
  );
});
