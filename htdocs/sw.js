// ============================================================
// Trainingsportal – Service Worker
// ============================================================
// Ziel: Die App startet auch ohne Netz und zeigt den zuletzt geladenen
// Trainingsplan. Auf keinen Fall darf sie dabei eine veraltete Version
// ausliefern – das Portal verlässt sich auf ?v=NNN-Cache-Buster.
//
// Strategie:
//   - Shell (JS/CSS/PHP-Assets, alle mit ?v=NNN):  stale-while-revalidate.
//     Ein Versionssprung ändert die URL → automatisch neuer Eintrag.
//   - Navigation (index.html):                     network-first.
//   - API-GETs:                                    network-first mit
//     Cache-Fallback (offline die zuletzt gesehenen Daten).
//   - Alles andere (POST/PUT/DELETE, fremde Hosts): unangetastet.
//
// Die Version steckt in der Registrierungs-URL (sw.js?v=NNN). Bei jedem
// Deploy ändert sie sich, der Browser installiert den SW neu und die alten
// Shell-Caches werden in activate() entsorgt.
// ============================================================

const VERSION     = new URL(self.location.href).searchParams.get('v') || '0';
const SHELL_CACHE = 'ts-shell-' + VERSION;
const DATA_CACHE  = 'ts-data';
const FONT_CACHE  = 'ts-fonts';

self.addEventListener('install', () => {
  // Sofort übernehmen – der Nutzer soll nach einem Deploy nicht erst
  // alle Tabs schließen müssen.
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const namen = await caches.keys();
    await Promise.all(namen.map(n => {
      // Alle Shell-Caches außer dem aktuellen entfernen; Daten/Fonts bleiben.
      if (n.startsWith('ts-shell-') && n !== SHELL_CACHE) return caches.delete(n);
      return Promise.resolve();
    }));
    await self.clients.claim();
  })());
});

self.addEventListener('message', event => {
  if (event.data === 'skipWaiting') self.skipWaiting();
});

function istApi(url) {
  return url.pathname.endsWith('/api/index.php') || url.pathname.includes('/api/index.php/');
}

function istFont(url) {
  return url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com';
}

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // Google Fonts: cache-first, sie ändern sich praktisch nie.
  if (istFont(url)) {
    event.respondWith(cacheFirst(req, FONT_CACHE));
    return;
  }

  if (url.origin !== self.location.origin) return;

  // Downloads (GPX, ICS, Workout-Dateien) nie abfangen
  if (url.searchParams.has('download') || /\.(gpx|ics|fit|workout)$/i.test(url.pathname)) return;

  if (istApi(url)) {
    event.respondWith(networkFirst(req, DATA_CACHE));
    return;
  }

  if (req.mode === 'navigate') {
    event.respondWith(networkFirst(req, SHELL_CACHE));
    return;
  }

  event.respondWith(staleWhileRevalidate(req, SHELL_CACHE));
});

async function cacheFirst(req, cacheName) {
  const cache  = await caches.open(cacheName);
  const treffer = await cache.match(req);
  if (treffer) return treffer;
  const res = await fetch(req);
  if (res && (res.ok || res.type === 'opaque')) cache.put(req, res.clone());
  return res;
}

async function networkFirst(req, cacheName) {
  const cache = await caches.open(cacheName);
  try {
    const res = await fetch(req);
    if (res && res.ok) cache.put(req, res.clone());
    return res;
  } catch (err) {
    const treffer = await cache.match(req);
    if (treffer) return treffer;
    // Für API-Aufrufe eine saubere JSON-Antwort statt eines Netzwerkfehlers,
    // damit die Oberfläche eine verständliche Meldung zeigen kann.
    if (istApi(new URL(req.url))) {
      return new Response(
        JSON.stringify({ ok: false, offline: true, fehler: 'Offline – keine gespeicherten Daten vorhanden.' }),
        { status: 503, headers: { 'Content-Type': 'application/json' } }
      );
    }
    throw err;
  }
}

async function staleWhileRevalidate(req, cacheName) {
  const cache   = await caches.open(cacheName);
  const treffer = await cache.match(req);
  const netz    = fetch(req).then(res => {
    if (res && res.ok) cache.put(req, res.clone());
    return res;
  }).catch(() => null);
  return treffer || netz.then(res => res || Promise.reject(new Error('offline')));
}
