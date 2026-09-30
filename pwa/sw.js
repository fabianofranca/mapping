// Service worker do Mapeador de Imagens: cache-first do app (funciona offline).
// `__BUILD_ID__` é trocado no build (vite.config.ts) por um hash do index.html;
// cada build novo gera um sw.js diferente, o que dispara o aviso de nova versão.
const VERSION = '__BUILD_ID__';
const CACHE = `mapeador-${VERSION}`;
const PRECACHE = [
  './index.html',
  './manifest.webmanifest',
  './icons/icon.svg',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './icons/apple-touch-icon.png',
];

const url = (path) => new URL(path, self.registration.scope).href;

self.addEventListener('install', (event) => {
  // Sem skipWaiting: a versão nova espera o usuário aceitar o aviso.
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(PRECACHE.map(url))));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(
        names
          .filter((name) => name.startsWith('mapeador-') && name !== CACHE)
          .map((name) => caches.delete(name)),
      );
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') void self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const requested = new URL(request.url);
  if (requested.origin !== self.location.origin) return;

  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE);
      // Navegação (inclusive com ?query) sempre serve o index.html do cache.
      const key = request.mode === 'navigate' ? url('./index.html') : request;
      const cached = await cache.match(key);
      if (cached) return cached;
      return fetch(request);
    })(),
  );
});
