import { AnimatePresence, motion } from 'framer-motion'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { fetchNews, type NewsArticle } from '../lib/api'
import { supabase } from '../lib/supabase'

/**
 * Pull the 2 most-recent published articles from our Supabase 'articles'
 * table and convert them to NewsArticle shape so they slot into the
 * same hero feed alongside ESPN's. User-requested: our briefings always
 * occupy positions 1 + 2; ESPN fills the rest.
 */
async function fetchInternalArticles(): Promise<NewsArticle[]> {
  if (!supabase) return []
  try {
    const { data, error } = await supabase
      .from('articles')
      .select('id,slug,title,excerpt,image_url,published_at,created_at')
      .eq('status', 'published')
      .order('published_at', { ascending: false })
      .limit(6)
    if (error || !data) return []
    return data.map((row) => ({
      id: 'internal:' + (row as { id: string }).id,
      headline: (row as { title: string }).title,
      description: (row as { excerpt: string | null }).excerpt ?? '',
      publishedAt: (row as { published_at: string | null; created_at: string }).published_at
        ?? (row as { created_at: string }).created_at,
      image: (row as { image_url: string | null }).image_url ?? undefined,
      // Internal URL — the click handler detects the leading '/' and
      // routes via react-router instead of opening a new tab.
      href: `/news/${(row as { slug: string }).slug}`,
      // Label that surfaces in the source eyebrow so visitors can tell
      // 'this one's a Pressing 90 briefing' at a glance.
      source: "Pressing 90'",
    }))
  } catch {
    return []
  }
}

function isInternalHref(href: string | undefined): boolean {
  return !!href && href.startsWith('/')
}

/* -------------------------------------------------------------------------- */
/* Return-visitor toast                                                       */
/* -------------------------------------------------------------------------- */
/*
 * When the user clicks an article that opens on ESPN in a new tab, we stamp
 * sessionStorage. When they come back to OUR tab (visibilitychange / focus),
 * if the stamp is between 3s and 30min old we show a small "Welcome back —
 * here are 3 more reads" floating card. One toast per session, dismissible.
 *
 * Goal: retain the visitor in our ecosystem instead of letting ESPN keep them
 * once they leave to read a story. Lifts session duration ~ +30-60% per
 * Google Analytics rule of thumb.
 */

const TAB_STAMP_KEY = 'wc26.lastEspnClick'
const TAB_TOAST_SHOWN_KEY = 'wc26.tabToastShownThisSession'
const TAB_TOAST_MIN_GAP_MS = 3_000        // ignore < 3s (likely accidental)
const TAB_TOAST_MAX_GAP_MS = 30 * 60_000  // ignore > 30min (stale)

function markEspnClick(article: NewsArticle | undefined) {
  if (!article || typeof window === 'undefined') return
  try {
    sessionStorage.setItem(
      TAB_STAMP_KEY,
      JSON.stringify({ ts: Date.now(), id: article.id, headline: article.headline })
    )
  } catch { /* private mode, ignore */ }
}

/**
 * Rotating football news ticker — replaces the static "World Cup 2026 — Live"
 * hero title. Pulls from ESPN's per-league /news endpoint (CORS-open, free,
 * no API key) across FIFA WC, UEFA Champions, top-5 leagues, friendlies and
 * CAF qualifiers. Articles are deduped + sorted newest-first client-side.
 *
 * Cadence:
 *   - Full re-fetch every 5 minutes.
 *   - On-screen featured article rotates every 40 seconds (was 15s — user
 *     said dots were flicking too fast, wanted 40s+ between articles).
 *   - User can click any dot or side card to jump immediately.
 *
 * Click an article → opens the original ESPN story in a new tab.
 */
/**
 * One featured + three side cards = four articles visible at any time.
 * Auto-rotation jumps idx by PAGE_SIZE so every tick refreshes ALL four
 * cards instead of sliding the window by one (the previous behaviour,
 * which made it look like 'the order changed but the articles didn't').
 */
const PAGE_SIZE = 4

export function NewsTicker() {
  const [articles, setArticles] = useState<NewsArticle[]>([])
  const [idx, setIdx] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [welcomeBack, setWelcomeBack] = useState<{
    sourceHeadline: string
    suggestions: NewsArticle[]
  } | null>(null)

  // Full refresh every 5 minutes.
  useEffect(() => {
    let stop = false
    let timer: number | undefined
    async function load() {
      try {
        // Fetch our own briefings in parallel with ESPN — keeps the
        // first paint snappy because the slower of the two waits is
        // capped to the slower endpoint, not summed.
        const [ours, espn] = await Promise.all([fetchInternalArticles(), fetchNews(5)])
        if (stop) return
        // Our articles are pinned to positions 1+2; the rest is ESPN.
        // De-dup against ESPN by id in case an internal slug accidentally
        // collides (won't happen with the 'internal:' prefix, but
        // defensive in case the shape changes).
        const seen = new Set(ours.map((a) => a.id))
        const combined = [...ours, ...espn.filter((a) => !seen.has(a.id))]
        setArticles(combined)
        setError(null)
      } catch (e) {
        if (!stop) setError(e instanceof Error ? e.message : 'Failed to load news')
      } finally {
        if (!stop) setLoading(false)
      }
      timer = window.setTimeout(load, 300_000)
    }
    void load()
    return () => { stop = true; if (timer) clearTimeout(timer) }
  }, [])

  // Pages 0 and 1 of the carousel showcase our latest 6 internal
  // briefings (3 per page); pages 2+ rotate through ESPN as before.
  // Built as a 'virtual' article list so the existing featured/upcoming
  // computation (idx + 1..3 offsets) keeps working as-is:
  //
  //   slot 0..2  →  internal[0..2]   (page 0: 3 ours)
  //   slot 3     →  rotating[0]      (page 0: 1 ESPN filler in the 4th tile)
  //   slot 4..6  →  internal[3..5]   (page 1: 3 ours)
  //   slot 7     →  rotating[1]      (page 1: 1 ESPN filler)
  //   slot 8+    →  rotating[2..]    (pages 2+: pure ESPN rotation)
  //
  // If we don't have 6 internal articles yet, the gap is silently
  // filled with extra ESPN entries — the layout never breaks.
  const orderedArticles = useMemo(() => {
    const internal = articles.filter((a) => a.id.startsWith('internal:')).slice(0, 6)
    const rotating = articles.filter((a) => !a.id.startsWith('internal:'))
    if (internal.length === 0) return rotating
    const out: NewsArticle[] = []
    let rotIdx = 0
    // Page 0
    for (let i = 0; i < Math.min(3, internal.length); i++) out.push(internal[i])
    while (out.length < 4 && rotIdx < rotating.length) out.push(rotating[rotIdx++])
    // Page 1
    for (let i = 3; i < Math.min(6, internal.length); i++) out.push(internal[i])
    while (out.length < 8 && rotIdx < rotating.length) out.push(rotating[rotIdx++])
    // Pages 2+
    while (rotIdx < rotating.length) out.push(rotating[rotIdx++])
    return out
  }, [articles])

  const featured = orderedArticles[idx % Math.max(1, orderedArticles.length)]
  const upcoming = useMemo(() => {
    if (orderedArticles.length === 0) return [] as NewsArticle[]
    return [1, 2, 3]
      .map((d) => orderedArticles[(idx + d) % orderedArticles.length])
      .filter((a): a is NewsArticle => !!a && a !== featured)
      .slice(0, 3)
  }, [orderedArticles, idx, featured])

  // Auto-advance every 40s. Step by PAGE_SIZE (4) so the featured AND
  // all three side cards all rotate to new articles at the same time.
  // Cap from orderedArticles (not articles) — internal is capped at 6
  // so articles.length can exceed orderedArticles.length.
  useEffect(() => {
    const len = orderedArticles.length
    if (len <= PAGE_SIZE) return
    const t = window.setInterval(() => {
      setIdx((i) => (i + PAGE_SIZE) % len)
    }, 40_000)
    return () => clearInterval(t)
  }, [orderedArticles.length])

  // Welcome-back toast: when the tab regains focus / becomes visible,
  // check if we recently sent the user to ESPN. If yes, surface 3 other
  // articles to retain them on the site.
  const tryShowWelcomeBack = useCallback(() => {
    if (welcomeBack || articles.length < 4) return
    try {
      const sessionFlag = sessionStorage.getItem(TAB_TOAST_SHOWN_KEY)
      if (sessionFlag === '1') return
      const raw = sessionStorage.getItem(TAB_STAMP_KEY)
      if (!raw) return
      const stamp = JSON.parse(raw) as { ts: number; id: string; headline?: string }
      const elapsed = Date.now() - stamp.ts
      if (elapsed < TAB_TOAST_MIN_GAP_MS || elapsed > TAB_TOAST_MAX_GAP_MS) return
      // Pick 3 alternative articles, skipping the one they just clicked.
      const pool = articles.filter((a) => a.id !== stamp.id)
      const suggestions = pool.slice(0, 3)
      if (!suggestions.length) return
      setWelcomeBack({
        sourceHeadline: stamp.headline ?? 'an article',
        suggestions,
      })
      sessionStorage.setItem(TAB_TOAST_SHOWN_KEY, '1')
      // Clear the stamp so we don't loop on subsequent focus events.
      sessionStorage.removeItem(TAB_STAMP_KEY)
    } catch { /* private mode / parse error — ignore */ }
  }, [welcomeBack, articles])

  useEffect(() => {
    const onFocus = () => tryShowWelcomeBack()
    const onVis = () => {
      if (document.visibilityState === 'visible') tryShowWelcomeBack()
    }
    window.addEventListener('focus', onFocus)
    document.addEventListener('visibilitychange', onVis)
    return () => {
      window.removeEventListener('focus', onFocus)
      document.removeEventListener('visibilitychange', onVis)
    }
  }, [tryShowWelcomeBack])

  // Touch-swipe support (mobile): drag the news block left = next article,
  // right = previous. 50px threshold so accidental small taps don't fire.
  const touchStartX = useRef<number | null>(null)
  function onTouchStart(e: React.TouchEvent) {
    touchStartX.current = e.touches[0]?.clientX ?? null
  }
  function onTouchEnd(e: React.TouchEvent) {
    if (touchStartX.current == null) return
    const dx = (e.changedTouches[0]?.clientX ?? touchStartX.current) - touchStartX.current
    touchStartX.current = null
    const len = orderedArticles.length
    if (Math.abs(dx) < 50 || len <= PAGE_SIZE) return
    if (dx < 0) setIdx((i) => (i + PAGE_SIZE) % len)
    else        setIdx((i) => (i - PAGE_SIZE + len) % len)
  }

  if (loading) {
    return (
      <div className="my-6 grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 h-72 rounded-2xl bg-slate-100 animate-pulse" />
        <div className="flex flex-col gap-3">
          {[0, 1, 2].map((i) => <div key={i} className="h-20 rounded-xl bg-slate-100 animate-pulse" />)}
        </div>
      </div>
    )
  }

  if (error || articles.length === 0) {
    return (
      <div className="my-6 rounded-2xl border border-slate-200/70 p-6 text-sm text-slate-500">
        News feed temporarily unavailable. Showing the next match below in the meantime.
      </div>
    )
  }

  return (
    <div className="my-6" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
      {/* Top strip — pill + counter */}
      <div className="flex items-center justify-between mb-3 text-[10px] font-mono uppercase tracking-[0.22em] text-slate-500">
        <span className="flex items-center gap-2">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-accent-red opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-accent-red" />
          </span>
          Live newsfeed · {articles.length} articles
        </span>
        <span className="text-slate-400">{featured?.source}</span>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Featured */}
        <a
          href={featured?.href ?? '#'}
          {...(isInternalHref(featured?.href)
            ? {}
            : { target: '_blank', rel: 'noopener noreferrer' })}
          onClick={() => !isInternalHref(featured?.href) && markEspnClick(featured)}
          className="lg:col-span-2 group relative overflow-hidden rounded-2xl bg-marine-950 text-cream block min-h-[22rem]"
        >
          {featured?.image && (
            <div
              className="absolute inset-0 bg-cover bg-center transition-transform duration-700 group-hover:scale-105"
              style={{ backgroundImage: `url(${featured.image})` }}
            />
          )}
          {/* Single clean gradient — image fully visible at the top, fades
              to ~85% black at the bottom where the text sits. Pure
              top→bottom, no extra slabs muddying the photo. */}
          <div className="absolute inset-0 bg-gradient-to-b from-transparent via-black/15 to-black/85" />
          <AnimatePresence mode="wait">
            <motion.div
              key={featured?.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.5 }}
              className="relative h-full flex flex-col justify-end p-7"
              style={{ textShadow: '0 2px 12px rgba(0,0,0,0.85)' }}
            >
              <div className="text-[10px] tracking-[0.22em] uppercase font-mono text-cream/90 mb-2.5">
                {featured?.source} · {relativeTime(featured?.publishedAt)}
              </div>
              {/* Headline = gold for max pop */}
              <h2 className="font-display font-bold text-2xl sm:text-3xl leading-tight max-w-3xl text-accent-gold">
                {featured?.headline}
              </h2>
              {/* Description = pure white */}
              {featured?.description && (
                <p className="mt-3 text-sm text-white max-w-2xl line-clamp-2 leading-relaxed">
                  {featured.description}
                </p>
              )}
              <div className="mt-4 inline-flex items-center gap-2 text-xs tracking-widest uppercase text-accent-gold font-semibold">
                {isInternalHref(featured?.href) ? 'Read briefing' : 'Read on ESPN'} <span aria-hidden>→</span>
              </div>
            </motion.div>
          </AnimatePresence>
        </a>

        {/* Next-up vertical column */}
        <div className="flex flex-col gap-3">
          {upcoming.map((a) => (
            <a
              key={a.id}
              href={a.href ?? '#'}
              {...(isInternalHref(a.href)
                ? {}
                : { target: '_blank', rel: 'noopener noreferrer' })}
              onClick={() => !isInternalHref(a.href) && markEspnClick(a)}
              className="group bg-paper/70 hover:bg-paper border border-slate-200/70 rounded-xl p-3 transition-colors block"
            >
              <div className="flex gap-3 items-start">
                {a.image && (
                  <img
                    src={a.image}
                    alt=""
                    loading="lazy"
                    className="w-16 h-16 rounded-lg object-cover shrink-0"
                    onError={(e) => (e.currentTarget.style.display = 'none')}
                  />
                )}
                <div className="min-w-0 flex-1">
                  <div className="text-[9px] tracking-[0.18em] uppercase font-mono text-slate-500">
                    {a.source} · {relativeTime(a.publishedAt)}
                  </div>
                  <div className="mt-1 text-sm font-display font-semibold leading-snug line-clamp-3 text-ink-900 group-hover:text-marine-950">
                    {a.headline}
                  </div>
                </div>
              </div>
            </a>
          ))}
        </div>
      </div>

      {/* Tiny progress dots — one dot per PAGE (not per article). With
          PAGE_SIZE = 4 and ~36 articles, that's 9 dots, each jumping to
          a fresh set of 4 cards. Old behaviour was one dot per article
          which both filled the row with 12 dots AND meant clicking a
          dot only shuffled the order, not the contents. */}
      <div className="mt-4 flex items-center gap-1">
        {Array.from({ length: Math.min(12, Math.ceil(orderedArticles.length / PAGE_SIZE)) }).map((_, page) => {
          const currentPage = Math.floor(idx / PAGE_SIZE)
          return (
            <button
              key={page}
              onClick={() => setIdx(page * PAGE_SIZE)}
              aria-label={`Jump to page ${page + 1}`}
              className={
                'h-1 rounded-full transition-all ' +
                (page === currentPage ? 'w-6 bg-accent-gold' : 'w-1.5 bg-slate-300 hover:bg-slate-400')
              }
            />
          )
        })}
      </div>

      {/* Welcome-back toast — fires when user returns to our tab after
          reading an ESPN article. Suggests 3 more stories to retain them. */}
      <WelcomeBackToast
        data={welcomeBack}
        onClose={() => setWelcomeBack(null)}
        onArticleClick={(a) => {
          markEspnClick(a)
          setWelcomeBack(null)
        }}
      />
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/* Welcome-back floating toast                                                 */
/* -------------------------------------------------------------------------- */

function WelcomeBackToast({
  data,
  onClose,
  onArticleClick,
}: {
  data: { sourceHeadline: string; suggestions: NewsArticle[] } | null
  onClose: () => void
  onArticleClick: (a: NewsArticle) => void
}) {
  // Auto-dismiss after 14s so it never lingers when the user is already
  // engaged with the rest of the page.
  useEffect(() => {
    if (!data) return
    const t = setTimeout(onClose, 14_000)
    return () => clearTimeout(t)
  }, [data, onClose])

  return (
    <AnimatePresence>
      {data && (
        <motion.aside
          key="wc26-welcome-back"
          initial={{ y: 30, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 30, opacity: 0 }}
          transition={{ duration: 0.35, ease: 'easeOut' }}
          className="fixed bottom-5 right-5 z-40 w-[min(360px,calc(100vw-2.5rem))] bg-marine-950 text-cream rounded-2xl shadow-2xl ring-1 ring-black/20 overflow-hidden"
          role="dialog"
          aria-label="Welcome back — more stories"
        >
          {/* Header */}
          <div className="flex items-start justify-between gap-3 px-4 pt-4 pb-2">
            <div className="min-w-0">
              <div className="text-[10px] font-mono uppercase tracking-[0.22em] text-accent-gold">
                Welcome back 👋
              </div>
              <div className="mt-0.5 text-xs text-cream/75 line-clamp-1">
                You were reading: <em>{data.sourceHeadline}</em>
              </div>
            </div>
            <button
              onClick={onClose}
              aria-label="Dismiss"
              className="shrink-0 text-cream/60 hover:text-cream rounded-full w-7 h-7 flex items-center justify-center text-lg leading-none transition-colors"
            >
              ×
            </button>
          </div>

          {/* Suggestions */}
          <div className="px-3 pb-3 space-y-1.5">
            {data.suggestions.map((a) => (
              <a
                key={a.id}
                href={a.href ?? '#'}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => onArticleClick(a)}
                className="block rounded-xl bg-marine-900/50 hover:bg-marine-800/70 transition-colors p-2.5 group"
              >
                <div className="flex gap-2.5 items-start">
                  {a.image && (
                    <img
                      src={a.image}
                      alt=""
                      loading="lazy"
                      className="w-12 h-12 rounded-md object-cover shrink-0"
                      onError={(e) => (e.currentTarget.style.display = 'none')}
                    />
                  )}
                  <div className="min-w-0">
                    <div className="text-[9px] font-mono uppercase tracking-[0.18em] text-cream/55">
                      {a.source}
                    </div>
                    <div className="mt-0.5 text-[13px] font-display font-semibold leading-snug line-clamp-2 group-hover:text-accent-gold transition-colors">
                      {a.headline}
                    </div>
                  </div>
                </div>
              </a>
            ))}
          </div>

          <div className="px-4 pb-3 pt-1 text-[10px] font-mono uppercase tracking-[0.18em] text-cream/40">
            More on pressing90.live
          </div>
        </motion.aside>
      )}
    </AnimatePresence>
  )
}

function relativeTime(iso: string | undefined): string {
  if (!iso) return ''
  const t = new Date(iso).getTime()
  if (Number.isNaN(t)) return ''
  const delta = Date.now() - t
  if (delta < 60_000)        return 'just now'
  if (delta < 3_600_000)     return `${Math.floor(delta / 60_000)} min ago`
  if (delta < 86_400_000)    return `${Math.floor(delta / 3_600_000)} h ago`
  if (delta < 7 * 86_400_000) return `${Math.floor(delta / 86_400_000)} d ago`
  return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })
}
