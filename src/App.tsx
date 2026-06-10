import { useEffect, useState, lazy, Suspense } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Routes, Route, Navigate, useLocation, useParams, Link } from 'react-router-dom'
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
import { Ad, AdPair } from './components/AdSlot'
import { AmazonShelf } from './components/AmazonShelf'
import { PushOptIn } from './components/PushOptIn'
import { IosInstallPrompt } from './components/IosInstallPrompt'

// Each section is its own page now — lazy-loaded per route so a slow
// chunk doesn't block sibling pages. The previous design had ALL lazy
// components inside a single <Suspense>; if any one resolved late, the
// entire `#bracket-predict` (and friends) anchor was missing from the
// DOM, which is why "My Bracket" navigation appeared to do nothing.
const Stadiums = lazy(() => import('./components/Stadiums').then((m) => ({ default: m.Stadiums })))
const Predictions = lazy(() => import('./components/Predictions').then((m) => ({ default: m.Predictions })))
const Leaderboard = lazy(() => import('./components/Leaderboard').then((m) => ({ default: m.Leaderboard })))
const DailyMatches = lazy(() => import('./components/DailyMatches').then((m) => ({ default: m.DailyMatches })))
const BracketWizard = lazy(() => import('./components/BracketWizard').then((m) => ({ default: m.BracketWizard })))
const PublicProfile = lazy(() => import('./components/PublicProfile').then((m) => ({ default: m.PublicProfile })))
const AtlasLions = lazy(() => import('./components/AtlasLions').then((m) => ({ default: m.AtlasLions })))
const About = lazy(() => import('./components/pages/About').then((m) => ({ default: m.About })))
const Contact = lazy(() => import('./components/pages/Contact').then((m) => ({ default: m.Contact })))
const Privacy = lazy(() => import('./components/pages/Privacy').then((m) => ({ default: m.Privacy })))
const Terms = lazy(() => import('./components/pages/Terms').then((m) => ({ default: m.Terms })))
const Watch = lazy(() => import('./components/pages/Watch').then((m) => ({ default: m.Watch })))
const WatchCountry = lazy(() => import('./components/pages/WatchCountry').then((m) => ({ default: m.WatchCountry })))
const TeamPage = lazy(() => import('./components/pages/TeamPage').then((m) => ({ default: m.TeamPage })))
const Explained = lazy(() => import('./components/pages/Explained').then((m) => ({ default: m.Explained })))
const ExplainedTopic = lazy(() => import('./components/pages/ExplainedTopic').then((m) => ({ default: m.ExplainedTopic })))
const AdminPanel = lazy(() => import('./components/pages/AdminPanel').then((m) => ({ default: m.AdminPanel })))

function App() {
  const authInit = useAuth((s) => s.init)
  const user = useAuth((s) => s.user)
  const completingSignIn = useAuth((s) => s.completingSignIn)
  const authError = useAuth((s) => s.authError)
  const dismissAuthError = useAuth((s) => s.dismissAuthError)
  const syncFromCloud = usePredictions((s) => s.syncFromCloud)
  const pushLocalToCloud = usePredictions((s) => s.pushLocalToCloud)
  const location = useLocation()

  // Intro splash — same setup as before the domain migration. React
  // motion.div, cream background matching the rest of the site,
  // 1.2s visible, 0.4s fade. No HTML boot splash, no double-render,
  // no CSS keyframes fighting Framer Motion.
  const [intro, setIntro] = useState<boolean>(typeof window !== 'undefined')
  useEffect(() => {
    if (!intro) return
    const t = setTimeout(() => setIntro(false), 1200)
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
      {/* Intro splash — original cream-themed reveal. */}
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

      {/* The admin panel is a self-contained operator console with its
          own header, footer, and theme — it should NOT render the main
          site Navigation / countdown / live-ticker / Footer underneath
          it. Those are top-level fixed elements with z-index 50, which
          would otherwise overlap the admin tabs and intercept clicks. */}
      {!location.pathname.startsWith('/admin-panel-') && (
        <>
          <Navigation />
          <StickyCountdown />
          <LiveTicker />
        </>
      )}

      {/* Pushes all page content down by the safe-area top inset when the
          site runs as an installed PWA (iOS adds env(safe-area-inset-top)
          ~47-59px once launched from the Home Screen icon). In a normal
          browser the inset is 0 so nothing changes. Without this the Sign
          in button + WC26 logo slide under the iPhone notch / Dynamic
          Island. */}
      <main style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}>
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
          {/* /squads (the player WC26-Live-Score grid) was removed in the
              2026-06-09 reorg. Redirecting any bookmark/old-link traffic
              to /wc26 so visitors landing on the old URL still get team
              info instead of a 404. */}
          <Route path="/squads" element={<Navigate to="/wc26" replace />} />
          <Route path="/board" element={<BoardPage />} />
          <Route path="/stadiums" element={<StadiumsPage />} />
          <Route path="/u/:slug" element={<ProfilePage />} />
          {/* /watch + /watch/:country — SEO trap for the 'where to watch
              world cup 2026 in <country>' search wave. Index + 22
              country-specific pages. Lazy-loaded since they're a side
              entry point, not part of the core read flow. */}
          <Route
            path="/watch"
            element={
              <Suspense fallback={<PageSkeleton caption="Loading countries…" />}>
                <Watch />
              </Suspense>
            }
          />
          <Route
            path="/watch/:country"
            element={
              <Suspense fallback={<PageSkeleton caption="Loading broadcasters…" />}>
                <WatchCountry />
              </Suspense>
            }
          />
          {/* /team/:abbr — standalone preview page per WC2026 nation.
              SEO-facing twin of the TeamSheet modal; every section
              renders inline so Google can index the whole story per
              team. 48 indexable URLs out of the box. */}
          <Route
            path="/team/:abbr"
            element={
              <Suspense fallback={<PageSkeleton caption="Loading team…" />}>
                <TeamPage />
              </Suspense>
            }
          />
          {/* Admin panel — obscured slug, real auth is the password.
              Pages-level <Suspense> wraps it without the global nav,
              so the panel renders as its own standalone shell. */}
          <Route
            path="/admin-panel-1992"
            element={
              <Suspense fallback={<PageSkeleton caption="Loading admin…" />}>
                <AdminPanel />
              </Suspense>
            }
          />
          {/* /explained — FAQ knowledge base. Index page lists all
              questions with one-line answers + FAQPage JSON-LD (covers
              'people also ask' surfaces). Each /explained/:slug page
              is its own indexable target for direct Google hits like
              'how does the best third placed teams rule work'. */}
          <Route
            path="/explained"
            element={
              <Suspense fallback={<PageSkeleton caption="Loading explainers…" />}>
                <Explained />
              </Suspense>
            }
          />
          <Route
            path="/explained/:slug"
            element={
              <Suspense fallback={<PageSkeleton caption="Loading explainer…" />}>
                <ExplainedTopic />
              </Suspense>
            }
          />
          {/* Static pages — required for AdSense + general trust. */}
          <Route
            path="/about"
            element={
              <Suspense fallback={<PageSkeleton caption="Loading…" />}>
                <About />
              </Suspense>
            }
          />
          <Route
            path="/contact"
            element={
              <Suspense fallback={<PageSkeleton caption="Loading…" />}>
                <Contact />
              </Suspense>
            }
          />
          <Route
            path="/privacy"
            element={
              <Suspense fallback={<PageSkeleton caption="Loading…" />}>
                <Privacy />
              </Suspense>
            }
          />
          <Route
            path="/terms"
            element={
              <Suspense fallback={<PageSkeleton caption="Loading…" />}>
                <Terms />
              </Suspense>
            }
          />
          <Route path="*" element={<HomePage />} />
        </Routes>
      </main>

      {/* Same gating as the top chrome — keep Footer + BottomNav off
          the admin panel so it stays a clean standalone console. */}
      {!location.pathname.startsWith('/admin-panel-') && (
        <>
          <Footer />
          <BottomNav />
        </>
      )}

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
      {/* Push opt-in card — only renders when the browser supports Web
          Push AND the user hasn't dismissed it this session. Sits right
          under the hero so it's the first call to action before scores. */}
      <PushOptIn />
      {/* Mid-page slot: double 300x250 banner pair instead of a single
          slot. Doubles impressions-per-pageview to compensate for the
          revenue drop we took switching away from Adsterra's native
          banner format (which auctions dating / clickbait spam). */}
      <div className="container max-w-6xl mx-auto px-6 my-6">
        <AdPair />
      </div>
      <Suspense fallback={<PageSkeleton caption="Loading today's matches…" />}>
        <DailyMatches />
      </Suspense>
      {/* Amazon affiliate shelf — editorial 'gear we like' row. Replaces
          one Adsterra footer slot. Direct CPA, no third-party creative
          review needed (we hand-pick every product). */}
      <AmazonShelf heading="Football gear we like" />
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
      <div className="container max-w-6xl mx-auto px-6 my-6">
        <AdPair />
      </div>
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
