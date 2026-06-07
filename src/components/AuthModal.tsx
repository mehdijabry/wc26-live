import { motion, AnimatePresence } from 'framer-motion'
import { useState } from 'react'
import { useAuth } from '../store/auth'
import { SUPABASE_CONFIGURED } from '../lib/supabase'

export function AuthModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { signInWithMagicLink } = useAuth()
  const [email, setEmail] = useState('')
  const [alias, setAlias] = useState('')
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle')
  const [errorMsg, setErrorMsg] = useState('')

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!email) return
    setStatus('sending')
    const { error } = await signInWithMagicLink(email, alias || undefined)
    if (error) {
      setStatus('error')
      setErrorMsg(error)
    } else {
      setStatus('sent')
    }
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="fixed inset-0 z-50 bg-ink-900/80 backdrop-blur-md flex items-center justify-center p-4"
        >
          <motion.div
            initial={{ scale: 0.95, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.95, opacity: 0 }}
            onClick={(e) => e.stopPropagation()}
            className="glass rounded-3xl p-8 max-w-md w-full ring-glow"
          >
            <div className="flex items-start justify-between mb-6">
              <div>
                <div className="text-xs uppercase tracking-widest text-accent-gold font-mono">
                  Sign in
                </div>
                <div className="font-display font-bold text-3xl mt-1">
                  Save your bracket
                </div>
                <div className="text-sm text-slate-500 mt-2">
                  We'll email you a one-click sign-in link. No password.
                </div>
              </div>
              <button onClick={onClose} className="text-slate-500 hover:text-white text-xl w-8 h-8 rounded-full hover:bg-white/10 transition-colors">×</button>
            </div>

            {!SUPABASE_CONFIGURED && (
              <div className="mb-4 p-3 rounded-lg bg-accent-red/10 border border-accent-red/30 text-xs text-red-300">
                Supabase isn't configured yet. Add <code>VITE_SUPABASE_URL</code> and{' '}
                <code>VITE_SUPABASE_ANON_KEY</code> to <code>.env.local</code> and restart the dev server.
              </div>
            )}

            {status === 'sent' ? (
              <div className="text-center py-6">
                <div className="text-5xl mb-3">📬</div>
                <div className="font-display text-xl text-white mb-2">Check your inbox</div>
                <div className="text-sm text-slate-400">
                  We just sent a magic link to <span className="text-accent-gold font-mono">{email}</span>.
                  Click it to finish signing in.
                </div>
              </div>
            ) : (
              <form onSubmit={onSubmit} className="space-y-4">
                <div>
                  <label className="text-xs uppercase tracking-widest text-slate-500 font-mono">
                    Email
                  </label>
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@domain.com"
                    className="mt-1 w-full bg-ink-900/60 border border-white/10 rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-accent-gold/50"
                  />
                </div>
                <div>
                  <label className="text-xs uppercase tracking-widest text-slate-500 font-mono">
                    Alias <span className="text-slate-700">(optional)</span>
                  </label>
                  <input
                    value={alias}
                    onChange={(e) => setAlias(e.target.value)}
                    placeholder="el10"
                    maxLength={20}
                    className="mt-1 w-full bg-ink-900/60 border border-white/10 rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-accent-gold/50"
                  />
                </div>
                {status === 'error' && (
                  <div className="text-xs text-red-400 font-mono">{errorMsg}</div>
                )}
                <button
                  type="submit"
                  disabled={status === 'sending' || !SUPABASE_CONFIGURED}
                  className="w-full bg-accent-gold text-ink-900 font-semibold rounded-full py-3 hover:bg-yellow-300 transition-colors disabled:opacity-40"
                >
                  {status === 'sending' ? 'Sending…' : 'Email me a link →'}
                </button>
              </form>
            )}

            <div className="mt-6 pt-6 border-t border-white/5 grid grid-cols-3 gap-2 text-center text-[10px] text-slate-500 font-mono">
              <div><div className="text-white text-base font-display font-bold">100</div>exact score</div>
              <div><div className="text-white text-base font-display font-bold">60</div>winner + gap</div>
              <div><div className="text-white text-base font-display font-bold">30</div>winner only</div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
