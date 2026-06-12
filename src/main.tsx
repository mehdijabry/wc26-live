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
// that no longer exist on the CDN. The lazy import 404s, React
// Suspense surfaces a ChunkLoadError, and the user sees a blank page.
//
// Vite 5+ emits a 'vite:preloadError' event on the window for exactly
// this case. We reload once — sessionStorage gates it so we don't
// pingpong if the new bundle is also broken.
window.addEventListener('vite:preloadError', (e) => {
  try {
    if (sessionStorage.getItem('wc26.chunkReloaded') === '1') return
    sessionStorage.setItem('wc26.chunkReloaded', '1')
  } catch { /* private mode — still try reload */ }
  console.warn('[wc26] stale chunk detected, reloading:', (e as Event & { payload?: unknown }).payload)
  window.location.reload()
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
)
