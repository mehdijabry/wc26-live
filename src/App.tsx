import { useEffect, lazy, Suspense, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Routes, Route, useLocation, useParams, Link } from 'react-router-dom'
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
import { Ad } from './components/AdSlot'
import { IosInstallPrompt } from './components/IosInstallPrompt'

// Each section is its own page now — lazy-loaded per route so a slow
// chunk doesn't block sibling pages. The previous design had ALL lazy
// components inside a single <Suspense>; if any one resolved late, the
// entire `#bracket-predict` (and friends) anchor was missing from the
// DOM, which is why "My Bracket" navigation appeared to do nothing.
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
  const location = useLocation()

  // Intro splash now uses localStorage so it only ever plays on the
  // first visit per browser, not on every reload. Was sessionStorage
  // which fired every new tab — annoying on a multi-tab workflow.
  // Shortened to 1.2s (was 1.8s) so it doesn't drag.
  const [intro, setIntro] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false
    return localStorage.getItem('wc26:introSeen') !== '1'
  })
  useEffect(() => {
    if (!intro) return
    const t = setTimeout(() => {
      setIntro(false)
      try { localStorage.setItem('wc26:introSeen', '1') } catch { /* ignore */ }
    }, 1200)
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

  // Auto-scroll to top on route change — feels like a real multi-page app
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' })
  }, [location.pathname])

  return (
    <div className="min-h-svh pb-20 md:pb-0">
      {/* Intro splash — once per device, 1.2s */}
      <AnimatePresence>
        {intro && (
          <motion.div
            key="wc26-intro"
            initial={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.4, ease: 'easeOut' }}
            className="fixed inset-0 z-[80] bg-paper flex flex-col items-center justify-center"
          >
            <motion.img
              src="/wc26-emblem.svg"
              alt=""
              initial={{ scale: 0.85, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ duration: 0.5, ease: 'easeOut' }}
              className="w-24 h-24 sm:w-28 sm:h-28 drop-shadow-[0_8px_30px_rgba(212,175,55,0.25)]"
            />
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.45, delay: 0.25 }}
              className="mt-5 text-center"
            >
              <div className="font-display font-bold text-2xl sm:text-3xl tracking-tight text-marine-950">
                WC<span className="text-accent-gold">26</span> Live
              </div>
              <div className="mt-1.5 font-mono text-[10px] sm:text-xs tracking-brand uppercase">
                <span className="text-slate-600">Pressing</span>{' '}
                <span className="text-accent-red font-semibold">90′</span>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <Navigation />
      <StickyCountdown />
      <LiveTicker />

      <main>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/wc26" element={<WC26Page />} />
          {/* WC26 Prediction = full bracket wizard + match-by-match
              predictions stacked in one page. Old /bracket and /predict
              URLs redirect here so any shared link still works. */}
          <Route path="/predictions" element={<PredictionsPage />} />
          <Route path="/bracket" element={<PredictionsPage />} />
          <Route path="/predict" element={<PredictionsPage />} />
          <Route path="/today" element={<TodayPage />} />
          <Route path="/squads" element={<SquadsPage />} />
          <Route path="/board" element={<BoardPage />} />
          <Route path="/stadiums" element={<StadiumsPage />} />
          <Route path="/u/:slug" element={<ProfilePage />} />
          <Route path="*" element={<HomePage />} />
        </Routes>
      </main>

      <Footer />
      <BottomNav />

      {/* Floating "Add to Home Screen" prompt for iPhone Safari users.
          Self-gates: only shows on iOS Safari, not in standalone mode,
          not if previously dismissed. */}
      <IosInstallPrompt />

      {/* Konami code Atlas Lions easter egg — keep loaded everywhere */}
      <Suspense fallback={null}>
        <AtlasLions />
      </Suspense>

      {completingSignIn && (
        <div className="fixed inset-0 z-[60] bg-slate-900/50 backdrop-blur-sm flex items-center justify-center">
          <div className="bg-white rounded-2xl px-8 py-6 shadow-xl flex flex-col items-center gap-2">
            <LottieLoader name="ball-spin" size={56} />
            <span className="text-sm text-slate-800 font-mono">Completing sign-in…</span>
          </div>
        </div>
      )}

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

/* -------------------------------------------------------------------------- */
/* Routes — each page has its own Suspense so they load independently         */
/* -------------------------------------------------------------------------- */

function PageSkeleton({ caption }: { caption?: string }) {
  return (
    <div className="py-32 flex flex-col items-center justify-center">
      <LottieLoader name="ball-spin" size={80} caption={caption ?? 'Loading…'} />
    </div>
  )
}

function HomePage() {
  return (
    <>
      <Hero />
      {/* Native ad between hero news + daily matches — looks like another
          news card so it doesn't break the scroll. */}
      <div className="container max-w-6xl mx-auto px-6"><Ad slot="home-mid" /></div>
      <Suspense fallback={<PageSkeleton caption="Loading today's matches…" />}>
        <DailyMatches />
      </Suspense>
      <WC26PromoSection />
      <div className="container max-w-6xl mx-auto px-6"><Ad slot="home-footer" /></div>
    </>
  )
}

function WC26Page() {
  return (
    <>
      <Groups />
      <div className="container max-w-6xl mx-auto px-6"><Ad slot="wc26-mid" /></div>
      <Schedule />
    </>
  )
}

/**
 * Hero card on the home page that funnels visitors into the WC-specific
 * hub (groups, schedule, bracket predictor). Keeps the WC content
 * accessible without forcing it on everyone landing on /.
 */
function WC26PromoSection() {
  return (
    <section className="py-16 sm:py-24 border-t border-slate-200/70 bg-gradient-to-b from-paper to-cream/50">
      <div className="container max-w-6xl mx-auto px-6">
        <div className="rounded-3xl bg-marine-950 text-cream p-8 sm:p-12 relative overflow-hidden">
          {/* Background emblem */}
          <img
            src="/wc26-emblem.svg"
            aria-hidden
            className="absolute -right-8 -bottom-8 w-64 h-64 opacity-10 pointer-events-none"
          />

          <div className="relative max-w-2xl">
            <div className="text-[11px] tracking-[0.22em] uppercase font-mono text-accent-gold mb-3">
              🏆 The main event
            </div>
            <h2 className="font-display font-bold text-3xl sm:text-5xl leading-tight tracking-tight">
              WC<span className="text-accent-gold">26</span> · <span className="italic text-cream/80">The whole tournament hub</span>
            </h2>
            <p className="mt-4 text-cream/80 text-base sm:text-lg max-w-xl leading-relaxed">
              All 12 groups · the live schedule · countdown to kickoff · the full bracket predictor with PNG export.
              Everything World Cup 26 in one place.
            </p>

            <div className="mt-8 flex flex-wrap gap-3">
              <Link
                to="/wc26"
                className="inline-flex items-center gap-2 px-6 py-3 rounded-full bg-accent-gold text-ink-900 font-semibold text-sm hover:bg-yellow-300 transition-colors"
              >
                Enter the WC26 Hub →
              </Link>
              <Link
                to="/predictions"
                className="inline-flex items-center gap-2 px-6 py-3 rounded-full bg-white/10 hover:bg-white/20 text-cream text-sm font-semibold transition-colors"
              >
                🏆 Make my prediction
              </Link>
              <Link
                to="/today"
                className="inline-flex items-center gap-2 px-6 py-3 rounded-full bg-white/10 hover:bg-white/20 text-cream text-sm font-semibold transition-colors"
              >
                ⚽ Today&apos;s matches
              </Link>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

/**
 * WC26 Prediction — merged 'Predict' (match-by-match scoring) and
 * 'Bracket' (full-tournament wizard) into one page, per user request.
 * Bracket goes first because it's the headline feature; the individual
 * match predictions live below for fans who want to score every game.
 */
function PredictionsPage() {
  return (
    <>
      <Suspense fallback={<PageSkeleton caption="Loading the bracket predictor…" />}>
        <BracketWizard />
      </Suspense>
      <div className="container max-w-6xl mx-auto px-6"><Ad slot="predict-mid" /></div>
      <Suspense fallback={<PageSkeleton caption="Loading match predictions…" />}>
        <Predictions />
      </Suspense>
    </>
  )
}

function TodayPage() {
  return (
    <>
      <Suspense fallback={<PageSkeleton caption="Loading today's fixtures…" />}>
        <DailyMatches />
      </Suspense>
      <div className="container max-w-6xl mx-auto px-6"><Ad slot="today-strip" /></div>
    </>
  )
}

function SquadsPage() {
  return (
    <>
      <Suspense fallback={<PageSkeleton caption="Loading squads…" />}>
        <Players />
      </Suspense>
      <div className="container max-w-6xl mx-auto px-6"><Ad slot="squads-footer" /></div>
    </>
  )
}

function BoardPage() {
  return (
    <>
      <Suspense fallback={<PageSkeleton caption="Loading the leaderboard…" />}>
        <Leaderboard />
      </Suspense>
      <div className="container max-w-6xl mx-auto px-6"><Ad slot="board-mid" /></div>
    </>
  )
}

function StadiumsPage() {
  return (
    <Suspense fallback={<PageSkeleton caption="Loading host venues…" />}>
      <Stadiums />
    </Suspense>
  )
}

function ProfilePage() {
  const { slug } = useParams<{ slug: string }>()
  if (!slug) return <PageSkeleton caption="Profile not found" />
  return (
    <Suspense fallback={<PageSkeleton caption="Loading profile…" />}>
      <PublicProfile slug={slug} />
    </Suspense>
  )
}

export default App
