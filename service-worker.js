const CACHE_NAME = 'teacher-ai-shell-v2';
const APP_SHELL = [
  './',
  './index.html',
  './styles-aero.css',
  './welcome-overrides.css',
  './theme-toggle.css',
  './aero-enhancements.css',
  './night-aero.css',
  './motion.css',
  './storage.js',
  './api.js',
  './fileparse.js',
  './diagrams-core.js',
  './diagrams-science.js',
  './diagrams-math.js',
  './diagrams-concept.js',
  './motion.js',
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

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)));
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
    // โค้ด/สไตล์ของแอป: ขอจากเครือข่ายก่อนเพื่อให้ได้เวอร์ชันล่าสุดเสมอ ตกมาใช้ cache เฉพาะตอนออฟไลน์
    // (ถ้า cache-first ผู้ใช้จะติด app.js เก่าตลอดและปนกับ index.html ใหม่)
    if (/\.(?:js|css|html|webmanifest)$/.test(url.pathname)) {
      event.respondWith(fetch(request).then((response) => {
        if (response.ok) {
          const copy = response.clone();
          event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.put(request, copy)));
        }
        return response;
      }).catch(() => caches.match(request)));
      return;
    }
    // รูป/ไอคอน ไม่ค่อยเปลี่ยน: cache-first
    event.respondWith(caches.match(request).then((cached) => cached || fetch(request).then((response) => {
      if (response.ok) {
        const copy = response.clone();
        event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.put(request, copy)));
      }
      return response;
    })));
    return;
  }

  // CDN dependencies are optional runtime assets (URLs are version-pinned, so cache-first is safe and fast):
  // cache successful responses, but never let a failed third-party request break navigation or SW install.
  event.respondWith(caches.match(request).then((cached) => cached || fetch(request).then((response) => {
    if (response.ok || response.type === 'opaque') {
      const copy = response.clone();
      event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.put(request, copy)));
    }
    return response;
  })));
});
