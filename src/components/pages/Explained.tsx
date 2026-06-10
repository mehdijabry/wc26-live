import { useEffect } from 'react'
import { Link } from 'react-router-dom'
import { WC_FAQ, type FaqEntry } from '../../data/wcFaq'

/**
 * Section grouping for the index. We bucket entries by their FIRST tag
 * so each entry appears in exactly one section — entries with multiple
 * tags (like new-rules + rules) get classified by their primary tag.
 */
const SECTIONS: Array<{
  key: FaqEntry['tags'][number]
  title: string
  eyebrow: string
  blurb: string
}> = [
  {
    key: 'new-rules',
    title: 'New rules in effect for WC2026',
    eyebrow: 'First time at a World Cup',
    blurb: "The IFAB and FIFA approved a cluster of rule changes between 2024 and 2025. WC26 is the first World Cup where all of them apply at once.",
  },
  {
    key: 'format',
    title: 'How the tournament is structured',
    eyebrow: 'Format & schedule',
    blurb: '48 teams, 12 groups, 32-team knockout. The first 48-team World Cup explained.',
  },
  {
    key: 'rules',
    title: 'Existing rules — the reminders',
    eyebrow: 'Laws of the game',
    blurb: 'Offside, handball, back-pass, cooling breaks — the rules everyone knows but most fans get fuzzy on under pressure.',
  },
  {
    key: 'qualification',
    title: 'Qualifying teams',
    eyebrow: 'The 48',
    blurb: 'Who made it, who missed out, and what to watch for from each.',
  },
  {
    key: 'logistics',
    title: 'Where + when',
    eyebrow: 'Host cities & dates',
    blurb: '16 stadiums across three countries, 39 days, 104 matches.',
  },
]

function bucket(entries: FaqEntry[]): Map<string, FaqEntry[]> {
  const byTag = new Map<string, FaqEntry[]>()
  for (const e of entries) {
    // First tag wins — keeps each entry in exactly one section so the
    // index reads as a clean taxonomy.
    const primary = e.tags[0]
    const list = byTag.get(primary) ?? []
    list.push(e)
    byTag.set(primary, list)
  }
  return byTag
}

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
      'Plain-English answers to every WC2026 question — the new rules first in effect this tournament (8-second goalkeeper rule, captain-only refereeing, Adidas Trionda connected ball, VAR PA announcements), plus reminders of the classics (offside, handball, back-pass, cooling breaks). Format, host cities, schedule, qualified teams.'
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
    <div className="container max-w-3xl mx-auto px-6 pt-28 pb-16">
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

      {(() => {
        const buckets = bucket(WC_FAQ)
        return (
          <>
            {SECTIONS.map((section) => {
              const items = buckets.get(section.key) ?? []
              if (items.length === 0) return null
              return (
                <section key={section.key} className="mb-12">
                  <header className="mb-5">
                    <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-accent-gold font-semibold mb-1.5">
                      {section.eyebrow}
                    </div>
                    <h2 className="font-display font-bold text-2xl sm:text-3xl text-ink-900 tracking-tight">
                      {section.title}
                    </h2>
                    <p className="mt-2 text-sm text-slate-600 max-w-2xl leading-relaxed">
                      {section.blurb}
                    </p>
                  </header>

                  <div className="space-y-4">
                    {items.map((entry) => (
                      <article
                        key={entry.slug}
                        id={entry.slug}
                        className="rounded-2xl border border-slate-200 bg-paper-elev p-5 sm:p-6"
                      >
                        <h3 className="font-display font-bold text-lg sm:text-xl text-ink-900">
                          <Link
                            to={`/explained/${entry.slug}`}
                            className="hover:text-accent-gold transition-colors"
                          >
                            {entry.question}
                          </Link>
                        </h3>
                        <p className="mt-2 text-slate-700 leading-relaxed text-[15px]">
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
                  </div>
                </section>
              )
            })}
          </>
        )
      })()}

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
