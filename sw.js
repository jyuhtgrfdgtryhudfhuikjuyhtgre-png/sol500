/*
 * SOL 500 — service worker. Caches the app shell so the installed app starts offline.
 * App files: network first (always fresh when online), cache as the fallback. LAN API calls and the admin page are never cached.
 */
const CACHE = 'sol500-v1';
const SHELL = [
  './', 'index.html', 'manifest.webmanifest',
  'src/style.css', 'src/data.js', 'src/engine.js', 'src/i18n.js', 'src/art.js', 'src/charts.js',
  'src/net.js', 'src/surface.js', 'src/ui.js',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/maskable-512.png', 'icons/apple-touch-icon.png',
];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  // API calls and the admin page (it carries this PC's admin key) always go to the network and are never stored.
  if (event.request.method !== 'GET' || url.pathname.includes('/api/') || url.pathname === '/admin') return;
  const sameOrigin = url.origin === self.location.origin;
  event.respondWith(
    fetch(event.request)
      .then(res => {
        if (res.ok && (sameOrigin || url.hostname.endsWith('gstatic.com') || url.hostname.endsWith('googleapis.com'))) {
          const copy = res.clone();
          caches.open(CACHE).then(c => c.put(event.request, copy));
        }
        return res;
      })
      .catch(() => caches.match(event.request).then(hit => hit || (event.request.mode === 'navigate' ? caches.match('index.html') : undefined)))
  );
});
