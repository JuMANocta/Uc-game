// Bump CACHE à chaque déploiement pour purger les anciennes versions.
var CACHE = 'uc-game-v10';
var ASSETS = [
  './',
  './index.html',
  './app.js',
  './style.css',
  './net.js',
  './net-peerjs.js',
  './client.js',
  './pwa.js',
  './qr.js',
  './vendor/qrcode.js',
  // Chargé paresseusement par net-peerjs.js, mais précaché malgré tout pour
  // que le multi-appareils fonctionne sur une PWA déjà installée.
  './vendor/peerjs.min.js',
  './diag.html',
  './manifest.json',
  './icons/icon.svg'
];

self.addEventListener('install', function(e) {
  e.waitUntil(
    caches.open(CACHE).then(function(cache) {
      // cache:'reload' — ignore le cache HTTP, récupère bien la version fraîche
      return cache.addAll(ASSETS.map(function(u) {
        return new Request(u, { cache: 'reload' });
      }));
    }).then(function() {
      return self.skipWaiting();
    })
  );
});

self.addEventListener('activate', function(e) {
  e.waitUntil(
    caches.keys().then(function(keys) {
      return Promise.all(
        keys.filter(function(k) { return k !== CACHE; })
            .map(function(k) { return caches.delete(k); })
      );
    }).then(function() {
      return self.clients.claim();
    })
  );
});

// Stale-while-revalidate : on sert le cache immédiatement (rapide, offline),
// mais on rafraîchit toujours en arrière-plan. Le rechargement suivant a la
// nouvelle version — sans dépendre d'un bump manuel de CACHE.
self.addEventListener('fetch', function(e) {
  if (e.request.method !== 'GET') return;
  if (e.request.url.indexOf(self.location.origin) !== 0) return;

  e.respondWith(
    caches.match(e.request).then(function(cached) {
      var network = fetch(e.request).then(function(response) {
        if (response && response.status === 200 && response.type === 'basic') {
          var clone = response.clone();
          caches.open(CACHE).then(function(cache) { cache.put(e.request, clone); });
        }
        return response;
      }).catch(function() {
        return cached;
      });
      return cached || network;
    })
  );
});
