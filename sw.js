/* GO Paint service worker: push notifications + light offline shell */
const CACHE = 'gopaint-shell-v1';

self.addEventListener('install', () => { self.skipWaiting(); });

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

// Network-first for page navigations, falling back to the last cached copy when offline.
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || req.mode !== 'navigate') return;
  e.respondWith((async () => {
    try {
      const fresh = await fetch(req);
      const cache = await caches.open(CACHE);
      cache.put(req, fresh.clone());
      return fresh;
    } catch (err) {
      return (await caches.match(req)) || (await caches.match('./')) || new Response('Offline', { status: 503 });
    }
  })());
});

self.addEventListener('push', (e) => {
  let data = {};
  try { data = e.data ? e.data.json() : {}; }
  catch (err) { data = { title: 'GO Paint', body: e.data ? e.data.text() : '' }; }
  const groupable = data.type === 'like' || data.type === 'comment';
  const options = {
    body: data.body || '',
    icon: 'icon-192.png',
    badge: 'icon-192.png',
    dir: 'rtl',
    lang: 'ar',
    data: { content_id: data.content_id || null, type: data.type || null, url: data.url || null }
  };
  if (groupable && data.content_id) { options.tag = data.type + ':' + data.content_id; options.renotify = true; }
  e.waitUntil(self.registration.showNotification(data.title || 'GO Paint', options));
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const d = e.notification.data || {};
  if (d.url) {
    e.waitUntil(self.clients.openWindow(d.url));
    return;
  }
  const target = new URL(self.registration.scope);
  if (d.content_id) target.searchParams.set('open', d.content_id);
  e.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const c of all) {
      if (c.url.startsWith(self.registration.scope)) {
        await c.focus();
        c.postMessage({ type: 'open-content', content_id: d.content_id });
        return;
      }
    }
    await self.clients.openWindow(target.href);
  })());
});
