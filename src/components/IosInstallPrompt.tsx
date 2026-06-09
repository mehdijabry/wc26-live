import { AnimatePresence, motion } from 'framer-motion'
import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'

/**
 * InstallPrompt — floating "Install app" button + platform-specific
 * education modal. Covers ALL mobile browser scenarios:
 *
 *  - iOS Safari            → 3-step Add to Home Screen guide.
 *  - iOS Chrome/Firefox/…  → 'Open in Safari' modal (we explain why
 *                            and offer to share the URL to Safari).
 *  - Android Chromium      → one-tap native install via the
 *                            beforeinstallprompt event.
 *  - Android Firefox/…     → 'Open in Chrome' modal (Android intent
 *                            link to launch Chrome with the same URL).
 *
 * The component name is kept as IosInstallPrompt for import stability
 * across the codebase; functionally it now handles the full mobile
 * matrix.
 */

const DISMISSED_KEY = 'wc26-install-dismissed'

type Platform =
  | 'ios-safari'        // can install via guide
  | 'ios-other'         // needs to switch to Safari
  | 'android-chromium'  // can one-tap install
  | 'android-other'     // needs to switch to Chrome
  | null

// Native event type — not in TS lib.dom.d.ts yet.
interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>
}

function isIos() {
  if (typeof navigator === 'undefined') return false
  const ua = navigator.userAgent
  return /iPhone|iPad|iPod/.test(ua) || (ua.includes('Mac') && (navigator as Navigator & { maxTouchPoints?: number }).maxTouchPoints! > 1)
}

function isIosSafari() {
  if (!isIos()) return false
  const ua = navigator.userAgent
  const isOtherBrowser = /CriOS|FxiOS|EdgiOS|OPiOS|GSA|FBAN|FBAV|Instagram|Line|TikTok/.test(ua)
  if (isOtherBrowser) return false
  return /Safari/.test(ua) && /Version\//.test(ua)
}

function isAndroid() {
  if (typeof navigator === 'undefined') return false
  return /Android/i.test(navigator.userAgent)
}

/**
 * Best-effort detection of Chromium-derived browsers on Android. These
 * fire beforeinstallprompt natively. Firefox / Opera Mini / DuckDuckGo
 * don't, so we send those users through the 'Open in Chrome' modal.
 */
function isAndroidChromium() {
  if (!isAndroid()) return false
  const ua = navigator.userAgent
  // Firefox Android (Fennec/Fenix) — explicit reject
  if (/Firefox|Focus|FxiOS/.test(ua)) return false
  // Opera Mini doesn't support PWAs
  if (/Opera Mini/.test(ua)) return false
  // DuckDuckGo browser is WebView-based but doesn't surface install
  if (/DuckDuckGo/.test(ua)) return false
  // FB / IG / TikTok in-app webviews
  if (/FBAN|FBAV|Instagram|Line|TikTok/.test(ua)) return false
  // The rest of Android UAs we treat as chromium-derived (Chrome, Edge,
  // Samsung Internet, Brave, Opera, Vivaldi, etc.)
  return true
}

function isStandalone() {
  if (typeof window === 'undefined') return false
  const nav = navigator as Navigator & { standalone?: boolean }
  if (nav.standalone === true) return true
  if (window.matchMedia) {
    if (window.matchMedia('(display-mode: standalone)').matches) return true
    if (window.matchMedia('(display-mode: fullscreen)').matches) return true
    if (window.matchMedia('(display-mode: minimal-ui)').matches) return true
  }
  return false
}

function detectPlatform(): Platform {
  if (isIos()) {
    return isIosSafari() ? 'ios-safari' : 'ios-other'
  }
  if (isAndroid()) {
    return isAndroidChromium() ? 'android-chromium' : 'android-other'
  }
  return null
}

export function IosInstallPrompt() {
  const [show, setShow] = useState(false)
  const [openModal, setOpenModal] = useState(false)
  const [platform, setPlatform] = useState<Platform>(null)
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null)

  useEffect(() => {
    if (isStandalone()) return
    const p = detectPlatform()
    if (!p) return
    setPlatform(p)

    let cancelled = false

    function dismissedAlready() {
      try { return Boolean(localStorage.getItem(DISMISSED_KEY)) } catch { return false }
    }

    // ---------- iOS Safari ----------
    if (p === 'ios-safari') {
      function evaluate() {
        if (cancelled) return
        if (isStandalone()) { setShow(false); return }
        if (dismissedAlready()) return
        setShow(true)
      }
      const initial = window.setTimeout(evaluate, 2_500)
      const onVis = () => { if (!document.hidden) evaluate() }
      document.addEventListener('visibilitychange', onVis)
      const mq = window.matchMedia?.('(display-mode: standalone)')
      const onMq = () => evaluate()
      mq?.addEventListener?.('change', onMq)
      return () => {
        cancelled = true
        clearTimeout(initial)
        document.removeEventListener('visibilitychange', onVis)
        mq?.removeEventListener?.('change', onMq)
      }
    }

    // ---------- iOS non-Safari / Android non-Chromium ----------
    // Show educational button after a delay. No native install path so
    // tapping opens the 'switch browser' modal.
    if (p === 'ios-other' || p === 'android-other') {
      const initial = window.setTimeout(() => {
        if (cancelled || dismissedAlready()) return
        setShow(true)
      }, 3_000)
      return () => {
        cancelled = true
        clearTimeout(initial)
      }
    }

    // ---------- Android Chromium ----------
    if (p === 'android-chromium') {
      function onBeforeInstall(e: Event) {
        e.preventDefault()
        if (dismissedAlready()) return
        setDeferredPrompt(e as BeforeInstallPromptEvent)
        setShow(true)
      }
      function onInstalled() {
        setShow(false)
        setDeferredPrompt(null)
      }
      window.addEventListener('beforeinstallprompt', onBeforeInstall)
      window.addEventListener('appinstalled', onInstalled)
      // Fallback — if the browser is slow to fire beforeinstallprompt
      // (engagement heuristic), surface our educational button after
      // 12s so users still have a path. Once the event fires we swap
      // to the proper install handler.
      const fallback = window.setTimeout(() => {
        if (cancelled || dismissedAlready()) return
        // Only show if we don't already have the deferred prompt
        setShow((current) => current || false || true)
      }, 12_000)
      return () => {
        cancelled = true
        clearTimeout(fallback)
        window.removeEventListener('beforeinstallprompt', onBeforeInstall)
        window.removeEventListener('appinstalled', onInstalled)
      }
    }
  }, [])

  function dismiss() {
    setShow(false)
    try { localStorage.setItem(DISMISSED_KEY, String(Date.now())) } catch { /* ignore */ }
  }

  async function shareToSafari() {
    // On iOS, navigator.share() opens the native share sheet which
    // lets the user pick "Open in Safari" — only path off Chrome iOS
    // (Apple has no x-safari:// scheme).
    try {
      if (navigator.share) {
        await navigator.share({
          title: 'WC26 Live · Pressing 90′',
          text: 'Install WC26 Live on your iPhone home screen',
          url: window.location.origin,
        })
        return
      }
    } catch { /* user cancelled */ }
    // Fallback: copy URL so they can paste into Safari manually
    try { await navigator.clipboard.writeText(window.location.origin) } catch { /* ignore */ }
  }

  function openInChrome() {
    // Android intent URL — asks Android to open the URL in Chrome
    // specifically. Firefox respects intent:// links and offers the
    // hand-off; if Chrome isn't installed the catch block falls back
    // to copying the URL.
    const url = window.location.origin
    try {
      window.location.href =
        `intent://${url.replace(/^https?:\/\//, '')}#Intent;scheme=https;package=com.android.chrome;end`
    } catch {
      navigator.clipboard?.writeText(url).catch(() => { /* ignore */ })
    }
  }

  async function handlePrimaryAction() {
    if (platform === 'ios-safari' || platform === 'ios-other' || platform === 'android-other') {
      setOpenModal(true)
      return
    }
    if (platform === 'android-chromium') {
      if (deferredPrompt) {
        try {
          await deferredPrompt.prompt()
          const choice = await deferredPrompt.userChoice
          if (choice.outcome === 'accepted') setShow(false)
          setDeferredPrompt(null)
        } catch { /* silent */ }
      } else {
        // beforeinstallprompt hasn't fired yet — open the educational
        // modal explaining how to install from the Chrome menu instead.
        setOpenModal(true)
      }
    }
  }

  if (!show && !openModal) return null

  const eyebrow =
    platform === 'android-chromium' ? 'Install · 1 tap' :
    platform === 'ios-safari'       ? 'Install · 1 step' :
    platform === 'ios-other'        ? 'Best install in Safari' :
    platform === 'android-other'    ? 'Best install in Chrome' :
    'Install'
  const mainLabel =
    platform === 'android-chromium' ? 'Install WC26 app' :
    platform === 'ios-safari'       ? 'Add to Home Screen' :
    'Get the WC26 app'

  return createPortal(
    <>
      <AnimatePresence>
        {show && !openModal && (
          <motion.div
            key="btn"
            initial={{ y: 80, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 80, opacity: 0 }}
            transition={{ type: 'spring', damping: 22, stiffness: 220 }}
            className="fixed inset-x-4 z-[80] flex justify-center"
            style={{ bottom: 'calc(env(safe-area-inset-bottom, 0px) + 84px)' }}
          >
            <div
              className="flex items-center bg-black/55 backdrop-blur-md text-white rounded-full overflow-hidden max-w-full"
              style={{ boxShadow: '0 12px 32px -8px rgba(0,0,0,0.4)' }}
            >
              <button
                onClick={handlePrimaryAction}
                className="flex items-center gap-2.5 pl-3.5 pr-4 py-2.5 active:bg-black/30 transition-colors min-w-0"
              >
                <img src="/wc26-emblem.svg" alt="" className="w-7 h-7 shrink-0" />
                <div className="flex flex-col text-left leading-tight min-w-0">
                  <span className="text-[9px] uppercase tracking-[0.2em] text-accent-gold font-mono">
                    {eyebrow}
                  </span>
                  <span className="text-[13px] font-semibold whitespace-nowrap text-white">
                    {mainLabel}
                  </span>
                </div>
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); dismiss() }}
                aria-label="Dismiss"
                className="self-stretch px-3 text-white/70 hover:text-white border-l border-white/15 flex items-center justify-center text-lg leading-none active:bg-black/30 transition-colors"
              >
                ×
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

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
              {platform === 'ios-safari' && <IosSafariGuide onClose={() => setOpenModal(false)} onDismiss={() => { dismiss(); setOpenModal(false) }} />}
              {platform === 'ios-other' && <IosOtherGuide onClose={() => setOpenModal(false)} onDismiss={() => { dismiss(); setOpenModal(false) }} onShare={shareToSafari} />}
              {platform === 'android-chromium' && <AndroidChromeGuide onClose={() => setOpenModal(false)} onDismiss={() => { dismiss(); setOpenModal(false) }} />}
              {platform === 'android-other' && <AndroidOtherGuide onClose={() => setOpenModal(false)} onDismiss={() => { dismiss(); setOpenModal(false) }} onOpenChrome={openInChrome} />}
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>,
    document.body,
  )
}

/* -------------------------------------------------------------------------- */
/* Modal contents — one per platform path                                     */
/* -------------------------------------------------------------------------- */

function ModalHeader({ eyebrow, title, sub }: { eyebrow: string; title: React.ReactNode; sub: string }) {
  return (
    <div className="px-6 pt-6 pb-4 bg-gradient-to-br from-marine-950 to-marine-900 text-cream">
      <div className="flex items-center gap-3">
        <img src="/wc26-emblem.svg" alt="" className="w-12 h-12" />
        <div>
          <div className="text-[10px] tracking-[0.22em] uppercase text-accent-gold font-mono">{eyebrow}</div>
          <div className="font-display font-bold text-lg leading-tight">{title}</div>
        </div>
      </div>
      <p className="text-xs text-cream/75 mt-3 leading-relaxed">{sub}</p>
    </div>
  )
}

function ModalActions({ primary, onPrimary, onClose, onDismiss }: { primary?: string; onPrimary?: () => void; onClose: () => void; onDismiss: () => void }) {
  return (
    <div className="px-6 pb-6 pt-2 flex gap-2 flex-wrap">
      {primary && (
        <button onClick={onPrimary} className="flex-1 px-4 py-3 rounded-full bg-marine-950 text-cream text-sm font-semibold active:scale-[0.98] transition-transform">
          {primary}
        </button>
      )}
      <button onClick={onClose} className="px-4 py-3 rounded-full bg-slate-100 text-slate-700 text-sm font-semibold">
        Later
      </button>
      <button onClick={onDismiss} className="px-4 py-3 rounded-full text-slate-500 text-sm">
        Don&apos;t show again
      </button>
    </div>
  )
}

function IosSafariGuide({ onClose, onDismiss }: { onClose: () => void; onDismiss: () => void }) {
  return (
    <>
      <ModalHeader
        eyebrow="Install on iPhone"
        title={<>WC<span className="text-accent-gold">26</span> Live on your home screen</>}
        sub="Launch the app fullscreen, no browser chrome. Apple doesn't allow one-tap install on iPhone — three quick steps:"
      />
      <ol className="px-6 py-6 space-y-4">
        <Step n={1} title="Tap the Share button" description="At the bottom of Safari (or top on iPad) — square with an arrow pointing up." icon={shareIcon} />
        <Step n={2} title="Scroll & tap 'Add to Home Screen'" description="In the share sheet, swipe through actions until you see this option." icon={addIcon} />
        <Step n={3} title="Tap 'Add' — done!" description="The WC26 icon lands on your home screen. Tap it to launch the app fullscreen." icon={checkIcon} />
      </ol>
      <ModalActions onClose={onClose} onDismiss={onDismiss} />
    </>
  )
}

function IosOtherGuide({ onClose, onDismiss, onShare }: { onClose: () => void; onDismiss: () => void; onShare: () => void }) {
  return (
    <>
      <ModalHeader
        eyebrow="Switch to Safari first"
        title="Open this page in Safari"
        sub="Chrome / Firefox on iPhone don't let us install our app icon — you'd get a generic browser shortcut instead. Open in Safari for the real WC26 app experience."
      />
      <div className="px-6 py-6 space-y-3 text-sm">
        <div className="flex items-start gap-3">
          <span className="shrink-0 w-7 h-7 rounded-full bg-marine-950 text-cream flex items-center justify-center font-mono font-bold text-xs">1</span>
          <div>
            <div className="font-semibold">Tap the button below</div>
            <div className="text-xs text-slate-500 mt-0.5">It opens the iOS share sheet with the WC26 link ready to send.</div>
          </div>
        </div>
        <div className="flex items-start gap-3">
          <span className="shrink-0 w-7 h-7 rounded-full bg-marine-950 text-cream flex items-center justify-center font-mono font-bold text-xs">2</span>
          <div>
            <div className="font-semibold">Pick &quot;Open in Safari&quot;</div>
            <div className="text-xs text-slate-500 mt-0.5">In the share sheet, scroll the apps row — Safari is there.</div>
          </div>
        </div>
        <div className="flex items-start gap-3">
          <span className="shrink-0 w-7 h-7 rounded-full bg-marine-950 text-cream flex items-center justify-center font-mono font-bold text-xs">3</span>
          <div>
            <div className="font-semibold">Install from Safari</div>
            <div className="text-xs text-slate-500 mt-0.5">Once in Safari, the WC26 install button appears with the proper guide.</div>
          </div>
        </div>
      </div>
      <ModalActions primary="📤 Share to Safari" onPrimary={onShare} onClose={onClose} onDismiss={onDismiss} />
    </>
  )
}

function AndroidChromeGuide({ onClose, onDismiss }: { onClose: () => void; onDismiss: () => void }) {
  return (
    <>
      <ModalHeader
        eyebrow="Install via menu"
        title={<>Install WC<span className="text-accent-gold">26</span> Live</>}
        sub="Chrome's automatic install prompt hasn't fired yet (it waits for a bit of browsing time). You can still install right now from the browser menu:"
      />
      <ol className="px-6 py-6 space-y-4">
        <Step n={1} title="Tap the menu ⋮" description="Top-right corner of Chrome / Edge / Samsung Internet." icon={menuIcon} />
        <Step n={2} title="Tap 'Install app' or 'Add to Home Screen'" description="Both are equivalent — they put the WC26 icon on your home screen." icon={addIcon} />
        <Step n={3} title="Confirm to finish" description="Done. The icon launches WC26 fullscreen like a native app." icon={checkIcon} />
      </ol>
      <ModalActions onClose={onClose} onDismiss={onDismiss} />
    </>
  )
}

function AndroidOtherGuide({ onClose, onDismiss, onOpenChrome }: { onClose: () => void; onDismiss: () => void; onOpenChrome: () => void }) {
  return (
    <>
      <ModalHeader
        eyebrow="Switch to Chrome first"
        title="Open this page in Chrome"
        sub="Firefox / other browsers don't expose the one-tap install prompt. Chrome, Edge, Samsung Internet and Brave all support it. Tap below to switch — the link will open in Chrome automatically."
      />
      <div className="px-6 py-6 space-y-3 text-sm">
        <div className="flex items-start gap-3">
          <span className="shrink-0 w-7 h-7 rounded-full bg-marine-950 text-cream flex items-center justify-center font-mono font-bold text-xs">1</span>
          <div>
            <div className="font-semibold">Tap &quot;Open in Chrome&quot;</div>
            <div className="text-xs text-slate-500 mt-0.5">The same page reopens in Chrome with the install button visible.</div>
          </div>
        </div>
        <div className="flex items-start gap-3">
          <span className="shrink-0 w-7 h-7 rounded-full bg-marine-950 text-cream flex items-center justify-center font-mono font-bold text-xs">2</span>
          <div>
            <div className="font-semibold">Tap the WC26 install pill in Chrome</div>
            <div className="text-xs text-slate-500 mt-0.5">One-tap and the icon lands on your home screen.</div>
          </div>
        </div>
        <div className="text-[11px] text-slate-500 mt-2">
          Or stay here and install manually: tap your browser&apos;s menu and choose &quot;Install&quot; / &quot;Add to home screen&quot;.
        </div>
      </div>
      <ModalActions primary="🌐 Open in Chrome" onPrimary={onOpenChrome} onClose={onClose} onDismiss={onDismiss} />
    </>
  )
}

function Step({ n, title, description, icon }: { n: number; title: string; description: string; icon: React.ReactNode }) {
  return (
    <li className="flex items-start gap-3">
      <span className="shrink-0 w-9 h-9 rounded-full bg-marine-950 text-cream flex items-center justify-center font-mono font-bold text-sm">{n}</span>
      <span className="shrink-0 w-9 h-9 rounded-lg bg-accent-gold/15 text-marine-900 flex items-center justify-center">{icon}</span>
      <div className="min-w-0">
        <div className="font-display font-bold text-sm text-slate-900">{title}</div>
        <div className="text-[12px] text-slate-600 leading-snug mt-0.5">{description}</div>
      </div>
    </li>
  )
}

/* SVG icons */
const shareIcon = (
  <svg viewBox="0 0 24 24" className="w-7 h-7" fill="none">
    <path d="M12 3v13M8 7l4-4 4 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    <rect x="5" y="10" width="14" height="11" rx="2" stroke="currentColor" strokeWidth="1.8" />
  </svg>
)
const addIcon = (
  <svg viewBox="0 0 24 24" className="w-7 h-7" fill="none">
    <rect x="3" y="3" width="18" height="18" rx="4" stroke="currentColor" strokeWidth="1.8" />
    <path d="M12 8v8M8 12h8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
  </svg>
)
const checkIcon = (
  <svg viewBox="0 0 24 24" className="w-7 h-7" fill="none">
    <path d="M5 12l5 5L20 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
)
const menuIcon = (
  <svg viewBox="0 0 24 24" className="w-7 h-7" fill="none">
    <circle cx="12" cy="5" r="1.5" fill="currentColor" />
    <circle cx="12" cy="12" r="1.5" fill="currentColor" />
    <circle cx="12" cy="19" r="1.5" fill="currentColor" />
  </svg>
)
