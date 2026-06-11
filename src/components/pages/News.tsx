import { useEffect, useState } from 'react'
import { Link, useParams, Navigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { supabase } from '../../lib/supabase'

/**
 * Public news pages — list + detail.
 *
 * Articles are written into Supabase by the cron + manual flows in
 * worker/src/news.ts, then approved via the admin panel. RLS allows
 * the anon key to SELECT status='published' rows only, so we hit
 * Supabase directly from the browser — no worker round-trip needed.
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

// ─── List page · /news ──────────────────────────────────────────────

export function NewsListPage() {
  const [items, setItems] = useState<Article[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    document.title = 'News · WC26 Live · Pressing 90'
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

      <div className="space-y-4">
        {items?.map((a, i) => <ArticleCard key={a.id} article={a} featured={i === 0} />)}
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
        {article.image_url && (
          <div className={featured ? 'md:w-2/5 aspect-video md:aspect-auto' : 'md:w-48 aspect-video md:aspect-auto md:flex-shrink-0'}>
            <img
              src={article.image_url}
              alt=""
              className="w-full h-full object-cover"
              onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
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

  useEffect(() => {
    if (!slug || !supabase) return
    void supabase
      .from('articles')
      .select(SELECT)
      .eq('slug', slug)
      .eq('status', 'published')
      .maybeSingle()
      .then(({ data }) => {
        setArticle((data as Article | null) ?? null)
        if (data) {
          document.title = (data as Article).title + ' · Pressing 90'
        }
      })
  }, [slug])

  if (article === null) return <Navigate to="/news" replace />

  return (
    <article className="container max-w-3xl mx-auto px-6 py-8 sm:py-12">
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
          {article.image_url && (
            <div className="aspect-video rounded-2xl overflow-hidden mb-6">
              <img
                src={article.image_url}
                alt=""
                className="w-full h-full object-cover"
                onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
              />
            </div>
          )}
          <div className="prose prose-slate prose-sm sm:prose-base max-w-none text-slate-800 whitespace-pre-wrap leading-relaxed">
            {article.body}
          </div>
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
        </>
      )}
    </article>
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
