/*
 * MotoXplosion service worker.
 * - Navigations: network first, falling back to the cached app shell (offline play).
 * - Hashed build assets (/assets/*) and icons: cache first (immutable).
 * Bump CACHE whenever files in public/assets change (their names are not hashed).
 */
const CACHE = 'motoxplosion-v36';
const SHELL = [
  '/',
  '/index.html',
  '/manifest.webmanifest',
  '/icons/favicon-48.png',
  '/icons/apple-touch-icon.png',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/res/backdrops.json',
  '/res/backdrop-alps-forest.webp',
  '/res/splash.webp',
  '/res/tex-dirt.webp',
  '/res/tex-grass.webp',
  '/res/tex-rock.webp',
  '/res/tex-rock-warm.webp',
  '/res/tex-stone.webp',
  '/res/tex-sand.webp',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;
  // Music is streamed by <audio> with range requests: leave it to the network/HTTP cache.
  if (url.pathname.startsWith('/audio/')) return;

  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put('/index.html', copy));
          return res;
        })
        .catch(() => caches.match('/index.html').then((r) => r || caches.match('/'))),
    );
    return;
  }

  event.respondWith(
    caches.match(req).then(
      (hit) =>
        hit ||
        fetch(req).then((res) => {
          if (res.ok && (url.pathname.startsWith('/assets/') || url.pathname.startsWith('/res/') || url.pathname.startsWith('/icons/'))) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copy));
          }
          return res;
        }),
    ),
  );
});
