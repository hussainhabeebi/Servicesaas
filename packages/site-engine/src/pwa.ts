/**
 * Per-tenant PWA support — each tenant's site is independently installable
 * (own name, icon, theme color) since it's served from the tenant's own
 * origin (subdomain or custom domain), which is what gives it its own
 * isolated service worker scope and install prompt in the first place.
 */

export interface ManifestInput {
  businessName: string;
  themeColor: string;
  logoUrl?: string;
}

export function renderManifest(opts: ManifestInput): Record<string, unknown> {
  const shortName = opts.businessName.length > 12 ? opts.businessName.slice(0, 12) : opts.businessName;
  const icons = opts.logoUrl
    ? [{ src: opts.logoUrl, sizes: "any", type: "image/png", purpose: "any" }]
    : [
        { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
        { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      ];
  return {
    name: `${opts.businessName} — Book Online`,
    short_name: shortName,
    description: `Book with ${opts.businessName} in a few taps.`,
    id: "/",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait-primary",
    background_color: "#ffffff",
    theme_color: opts.themeColor,
    icons,
  };
}

/**
 * Deliberately minimal: network-first for same-origin GETs so tenants
 * always see fresh booking/availability content, falling back to the last
 * cached copy (or the shell page) when offline — not a full precache/asset
 * pipeline, since these pages are server-rendered HTML with no separate
 * static bundle to precache.
 */
export const SERVICE_WORKER_JS = `
const CACHE_NAME = 'servbazaar-site-v1';

self.addEventListener('install', () => { self.skipWaiting(); });

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  event.respondWith(
    fetch(req)
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(req, copy));
        return res;
      })
      .catch(() => caches.match(req).then((cached) => cached || caches.match('/')))
  );
});

// Booking reminders / rebook nudges (lib/webpush.ts + lib/push-reminders.ts
// on the API worker) arrive here as a push event.
self.addEventListener('push', (event) => {
  let data = { title: 'Reminder', body: '' };
  try { data = event.data ? event.data.json() : data; } catch (e) {}
  event.waitUntil(
    self.registration.showNotification(data.title || 'Reminder', {
      body: data.body || '',
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      data: { url: data.url || '/' },
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || '/';
  event.waitUntil(
    self.clients.matchAll({ type: 'window' }).then((clients) => {
      for (const client of clients) {
        if (client.url === url && 'focus' in client) return client.focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow(url);
    })
  );
});
`;
