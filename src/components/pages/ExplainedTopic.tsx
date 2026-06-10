import { useEffect } from 'react'
import { Link, useParams } from 'react-router-dom'
import { faqBySlug, WC_FAQ } from '../../data/wcFaq'

/**
 * /explained/:slug — dedicated page per FAQ entry. Designed for direct
 * Google search hits ('how does extra time work at the world cup',
 * 'best third placed teams rule', etc.) and for the FAQPage rich
 * result snippet.
 *
 * Each page ships its own FAQPage JSON-LD with one Question entry — the
 * sharper structured data signal helps Google show a per-page snippet
 * instead of routing everything through the /explained index.
 */
export function ExplainedTopic() {
  const { slug } = useParams<{ slug: string }>()
  const entry = slug ? faqBySlug(slug) : null

  useEffect(() => {
    if (!entry) return
    document.title = `${entry.question} · Pressing 90`
    setMeta('description', entry.short)
    setLink('canonical', `https://pressing90.live/explained/${entry.slug}`)
    setOg('og:title', entry.question)
    setOg('og:url', `https://pressing90.live/explained/${entry.slug}`)
    setOg('og:description', entry.short)

    setJsonLd('explained-topic', {
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      mainEntity: [
        {
          '@type': 'Question',
          name: entry.question,
          acceptedAnswer: {
            '@type': 'Answer',
            text: entry.long.join(' ') || entry.short,
          },
        },
      ],
    })
    return () => {
      const tag = document.querySelector('script[data-ld-key="explained-topic"]')
      if (tag) tag.remove()
    }
  }, [entry])

  if (!entry) {
    return (
      <div className="container max-w-3xl mx-auto px-6 pt-28 pb-16 text-center">
        <h1 className="font-display text-3xl font-bold text-ink-900">
          Question not found
        </h1>
        <p className="mt-3 text-slate-600">
          We don't have an explainer for this slug.{' '}
          <Link to="/explained" className="text-accent-gold underline">
            Back to all explainers →
          </Link>
        </p>
      </div>
    )
  }

  const relatedEntries = entry.related
    .map((s) => WC_FAQ.find((f) => f.slug === s))
    .filter(Boolean) as typeof WC_FAQ

  return (
    <div className="container max-w-3xl mx-auto px-6 pt-28 pb-16">
      <nav className="mb-6">
        <Link to="/explained" className="text-xs font-mono uppercase tracking-[0.18em] text-slate-500 hover:text-accent-gold">
          ← All explainers
        </Link>
      </nav>

      <header className="mb-8">
        <div className="font-mono text-xs uppercase tracking-[0.22em] text-slate-500 mb-3">
          {entry.tags.map((t) => t.toUpperCase()).join(' · ')}
        </div>
        <h1 className="font-display font-bold text-3xl sm:text-4xl text-ink-900 tracking-tight leading-[1.15]">
          {entry.question}
        </h1>
      </header>

      <section className="mb-10 rounded-2xl border-l-4 border-accent-gold bg-paper-elev p-5 sm:p-6">
        <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-slate-500 mb-2">
          Short answer
        </div>
        <p className="font-display text-base sm:text-lg leading-relaxed text-ink-900">
          {entry.short}
        </p>
      </section>

      <section className="mb-12 space-y-5 text-slate-700 leading-relaxed">
        <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-slate-500">
          The full picture
        </div>
        {entry.long.map((para, i) => (
          <p key={i}>{para}</p>
        ))}
      </section>

      {relatedEntries.length > 0 && (
        <section className="mb-12">
          <h2 className="font-display font-bold text-xl text-ink-900 mb-4">
            Related questions
          </h2>
          <ul className="space-y-3">
            {relatedEntries.map((rel) => (
              <li key={rel.slug}>
                <Link
                  to={`/explained/${rel.slug}`}
                  className="group block rounded-xl border border-slate-200 bg-white p-4 hover:border-accent-gold transition-colors"
                >
                  <div className="font-display font-semibold text-base text-ink-900 group-hover:text-accent-gold">
                    {rel.question}
                  </div>
                  <div className="mt-1 text-sm text-slate-600 line-clamp-2">{rel.short}</div>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="rounded-2xl bg-marine-950 text-cream p-6 sm:p-8">
        <h2 className="font-display font-bold text-2xl mb-3">Now watch it</h2>
        <p className="text-cream/80 mb-5 max-w-xl">
          Make your bracket, follow live scores, see the broadcasters in your country.
        </p>
        <div className="flex flex-wrap gap-3">
          <Link
            to="/predictions"
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-accent-gold text-ink-900 font-semibold text-sm hover:bg-yellow-300 transition-colors"
          >
            Make my bracket →
          </Link>
          <Link
            to="/today"
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-white/10 hover:bg-white/20 text-cream text-sm font-semibold transition-colors"
          >
            Today's matches
          </Link>
        </div>
      </section>
    </div>
  )
}

function setMeta(name: string, content: string) {
  let tag = document.querySelector(`meta[name="${name}"]`) as HTMLMetaElement | null
  if (!tag) { tag = document.createElement('meta'); tag.name = name; document.head.appendChild(tag) }
  tag.content = content
}
function setOg(property: string, content: string) {
  let tag = document.querySelector(`meta[property="${property}"]`) as HTMLMetaElement | null
  if (!tag) { tag = document.createElement('meta'); tag.setAttribute('property', property); document.head.appendChild(tag) }
  tag.content = content
}
function setLink(rel: string, href: string) {
  let tag = document.querySelector(`link[rel="${rel}"]`) as HTMLLinkElement | null
  if (!tag) { tag = document.createElement('link'); tag.rel = rel; document.head.appendChild(tag) }
  tag.href = href
}
function setJsonLd(key: string, ld: unknown) {
  document.querySelectorAll(`script[data-ld-key="${key}"]`).forEach((n) => n.remove())
  const tag = document.createElement('script')
  tag.type = 'application/ld+json'
  tag.setAttribute('data-ld-key', key)
  tag.textContent = JSON.stringify(ld)
  document.head.appendChild(tag)
}
