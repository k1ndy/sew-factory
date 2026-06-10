/* ЦЕХ — простой и безопасный service worker.
   Правила:
   - HTML/навигация: только сеть (никогда не отдаём устаревший HTML);
     офлайн — fallback на закэшированную оболочку.
   - Запросы к Supabase (API): только сеть, без кэша.
   - Статика (css/js/иконки): cache-first + фоновое обновление.
   Версия в имени кэша — при изменении статики поднимайте APP_VERSION,
   старые кэши удаляются на activate. */
const APP_VERSION = '1.0.0';
const STATIC_CACHE = 'cex-static-' + APP_VERSION;
const STATIC_ASSETS = ['/', '/index.html', '/css/styles.css?v=1.0.0', '/manifest.json', '/icons/icon.svg'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(STATIC_CACHE).then((c) => c.addAll(STATIC_ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== STATIC_CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // API (Supabase) — только сеть
  if (url.pathname.includes('/rest/v1/') || url.hostname.includes('supabase')) return;

  // Навигация / HTML — сеть, fallback на кэш (без жёсткого кэша HTML)
  if (req.mode === 'navigate' || (req.headers.get('accept') || '').includes('text/html')) {
    e.respondWith(
      fetch(req).catch(() => caches.match('/index.html').then((r) => r || caches.match('/')))
    );
    return;
  }

  // Статика того же источника — cache-first + фоновое обновление
  if (url.origin === self.location.origin) {
    e.respondWith(
      caches.match(req).then((cached) => {
        const network = fetch(req).then((res) => {
          if (res && res.status === 200) {
            const copy = res.clone();
            caches.open(STATIC_CACHE).then((c) => c.put(req, copy));
          }
          return res;
        }).catch(() => cached);
        return cached || network;
      })
    );
  }
});
