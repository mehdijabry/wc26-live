import { motion, AnimatePresence } from 'framer-motion'
import { useState } from 'react'
import { useAuth } from '../store/auth'
import { SUPABASE_CONFIGURED } from '../lib/supabase'

type Mode = 'signup' | 'login' | 'magic' | 'reset'

export function AuthModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const {
    signUpWithPassword,
    signInWithPassword,
    signInWithMagicLink,
    signInWithGoogle,
    resetPassword,
  } = useAuth()

  const [mode, setMode] = useState<Mode>('signup')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [alias, setAlias] = useState('')
  const [status, setStatus] = useState<'idle' | 'busy' | 'sent' | 'needsConfirm' | 'error' | 'success'>('idle')
  const [errorMsg, setErrorMsg] = useState('')

  function reset() {
    setStatus('idle')
    setErrorMsg('')
  }

  function setError(msg: string) {
    setStatus('error')
    setErrorMsg(msg)
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setStatus('busy')
    setErrorMsg('')

    if (mode === 'signup') {
      const { error, needsConfirm } = await signUpWithPassword(email, password, alias || undefined)
      if (error) return setError(error)
      if (needsConfirm) return setStatus('needsConfirm')
      setStatus('success')
      setTimeout(onClose, 800)
    }
    if (mode === 'login') {
      const { error } = await signInWithPassword(email, password)
      if (error) return setError(error)
      setStatus('success')
      setTimeout(onClose, 800)
    }
    if (mode === 'magic') {
      const { error } = await signInWithMagicLink(email, alias || undefined)
      if (error) return setError(error)
      setStatus('sent')
    }
    if (mode === 'reset') {
      const { error } = await resetPassword(email)
      if (error) return setError(error)
      setStatus('sent')
    }
  }

  async function onGoogle() {
    setStatus('busy')
    const { error } = await signInWithGoogle()
    if (error) setError(error)
    // On success, browser redirects to Google → comes back → onAuthStateChange triggers
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="fixed inset-0 z-50 bg-ink-900/80 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto"
        >
          <motion.div
            initial={{ scale: 0.95, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.95, opacity: 0 }}
            onClick={(e) => e.stopPropagation()}
            className="glass rounded-3xl p-8 max-w-md w-full ring-glow my-auto"
          >
            <div className="flex items-start justify-between mb-5">
              <div>
                <div className="text-xs uppercase tracking-widest text-accent-gold font-mono">
                  {mode === 'reset' ? 'Reset' : mode === 'magic' ? 'Magic link' : mode === 'login' ? 'Sign in' : 'Sign up'}
                </div>
                <div className="font-display font-bold text-3xl mt-1">
                  {mode === 'reset' ? 'Reset your password' :
                   mode === 'magic' ? 'One-click sign in' :
                   mode === 'login' ? 'Welcome back' :
                   'Save your bracket'}
                </div>
              </div>
              <button onClick={onClose} className="text-slate-500 hover:text-white text-xl w-8 h-8 rounded-full hover:bg-white/10 transition-colors flex items-center justify-center">×</button>
            </div>

            {!SUPABASE_CONFIGURED && (
              <div className="mb-4 p-3 rounded-lg bg-accent-red/10 border border-accent-red/30 text-xs text-red-300">
                Supabase isn't configured. Add env vars in <code>.env.local</code>.
              </div>
            )}

            {/* Mode tabs (signup / login) */}
            {(mode === 'signup' || mode === 'login') && (
              <div className="flex gap-2 mb-5 p-1 bg-ink-900/40 rounded-full">
                <button
                  onClick={() => { setMode('signup'); reset() }}
                  className={`flex-1 px-3 py-1.5 rounded-full text-sm transition-all ${mode === 'signup' ? 'bg-accent-gold text-ink-900 font-semibold' : 'text-slate-400'}`}
                >
                  Sign up
                </button>
                <button
                  onClick={() => { setMode('login'); reset() }}
                  className={`flex-1 px-3 py-1.5 rounded-full text-sm transition-all ${mode === 'login' ? 'bg-accent-gold text-ink-900 font-semibold' : 'text-slate-400'}`}
                >
                  Log in
                </button>
              </div>
            )}

            {/* Google OAuth button */}
            {(mode === 'signup' || mode === 'login') && (
              <>
                <button
                  type="button"
                  onClick={onGoogle}
                  disabled={status === 'busy' || !SUPABASE_CONFIGURED}
                  className="w-full flex items-center justify-center gap-2 bg-white text-ink-900 font-semibold rounded-full py-2.5 hover:bg-slate-100 transition-colors disabled:opacity-40 mb-4"
                >
                  <GoogleIcon />
                  <span>Continue with Google</span>
                </button>
                <div className="flex items-center gap-3 mb-4 text-[10px] text-slate-600 font-mono uppercase tracking-widest">
                  <div className="flex-1 h-px bg-white/5" /> or <div className="flex-1 h-px bg-white/5" />
                </div>
              </>
            )}

            {/* Sent / confirm states */}
            {status === 'sent' && (
              <div className="text-center py-6">
                <div className="text-5xl mb-3">📬</div>
                <div className="font-display text-xl text-white mb-2">Check your inbox</div>
                <div className="text-sm text-slate-400">
                  {mode === 'reset' ? 'We sent a password reset link to' : 'We sent a magic link to'}{' '}
                  <span className="text-accent-gold font-mono">{email}</span>.
                </div>
              </div>
            )}

            {status === 'needsConfirm' && (
              <div className="text-center py-6">
                <div className="text-5xl mb-3">📬</div>
                <div className="font-display text-xl text-white mb-2">One more step</div>
                <div className="text-sm text-slate-400 mb-4">
                  We sent a confirmation email to <span className="text-accent-gold font-mono">{email}</span>.
                  Click the link to activate your account. After that you can log in with your password anytime.
                </div>
              </div>
            )}

            {status === 'success' && (
              <div className="text-center py-6">
                <div className="text-5xl mb-3">✅</div>
                <div className="font-display text-xl text-white">Welcome to WC26 Hub.</div>
              </div>
            )}

            {/* Form */}
            {status !== 'sent' && status !== 'needsConfirm' && status !== 'success' && (
              <form onSubmit={onSubmit} className="space-y-3">
                <Field
                  label="Email"
                  type="email"
                  required
                  value={email}
                  onChange={setEmail}
                  placeholder="you@domain.com"
                />

                {mode === 'signup' && (
                  <Field
                    label="Alias"
                    optional
                    value={alias}
                    onChange={setAlias}
                    placeholder="el10"
                    maxLength={20}
                  />
                )}

                {(mode === 'signup' || mode === 'login') && (
                  <Field
                    label="Password"
                    type="password"
                    required
                    value={password}
                    onChange={setPassword}
                    placeholder={mode === 'signup' ? 'min. 8 characters' : '••••••••'}
                    minLength={mode === 'signup' ? 8 : undefined}
                  />
                )}

                {status === 'error' && (
                  <div className="text-xs text-red-400 font-mono px-1">{errorMsg}</div>
                )}

                <button
                  type="submit"
                  disabled={status === 'busy' || !SUPABASE_CONFIGURED}
                  className="w-full bg-accent-gold text-ink-900 font-semibold rounded-full py-3 hover:bg-yellow-300 transition-colors disabled:opacity-40 mt-2"
                >
                  {status === 'busy' ? 'Working…' :
                   mode === 'signup' ? 'Create account →' :
                   mode === 'login' ? 'Sign in →' :
                   mode === 'magic' ? 'Email me a link →' :
                   'Send reset link →'}
                </button>

                {/* Auxiliary links */}
                <div className="pt-2 flex items-center justify-between text-[11px] font-mono text-slate-500">
                  {mode === 'login' && (
                    <button type="button" onClick={() => { setMode('reset'); reset() }} className="hover:text-accent-gold">
                      Forgot password?
                    </button>
                  )}
                  {(mode === 'signup' || mode === 'login') && (
                    <button type="button" onClick={() => { setMode('magic'); reset() }} className="hover:text-accent-gold ml-auto">
                      Use magic link instead
                    </button>
                  )}
                  {(mode === 'magic' || mode === 'reset') && (
                    <button type="button" onClick={() => { setMode('login'); reset() }} className="hover:text-accent-gold">
                      ← Back to sign in
                    </button>
                  )}
                </div>
              </form>
            )}

            <div className="mt-6 pt-4 border-t border-white/5 grid grid-cols-3 gap-2 text-center text-[10px] text-slate-500 font-mono">
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

function Field({
  label, type = 'text', required, value, onChange, placeholder, optional, maxLength, minLength,
}: {
  label: string
  type?: string
  required?: boolean
  value: string
  onChange: (v: string) => void
  placeholder?: string
  optional?: boolean
  maxLength?: number
  minLength?: number
}) {
  return (
    <div>
      <label className="text-xs uppercase tracking-widest text-slate-500 font-mono">
        {label} {optional && <span className="text-slate-700">(optional)</span>}
      </label>
      <input
        type={type}
        required={required}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        maxLength={maxLength}
        minLength={minLength}
        className="mt-1 w-full bg-ink-900/60 border border-white/10 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:border-accent-gold/50"
      />
    </div>
  )
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24">
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
    </svg>
  )
}
