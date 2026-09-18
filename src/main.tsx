import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import './index.css'
import App from './App.tsx'

// Hard redirect from the legacy subdomain. Anyone still landing on
// wc26.mehdijabry.dev (Facebook posts, Google cache, bookmarks, PWAs
// installed before the domain swap) gets sent to pressing90.live with
// their exact path + query preserved, so deep links to /predictions,
// /u/:slug, /today etc. still work. Runs BEFORE React mounts so we
// don't pay the cost of bootstrapping the app just to redirect.
if (typeof window !== 'undefined' && window.location.hostname === 'wc26.mehdijabry.dev') {
  const dest = 'https://pressing90.live' + window.location.pathname + window.location.search + window.location.hash
  window.location.replace(dest)
}

// Register the service worker so Android Chrome / Edge / Samsung
// Internet fire the `beforeinstallprompt` event — without this the
// browser won't surface our 'Install app' button. The SW itself is
// a minimal pass-through (see public/sw.js).
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/sw.js', { scope: '/' })
      .catch((err) => {
        // Silent fail — install prompt just won't appear, which is
        // fine. Log so we can see it during local dev / Sentry later.
        console.warn('[wc26] service worker registration failed:', err)
      })
  })
}

// Stale-chunk recovery. When we redeploy, the main bundle the user
// already has cached references lazy chunks (e.g. AdminPanel-OLD.js)
// that no longer exist on the CDN — or the chunk 404s for ~1 min while
// the new deployment propagates across Cloudflare's edge. The lazy
// import rejects, React Suspense unmounts, blank page.
//
// Previous version reloaded ONCE per session — during an edge
// propagation window that single reload landed while the chunk was
// still 404 and the user stayed on a white page for the whole session
// (this exactly happened on 2026-07-15). Now: time-gated retry (one
// reload per 15s, indefinitely) + an unhandledrejection fallback for
// chunk failures that bypass vite:preloadError.
function recoverFromStaleChunk(reason: unknown) {
  const msg = String((reason as { message?: unknown })?.message ?? reason ?? '')
  if (!/dynamically imported module|Importing a module script failed|ChunkLoadError|error loading dynamically imported/i.test(msg)) return
  let last = 0
  try { last = Number(sessionStorage.getItem('wc26.chunkReloadAt') ?? 0) } catch { /* private mode */ }
  if (Date.now() - last < 15_000) return // just tried — don't pingpong
  try { sessionStorage.setItem('wc26.chunkReloadAt', String(Date.now())) } catch { /* private mode */ }
  console.warn('[p90] stale/unreachable chunk, healing cache + reloading:', msg)
  // The failure can be a POISONED BROWSER-CACHE ENTRY (a 404/HTML that
  // got cached under the chunk URL during deploy propagation) — a plain
  // reload reuses it forever. `cache: 'reload'` bypasses the cache and
  // OVERWRITES the entry with the fresh network response, so the reload
  // that follows imports the healthy file. Seen 2026-08-06: fetch() said
  // 200 while import() kept failing on the same URL.
  const urlMatch = /https?:\/\/\S+?\.js/.exec(msg)
  const heal = urlMatch
    ? fetch(urlMatch[0], { cache: 'reload' }).catch(() => undefined)
    : Promise.resolve(undefined)
  void heal.finally(() => window.location.reload())
}
window.addEventListener('vite:preloadError', (e) => {
  recoverFromStaleChunk((e as Event & { payload?: unknown }).payload ?? 'vite:preloadError')
})
window.addEventListener('unhandledrejection', (e) => recoverFromStaleChunk(e.reason))

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
)
