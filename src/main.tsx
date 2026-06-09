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

// Drop the inline boot splash from index.html now that React is about
// to take over. Both the boot splash and the React intro splash use
// the same marine #0a2540 background + WC26 emblem layout, so the
// hand-off is invisible to the eye. We remove on the next animation
// frame so React has time to paint its own splash first.
requestAnimationFrame(() => {
  const boot = document.getElementById('boot-splash')
  if (boot) boot.remove()
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
)
