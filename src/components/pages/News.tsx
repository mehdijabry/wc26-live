import { Fragment, useEffect, useState } from 'react'
import { Link, useParams, Navigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { supabase } from '../../lib/supabase'
import { Ad, AdsterraZone, ADSTERRA_ZONES } from '../AdSlot'

/**
 * Public news pages — list + detail.
 *
 * Articles are written into Supabase by the cron + manual flows in
 * worker/src/news.ts, then approved via the admin panel. RLS allows
 * the anon key to SELECT status='published' rows only, so we hit
 * Supabase directly from the browser — no worker round-trip needed.
 *
 * SEO surface per article:
 *   - <title>                  the article title + brand suffix
 *   - <meta description>       the AI-written excerpt
 *   - og:title / og:image / og:description / og:type=article
 *   - twitter:card=summary_large_image + twitter:image
 *   - JSON-LD NewsArticle schema (Google Discover / News-eligible)
 *
 * Cloudflare Pages serves the SPA shell statically; Google's renderer
 * runs JS so these dynamically-set tags ARE indexed (verified on the
 * existing /u/<slug> public profile pages). For pre-render at edge
 * (faster bot crawl, social card previews from Twitter/Facebook bots
 * that don't run JS), a worker route /news/<slug> with HTMLRewriter
 * could be added later — see SEO_TODO note at bottom of file.
 */

interface Article {
  id: string
  slug: string
  title: string
  excerpt: string | null
  body: string
  image_url: string | null
  source_url: string
  source_name: string
  source_attribution: string | null
  published_at: string | null
  created_at: string
}

const SELECT = 'id,slug,title,excerpt,body,image_url,source_url,source_name,source_attribution,published_at,created_at'
const SITE = 'https://pressing90.live'

// ─── List page · /news ──────────────────────────────────────────────

export function NewsListPage() {
  const [items, setItems] = useState<Article[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    document.title = 'WC26 News · Daily World Cup 2026 briefing · Pressing 90'
    setMeta('description', 'Daily World Cup 2026 news briefing — original takes on the stories that matter, drawn from ESPN, BBC, Sky Sports and more.')
    setMeta('og:title', 'WC26 News · Pressing 90′', true)
    setMeta('og:description', 'Daily World Cup 2026 briefing from the Pressing 90′ desk.', true)
    setMeta('og:type', 'website', true)
    setMeta('og:url', `${SITE}/news`, true)

    if (!supabase) { setError('Database not configured'); return }
    void supabase
      .from('articles')
      .select(SELECT)
      .eq('status', 'published')
      .order('published_at', { ascending: false })
      .limit(50)
      .then(({ data, error }) => {
        if (error) setError(error.message)
        else setItems(data as Article[])
      })
  }, [])

  return (
    <section className="container max-w-5xl mx-auto px-6 py-8 sm:py-12">
      <div className="mb-8">
        <div className="text-xs uppercase tracking-widest font-mono text-accent-gold mb-2">
          Pressing 90′ · the briefing
        </div>
        <h1 className="font-display font-bold text-3xl sm:text-4xl text-slate-900">
          WC26 News
        </h1>
        <p className="text-slate-600 mt-2 max-w-2xl text-sm">
          Daily picks from the World Cup beat — quick takes on the stories that
          actually matter, with original commentary and links to the full source.
        </p>
      </div>

      <Ad slot="news-list-top" className="mb-6" />

      {error && (
        <div className="px-4 py-3 rounded-lg bg-rose-50 text-rose-800 text-sm font-mono">
          Failed to load: {error}
        </div>
      )}

      {!items && !error && (
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-32 rounded-2xl bg-slate-100 animate-pulse" />
          ))}
        </div>
      )}

      {items && items.length === 0 && (
        <div className="text-center py-16 text-slate-500">
          <div className="text-4xl mb-2">📭</div>
          <div className="font-display font-bold text-slate-900">No articles published yet</div>
          <div className="text-xs font-mono mt-1">Check back later — fresh stories drop throughout the day.</div>
        </div>
      )}

      <div className="space-y-5">
        {items?.map((a, i) => (
          <Fragment key={a.id}>
            <ArticleCard article={a} featured={i === 0} />
            {/* Mid-list ad after the 3rd card — one impression per 50
                articles, doesn't drown the feed. */}
            {i === 2 && items.length > 4 && <Ad slot="news-list-mid" className="my-2" />}
          </Fragment>
        ))}
      </div>
    </section>
  )
}

function ArticleCard({ article, featured }: { article: Article; featured: boolean }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
    >
      <Link
        to={`/news/${article.slug}`}
        className={
          'block group rounded-2xl overflow-hidden border border-slate-200 bg-white hover:shadow-lg hover:border-accent-gold/40 transition-all ' +
          (featured ? 'md:flex md:gap-0' : 'md:flex md:gap-0')
        }
      >
        {/* The hero image only renders if we have a real URL. No
            placeholder — user wants the actual article photo every
            time. The worker fetches og:image at produce time so this
            should be populated for every new article. */}
        {article.image_url && (
          <div className={featured ? 'md:w-2/5 aspect-video md:aspect-auto bg-slate-100 flex-shrink-0' : 'md:w-48 aspect-video md:aspect-auto md:flex-shrink-0 bg-slate-100'}>
            <img
              src={article.image_url}
              alt={article.title}
              loading="lazy"
              className="w-full h-full object-cover"
              onError={(e) => { (e.target as HTMLImageElement).parentElement!.style.display = 'none' }}
            />
          </div>
        )}
        <div className="flex-1 p-4 sm:p-5 min-w-0">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-[10px] uppercase tracking-widest font-mono text-accent-gold">
              {article.source_name}
            </span>
            <span className="text-[10px] text-slate-400 font-mono">
              · {formatDate(article.published_at ?? article.created_at)}
            </span>
          </div>
          <h2 className={
            'font-display font-bold text-slate-900 leading-tight mb-2 group-hover:text-accent-gold transition-colors ' +
            (featured ? 'text-xl sm:text-2xl' : 'text-base sm:text-lg')
          }>
            {article.title}
          </h2>
          {article.excerpt && (
            <p className="text-sm text-slate-600 line-clamp-2">{article.excerpt}</p>
          )}
          <div className="mt-3 text-[11px] font-mono text-accent-gold opacity-0 group-hover:opacity-100 transition-opacity">
            Read more →
          </div>
        </div>
      </Link>
    </motion.div>
  )
}

// ─── Detail page · /news/:slug ──────────────────────────────────────

export function NewsArticlePage() {
  const { slug } = useParams<{ slug: string }>()
  const [article, setArticle] = useState<Article | null | undefined>(undefined)
  // Show the 6-ad interstitial on each article navigation. Resets on
  // slug change so navigating between articles re-fires the modal.
  const [showInterstitial, setShowInterstitial] = useState(true)

  useEffect(() => {
    if (!slug || !supabase) return
    setShowInterstitial(true)
    void supabase
      .from('articles')
      .select(SELECT)
      .eq('slug', slug)
      .eq('status', 'published')
      .maybeSingle()
      .then(({ data }) => {
        const art = (data as Article | null) ?? null
        setArticle(art)
        if (art) hydrateMetaTags(art)
      })
  }, [slug])

  if (article === null) return <Navigate to="/news" replace />

  return (
    <article className="container max-w-3xl mx-auto px-6 py-8 sm:py-12">
      {showInterstitial && <Interstitial onClose={() => setShowInterstitial(false)} />}

      <Link to="/news" className="inline-flex items-center gap-1 text-xs font-mono text-slate-500 hover:text-slate-900 mb-6">
        ← Back to news
      </Link>

      {!article && (
        <div className="space-y-4">
          <div className="h-8 w-32 bg-slate-100 rounded animate-pulse" />
          <div className="h-12 bg-slate-100 rounded animate-pulse" />
          <div className="aspect-video bg-slate-100 rounded-2xl animate-pulse" />
          <div className="space-y-2">
            <div className="h-4 bg-slate-100 rounded animate-pulse" />
            <div className="h-4 bg-slate-100 rounded animate-pulse" />
            <div className="h-4 bg-slate-100 rounded animate-pulse w-3/4" />
          </div>
        </div>
      )}

      {article && (
        <>
          {/* JSON-LD NewsArticle — Google News + Discover eligibility.
              Embedded inline so the bot picks it up on the same paint. */}
          <script
            type="application/ld+json"
            dangerouslySetInnerHTML={{ __html: JSON.stringify(buildJsonLd(article)) }}
          />

          <div className="flex items-center gap-2 mb-3">
            <span className="text-xs uppercase tracking-widest font-mono text-accent-gold">
              {article.source_name}
            </span>
            <span className="text-xs text-slate-400 font-mono">
              · {formatDate(article.published_at ?? article.created_at)}
            </span>
          </div>
          <h1 className="font-display font-bold text-3xl sm:text-4xl text-slate-900 leading-tight mb-4">
            {article.title}
          </h1>
          {article.excerpt && (
            <p className="text-lg text-slate-600 mb-6 italic">{article.excerpt}</p>
          )}

          <Ad slot="news-article-top" className="my-4" />

          {article.image_url && (
            <figure className="aspect-video rounded-2xl overflow-hidden mb-6 bg-slate-100">
              <img
                src={article.image_url}
                alt={article.title}
                className="w-full h-full object-cover"
                onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
              />
            </figure>
          )}

          <div className="prose prose-slate prose-sm sm:prose-base max-w-none text-slate-800 whitespace-pre-wrap leading-relaxed">
            {article.body}
          </div>

          <Ad slot="news-article-mid" className="my-6" />

          <div className="mt-8 pt-6 border-t border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs font-mono text-slate-500">
            <div>
              {article.source_attribution ?? `Based on reporting by ${article.source_name}`}
            </div>
            <a
              href={article.source_url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-accent-gold hover:underline"
            >
              ↗ Read original
            </a>
          </div>

          <Ad slot="news-article-footer" className="mt-8" />
        </>
      )}
    </article>
  )
}

/**
 * Article-open interstitial — full-screen white modal stacked with six
 * Adsterra ad placements (2× NativeBanner, 2× banners, 2× SocialBar)
 * arranged in a scrollable column. Close button (×) sits top-right; it
 * stays disabled & grey with a visible countdown for 5 seconds, then
 * unlocks. Closes on click or on Escape after the countdown.
 *
 * Body scroll is locked while open so the focus stays on the ads.
 */
function Interstitial({ onClose }: { onClose: () => void }) {
  const [secsLeft, setSecsLeft] = useState(5)

  useEffect(() => {
    document.body.style.overflow = 'hidden'
    const t = setInterval(() => setSecsLeft((s) => (s > 0 ? s - 1 : 0)), 1000)
    return () => {
      clearInterval(t)
      document.body.style.overflow = ''
    }
  }, [])

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && secsLeft === 0) onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [secsLeft, onClose])

  const unlocked = secsLeft === 0

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="fixed inset-0 z-[60] bg-white/98 backdrop-blur-md overflow-y-auto"
    >
      {/* Close button — grey until 5s elapsed, then turns dark and
          becomes clickable. Visible countdown sits to the left. */}
      <div className="sticky top-0 z-10 bg-white/95 backdrop-blur-md border-b border-slate-200 px-4 py-3 flex items-center justify-between">
        <div className="text-[10px] uppercase tracking-widest font-mono text-accent-gold">
          Pressing 90′ · sponsored break
        </div>
        <button
          onClick={() => unlocked && onClose()}
          disabled={!unlocked}
          aria-label={unlocked ? 'Close' : `Close available in ${secsLeft}s`}
          className={
            'w-10 h-10 rounded-full flex items-center justify-center font-mono text-sm transition-colors ' +
            (unlocked
              ? 'bg-ink-900 text-white hover:bg-slate-700 cursor-pointer'
              : 'bg-slate-200 text-slate-400 cursor-not-allowed')
          }
        >
          {unlocked ? '✕' : secsLeft}
        </button>
      </div>

      {/* Ad stack — 4 slots, both proven formats only.
          NativeBanner + 300x250 dropped from the modal: user observed
          they each fill ~1/10 calls on this account, not worth the
          slot. Replaced with two SocialBar embeds which fill more
          reliably even sandboxed in an iframe. */}
      <div className="max-w-xl mx-auto px-4 py-4 space-y-3">
        <div className="text-center font-display font-bold text-lg text-slate-900 mb-1">
          Continuing to your article…
        </div>

        <AdsterraZone zoneKey={ADSTERRA_ZONES.banner728} variant="banner-728x90" />
        <AdsterraZone zoneKey={ADSTERRA_ZONES.socialBar} variant="socialBar" />
        <AdsterraZone zoneKey={ADSTERRA_ZONES.socialBar} variant="socialBar" />
        <AdsterraZone zoneKey={ADSTERRA_ZONES.banner728} variant="banner-728x90" />
      </div>
    </motion.div>
  )
}

// ─── helpers ────────────────────────────────────────────────────────

function formatDate(iso: string): string {
  const d = new Date(iso)
  const now = Date.now()
  const minutes = Math.floor((now - d.getTime()) / 60_000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return minutes + ' min ago'
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return hours + 'h ago'
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function setMeta(name: string, content: string, property = false) {
  const attr = property ? 'property' : 'name'
  let tag = document.querySelector(`meta[${attr}="${name}"]`) as HTMLMetaElement | null
  if (!tag) {
    tag = document.createElement('meta')
    tag.setAttribute(attr, name)
    document.head.appendChild(tag)
  }
  tag.content = content
}

function hydrateMetaTags(a: Article) {
  document.title = `${a.title} · WC26 News · Pressing 90′`
  const desc = a.excerpt ?? a.body.slice(0, 200)
  const url = `${SITE}/news/${a.slug}`
  const img = a.image_url ?? `${SITE}/wc26-emblem.svg`
  setMeta('description', desc)
  setMeta('og:title', a.title, true)
  setMeta('og:description', desc, true)
  setMeta('og:type', 'article', true)
  setMeta('og:url', url, true)
  setMeta('og:image', img, true)
  setMeta('og:site_name', 'Pressing 90′', true)
  setMeta('twitter:card', 'summary_large_image')
  setMeta('twitter:title', a.title)
  setMeta('twitter:description', desc)
  setMeta('twitter:image', img)
  // Canonical so Google doesn't index the source ESPN dupe alongside ours.
  let link = document.querySelector('link[rel="canonical"]') as HTMLLinkElement | null
  if (!link) {
    link = document.createElement('link')
    link.rel = 'canonical'
    document.head.appendChild(link)
  }
  link.href = url
}

function buildJsonLd(a: Article) {
  return {
    '@context': 'https://schema.org',
    '@type': 'NewsArticle',
    headline: a.title,
    description: a.excerpt ?? a.body.slice(0, 200),
    image: a.image_url ? [a.image_url] : undefined,
    datePublished: a.published_at ?? a.created_at,
    dateModified: a.published_at ?? a.created_at,
    author: { '@type': 'Organization', name: 'Pressing 90′' },
    publisher: {
      '@type': 'Organization',
      name: 'Pressing 90′',
      logo: { '@type': 'ImageObject', url: `${SITE}/wc26-emblem.svg` },
    },
    mainEntityOfPage: { '@type': 'WebPage', '@id': `${SITE}/news/${a.slug}` },
    isBasedOn: a.source_url,
  }
}

/* SEO_TODO — second-pass enhancements once the pipeline is steady:
 *
 * 1. Edge prerender: a worker route serving /news/<slug> reads the row
 *    from Supabase and emits the SPA shell with title/description/og
 *    tags already in the HTML. Google's mobile crawler executes JS so
 *    we don't strictly NEED this, but Twitter/Facebook unfurlers don't —
 *    so prerendering lifts share-card quality.
 *
 * 2. Sitemap inclusion: extend the existing public/sitemap.xml builder
 *    (or generate dynamically at edge) to emit a <url><loc>/news/<slug>
 *    entry per published article so GSC picks them up without waiting
 *    for crawl discovery via /news.
 *
 * 3. RSS feed: serve /news/feed.xml so other aggregators can pull our
 *    rewritten briefings — small but high-conversion SEO loop. */
