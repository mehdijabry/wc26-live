import { AnimatePresence, motion } from 'framer-motion'
import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'

/**
 * IosInstallPrompt — floating "Install app" button + guided modal for
 * iPhone / iPad Safari users.
 *
 * IMPORTANT HONESTY NOTE:
 *   Apple does NOT expose a JavaScript API to programmatically trigger
 *   "Add to Home Screen". On iOS, only the user can do it via Safari's
 *   share sheet. We can:
 *     ✅ Detect iOS Safari and surface a prominent button
 *     ✅ Hide the button if the app is already installed (standalone mode)
 *     ✅ Show clear visual instructions (Share icon → Add to Home Screen)
 *     ✅ Make sure the saved icon launches as a real app (apple-mobile-
 *        web-app-capable + manifest, set up in index.html)
 *     ❌ We CANNOT bypass the share-sheet step, no matter what
 *
 * After "Add to Home Screen", iOS uses our apple-touch-icon + the
 * apple-mobile-web-app-* meta tags + manifest.json to:
 *   - place the WC26 emblem as the app icon on the home screen
 *   - launch the site fullscreen with no Safari chrome (standalone)
 *   - use our theme color for the status bar
 */

const DISMISSED_KEY = 'wc26-install-dismissed'

function isIos() {
  if (typeof navigator === 'undefined') return false
  const ua = navigator.userAgent
  // iPad on iOS 13+ identifies as Macintosh. Disambiguate with maxTouchPoints.
  return /iPhone|iPad|iPod/.test(ua) || (ua.includes('Mac') && (navigator as Navigator & { maxTouchPoints?: number }).maxTouchPoints! > 1)
}

function isIosSafari() {
  if (!isIos()) return false
  const ua = navigator.userAgent
  // Reject the in-app browsers and other iOS browsers that don't expose
  // the share → Add to Home Screen flow with our app icon (Chrome iOS,
  // Firefox iOS, FB / Insta in-app webviews).
  const isOtherBrowser = /CriOS|FxiOS|EdgiOS|OPiOS|GSA|FBAN|FBAV|Instagram|Line|TikTok/.test(ua)
  if (isOtherBrowser) return false
  // Some in-app webviews fake Safari UA — narrow further.
  return /Safari/.test(ua) && /Version\//.test(ua)
}

function isStandalone() {
  if (typeof window === 'undefined') return false
  // iOS Safari sets navigator.standalone === true ONLY when launched from
  // the home-screen icon (not from inside Safari). This is the gold check.
  const nav = navigator as Navigator & { standalone?: boolean }
  if (nav.standalone === true) return true
  // Android Chrome PWA + iOS 16.4+ also expose this CSS media query.
  // Cover all PWA display modes just in case (some browsers use 'fullscreen'
  // or 'minimal-ui' for installed apps).
  if (window.matchMedia) {
    if (window.matchMedia('(display-mode: standalone)').matches) return true
    if (window.matchMedia('(display-mode: fullscreen)').matches) return true
    if (window.matchMedia('(display-mode: minimal-ui)').matches) return true
  }
  // Some installed PWAs land on /?source=pwa or similar after install — not
  // a guarantee but a soft signal we can use as a backstop. Disabled by
  // default since URL params can be spoofed; uncomment if needed.
  // if (location.search.includes('standalone=1')) return true
  return false
}

export function IosInstallPrompt() {
  const [show, setShow] = useState(false)
  const [openModal, setOpenModal] = useState(false)

  useEffect(() => {
    // Don't even mount on non-iOS browsers
    if (!isIosSafari()) return

    // Decision function — run it on mount, again after a short delay
    // (iOS sometimes lags exposing navigator.standalone right after launch),
    // and again on visibilitychange / display-mode change.
    let cancelled = false
    function evaluate() {
      if (cancelled) return
      if (isStandalone()) {
        // App is installed and opened from home screen icon → never show
        setShow(false)
        return
      }
      try {
        if (localStorage.getItem(DISMISSED_KEY)) return
      } catch { /* ignore */ }
      setShow(true)
    }

    // First check after a small delay so the page renders first
    const initial = window.setTimeout(evaluate, 2_500)
    // Re-check when the user returns to the tab — useful if they install
    // the app and come back to the still-open Safari tab.
    const onVis = () => { if (!document.hidden) evaluate() }
    document.addEventListener('visibilitychange', onVis)
    // Some browsers emit a 'change' event on the display-mode media query
    // when the app transitions standalone (rare but cheap to listen for).
    const mq = window.matchMedia?.('(display-mode: standalone)')
    const onMq = () => evaluate()
    mq?.addEventListener?.('change', onMq)

    return () => {
      cancelled = true
      clearTimeout(initial)
      document.removeEventListener('visibilitychange', onVis)
      mq?.removeEventListener?.('change', onMq)
    }
  }, [])

  function dismiss() {
    setShow(false)
    try { localStorage.setItem(DISMISSED_KEY, String(Date.now())) } catch { /* ignore */ }
  }

  if (!show && !openModal) return null

  return createPortal(
    <>
      {/* Floating pill — single compact element so it fits on iPhone
          screen width (390px+ but with safe-area padding eating the
          edges). Dismiss × is inside the pill, not a separate button,
          which also stops the × from being clipped by the viewport. */}
      <AnimatePresence>
        {show && !openModal && (
          <motion.div
            key="btn"
            initial={{ y: 80, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 80, opacity: 0 }}
            transition={{ type: 'spring', damping: 22, stiffness: 220 }}
            className="fixed inset-x-4 z-[80] flex justify-center"
            style={{
              bottom: 'calc(env(safe-area-inset-bottom, 0px) + 84px)',
            }}
          >
            <div
              className="flex items-center bg-marine-950 text-cream rounded-full overflow-hidden max-w-full"
              style={{ boxShadow: '0 12px 32px -8px rgba(10,37,64,0.45)' }}
            >
              <button
                onClick={() => setOpenModal(true)}
                className="flex items-center gap-2.5 pl-3.5 pr-4 py-2.5 active:bg-marine-900 transition-colors min-w-0"
              >
                <img src="/wc26-emblem.svg" alt="" className="w-7 h-7 shrink-0" />
                <div className="flex flex-col text-left leading-tight min-w-0">
                  <span className="text-[9px] uppercase tracking-[0.2em] text-accent-gold font-mono">
                    Install · 1 step
                  </span>
                  <span className="text-[13px] font-semibold whitespace-nowrap">
                    Add to Home Screen
                  </span>
                </div>
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); dismiss() }}
                aria-label="Dismiss"
                className="self-stretch px-3 text-cream/60 hover:text-cream border-l border-white/10 flex items-center justify-center text-lg leading-none active:bg-marine-900 transition-colors"
              >
                ×
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Modal with the step-by-step iOS install guide. */}
      <AnimatePresence>
        {openModal && (
          <>
            <motion.div
              key="backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setOpenModal(false)}
              className="fixed inset-0 z-[110] bg-slate-950/70 backdrop-blur-sm"
            />
            <motion.div
              key="modal"
              initial={{ y: 80, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 80, opacity: 0 }}
              transition={{ type: 'spring', damping: 26, stiffness: 240 }}
              className="fixed inset-x-3 bottom-3 z-[120] mx-auto max-w-md rounded-3xl bg-paper shadow-2xl overflow-hidden"
              style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
            >
              {/* Header */}
              <div className="px-6 pt-6 pb-4 bg-gradient-to-br from-marine-950 to-marine-900 text-cream">
                <div className="flex items-center gap-3">
                  <img src="/wc26-emblem.svg" alt="" className="w-12 h-12" />
                  <div>
                    <div className="text-[10px] tracking-[0.22em] uppercase text-accent-gold font-mono">
                      Install on iPhone
                    </div>
                    <div className="font-display font-bold text-lg leading-tight">
                      WC<span className="text-accent-gold">26</span> Live on your home screen
                    </div>
                  </div>
                </div>
                <p className="text-xs text-cream/75 mt-3 leading-relaxed">
                  Launch the app fullscreen, no browser chrome, like a native app.
                  Apple doesn&apos;t allow one-tap install on iPhone — just follow these 3 steps:
                </p>
              </div>

              {/* Steps */}
              <ol className="px-6 py-6 space-y-4">
                <Step
                  n={1}
                  title="Tap the Share button"
                  description="It's at the bottom of Safari (or top on iPad) — the square with an arrow pointing up."
                  icon={
                    <svg viewBox="0 0 24 24" className="w-7 h-7" fill="none">
                      <path d="M12 3v13M8 7l4-4 4 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                      <rect x="5" y="10" width="14" height="11" rx="2" stroke="currentColor" strokeWidth="1.8" />
                    </svg>
                  }
                />
                <Step
                  n={2}
                  title="Scroll & tap 'Add to Home Screen'"
                  description="In the share sheet, swipe through the actions until you see this option."
                  icon={
                    <svg viewBox="0 0 24 24" className="w-7 h-7" fill="none">
                      <rect x="3" y="3" width="18" height="18" rx="4" stroke="currentColor" strokeWidth="1.8" />
                      <path d="M12 8v8M8 12h8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                    </svg>
                  }
                />
                <Step
                  n={3}
                  title="Tap 'Add' — done!"
                  description="The WC26 icon lands on your home screen. Tap it to launch the app fullscreen."
                  icon={
                    <svg viewBox="0 0 24 24" className="w-7 h-7" fill="none">
                      <path d="M5 12l5 5L20 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  }
                />
              </ol>

              {/* Action */}
              <div className="px-6 pb-6 pt-2 flex gap-2">
                <button
                  onClick={() => setOpenModal(false)}
                  className="flex-1 px-4 py-3 rounded-full bg-slate-100 text-slate-700 text-sm font-semibold"
                >
                  Got it
                </button>
                <button
                  onClick={() => { dismiss(); setOpenModal(false) }}
                  className="px-4 py-3 rounded-full text-slate-500 text-sm"
                >
                  Don&apos;t show again
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>,
    document.body,
  )
}

function Step({
  n, title, description, icon,
}: {
  n: number
  title: string
  description: string
  icon: React.ReactNode
}) {
  return (
    <li className="flex items-start gap-3">
      <span className="shrink-0 w-9 h-9 rounded-full bg-marine-950 text-cream flex items-center justify-center font-mono font-bold text-sm">
        {n}
      </span>
      <span className="shrink-0 w-9 h-9 rounded-lg bg-accent-gold/15 text-marine-900 flex items-center justify-center">
        {icon}
      </span>
      <div className="min-w-0">
        <div className="font-display font-bold text-sm text-slate-900">{title}</div>
        <div className="text-[12px] text-slate-600 leading-snug mt-0.5">{description}</div>
      </div>
    </li>
  )
}
