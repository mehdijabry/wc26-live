/* WC26 Live — minimal service worker.
 *
 * Purpose right now: satisfy Chrome's PWA install criteria so the
 * beforeinstallprompt event fires on Android (Chrome requires a
 * fetch-handling SW to consider a site installable). We're NOT trying
 * to be offline-first — the site is a live scoreboard so stale data
 * is worse than no data. The fetch handler is a pure pass-through.
 *
 * If we ever want offline caching for /today / /predictions, this is
 * where it goes. Until then, keep it boring — every request goes to
 * the network unmodified.
 */

const VERSION = 'wc26-v1'

self.addEventListener('install', (event) => {
  // Activate this version immediately, even if older versions are still
  // controlling tabs.
  event.waitUntil(self.skipWaiting())
})

self.addEventListener('activate', (event) => {
  // Take control of every open client tab right away so users don't
  // have to refresh to get the install prompt.
  event.waitUntil(self.clients.claim())
})

self.addEventListener('fetch', (event) => {
  // Pass-through. Required for Chrome to consider us installable.
  // (Just having `addEventListener('fetch', ...)` qualifies.)
  event.respondWith(fetch(event.request).catch(() => {
    // If the network is down and the request is for navigation,
    // serve a minimal fallback so the app doesn't show Chrome's
    // dinosaur. Stops at HTML — assets fall through to error.
    if (event.request.mode === 'navigate') {
      return new Response(
        '<!doctype html><meta charset="utf-8"><title>WC26 Live — offline</title>' +
        '<div style="font-family:system-ui;padding:48px;text-align:center;color:#0a2540">' +
        '<h1>WC26 Live</h1><p>You appear to be offline. Reconnect to see live scores.</p></div>',
        { headers: { 'content-type': 'text/html; charset=utf-8' } }
      )
    }
    return new Response('', { status: 504 })
  }))
})

// Cache name version reference — bump VERSION above on cache-busting
// changes if we ever start caching assets here.
void VERSION

// ─── Web Push handlers ───────────────────────────────────────────────
// Triggered when the push service (FCM / Mozilla / Apple) delivers
// a notification payload to this user agent. Payload shape from our
// Cloudflare Worker /push/send endpoint:
//   { title: string, body: string, url?: string, tag?: string }
// We keep the renderer minimal — the icon + badge come from
// /icon-192.png, the tag groups notifications so a follow-up FT
// alert replaces the earlier kickoff alert instead of stacking.
self.addEventListener('push', (event) => {
  let data = { title: 'WC26 Live', body: 'Match update' }
  try { if (event.data) data = { ...data, ...event.data.json() } } catch { /* keep defaults */ }
  const options = {
    body: data.body,
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    tag: data.tag || 'wc26-default',
    data: { url: data.url || '/today' },
    requireInteraction: false,
  }
  event.waitUntil(self.registration.showNotification(data.title, options))
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const targetUrl = (event.notification.data && event.notification.data.url) || '/'
  event.waitUntil(
    (async () => {
      const clientList = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      // Re-use an existing tab on our origin if one is open — saves
      // the user a fresh app boot.
      for (const client of clientList) {
        try {
          const u = new URL(client.url)
          if (u.origin === self.location.origin && 'focus' in client) {
            await client.focus()
            try { client.postMessage({ type: 'wc26:notification-click', url: targetUrl }) } catch {}
            return
          }
        } catch { /* skip malformed urls */ }
      }
      // No matching tab open → open a new one at the deep link.
      if (self.clients.openWindow) await self.clients.openWindow(targetUrl)
    })()
  )
})
