/* MENES Ambassador — offline shell + push */
const CACHE = 'menes-amb-v6';
const SHELL = [
  '/',
  '/index.html',
  '/styles.css',
  '/app.js',
  '/config.js',
  '/manifest.json',
  '/icons/icon.svg',
];
const NETWORK_FIRST = new Set(['/app.js', '/styles.css', '/config.js', '/index.html', '/']);

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET') return;
  if (url.pathname.startsWith('/api/')) return;

  const networkFirst = NETWORK_FIRST.has(url.pathname) || url.pathname.endsWith('.js') || url.pathname.endsWith('.css');

  if (networkFirst) {
    event.respondWith(
      fetch(event.request)
        .then((res) => {
          if (res.ok && url.origin === self.location.origin) {
            const clone = res.clone();
            caches.open(CACHE).then((cache) => cache.put(event.request, clone));
          }
          return res;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cached) => {
      const fetchPromise = fetch(event.request).then((res) => {
        if (res.ok && url.origin === self.location.origin) {
          const clone = res.clone();
          caches.open(CACHE).then((cache) => cache.put(event.request, clone));
        }
        return res;
      }).catch(() => cached);
      return cached || fetchPromise;
    })
  );
});

self.addEventListener('push', (event) => {
  let data = { title: 'MENES Ambassador', body: 'Nouveau message', data: {} };
  try {
    if (event.data) data = { ...data, ...event.data.json() };
  } catch {
    try {
      if (event.data) data.body = event.data.text();
    } catch {}
  }
  event.waitUntil(
    self.registration.showNotification(data.title || 'MENES Ambassador', {
      body: data.body || 'Nouvelle notification',
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      tag: data.data?.messageId || data.data?.type || 'menes-amb',
      renotify: true,
      data: data.data || {},
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const view = event.notification.data?.view || 'community';
  const channel = event.notification.data?.channel || '';
  const target = `/?view=${encodeURIComponent(view)}${channel ? `&channel=${encodeURIComponent(channel)}` : ''}`;
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const client of list) {
        if (client.url.includes(self.registration.scope) && 'focus' in client) {
          client.postMessage({ type: 'navigate', view, channel });
          return client.focus();
        }
      }
      if (clients.openWindow) return clients.openWindow(target);
      return undefined;
    })
  );
});
