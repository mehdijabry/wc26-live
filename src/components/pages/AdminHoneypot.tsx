import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'

/**
 * Decoy / honeypot mounted at the LEGACY /admin-panel-1992 URL.
 *
 * The real operator console moved to admin.pressing90.live/visca-barca.
 * Anyone hitting this old path — scrapers, an attacker who saw it in
 * a screen-share, etc. — sees a polished "sign in via magic link"
 * form that LOOKS like a legit admin login.
 *
 * The form does nothing. submit() waits a believable beat, then shows
 * the standard "check your inbox" success message. No request leaves
 * the page. No magic link exists. The attacker walks away convinced
 * they need to compromise an email account to get in — wrong rabbit
 * hole entirely.
 *
 * Future: when we genuinely want magic-link auth on the real admin,
 * we wire this UI to /admin/auth/magic-link on the worker. Until then,
 * it's pure deflection.
 */
export function AdminHoneypot() {
  const [email, setEmail] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [sent, setSent] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    document.title = 'Sign in · Pressing 90'
    const tag = document.createElement('meta')
    tag.name = 'robots'
    tag.content = 'noindex,nofollow,noarchive'
    document.head.appendChild(tag)
    return () => {
      try { document.head.removeChild(tag) } catch { /* tag was moved or already removed */ }
    }
  }, [])

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setErr(null)
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setErr('Enter a valid email address.')
      return
    }
    setSubmitting(true)
    // Believable latency. No fetch — the honeypot intentionally never
    // contacts the worker, so there's no signal an attacker can probe.
    await new Promise((r) => setTimeout(r, 900 + Math.random() * 700))
    setSubmitting(false)
    setSent(true)
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 p-6">
      <div className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-7 shadow-xl">
        <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-slate-500 mb-3">
          Pressing 90 · operator access
        </div>
        <h1 className="font-display font-bold text-2xl text-ink-900 mb-3">
          Sign in
        </h1>

        {sent ? (
          <div className="space-y-3">
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">
              ✓ Magic link sent to <strong className="break-all">{email}</strong>.
              Check your inbox — link expires in 10 minutes.
            </div>
            <p className="text-xs text-slate-500 font-mono leading-relaxed">
              Didn't get it? Check your spam folder or contact{' '}
              <span className="text-ink-900">admin@pressing90.live</span>.
            </p>
            <button
              type="button"
              onClick={() => { setSent(false); setEmail(''); setErr(null) }}
              className="mt-2 text-xs font-mono uppercase tracking-widest text-slate-400 hover:text-ink-900 transition-colors"
            >
              ← use a different email
            </button>
          </div>
        ) : (
          <form onSubmit={onSubmit}>
            <p className="text-xs text-slate-500 mb-4 leading-relaxed">
              Enter your operator email. We'll send you a one-time sign-in link —
              no password required.
            </p>
            <label className="block text-xs font-mono uppercase tracking-widest text-slate-500 mb-1">
              Email
            </label>
            <input
              autoFocus
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={submitting}
              placeholder="you@pressing90.live"
              className="w-full px-3 py-2 rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-accent-gold/40 font-mono text-sm"
            />
            {err && (
              <div className="mt-3 text-xs text-accent-red font-mono">{err}</div>
            )}
            <button
              type="submit"
              disabled={submitting || !email}
              className="mt-5 w-full px-4 py-2.5 rounded-full bg-accent-gold text-ink-900 font-semibold text-sm hover:bg-yellow-300 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              {submitting ? 'Sending magic link…' : 'Send magic link'}
            </button>
          </form>
        )}

        <div className="mt-6 pt-5 border-t border-slate-200 text-[11px] text-slate-400 font-mono leading-relaxed">
          For authorized operators only. Access attempts are logged.
        </div>
      </div>
    </div>
  )
}
