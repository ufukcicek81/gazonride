/* GazOnRide (beta): keep the app's own files on the phone so it opens even
 * when the connection to github.io is slow, stalled or reset.
 * - The page: network first, but after 4 s the copy on the phone is used
 *   (a fresh copy still replaces it in the background when it arrives).
 * - The app's files and the icon font: served from the phone, refreshed in
 *   the background (file names carry ?v= versions, so new code is new URLs).
 * - Everything else (maps, Supabase, weather, routing) is not touched.
 * Registered by index.html / login.html only under /beta/.
 */
const VERSION = 'gazonride-beta-v2';
const PAGE_TIMEOUT = 4000;

function pageKey(u) {
  const x = new URL(u);
  x.search = ''; x.hash = '';
  if (x.pathname.endsWith('/index.html')) x.pathname = x.pathname.slice(0, -'index.html'.length);
  return x.href;
}
function withTimeout(p, ms) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('timeout')), ms);
    p.then(v => { clearTimeout(t); resolve(v); }, e => { clearTimeout(t); reject(e); });
  });
}
// Cache the start page and every local file it references.
async function precache() {
  const cache = await caches.open(VERSION);
  const res = await fetch('./', { cache: 'no-store' });
  if (!res.ok) return;
  const html = await res.clone().text();
  await cache.put(pageKey(new URL('./', self.registration.scope).href), res);
  const urls = new Set();
  html.replace(/(?:src|href)="([^"#]+)"/g, (m, u) => {
    if (!/^(https?:|data:|mailto:|javascript:|\/\/)/.test(u)) urls.add(new URL(u, self.registration.scope).href);
    return m;
  });
  await Promise.all([...urls].map(u => fetch(u).then(r => r.ok ? cache.put(u, r) : null).catch(() => null)));
}

self.addEventListener('install', e => {
  self.skipWaiting();
  e.waitUntil(precache().catch(() => {}));
});
self.addEventListener('activate', e => e.waitUntil(
  caches.keys()
    .then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k))))
    .then(() => self.clients.claim())
));

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  if (req.mode === 'navigate' && url.origin === location.origin) {
    const key = pageKey(req.url);
    const net = fetch(req).then(r => {
      if (r.ok) { const copy = r.clone(); caches.open(VERSION).then(c => c.put(key, copy)); }
      return r;
    });
    e.waitUntil(net.catch(() => {}));
    // No copy on the phone yet: keep waiting for the network (or its error).
    e.respondWith(withTimeout(net, PAGE_TIMEOUT).catch(() => caches.match(key).then(hit => hit || net)));
    return;
  }

  const own = url.origin === location.origin;
  const font = url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com';
  if (!own && !font) return;
  e.respondWith(caches.open(VERSION).then(cache => cache.match(req).then(hit => {
    const net = fetch(req).then(r => {
      if (r.ok || r.type === 'opaque') cache.put(req, r.clone());
      return r;
    });
    if (hit) { e.waitUntil(net.catch(() => {})); return hit; }
    return net;
  })));
});
