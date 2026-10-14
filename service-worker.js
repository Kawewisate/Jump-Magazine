const CACHE_NAME = 'teacher-ai-shell-v7';
const APP_SHELL = [
  './',
  './index.html',
  './styles-aero.css',
  './welcome-overrides.css',
  './theme-toggle.css',
  './aero-enhancements.css',
  './night-aero.css',
  './motion.css',
  './fx.css',
  './storage.js',
  './api.js',
  './stream-text.js',
  './fileparse.js',
  './diagrams-core.js',
  './diagrams-science.js',
  './diagrams-math.js',
  './diagrams-concept.js',
  './motion.js',
  './fx.js',
  './print.js',
  './slides.js',
  './app.js',
  './pwa.js',
  './assets/favicon.svg',
  './assets/icons/icon-192.png',
  './assets/icons/icon-512.png',
  './assets/icons/icon-maskable-512.png',
  './assets/icons/apple-touch-icon-180.png',
  './assets/vintage/aero-lake-mirror-public-domain.jpg',
  './assets/vintage/nuvola-bookcase.png',
  './assets/vintage/nuvola-browser.png',
  './assets/vintage/nuvola-history.png',
  './assets/vintage/nuvola-kwrite.png',
  './assets/vintage/nuvola-mathematics.png'
];
const OPTIONAL_CDN = [
  'https://cdn.jsdelivr.net/npm/gsap@3.13.0/dist/gsap.min.js',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL.map((url) => new Request(url, { cache: 'reload' }))).then(() =>
    // CDN libs are best-effort so an offline/blocked CDN never fails the install.
    Promise.allSettled(OPTIONAL_CDN.map((url) => cache.add(url)))
  )));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key.startsWith('teacher-ai-shell-') && key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin.includes('openrouter.ai') || url.pathname.includes('/api/')) return;

  if (request.mode === 'navigate') {
    event.respondWith(fetch(request).catch(() => caches.match('./index.html')));
    return;
  }

  if (url.origin === self.location.origin) {
    event.respondWith(caches.match(request).then((cached) => cached || fetch(request).then((response) => {
      if (response.ok) caches.open(CACHE_NAME).then((cache) => cache.put(request, response.clone()));
      return response;
    })));
    return;
  }

  // CDN dependencies are optional runtime assets: cache successful responses,
  // but never let a failed third-party request break navigation or SW install.
  event.respondWith(fetch(request).then((response) => {
    if (response.ok || response.type === 'opaque') caches.open(CACHE_NAME).then((cache) => cache.put(request, response.clone()));
    return response;
  }).catch(() => caches.match(request)));
});
