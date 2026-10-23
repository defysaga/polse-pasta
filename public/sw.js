// Service worker: lagrer appens filer på telefonen (så den åpner uten nett),
// viser push-varsler, og åpner appen når du trykker på et varsel.
// Appens filer hentes alltid ferske når det er nett, så du trenger ikke endre noe her ved oppdateringer.

const SHELL = 'pp-shell-v3';
const PHOTOS = 'pp-photos-v1';
const FONTS = 'pp-fonts-v1';
const FILES = ['/', '/app.css', '/app.js', '/game.js', '/quiz-data.js', '/manifest.webmanifest', '/icons/icon-192.png', '/icons/apple-touch-icon.png'];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(SHELL).then(c => c.addAll(FILES.map(f => new Request(f, { cache: 'reload' })))).catch(() => {}));
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  const keep = [SHELL, PHOTOS, FONTS];
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => !keep.includes(k)).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // Google Fonts: vis lagret versjon, oppdater i bakgrunnen
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    event.respondWith(caches.open(FONTS).then(async c => {
      const hit = await c.match(req);
      const net = fetch(req).then(r => { if (r.ok || r.type === 'opaque') c.put(req, r.clone()); return r; }).catch(() => hit);
      return hit || net;
    }));
    return;
  }
  if (url.origin !== self.location.origin) return;

  // Bildene endrer seg aldri: lagre dem og bruk lagret kopi
  if (url.pathname.startsWith('/api/photo/')) {
    event.respondWith(caches.open(PHOTOS).then(async c => {
      const hit = await c.match(req);
      if (hit) return hit;
      const r = await fetch(req);
      if (r.ok) c.put(req, r.clone());
      return r;
    }));
    return;
  }
  // Resten av API-et går alltid rett til serveren
  if (url.pathname.startsWith('/api/')) return;

  // Appens filer: prøv nettet først, bruk lagret kopi uten nett
  event.respondWith((async () => {
    const c = await caches.open(SHELL);
    const key = req.mode === 'navigate' ? '/' : req;
    try {
      const r = await fetch(req, { cache: 'no-cache' });
      if (r.ok) c.put(key, r.clone());
      return r;
    } catch (e) {
      const hit = await c.match(key, { ignoreSearch: true });
      if (hit) return hit;
      throw e;
    }
  })());
});

// Push fra serveren: vis varselet og si fra til appen hvis den er åpen
self.addEventListener('push', event => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch (e) { data = { body: event.data ? event.data.text() : '' }; }
  event.waitUntil((async () => {
    try {
      if (typeof data.badge === 'number' && 'setAppBadge' in self.navigator) {
        await (data.badge > 0 ? self.navigator.setAppBadge(data.badge) : self.navigator.clearAppBadge());
      }
    } catch (e) {}
    await self.registration.showNotification(data.title || 'Pølse & Pasta', {
      body: data.body || '',
      tag: data.tag || undefined,
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      data: { url: data.url || '/#pling' }
    });
    const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    wins.forEach(w => w.postMessage({ type: 'push' }));
  })());
});

// Trykk på varselet: hent frem appen, eller åpne den
self.addEventListener('notificationclick', event => {
  event.notification.close();
  const url = new URL((event.notification.data && event.notification.data.url) || '/#pling', self.location.origin).href;
  event.waitUntil((async () => {
    const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const w of wins) {
      if (w.url.startsWith(self.location.origin)) {
        w.postMessage({ type: 'open', url });
        if ('focus' in w) return w.focus();
      }
    }
    return self.clients.openWindow(url);
  })());
});
