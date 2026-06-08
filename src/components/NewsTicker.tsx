import { AnimatePresence, motion } from 'framer-motion'
import { useEffect, useMemo, useState } from 'react'
import { fetchNews, type NewsArticle } from '../lib/api'

/**
 * Rotating football news ticker — replaces the static "World Cup 2026 — Live"
 * hero title. Pulls from ESPN's per-league /news endpoint (CORS-open, free,
 * no API key) across FIFA WC, UEFA Champions, top-5 leagues, friendlies and
 * CAF qualifiers. Articles are deduped + sorted newest-first client-side.
 *
 * Cadence:
 *   - Full re-fetch every 5 minutes.
 *   - On-screen featured article rotates every 15 seconds.
 *   - User can click left/right arrows or click on a side card to jump.
 *
 * Click an article → opens the original ESPN story in a new tab.
 */
export function NewsTicker() {
  const [articles, setArticles] = useState<NewsArticle[]>([])
  const [idx, setIdx] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Full refresh every 5 minutes.
  useEffect(() => {
    let stop = false
    let timer: number | undefined
    async function load() {
      try {
        const fresh = await fetchNews(5)
        if (stop) return
        setArticles(fresh)
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

  // Auto-advance every 15s.
  useEffect(() => {
    if (articles.length < 2) return
    const t = window.setInterval(() => {
      setIdx((i) => (i + 1) % articles.length)
    }, 15_000)
    return () => clearInterval(t)
  }, [articles.length])

  const featured = articles[idx]
  const upcoming = useMemo(() => {
    if (articles.length === 0) return [] as NewsArticle[]
    return [1, 2, 3].map((d) => articles[(idx + d) % articles.length]).filter(Boolean)
  }, [articles, idx])

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
    <div className="my-6">
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
          target="_blank"
          rel="noopener noreferrer"
          className="lg:col-span-2 group relative overflow-hidden rounded-2xl bg-marine-950 text-cream block min-h-[22rem]"
        >
          {featured?.image && (
            <div
              className="absolute inset-0 bg-cover bg-center transition-transform duration-700 group-hover:scale-105 brightness-[0.4]"
              style={{ backgroundImage: `url(${featured.image})` }}
            />
          )}
          {/* Triple-layered overlay so the text block ALWAYS has a guaranteed
              dark backdrop regardless of the underlying photo (sky, jersey,
              faces). Order, back→front:
                1) Full-card uniform tint
                2) Bottom-half darker gradient
                3) Solid near-opaque slab right behind the text block */}
          <div className="absolute inset-0 bg-black/45" />
          <div className="absolute inset-x-0 bottom-0 h-3/4 bg-gradient-to-t from-black via-black/90 via-50% to-transparent" />
          <div className="absolute inset-x-0 bottom-0 h-[60%] bg-black/55 backdrop-blur-[1px]" />
          <AnimatePresence mode="wait">
            <motion.div
              key={featured?.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.5 }}
              className="relative h-full flex flex-col justify-end p-7"
              style={{ textShadow: '0 2px 20px rgba(0,0,0,0.95), 0 0 8px rgba(0,0,0,0.7)' }}
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
                Read on ESPN <span aria-hidden>→</span>
              </div>
            </motion.div>
          </AnimatePresence>
        </a>

        {/* Next-up vertical column */}
        <div className="flex flex-col gap-3">
          {upcoming.map((a, i) => (
            <a
              key={a.id}
              href={a.href ?? '#'}
              target="_blank"
              rel="noopener noreferrer"
              onMouseEnter={() => setIdx((idx + i + 1) % articles.length)}
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

      {/* Tiny progress dots */}
      <div className="mt-4 flex items-center gap-1">
        {articles.slice(0, 12).map((_, i) => (
          <button
            key={i}
            onClick={() => setIdx(i)}
            aria-label={`Jump to article ${i + 1}`}
            className={
              'h-1 rounded-full transition-all ' +
              (i === idx ? 'w-6 bg-accent-gold' : 'w-1.5 bg-slate-300 hover:bg-slate-400')
            }
          />
        ))}
      </div>
    </div>
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
