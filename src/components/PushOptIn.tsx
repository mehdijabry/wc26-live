import { useEffect, useState } from 'react'
import {
  getCurrentSubscription,
  pushSupport,
  subscribeToPush,
  unsubscribeFromPush,
} from '../lib/push'

/**
 * Push-notification opt-in — PWA-only.
 *
 * Two presentations:
 *
 *   - **Modal** (first cold-start of the PWA): a prominent centered
 *     card with a single Enable CTA. Tap = triggers the native iOS
 *     permission prompt. This is as close as we can get to
 *     "auto-launch on first open" — iOS Safari refuses to fire
 *     Notification.requestPermission() without a user gesture, so we
 *     present the gesture target as soon as the app boots.
 *
 *   - **Bubble** (every subsequent cold-start): a small corner pill
 *     identical to the previous design. Shows up on every new visit
 *     until the user grants permission. Per-session dismissal stops
 *     it from re-appearing until the next session.
 *
 * State table:
 *   subscription present → render nothing (handled)
 *   first-shown flag missing → modal
 *   first-shown flag set + session-dismissed → render nothing
 *   first-shown flag set + permission still ungranted → bubble
 *
 * Detection of 'is this a PWA' uses display-mode media query +
 * navigator.standalone (iOS). Browser tabs render nothing here.
 */

const FIRST_SHOWN_KEY = 'wc26.pushPrompt.firstShown'
const SESSION_DISMISS_KEY = 'wc26.pushOptIn.dismissed'

/** True when the page is running as a PWA / standalone app, not a tab. */
function isStandalonePwa(): boolean {
  if (typeof window === 'undefined') return false
  try {
    if (window.matchMedia?.('(display-mode: standalone)').matches) return true
    // iOS Safari home-screen install — exposes a non-standard property.
    const iosNav = navigator as Navigator & { standalone?: boolean }
    if (iosNav.standalone === true) return true
  } catch { /* matchMedia / navigator unavailable */ }
  return false
}

type State =
  | { kind: 'hidden' }
  | { kind: 'modal' }
  | { kind: 'bubble' }
  | { kind: 'working' }
  | { kind: 'subscribed' }
  | { kind: 'error'; message: string; from: 'modal' | 'bubble' }

export function PushOptIn() {
  const [state, setState] = useState<State>({ kind: 'hidden' })

  useEffect(() => {
    let cancelled = false
    const support = pushSupport()
    // Treat 'denied' as still-showable — the bubble lets the user know
    // they can re-enable via Settings even if requestPermission can't
    // re-prompt the native dialog. Truly unsupported devices skip.
    if (!support.ok && support.reason !== 'denied') return
    if (!isStandalonePwa()) return
    void getCurrentSubscription().then((sub) => {
      if (cancelled) return
      if (sub) return // already subscribed, never nag

      let firstShown = false
      try { firstShown = localStorage.getItem(FIRST_SHOWN_KEY) === '1' } catch { /* private mode */ }

      if (!firstShown) {
        // First cold-start in this PWA → prominent modal.
        setState({ kind: 'modal' })
        return
      }

      // Returning visitor — honor per-session dismissal.
      try {
        if (sessionStorage.getItem(SESSION_DISMISS_KEY) === '1') return
      } catch { /* private mode */ }
      setState({ kind: 'bubble' })
    })
    return () => { cancelled = true }
  }, [])

  if (state.kind === 'hidden') return null

  // ── Actions ────────────────────────────────────────────────────────

  async function onEnable(from: 'modal' | 'bubble') {
    // Mark first-shown the moment we ask, so we don't re-modal even if
    // the user backs out of the native iOS sheet.
    try { localStorage.setItem(FIRST_SHOWN_KEY, '1') } catch { /* private mode */ }
    setState({ kind: 'working' })
    try {
      await subscribeToPush()
      setState({ kind: 'subscribed' })
      // Brief success state, then hide. The fade is CSS — no animation
      // library needed.
      setTimeout(() => setState({ kind: 'hidden' }), 1600)
    } catch (e) {
      setState({
        kind: 'error',
        from,
        message: e instanceof Error ? e.message : 'Could not enable notifications.',
      })
    }
  }

  function onLater() {
    // 'Maybe later' from the modal → mark first-shown so we don't
    // modal again, dismiss for this session so the bubble doesn't
    // immediately replace the modal. Next cold-start the bubble
    // reappears (which matches 'demander à chaque nouvelle visite').
    try { localStorage.setItem(FIRST_SHOWN_KEY, '1') } catch { /* private mode */ }
    try { sessionStorage.setItem(SESSION_DISMISS_KEY, '1') } catch { /* private mode */ }
    setState({ kind: 'hidden' })
  }

  function onDismissBubble() {
    try { sessionStorage.setItem(SESSION_DISMISS_KEY, '1') } catch { /* private mode */ }
    setState({ kind: 'hidden' })
  }

  // Kept for future use — toggling off the subscription is exposed
  // from elsewhere. void to silence the unused-var linter.
  void unsubscribeFromPush

  // ── Modal ──────────────────────────────────────────────────────────

  if (state.kind === 'modal') {
    return (
      <div
        className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-ink-900/40 backdrop-blur-sm p-4"
        role="dialog"
        aria-modal="true"
        aria-labelledby="push-modal-title"
      >
        <div
          className="w-full max-w-sm rounded-3xl bg-paper border border-slate-200 shadow-2xl p-6 sm:p-7"
          style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 1.5rem)' }}
        >
          <div className="flex items-center justify-center w-14 h-14 rounded-full bg-accent-gold/15 mx-auto mb-4">
            <span className="text-3xl leading-none" aria-hidden>🔔</span>
          </div>
          <h2
            id="push-modal-title"
            className="font-display font-bold text-xl text-ink-900 text-center mb-2"
          >
            Stay in the loop
          </h2>
          <p className="text-sm text-slate-600 text-center mb-5 leading-relaxed">
            Get pinged the moment a match kicks off, a goal lands,
            or a card hits the box. <strong className="text-ink-900">Live, every match.</strong>
          </p>
          <button
            onClick={() => onEnable('modal')}
            className="w-full px-4 py-3 rounded-full bg-accent-gold text-ink-900 font-semibold text-sm hover:bg-yellow-300 active:bg-yellow-400 transition-colors"
            autoFocus
          >
            Enable notifications
          </button>
          <button
            onClick={onLater}
            className="mt-2 w-full px-4 py-2 rounded-full text-xs font-mono uppercase tracking-widest text-slate-500 hover:text-ink-900 transition-colors"
          >
            Maybe later
          </button>
          <p className="mt-3 text-[10px] text-slate-400 text-center font-mono leading-relaxed">
            iOS will ask you to confirm. You can change this any time
            in Settings.
          </p>
        </div>
      </div>
    )
  }

  // ── Subscribed (brief fade-out) ────────────────────────────────────

  if (state.kind === 'subscribed') {
    return (
      <div
        className="fixed bottom-4 right-4 z-50 pointer-events-none"
        style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
      >
        <div className="pointer-events-auto rounded-2xl border border-emerald-200 bg-emerald-50 shadow-lg px-4 py-3 flex items-center gap-2 text-sm text-emerald-900">
          <span aria-hidden>✓</span>
          <span className="font-semibold">Notifications on</span>
        </div>
      </div>
    )
  }

  // ── Bubble (returning visit) + working + error ─────────────────────

  return (
    <div
      className="fixed bottom-4 right-4 z-50 pointer-events-none"
      style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
    >
      <div className="pointer-events-auto max-w-[280px] rounded-2xl border border-slate-200 bg-white/95 backdrop-blur shadow-xl p-3 pr-2 flex items-start gap-2.5">
        <span className="text-xl leading-none mt-0.5 shrink-0" aria-hidden>🔔</span>
        <div className="flex-1 min-w-0">
          {state.kind === 'bubble' && (
            <>
              <div className="font-display font-bold text-sm text-ink-900 leading-tight">
                Goal & kickoff alerts
              </div>
              <div className="text-[11px] text-slate-600 mt-0.5 leading-snug">
                Get pinged at kickoff, on goals, full-time.
              </div>
              <button
                onClick={() => onEnable('bubble')}
                className="mt-2 inline-flex items-center gap-1 px-3 py-1 rounded-full bg-accent-gold text-ink-900 font-semibold text-xs hover:bg-yellow-300 transition-colors"
              >
                Enable
              </button>
            </>
          )}
          {state.kind === 'working' && (
            <div className="text-xs text-slate-600 py-1">Setting up…</div>
          )}
          {state.kind === 'error' && (
            <>
              <div className="font-display font-semibold text-xs text-ink-900">Couldn't enable.</div>
              <div className="text-[11px] text-slate-600 mt-0.5">{state.message.slice(0, 80)}</div>
              <button
                onClick={() => onEnable(state.from)}
                className="mt-2 px-3 py-1 rounded-full bg-accent-gold text-ink-900 font-semibold text-xs hover:bg-yellow-300"
              >
                Retry
              </button>
            </>
          )}
        </div>
        <button
          onClick={onDismissBubble}
          aria-label="Dismiss"
          className="shrink-0 w-7 h-7 rounded-full text-slate-400 hover:text-slate-700 hover:bg-slate-100 flex items-center justify-center text-lg leading-none"
        >
          ×
        </button>
      </div>
    </div>
  )
}
