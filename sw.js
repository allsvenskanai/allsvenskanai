const VERSION = 'allsvenskanai-v2';
const API_CACHE = 'api-cache-v2';

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

  // Cache API responses for 5 minutes
  if(url.pathname.startsWith('/api/')) {
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
        const clone = response.clone();
        const headers = new Headers(clone.headers);
        headers.set('sw-cached-at', Date.now().toString());
        const cached2 = new Response(await clone.arrayBuffer(), {
          status: clone.status, statusText: clone.statusText, headers
        });
        cache.put(e.request, cached2);
        return response;
      }).catch(() => caches.match(e.request))
    );
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
