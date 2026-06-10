import { useEffect } from 'react'
import { Link } from 'react-router-dom'
import { WC_FAQ } from '../../data/wcFaq'

/**
 * /explained — index FAQ page covering format / rules / qualification /
 * logistics. Each entry is briefly summarised here with a CTA to the
 * dedicated /explained/<slug> page for the full answer.
 *
 * Critical SEO move: ship the FAQPage JSON-LD with EVERY question on it
 * so Google can surface them as 'People also ask' or as an in-result
 * accordion. The static prerender pass bakes this into the index page
 * HTML so it lands in the first crawl pass — no JS rendering required.
 */
export function Explained() {
  useEffect(() => {
    document.title = 'How the WC26 World Cup works · FAQ · Pressing 90'
    setMeta('description',
      'Plain-English answers to every common question about the 2026 FIFA World Cup — format, qualifying teams, host cities, group rules, VAR, penalty shootouts, squad sizes, schedule. Updated for the 48-team expansion.'
    )
    setLink('canonical', 'https://pressing90.live/explained')
    setOg('og:title', 'How the WC26 World Cup works · FAQ · Pressing 90')
    setOg('og:url', 'https://pressing90.live/explained')
    setOg('og:description', 'Format, host cities, rules, VAR, penalty shootouts, squad sizes — every WC2026 question answered in one page.')

    setJsonLd('explained-index', {
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      mainEntity: WC_FAQ.map((f) => ({
        '@type': 'Question',
        name: f.question,
        acceptedAnswer: {
          '@type': 'Answer',
          text: f.short,
        },
      })),
    })
    return () => {
      const tag = document.querySelector('script[data-ld-key="explained-index"]')
      if (tag) tag.remove()
    }
  }, [])

  return (
    <div className="container max-w-3xl mx-auto px-6 py-16">
      <header className="mb-12">
        <div className="font-mono text-xs uppercase tracking-[0.22em] text-slate-500 mb-3">
          Explained
        </div>
        <h1 className="font-display font-bold text-4xl sm:text-5xl text-ink-900 tracking-tight leading-[1.1]">
          How the <span className="text-accent-gold">2026 World Cup</span>{' '}
          actually works
        </h1>
        <p className="mt-5 text-lg text-slate-700 leading-relaxed">
          Plain-English answers to every common question about the new 48-team
          format, the qualifying teams, the host cities, group-stage rules,
          VAR, penalty shootouts, squad sizes and the schedule.
        </p>
      </header>

      <section className="space-y-6">
        {WC_FAQ.map((entry) => (
          <article
            key={entry.slug}
            id={entry.slug}
            className="rounded-2xl border border-slate-200 bg-paper-elev p-5 sm:p-6"
          >
            <h2 className="font-display font-bold text-xl sm:text-2xl text-ink-900">
              <Link
                to={`/explained/${entry.slug}`}
                className="hover:text-accent-gold transition-colors"
              >
                {entry.question}
              </Link>
            </h2>
            <p className="mt-2 text-slate-700 leading-relaxed">
              {entry.short}
            </p>
            <div className="mt-3">
              <Link
                to={`/explained/${entry.slug}`}
                className="text-xs font-mono uppercase tracking-[0.12em] text-accent-gold font-semibold hover:text-yellow-700"
              >
                Read full answer →
              </Link>
            </div>
          </article>
        ))}
      </section>

      <section className="mt-12 rounded-2xl bg-marine-950 text-cream p-6 sm:p-8">
        <h2 className="font-display font-bold text-2xl mb-3">Watch it live</h2>
        <p className="text-cream/80 mb-5 max-w-xl">
          Once you understand the format, follow it match-by-match: live
          scores, bracket predictor, per-country broadcasters.
        </p>
        <div className="flex flex-wrap gap-3">
          <Link
            to="/today"
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-accent-gold text-ink-900 font-semibold text-sm hover:bg-yellow-300 transition-colors"
          >
            Today's matches →
          </Link>
          <Link
            to="/predictions"
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-white/10 hover:bg-white/20 text-cream text-sm font-semibold transition-colors"
          >
            Make your bracket
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
