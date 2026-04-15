const VERSION = 'allsvenskanai-v4';
const API_CACHE = 'api-cache-v4';

self.addEventListener('install', e => {
  self.skipWaiting(); // Activate immediately
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== API_CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim()) // Take control immediately
  );
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);

  // Static app modules/assets must never fall back to index.html. If a JS
  // module receives HTML, the browser rejects it with a MIME error.
  if(
    url.pathname.startsWith('/assets/') ||
    url.pathname.startsWith('/src/') ||
    e.request.destination === 'script' ||
    e.request.destination === 'style'
  ) {
    e.respondWith(
      fetch(e.request, { cache: 'no-store' }).then(response => {
        const contentType = response.headers.get('content-type') || '';
        if(url.pathname.endsWith('.js') && contentType.includes('text/html')) {
          console.error('[sw] Refusing HTML response for JS module', url.pathname);
          return new Response('JavaScript module was served as HTML', {
            status: 502,
            headers: { 'Content-Type': 'text/plain; charset=utf-8' }
          });
        }
        return response;
      })
    );
    return;
  }

  // Cache low-risk public API responses briefly. Admin/statistics cache endpoints must
  // stay network-first so admin refreshes become visible immediately.
  if(url.pathname.startsWith('/api/') && !url.pathname.startsWith('/api/admin') && !url.pathname.startsWith('/api/stats')) {
    e.respondWith(
      caches.open(API_CACHE).then(async cache => {
        const cached = await cache.match(e.request);
        if(cached) {
          const cachedTime = cached.headers.get('sw-cached-at');
          if(cachedTime && Date.now() - parseInt(cachedTime) < 5 * 60 * 1000) {
            return cached;
          }
        }
        const response = await fetch(e.request);
        if(response.ok) {
          const clone = response.clone();
          const headers = new Headers(clone.headers);
          headers.set('sw-cached-at', Date.now().toString());
          const cached2 = new Response(await clone.arrayBuffer(), {
            status: clone.status, statusText: clone.statusText, headers
          });
          cache.put(e.request, cached2);
        }
        return response;
      }).catch(() => caches.match(e.request))
    );
    return;
  }

  if(url.pathname.startsWith('/api/admin') || url.pathname.startsWith('/api/stats')) {
    e.respondWith(fetch(e.request));
    return;
  }

  // For HTML — always fetch fresh from network (never cache)
  if(e.request.mode === 'navigate' || url.pathname.endsWith('.html')) {
    e.respondWith(
      fetch(e.request).catch(() => new Response('Offline — starta om appen när du har internet', {
        headers: {'Content-Type': 'text/plain'}
      }))
    );
    return;
  }

  // Everything else — network first
  e.respondWith(fetch(e.request).catch(() => caches.match(e.request)));
});
