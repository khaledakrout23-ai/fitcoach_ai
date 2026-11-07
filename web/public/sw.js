// Service worker Kammel : l'app s'ouvre même sans réseau (salles avec peu de signal).
// - /api/* n'est JAMAIS mis en cache (données personnelles, sessions)
// - fichiers avec empreinte (/assets/*), polices, icônes : cache d'abord
// - pages : réseau d'abord, sinon la dernière page d'accueil en cache
const VERSION = 'kammel-v2';
const SHELL = ['/', '/manifest.webmanifest', '/brand/kammel-symbol.png', '/icons/kammel-192.png', '/fonts/alexandria-latin.woff2', '/fonts/alexandria-arabic.woff2'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(VERSION).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/')) return; // jamais de cache pour l'API

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) caches.open(VERSION).then((cache) => cache.put('/', response.clone()));
          return response;
        })
        .catch(() => caches.match('/'))
    );
    return;
  }

  if (/^\/(assets|fonts|icons|brand)\//.test(url.pathname)) {
    event.respondWith(
      caches.match(request).then(
        (hit) =>
          hit ||
          fetch(request).then((response) => {
            if (response.ok) {
              const copy = response.clone();
              caches.open(VERSION).then((cache) => cache.put(request, copy));
            }
            return response;
          })
      )
    );
  }
});

// Notification affichée par l'app (rappels d'eau, salle calme) : un clic ouvre la bonne page
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const link = event.notification.data && typeof event.notification.data.link === 'string' ? event.notification.data.link : '/app';
  const target = link.startsWith('/') ? link : '/app'; // uniquement des liens internes
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const client of list) {
        if ('focus' in client) {
          client.navigate(target);
          return client.focus();
        }
      }
      return self.clients.openWindow(target);
    })
  );
});
