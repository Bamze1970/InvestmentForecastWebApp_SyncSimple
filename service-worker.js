const CACHE='investment-forecast-syncsimple-v2';
const ASSETS=['./','./index.html','./styles.css?v=2','./app.js?v=2','./config.js?v=2','./manifest.webmanifest','./icon.svg'];
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS))); self.skipWaiting(); });
self.addEventListener('activate', e => { e.waitUntil(self.clients.claim()); });
self.addEventListener('fetch', e => { e.respondWith(caches.match(e.request).then(r => r || fetch(e.request))); });
