import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import './index.css'
import App from './App.tsx'
import { recupererChunkPerime } from './lib/chunks'
import { BarriereDErreur } from './components/BarriereDErreur'

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

// Récupération d'un morceau de code introuvable — voir src/lib/chunks.ts
// pour le détail et l'historique.
//
// TROIS évènements, pas deux. `vite:preloadError` couvre le préchargement et
// `unhandledrejection` les imports directs, mais l'échec d'un `React.lazy()`
// ne passe par ni l'un ni l'autre : React relance la promesse rejetée
// PENDANT LE RENDU, ce qui en fait une erreur classique. Elle sortait donc
// par `window.onerror`, que personne n'écoutait — une exception dans la
// console et l'écran restait blanc (2026-10-10).
window.addEventListener('vite:preloadError', (e) => {
  recupererChunkPerime((e as Event & { payload?: unknown }).payload ?? 'vite:preloadError')
})
window.addEventListener('unhandledrejection', (e) => { recupererChunkPerime(e.reason) })
window.addEventListener('error', (e) => { recupererChunkPerime(e.error ?? e.message) })

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      {/* Dernier filet : si l'en-tête ou le routeur lui-même casse, on
          affiche un écran lisible au lieu de rien du tout. */}
      <BarriereDErreur>
        <App />
      </BarriereDErreur>
    </BrowserRouter>
  </StrictMode>,
)
