// Mapping service worker: cache-first for the app (works offline).
// `__BUILD_ID__` is replaced at build time (vite.config.ts) by a hash of index.html;
// each new build generates a different sw.js, which triggers the new-version notice.
// `__CHANNEL__` becomes `preview` in the build of the branch published at /preview/.
const VERSION = '__BUILD_ID__';
const PREVIEW = '__CHANNEL__' === 'preview';
// The caches belong to the whole origin: the main version and the preview use distinct
// prefixes so that one does not delete the other's cache on activation.
// The `mapeador-` prefixes are the ones from before the rename to "Mapping" and stay: changing them
// would orphan the old caches (`activate` only deletes those that start with the current prefix).
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
  // The interactive guide (public/guia/): a single, self-contained page; works without internet.
  GUIDE,
  './icons/icon.svg',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './icons/apple-touch-icon.png',
];

const url = (path) => new URL(path, self.registration.scope).href;
// The app page is only the scope root (and index.html itself): other pages of the site
// (e.g. `other/`, pages published alongside) go to the network, without falling back to index.html.
const isAppPage = (pathname) => {
  const scope = new URL(self.registration.scope).pathname;
  return pathname === scope || pathname === `${scope}index.html`;
};
// The guide lives in `guia/`: navigation to it (with or without `index.html`) is served from the cache.
const isGuidePage = (pathname) => {
  const guide = new URL('./guia/', self.registration.scope).pathname;
  return pathname === guide || pathname === `${guide}index.html`;
};
const isPreviewPath = (pathname) => {
  const preview = new URL('./preview', self.registration.scope).pathname;
  return pathname === preview || pathname.startsWith(`${preview}/`);
};

self.addEventListener('install', (event) => {
  // No skipWaiting: the new version waits for the user to accept the notice.
  // `cache: 'reload'` skips the browser's HTTP cache: GitHub Pages serves with max-age=600 and,
  // right after a deploy, a plain `addAll` would store the old index.html in the new cache.
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
  // The preview (/preview/) is another app, with its own service worker: the scope of the
  // main version contains it, but it must not answer for it (nor for `/preview`
  // without the slash, which GitHub Pages redirects to `/preview/`).
  if (!PREVIEW && isPreviewPath(requested.pathname)) return;
  const guide = isGuidePage(requested.pathname);
  if (request.mode === 'navigate' && !isAppPage(requested.pathname) && !guide) return;

  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE);
      // Navigation (including with ?query) always serves the page from the cache: the app's index.html
      // or the guide.
      const key =
        request.mode === 'navigate' ? url(guide ? GUIDE : './index.html') : request;
      const cached = await cache.match(key);
      if (cached) return cached;
      return fetch(request);
    })(),
  );
});
