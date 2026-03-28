const CACHE = 'allsvenskanai-v1';
const STATIC = ['/'];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(STATIC))
  );
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);

  // Cache API responses for 5 minutes
  if(url.pathname.startsWith('/api/')) {
    e.respondWith(
      caches.open(CACHE).then(async cache => {
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
        const cachedResponse = new Response(await clone.arrayBuffer(), {
          status: clone.status, statusText: clone.statusText, headers
        });
        cache.put(e.request, cachedResponse);
        return response;
      }).catch(() => caches.match(e.request))
    );
    return;
  }

  // For navigation requests — serve from cache, fall back to network
  if(e.request.mode === 'navigate') {
    e.respondWith(
      fetch(e.request).catch(() => caches.match('/'))
    );
    return;
  }

  // Default: network first
  e.respondWith(
    fetch(e.request).catch(() => caches.match(e.request))
  );
});
