// NFOPD service worker: makes the site installable and lets it open offline.
// The page is always fetched fresh when there's a connection (every deploy shows up at once);
// the cached copy is only the fallback. Forecast data is not cached here: the app keeps its own
// copy in the browser and falls back to it for up to three days.
const V = 'nfopd-shell-v4';
const SHELL = ['/', '/manifest.webmanifest', '/favicon.ico', '/icons/icon.svg', '/icons/icon-192.png', '/icons/icon-512.png', '/icons/apple-touch-icon.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(V).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k.startsWith('nfopd-') && k !== V).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

const save = (key, res) => caches.open(V).then(c => c.put(key, res)).catch(() => {});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  // The map library comes from a CDN; keep a copy so the map still draws offline.
  if (url.hostname === 'cdnjs.cloudflare.com') {
    e.respondWith(caches.match(req).then(hit => hit || fetch(req).then(r => { if (r.ok || r.type === 'opaque') save(req, r.clone()); return r; })));
    return;
  }
  if (url.origin !== self.location.origin || url.pathname.startsWith('/_vercel/')) return;
  // Offline, tell the app its data proxy is "up" so it shows the forecasts it saved earlier instead of an empty page.
  if (url.pathname === '/proxy/health') {
    e.respondWith(fetch(req).catch(() => new Response('ok', { headers: { 'Content-Type': 'text/plain' } })));
    return;
  }
  if (url.pathname.startsWith('/proxy') || url.pathname.startsWith('/api/')) return; // live data: network only
  if (req.mode === 'navigate') {
    const key = ['/compare', '/methods'].includes(url.pathname) ? url.pathname : '/';
    const known = key !== '/' || url.pathname === '/' || url.pathname === '/index.html';
    e.respondWith(fetch(req).then(r => { if (r.ok && known) save(key, r.clone()); return r; }).catch(() => caches.match(key).then(hit => hit || caches.match('/'))));
    return;
  }
  // Icons and the manifest: answer from the cache, refresh in the background.
  e.respondWith(caches.match(req).then(hit => {
    const net = fetch(req).then(r => { if (r.ok) save(req, r.clone()); return r; });
    return hit || net;
  }));
});
