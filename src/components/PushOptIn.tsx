import { useEffect, useState } from 'react'
import {
  getCurrentSubscription,
  pushSupport,
  subscribeToPush,
  unsubscribeFromPush,
} from '../lib/push'

/**
 * Push-notification opt-in — PWA-only floating bubble.
 *
 * Lives as a small fixed-position pill in the bottom-right corner ON
 * the installed PWA only. On a regular browser tab it stays hidden
 * (the user explicitly didn't want the prompt on the web). Renders
 * nothing also when:
 *   - the device can't support Web Push at all
 *   - the user is already subscribed
 *   - the user dismissed the prompt this session
 *
 * State machine:
 *   - idle        → not subscribed, floating CTA shown
 *   - working     → spinner while permission/subscribe runs
 *   - subscribed  → bubble hides itself (no longer needed)
 *   - error       → friendly retry pill
 *   - hidden      → no DOM
 *
 * Detection of 'is this a PWA' uses display-mode media query +
 * navigator.standalone (iOS) — same checks every PWA UX library does.
 */

const SESSION_DISMISS_KEY = 'wc26.pushOptIn.dismissed'

/** True when the page is running as a PWA / standalone app, not a tab. */
function isStandalonePwa(): boolean {
  if (typeof window === 'undefined') return false
  try {
    if (window.matchMedia?.('(display-mode: standalone)').matches) return true
    // iOS Safari home-screen install — exposes a non-standard property.
    const iosNav = navigator as Navigator & { standalone?: boolean }
    if (iosNav.standalone === true) return true
  } catch {}
  return false
}

type State =
  | { kind: 'idle' }
  | { kind: 'working' }
  | { kind: 'subscribed' }
  | { kind: 'error'; message: string }
  | { kind: 'hidden' }

export function PushOptIn() {
  const [state, setState] = useState<State>({ kind: 'hidden' })

  useEffect(() => {
    let cancelled = false
    const support = pushSupport()
    if (!support.ok) return // never render
    // App-only — never show on a regular browser tab.
    if (!isStandalonePwa()) return
    // Session-dismiss check
    try {
      if (sessionStorage.getItem(SESSION_DISMISS_KEY) === '1') return
    } catch { /* private mode */ }
    // Initial subscription state — already subscribed = no nag.
    void getCurrentSubscription().then((sub) => {
      if (cancelled) return
      if (sub) return  // hidden — no need to prompt
      setState({ kind: 'idle' })
    })
    return () => { cancelled = true }
  }, [])

  if (state.kind === 'hidden') return null

  async function onEnable() {
    setState({ kind: 'working' })
    try {
      await subscribeToPush()
      setState({ kind: 'subscribed' })
    } catch (e) {
      setState({
        kind: 'error',
        message: e instanceof Error ? e.message : 'Could not enable notifications.',
      })
    }
  }

  async function onDisable() {
    setState({ kind: 'working' })
    try {
      await unsubscribeFromPush()
      setState({ kind: 'idle' })
    } catch {
      // Even if the server call failed, the local sub is dropped —
      // keep the UI honest.
      setState({ kind: 'idle' })
    }
  }

  function onDismiss() {
    try { sessionStorage.setItem(SESSION_DISMISS_KEY, '1') } catch {}
    setState({ kind: 'hidden' })
  }

  // Subscribed state: never render at all (no nag). Keep the function
  // defined though so the unused-var linter doesn't fire on onDisable.
  void onDisable

  return (
    <div
      className="fixed bottom-4 right-4 z-50 pointer-events-none"
      style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
    >
      <div className="pointer-events-auto max-w-[280px] rounded-2xl border border-slate-200 bg-white/95 backdrop-blur shadow-xl p-3 pr-2 flex items-start gap-2.5">
        <span className="text-xl leading-none mt-0.5 shrink-0" aria-hidden>🔔</span>
        <div className="flex-1 min-w-0">
          {state.kind === 'idle' && (
            <>
              <div className="font-display font-bold text-sm text-ink-900 leading-tight">
                Goal & kickoff alerts
              </div>
              <div className="text-[11px] text-slate-600 mt-0.5 leading-snug">
                Get pinged at kickoff, on goals, full-time.
              </div>
              <button
                onClick={onEnable}
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
              <div className="text-[11px] text-slate-600 mt-0.5">{state.message.slice(0, 60)}</div>
              <button
                onClick={onEnable}
                className="mt-2 px-3 py-1 rounded-full bg-accent-gold text-ink-900 font-semibold text-xs hover:bg-yellow-300"
              >
                Retry
              </button>
            </>
          )}
        </div>
        <button
          onClick={onDismiss}
          aria-label="Dismiss"
          className="shrink-0 w-6 h-6 rounded-full text-slate-400 hover:text-slate-700 hover:bg-slate-100 flex items-center justify-center text-base leading-none"
        >
          ×
        </button>
      </div>
    </div>
  )
}
