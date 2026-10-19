// Service worker do Mapping: cache-first do app (funciona offline).
// `__BUILD_ID__` é trocado no build (vite.config.ts) por um hash do index.html;
// cada build novo gera um sw.js diferente, o que dispara o aviso de nova versão.
// `__CHANNEL__` vira `preview` no build do branch publicado em /preview/.
const VERSION = '__BUILD_ID__';
const PREVIEW = '__CHANNEL__' === 'preview';
// Os caches são da origem inteira: a versão principal e o preview usam prefixos
// distintos para um não apagar o cache do outro ao ativar.
// Os prefixos `mapeador-` são os de antes do renome para "Mapping" e ficam: trocá-los
// deixaria os caches antigos órfãos (o `activate` só apaga os que começam com o prefixo atual).
const PREVIEW_PREFIX = 'mapeador-preview-';
const CACHE = PREVIEW ? `${PREVIEW_PREFIX}${VERSION}` : `mapeador-${VERSION}`;
const ownsCache = (name) =>
  PREVIEW
    ? name.startsWith(PREVIEW_PREFIX)
    : name.startsWith('mapeador-') && !name.startsWith(PREVIEW_PREFIX);
const GUIDE = './guia/index.html';
const PRECACHE = [
  './index.html',
  './manifest.webmanifest',
  // O guia interativo (public/guia/): uma página só, autocontida; funciona sem internet.
  GUIDE,
  './icons/icon.svg',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './icons/apple-touch-icon.png',
];

const url = (path) => new URL(path, self.registration.scope).href;
// A página da app é só a raiz do escopo (e o próprio index.html): outras páginas do site
// (ex.: `lab/…`, experimentos publicados ao lado) vão à rede, sem cair no index.html.
const isAppPage = (pathname) => {
  const scope = new URL(self.registration.scope).pathname;
  return pathname === scope || pathname === `${scope}index.html`;
};
// O guia fica em `guia/`: a navegação para ele (com ou sem `index.html`) é servida do cache.
const isGuidePage = (pathname) => {
  const guide = new URL('./guia/', self.registration.scope).pathname;
  return pathname === guide || pathname === `${guide}index.html`;
};
const isPreviewPath = (pathname) => {
  const preview = new URL('./preview', self.registration.scope).pathname;
  return pathname === preview || pathname.startsWith(`${preview}/`);
};

self.addEventListener('install', (event) => {
  // Sem skipWaiting: a versão nova espera o usuário aceitar o aviso.
  // `cache: 'reload'` pula o cache HTTP do navegador: o GitHub Pages serve com max-age=600 e,
  // logo depois de um deploy, o `addAll` comum guardaria o index.html antigo no cache novo.
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) =>
        cache.addAll(PRECACHE.map((p) => new Request(url(p), { cache: 'reload' }))),
      ),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(
        names
          .filter((name) => ownsCache(name) && name !== CACHE)
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
  // O preview (/preview/) é outra app, com o próprio service worker: o escopo da
  // versão principal o contém, mas não pode responder por ele (nem por `/preview`
  // sem a barra, que o GitHub Pages redireciona para `/preview/`).
  if (!PREVIEW && isPreviewPath(requested.pathname)) return;
  const guide = isGuidePage(requested.pathname);
  if (request.mode === 'navigate' && !isAppPage(requested.pathname) && !guide) return;

  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE);
      // Navegação (inclusive com ?query) sempre serve a página do cache: o index.html da app
      // ou o guia.
      const key =
        request.mode === 'navigate' ? url(guide ? GUIDE : './index.html') : request;
      const cached = await cache.match(key);
      if (cached) return cached;
      return fetch(request);
    })(),
  );
});
