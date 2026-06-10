import { useEffect, useState } from 'react'
import {
  getCurrentSubscription,
  pushSupport,
  subscribeToPush,
  unsubscribeFromPush,
} from '../lib/push'

/**
 * Push-notification opt-in card. Small, dismissible, sits on the home
 * page above the WC26 promo section. Renders nothing when the device
 * can't support Web Push (iOS Safari outside standalone PWA, etc.).
 *
 * State machine:
 *   - idle        → not subscribed, opt-in CTA shown
 *   - working     → spinner while we wait for Notification.requestPermission
 *                   + PushManager.subscribe + Worker persistence
 *   - subscribed  → cha-ching pill, with a small unsubscribe link
 *   - error       → friendly message, retry button
 *   - dismissed   → user clicked the X, we hide for the session
 *
 * Session-dismiss state in sessionStorage so the card doesn't reappear
 * on every navigation within the same visit.
 */

const SESSION_DISMISS_KEY = 'wc26.pushOptIn.dismissed'

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
    // Session-dismiss check
    try {
      if (sessionStorage.getItem(SESSION_DISMISS_KEY) === '1') return
    } catch { /* private mode */ }
    // Initial subscription state
    void getCurrentSubscription().then((sub) => {
      if (cancelled) return
      setState(sub ? { kind: 'subscribed' } : { kind: 'idle' })
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

  return (
    <section className="container max-w-6xl mx-auto px-6 my-6">
      <div className="relative rounded-2xl border border-slate-200 bg-gradient-to-br from-paper-elev to-cream p-5 sm:p-6 flex items-center gap-4 flex-wrap">
        <button
          onClick={onDismiss}
          aria-label="Dismiss"
          className="absolute top-3 right-3 w-7 h-7 rounded-full text-slate-400 hover:text-slate-700 hover:bg-slate-200/70 flex items-center justify-center text-lg leading-none"
        >
          ×
        </button>

        <span className="text-3xl shrink-0" aria-hidden>🔔</span>

        <div className="flex-1 min-w-0 pr-8">
          {state.kind === 'idle' && (
            <>
              <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-slate-500">
                Kickoff & goal alerts
              </div>
              <div className="font-display font-bold text-base sm:text-lg text-ink-900 mt-0.5">
                Don't miss the start of any match.
              </div>
              <div className="text-sm text-slate-600 mt-1">
                We'll ping you 15 min before kickoff, on every goal, and at full-time. One tap, opt out anytime.
              </div>
            </>
          )}

          {state.kind === 'working' && (
            <>
              <div className="font-display font-semibold text-ink-900">Setting up notifications…</div>
              <div className="text-sm text-slate-600 mt-1">
                Approve the browser prompt to finish.
              </div>
            </>
          )}

          {state.kind === 'subscribed' && (
            <>
              <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-emerald-700">
                Subscribed
              </div>
              <div className="font-display font-bold text-base sm:text-lg text-ink-900 mt-0.5">
                You'll get a ping at kickoff, on every goal, and at full-time.
              </div>
              <div className="text-sm text-slate-600 mt-1">
                Need to turn it off?{' '}
                <button
                  onClick={onDisable}
                  className="text-accent-red underline underline-offset-2 hover:text-red-700"
                >
                  Unsubscribe
                </button>
              </div>
            </>
          )}

          {state.kind === 'error' && (
            <>
              <div className="font-display font-semibold text-ink-900">Couldn't enable notifications.</div>
              <div className="text-sm text-slate-600 mt-1">{state.message}</div>
            </>
          )}
        </div>

        {state.kind === 'idle' && (
          <button
            onClick={onEnable}
            className="shrink-0 inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-accent-gold text-ink-900 font-semibold text-sm hover:bg-yellow-300 transition-colors"
          >
            Enable alerts
          </button>
        )}
        {state.kind === 'error' && (
          <button
            onClick={onEnable}
            className="shrink-0 inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-accent-gold text-ink-900 font-semibold text-sm hover:bg-yellow-300 transition-colors"
          >
            Retry
          </button>
        )}
      </div>
    </section>
  )
}
