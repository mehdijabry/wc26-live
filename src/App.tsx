import { useEffect, lazy, Suspense, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Navigation } from './components/Navigation'
import { StickyCountdown } from './components/StickyCountdown'
import { Hero } from './components/Hero'
import { Groups } from './components/Groups'
import { Schedule } from './components/Schedule'
import { Footer } from './components/Footer'
import { BottomNav } from './components/BottomNav'
import { LiveTicker } from './components/LiveTicker'
import { useAuth } from './store/auth'
import { usePredictions } from './store/predictions'
import { LottieLoader } from './components/LottieLoader'

// Heavy / below-the-fold sections are lazy-loaded so the first paint stays light.
// This dropped initial JS by ~40% in the production build measured locally.
const Bracket = lazy(() => import('./components/Bracket').then((m) => ({ default: m.Bracket })))
const Stadiums = lazy(() => import('./components/Stadiums').then((m) => ({ default: m.Stadiums })))
const Predictions = lazy(() => import('./components/Predictions').then((m) => ({ default: m.Predictions })))
const Players = lazy(() => import('./components/Players').then((m) => ({ default: m.Players })))
const Leaderboard = lazy(() => import('./components/Leaderboard').then((m) => ({ default: m.Leaderboard })))
const DailyMatches = lazy(() => import('./components/DailyMatches').then((m) => ({ default: m.DailyMatches })))
const BracketWizard = lazy(() => import('./components/BracketWizard').then((m) => ({ default: m.BracketWizard })))
const PublicProfile = lazy(() => import('./components/PublicProfile').then((m) => ({ default: m.PublicProfile })))
const AtlasLions = lazy(() => import('./components/AtlasLions').then((m) => ({ default: m.AtlasLions })))

function App() {
  const authInit = useAuth((s) => s.init)
  const user = useAuth((s) => s.user)
  const completingSignIn = useAuth((s) => s.completingSignIn)
  const authError = useAuth((s) => s.authError)
  const dismissAuthError = useAuth((s) => s.dismissAuthError)
  const syncFromCloud = usePredictions((s) => s.syncFromCloud)
  const pushLocalToCloud = usePredictions((s) => s.pushLocalToCloud)
  // Show the intro splash once per browser session (sessionStorage). Resets
  // on tab close so repeat visitors in the same session don't see it twice.
  const [intro, setIntro] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false
    return sessionStorage.getItem('wc26:introSeen') !== '1'
  })
  useEffect(() => {
    if (!intro) return
    const t = setTimeout(() => {
      setIntro(false)
      try { sessionStorage.setItem('wc26:introSeen', '1') } catch { /* ignore */ }
    }, 1800)
    return () => clearTimeout(t)
  }, [intro])

  // Init auth on mount
  useEffect(() => {
    authInit()
  }, [authInit])

  // When user logs in: push any local picks to cloud, then pull
  useEffect(() => {
    if (!user) return
    ;(async () => {
      await pushLocalToCloud()
      await syncFromCloud()
    })()
  }, [user, pushLocalToCloud, syncFromCloud])

  // Simple path-based routing for public profile pages /u/:slug
  const profileMatch = window.location.pathname.match(/^\/u\/([\w-]+)$/)
  if (profileMatch) {
    return (
      <Suspense fallback={<div className="min-h-svh flex items-center justify-center text-slate-500 text-sm">Loading profile…</div>}>
        <PublicProfile slug={profileMatch[1]} />
      </Suspense>
    )
  }

  return (
    <div className="min-h-svh pb-20 md:pb-0">
      {/* Intro splash — WC26 emblem + Pressing 90' lockup fading in/out.
          Plays once per session, mirrors the Fernani Fabric splitter intro. */}
      <AnimatePresence>
        {intro && (
          <motion.div
            key="wc26-intro"
            initial={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.55, ease: 'easeOut' }}
            className="fixed inset-0 z-[80] bg-paper flex flex-col items-center justify-center"
          >
            <motion.img
              src="/wc26-emblem.svg"
              alt=""
              initial={{ scale: 0.85, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ duration: 0.8, ease: 'easeOut' }}
              className="w-24 h-24 sm:w-28 sm:h-28 drop-shadow-[0_8px_30px_rgba(212,175,55,0.25)]"
            />
            <motion.div
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7, delay: 0.45 }}
              className="mt-6 text-center"
            >
              <div className="font-display font-bold text-2xl sm:text-3xl tracking-tight text-marine-950">
                WC<span className="text-accent-gold">26</span> Live
              </div>
              <div className="mt-2 font-mono text-[10px] sm:text-xs tracking-brand uppercase">
                <span className="text-slate-600">Pressing</span>{' '}
                <span className="text-accent-red font-semibold">90′</span>
              </div>
            </motion.div>
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: '120px' }}
              transition={{ duration: 0.9, delay: 0.7 }}
              className="mt-6 h-px bg-accent-gold/40"
            />
          </motion.div>
        )}
      </AnimatePresence>

      <Navigation />
      <StickyCountdown />
      <LiveTicker />
      <main>
        <Hero />
        <Groups />
        <Schedule />
        <Suspense fallback={<SectionSkeleton />}>
          <Bracket />
          <Stadiums />
          <Players />
          <Predictions />
          <BracketWizard />
          <Leaderboard />
          <DailyMatches />
        </Suspense>
      </main>
      <Footer />
      <BottomNav />
      <Suspense fallback={null}>
        <AtlasLions />
      </Suspense>

      {/* Auth-callback overlay — keeps the home view from flashing as
          "not signed in" while Supabase exchanges the URL token. */}
      {completingSignIn && (
        <div className="fixed inset-0 z-[60] bg-slate-900/50 backdrop-blur-sm flex items-center justify-center">
          <div className="bg-white rounded-2xl px-8 py-6 shadow-xl flex flex-col items-center gap-2">
            <LottieLoader name="ball-spin" size={56} />
            <span className="text-sm text-slate-800 font-mono">Completing sign-in…</span>
          </div>
        </div>
      )}

      {/* OAuth provider error — Supabase / Google round-trip failure.
          We surface the actual message instead of silently dropping the
          user back to a logged-out home; otherwise it looks like the
          sign-in just didn't happen, which is what the user reported. */}
      {authError && (
        <div className="fixed top-20 inset-x-0 z-[70] flex justify-center px-4 pointer-events-none">
          <div className="pointer-events-auto max-w-xl w-full bg-red-50 border border-red-200 rounded-2xl shadow-lg p-4 flex items-start gap-3">
            <div className="shrink-0 mt-0.5">
              <div className="w-8 h-8 rounded-full bg-red-100 text-red-600 flex items-center justify-center text-sm font-bold">!</div>
            </div>
            <div className="min-w-0 flex-1">
              <div className="font-semibold text-red-800 text-sm">Sign-in failed</div>
              <div className="text-xs text-red-700 mt-1 leading-relaxed break-words">{authError}</div>
              <div className="text-[11px] text-red-600/80 mt-2">
                Likely cause: the Google OAuth redirect URI doesn't match Supabase's callback.
                Check Google Cloud Console → Credentials → OAuth client → Authorized redirect URIs
                includes <code className="font-mono bg-red-100 px-1 rounded">https://ssvvojhxyotlbcdosiog.supabase.co/auth/v1/callback</code>
              </div>
            </div>
            <button
              onClick={dismissAuthError}
              aria-label="Dismiss"
              className="shrink-0 w-7 h-7 rounded-full text-red-500 hover:bg-red-100 flex items-center justify-center text-lg leading-none"
            >
              ×
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function SectionSkeleton() {
  return (
    <div className="py-20 sm:py-28 border-t border-slate-200/70">
      <div className="container max-w-6xl mx-auto px-6 flex flex-col items-center">
        <LottieLoader name="ball-spin" size={72} caption="Loading…" />
      </div>
    </div>
  )
}

export default App
