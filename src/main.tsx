import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import './index.css'
import App from './App.tsx'

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

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
)
